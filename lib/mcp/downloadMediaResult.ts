// Hardened result download (050 WP5): HTTPS-only, per-hop private-IP rejection,
// streamed byte cap, content-type check. Returns a temp file path — the caller
// (routes/mcpMedia.ts) owns the atomic commit. Signed URLs are never persisted.
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const MAX_REDIRECTS = 5;
const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./];

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("::ffff:127.");
  }
  return PRIVATE_V4.some((pattern) => pattern.test(address));
}

async function assertPublicHttps(url: URL): Promise<void> {
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

export async function downloadMediaResult(
  rawUrl: string,
  options: { kind: "image" | "video"; maxBytes?: number; timeoutMs?: number } ,
): Promise<DownloadedMedia> {
  const maxBytes = options.maxBytes ?? (options.kind === "video" ? 800 * 1024 * 1024 : 40 * 1024 * 1024);
  let url = new URL(rawUrl);
  let response: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicHttps(url);
    response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(options.timeoutMs ?? 120_000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("MCP_DOWNLOAD_REDIRECT_INVALID");
      url = new URL(location, url);
      continue;
    }
    break;
  }
  if (!response || !response.ok || !response.body) throw new Error(`MCP_DOWNLOAD_FAILED:${response?.status ?? "no-response"}`);
  const contentType = response.headers.get("content-type") ?? "";
  const expected = options.kind === "video" ? /^(video\/|application\/octet-stream)/ : /^image\//;
  if (!expected.test(contentType)) throw new Error(`MCP_RESULT_TYPE_MISMATCH:${contentType}`);

  const dir = await mkdtemp(join(tmpdir(), "ima2-mcp-dl-"));
  const tempPath = join(dir, "result");
  let bytes = 0;
  const capped = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) controller.error(new Error("MCP_DOWNLOAD_TOO_LARGE"));
      else controller.enqueue(chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body.pipeThrough(capped) as never), createWriteStream(tempPath));
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
