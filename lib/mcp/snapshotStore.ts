// Snapshot store (040 WP4): local cache (0600, atomic) + bundled fallback.
// Precedence: local cache > bundled asset. Bundled snapshots are immutable and
// lazy-loaded once per process.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SnapshotSource } from "../contracts/types.js";

const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const BUNDLED_PROVIDERS = ["runway", "higgsfield"] as const;
const bundledCache = new Map<string, SnapshotSource | null>();

function guardProvider(provider: string): void {
  if (!PROVIDER_ID_PATTERN.test(provider)) throw new Error(`MCP_PROVIDER_ID_INVALID:${provider}`);
}

function parseSnapshot(raw: string): SnapshotSource | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const candidate = parsed as SnapshotSource;
    return candidate.provenance && Array.isArray(candidate.tools) ? candidate : null;
  } catch {
    return null;
  }
}

export function saveLocalSnapshot(snapshotDir: string, snapshot: SnapshotSource): void {
  const provider = snapshot.provenance.provider;
  guardProvider(provider);
  mkdirSync(snapshotDir, { recursive: true, mode: 0o700 });
  const target = join(snapshotDir, `${provider}.json`);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  renameSync(tmp, target);
}

export function readLocalSnapshot(snapshotDir: string, provider: string): SnapshotSource | null {
  guardProvider(provider);
  try {
    return parseSnapshot(readFileSync(join(snapshotDir, `${provider}.json`), "utf8"));
  } catch {
    return null;
  }
}

export function loadBundledSnapshot(packageRoot: string, provider: string): SnapshotSource | null {
  guardProvider(provider);
  const key = `${packageRoot}:${provider}`;
  if (!bundledCache.has(key)) {
    let snapshot: SnapshotSource | null = null;
    try {
      snapshot = parseSnapshot(readFileSync(join(packageRoot, "assets", "mcp-snapshots", `${provider}.sanitized.json`), "utf8"));
    } catch {
      snapshot = null;
    }
    bundledCache.set(key, snapshot);
  }
  return bundledCache.get(key) ?? null;
}

/** Effective snapshot: local cache wins over the bundled asset. */
export function loadEffectiveSnapshot(options: { snapshotDir: string; packageRoot: string; provider: string }): SnapshotSource | null {
  return readLocalSnapshot(options.snapshotDir, options.provider) ?? loadBundledSnapshot(options.packageRoot, options.provider);
}

export function loadAllBundledSnapshots(packageRoot: string): SnapshotSource[] {
  const out: SnapshotSource[] = [];
  for (const provider of BUNDLED_PROVIDERS) {
    const snapshot = loadBundledSnapshot(packageRoot, provider);
    if (snapshot) out.push(snapshot);
  }
  return out;
}
