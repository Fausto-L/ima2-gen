// spikeSanitize.mjs — shared sanitizer for the MCP schema spike (010 WP1).
// Side-effect-free: pure functions only, importable from contract tests.
import { createHash } from "node:crypto";

export const SECRET_PATTERNS = [
  /[A-Za-z0-9_-]{40,}/g, // long opaque tokens
  /[\w.+-]+@[\w-]+\.[\w.]+/g, // emails
  /(sig|signature|token|key|secret)=[^&\s"']+/gi, // signed query params
];

export function scrub(value) {
  if (typeof value === "string") {
    let out = value;
    for (const p of SECRET_PATTERNS) out = out.replace(p, "[REDACTED]");
    return out;
  }
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)]));
  }
  return value;
}

export const sha = (obj) => "sha256:" + createHash("sha256").update(JSON.stringify(obj)).digest("hex");

/** Hard-deny every mutating MCP surface on a client instance (spike is read-only). */
export function denyMutations(client) {
  const deny = () => { throw new Error("MCP_SPIKE_MUTATION_DENIED"); };
  client.callTool = deny;
  client.readResource = deny;
  client.getPrompt = deny;
  return client;
}
