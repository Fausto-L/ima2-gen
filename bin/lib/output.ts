import { formatErrorWithHint } from "./error-hints.js";

const isTty = process.stdout.isTTY && !process.env.NO_COLOR;

export const color = {
  dim:    (s: unknown) => (isTty ? `\x1b[2m${s}\x1b[0m` : String(s)),
  bold:   (s: unknown) => (isTty ? `\x1b[1m${s}\x1b[0m` : String(s)),
  red:    (s: unknown) => (isTty ? `\x1b[31m${s}\x1b[0m` : String(s)),
  green:  (s: unknown) => (isTty ? `\x1b[32m${s}\x1b[0m` : String(s)),
  yellow: (s: unknown) => (isTty ? `\x1b[33m${s}\x1b[0m` : String(s)),
  cyan:   (s: unknown) => (isTty ? `\x1b[36m${s}\x1b[0m` : String(s)),
};

export function out(msg = "") { process.stdout.write(msg + "\n"); }
export function err(msg = "") { process.stderr.write(msg + "\n"); }

/** Marker thrown by exitFlushed so callers keep true `never` semantics:
 *  nothing after die/fail may continue to run. The installed guard swallows
 *  exactly this marker; the scheduled exit fires first. */
const EXIT_FLUSH_MARKER = Symbol("ima2-exit-flush");

/** Install once at the CLI entry: swallow only the exit-flush marker. */
let guardInstalled = false;
export function installExitFlushGuard(): void {
  if (guardInstalled) return;
  guardInstalled = true;
  const swallow = (reason: unknown) => {
    if (reason === EXIT_FLUSH_MARKER) return;
    throw reason;
  };
  process.on("unhandledRejection", swallow);
  process.on("uncaughtException", swallow);
}

// Module-load install: any process importing this module (CLI entry OR a
// spawned consumer of die/fail) can swallow the marker — the scheduled exit
// fires first either way.
installExitFlushGuard();

/** Flush piped stdio before exiting. An immediate process.exit() right after
 *  write() fast-fails with 0xC0000409 on Windows runners (260719 CI W1):
 *  the empty-write callbacks fire once buffered data is flushed; a bounded
 *  unref'd fallback guarantees the exit even with stalled/destroyed streams. */
export function exitFlushed(code: number): never {
  let settled = false;
  const done = () => {
    if (settled) return;
    settled = true;
    process.exit(code);
  };
  let pending = 0;
  for (const stream of [process.stdout, process.stderr]) {
    try {
      pending += 1;
      stream.write("", () => { pending -= 1; if (pending === 0) done(); });
    } catch {
      pending -= 1;
    }
  }
  if (pending === 0) done();
  // Referenced on purpose: this timer is the guaranteed exit path — unref'd,
  // a stalled stream could let the process die naturally with code 0 first.
  setTimeout(done, 250);
  throw EXIT_FLUSH_MARKER;
}

export function die(code: number, msg?: string): never {
  if (msg) err(color.red("✗ ") + msg);
  return exitFlushed(code);
}

export function fail(opts: {
  json: boolean;
  code: string;
  message: string;
  extra?: Record<string, unknown>;
  exitCode?: number;
}): never {
  if (opts.json) {
    json({ ok: false, code: opts.code, message: opts.message, ...(opts.extra ?? {}) });
    return exitFlushed(opts.exitCode ?? 2);
  }
  return die(opts.exitCode ?? 2, opts.message);
}

export interface ErrorLike {
  message?: string;
  code?: string | null;
  status?: number;
  name?: string;
}

export function dieWithError(e: unknown): never {
  const err = e as ErrorLike;
  return die(exitCodeForError(e), formatErrorWithHint(err?.message || String(e), err?.code));
}

export function json(obj: unknown) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

export interface TableColumn<R = Record<string, unknown>> {
  key: string;
  label: string;
  format?: (value: unknown, row: R) => unknown;
}

export function table<R extends Record<string, unknown>>(rows: R[], columns: TableColumn<R>[]): void {
  if (rows.length === 0) return;
  const widths = columns.map((c) =>
    Math.max(c.label.length, ...rows.map((r) => {
      const v = c.format ? c.format(r[c.key], r) : r[c.key];
      return String(v ?? "").length;
    })),
  );
  const pad = (s: unknown, w: number) => String(s ?? "").padEnd(w);
  out(color.dim(columns.map((c, i) => pad(c.label, widths[i])).join("  ")));
  out(color.dim(widths.map((w) => "─".repeat(w)).join("  ")));
  for (const r of rows) {
    out(columns.map((c, i) => pad(c.format ? c.format(r[c.key], r) : r[c.key], widths[i])).join("  "));
  }
}

export function exitCodeForError(e: unknown): number {
  const err = e as ErrorLike;
  if (err?.code === "SERVER_UNREACHABLE") return 3;
  if (err?.code === "APIKEY_DISABLED") return 4;
  if (err?.code === "AUTH_CHATGPT_EXPIRED" || err?.code === "OAUTH_UNAVAILABLE") return 4;
  if (err?.code === "NETWORK_FAILED") return 6;
  if (err?.code === "REF_TOO_LARGE" || err?.code === "REF_NOT_BASE64") return 5;
  if (err?.code === "SAFETY_REFUSAL") return 7;
  if (err?.code === "MODERATION_REFUSED") return 7;
  if (err?.name === "TimeoutError" || /abort/i.test(err?.message || "")) return 8;
  if ((err?.status ?? 0) >= 500) return 6;
  if ((err?.status ?? 0) >= 400) return 5;
  return 1;
}
