// Hardened result download (050 WP5): HTTPS-only, per-hop private-IP rejection,
// streamed byte cap, content-type check. Returns a temp file path — the caller
// (routes/mcpMedia.ts) owns the atomic commit. Signed URLs are never persisted.
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { setDefaultResultOrder } from "node:dns";
import https from "node:https";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// 260718 RCA: CloudFront AAAA records + hosts without working IPv6 made
// Node fetch die with ETIMEDOUT while curl/python (IPv4) worked — this was
// the actual "fetch failed" that dropped completed Runway results. Prefer
// IPv4 for outbound fetches in this process.
try { setDefaultResultOrder("ipv4first"); } catch { /* older runtimes */ }

const MAX_REDIRECTS = 5;
const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./];

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("::ffff:127.");
  }
  return PRIVATE_V4.some((pattern) => pattern.test(address));
}

export async function assertPublicHttps(url: URL): Promise<void> {
  if (url.protocol !== "https:") throw new Error(`MCP_DOWNLOAD_INSECURE:${url.protocol}`);
  const host = url.hostname;
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) throw new Error(`MCP_DOWNLOAD_PRIVATE_IP:${host}`);
  }
}

export interface DownloadedMedia {
  tempPath: string;
  contentType: string;
  bytes: number;
  /** Query-stripped origin+path — the only URL form allowed into sidecars. */
  sanitizedUrl: string;
  cleanup: () => Promise<void>;
}

/** Transient right after task completion: network-level failures and
 *  403/5xx from CDN propagation are worth retrying; contract violations and
 *  permanent client errors are not. */
function isRetryableDownloadError(error: unknown): boolean {
  const message = String((error as Error)?.message ?? error);
  // v4-fallback timeout is the same ETIMEDOUT class as the RCA — keep retrying.
  if (message.startsWith("MCP_DOWNLOAD_TIMEOUT")) return true;
  if (message.startsWith("MCP_DOWNLOAD_FAILED:")) {
    const status = Number(message.split(":")[1]);
    return status === 403 || status >= 500;
  }
  if (message.startsWith("MCP_DOWNLOAD_") || message.startsWith("MCP_RESULT_")) return false;
  return true;
}

export async function downloadMediaResult(
  rawUrl: string,
  options: { kind: "image" | "video"; maxBytes?: number; timeoutMs?: number; attempts?: number; baseDelayMs?: number; v4Fallback?: boolean },
): Promise<DownloadedMedia> {
  const attempts = Math.max(1, options.attempts ?? 1);
  const baseDelayMs = options.baseDelayMs ?? 4_000;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await downloadMediaResultOnce(rawUrl, options);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetryableDownloadError(error)) throw error;
      const delay = baseDelayMs * attempt + Math.floor(Math.random() * 1_000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function downloadMediaResultOnce(
  rawUrl: string,
  options: { kind: "image" | "video"; maxBytes?: number; timeoutMs?: number; v4Fallback?: boolean },
): Promise<DownloadedMedia> {
  const maxBytes = options.maxBytes ?? (options.kind === "video" ? 800 * 1024 * 1024 : 40 * 1024 * 1024);
  let url = new URL(rawUrl);
  let response: { status: number; headers: { get(name: string): string | null }; body: Readable | null } | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicHttps(url);
    response = await openGet(url, options.timeoutMs ?? 120_000, options.v4Fallback !== false);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("MCP_DOWNLOAD_REDIRECT_INVALID");
      response.body?.resume?.();
      url = new URL(location, url);
      continue;
    }
    break;
  }
  if (!response || response.status < 200 || response.status >= 300 || !response.body) {
    throw new Error(`MCP_DOWNLOAD_FAILED:${response?.status ?? "no-response"}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  const expected = options.kind === "video" ? /^(video\/|application\/octet-stream)/ : /^image\//;
  if (!expected.test(contentType)) throw new Error(`MCP_RESULT_TYPE_MISMATCH:${contentType}`);

  const dir = await mkdtemp(join(tmpdir(), "ima2-mcp-dl-"));
  const tempPath = join(dir, "result");
  let bytes = 0;
  try {
    const capped = Readable.toWeb(response.body).pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > maxBytes) controller.error(new Error("MCP_DOWNLOAD_TOO_LARGE"));
        else controller.enqueue(chunk);
      },
    }));
    await pipeline(Readable.fromWeb(capped as never), createWriteStream(tempPath));
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return {
    tempPath,
    contentType,
    bytes,
    sanitizedUrl: `${url.origin}${url.pathname}`,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

/** fetch first; on a network-level failure (broken-IPv6 hosts stall in
 *  undici/https happy-eyeballs), fall back to https.request with family 4 —
 *  this was the actual ETIMEDOUT behind the lost Runway results (260718). */
async function openGet(url: URL, timeoutMs: number, v4Fallback: boolean) {
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    return {
      status: response.status,
      headers: { get: (name: string) => response.headers.get(name) },
      body: response.body ? Readable.fromWeb(response.body as never) : null,
    };
  } catch (error) {
    if (!v4Fallback) throw error;
    if (!isRetryableDownloadError(error)) throw error;
    return httpsGetV4(url, timeoutMs);
  }
}

function httpsGetV4(url: URL, timeoutMs: number) {
  return new Promise<{ status: number; headers: { get(name: string): string | null }; body: Readable | null }>((resolve, reject) => {
    const request = https.request(url, { method: "GET", family: 4, timeout: timeoutMs }, (response) => {
      resolve({
        status: response.statusCode ?? 0,
        headers: { get: (name: string) => (response.headers[name.toLowerCase()] as string | undefined) ?? null },
        body: response,
      });
    });
    request.on("timeout", () => { request.destroy(new Error("MCP_DOWNLOAD_TIMEOUT")); });
    request.on("error", reject);
    request.end();
  });
}
