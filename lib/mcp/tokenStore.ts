// Atomic 0600 token store for MCP provider credentials (030 WP3).
// One JSON file per provider under config.mcp.tokenDir. Never logged.
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface McpTokenRecord {
  clientInformation?: Record<string, unknown>;
  tokens?: Record<string, unknown>;
  codeVerifier?: string;
  /** Server origin the dynamic client registration was created for. */
  origin?: string;
}

const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

function recordPath(tokenDir: string, provider: string): string {
  if (!PROVIDER_ID_PATTERN.test(provider)) throw new Error(`MCP_PROVIDER_ID_INVALID:${provider}`);
  return join(tokenDir, `${provider}.json`);
}

export function readTokenRecord(tokenDir: string, provider: string): McpTokenRecord | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(recordPath(tokenDir, provider), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as McpTokenRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (error instanceof SyntaxError) return null; // corrupt file -> auth_required, never overwritten here
    if (String((error as Error).message).startsWith("MCP_PROVIDER_ID_INVALID")) throw error;
    return null;
  }
}

export function writeTokenRecord(tokenDir: string, provider: string, record: McpTokenRecord): void {
  const target = recordPath(tokenDir, provider);
  mkdirSync(tokenDir, { recursive: true, mode: 0o700 });
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(record, null, 2), { mode: 0o600 });
  renameSync(tmp, target);
  try { chmodSync(target, 0o600); } catch { /* best-effort on exotic filesystems */ }
}

export function deleteTokenRecord(tokenDir: string, provider: string): void {
  try { rmSync(recordPath(tokenDir, provider)); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
