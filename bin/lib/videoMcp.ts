import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { config } from "../../config.js";
import {
  deriveVideoMode, GROK_VIDEO_MODEL_15, GROK_VIDEO_MODEL_15_PREVIEW_ALIAS,
  validateVideoResolutionForRequest, type VideoResolution,
} from "../../lib/imageModels.js";
import { type ParsedArgs } from "./args.js";
import { wasFlagPassed } from "./argsExplicit.js";
import { resolveHistoryReference, resolveServer, request } from "./client.js";
import { loadCliDefaults } from "./config-store.js";
import { runMcpJob } from "./mcpJob.js";
import { resolveTarget, type ModelCatalog, type ModelEntry, type ResolveResult } from "./modelResolver.js";
import { color, die, err, exitCodeForError, fail, json, out } from "./output.js";
import { createCliRequestId } from "./recover-output.js";
import { streamSse } from "./sse.js";

const VALID_RESOLUTIONS = new Set(["480p", "720p", "1080p"]);
const VALID_ASPECT_RATIOS = new Set(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "auto"]);
const MCP_VIDEO_TIMEOUT_MS = 12 * 60_000 + 120_000 + 30_000;

type Parameter = { name: string; type: string; options?: unknown[]; min?: number; max?: number };
type ModelCapabilities = { parameters: Parameter[]; aspectRatios: string[]; inputRoles: string[] };
type ResolvedTarget = Extract<ResolveResult, { ok: true }>;
type VideoContext = { server: { base: string }; catalog: ModelCatalog; target: ResolvedTarget; prompt: string };
type CoreOptions = { duration: number; resolution: string; aspectRatio: string };

function parseInteger(value: unknown, fallback: number, label: string): number {
  const raw = value === undefined ? String(fallback) : String(value);
  if (!/^\d+$/.test(raw)) die(2, `${label} must be an integer`);
  return Number(raw);
}

function generatedFilename(value: string): boolean {
  return /^\d{10,}_[A-Za-z0-9_-]+\.(?:png|jpe?g|webp)$/i.test(value);
}

function renderBar(pct: number): string {
  const width = 20;
  const filled = Math.round((pct / 100) * width);
  return color.green("█".repeat(filled)) + color.dim("░".repeat(width - filled));
}

async function writeBuffer(path: string, buffer: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
}

function failServer(jsonMode: boolean, error: unknown): never {
  const message = (error as Error)?.message || "server unreachable";
  if (jsonMode) err("Hint: start the server with `ima2 serve`.");
  fail({ json: jsonMode, code: "SERVER_UNREACHABLE", message: `${message}\nHint: run ima2 serve`, exitCode: 3 });
}

async function fetchCatalog(args: ParsedArgs) {
  try {
    const server = await resolveServer({ serverFlag: args.server });
    const catalog = await request(server.base, "/api/models", { timeoutMs: 5000 }) as ModelCatalog;
    return { server, catalog };
  } catch (error) {
    failServer(Boolean(args.json), error);
  }
}

function resolveVideoTarget(args: ParsedArgs, catalog: ModelCatalog): ResolvedTarget {
  const rawModel = args.model ? String(args.model) : undefined;
  const model = rawModel === GROK_VIDEO_MODEL_15_PREVIEW_ALIAS
    ? GROK_VIDEO_MODEL_15
    : rawModel?.endsWith(`/${GROK_VIDEO_MODEL_15_PREVIEW_ALIAS}`)
      ? rawModel.replace(GROK_VIDEO_MODEL_15_PREVIEW_ALIAS, GROK_VIDEO_MODEL_15)
      : rawModel;
  const result = resolveTarget("video", {
    model,
    provider: args.provider ? String(args.provider) : undefined,
  }, catalog, loadCliDefaults());
  if (!result.ok) fail({ json: Boolean(args.json), code: result.code, message: result.message, extra: result.extra });
  return result;
}

function modelCapabilities(entry: ModelEntry | undefined): ModelCapabilities {
  const raw = entry?.capabilities;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { parameters: [], aspectRatios: [], inputRoles: [] };
  const value = raw as Record<string, unknown>;
  return {
    parameters: Array.isArray(value.parameters) ? value.parameters as Parameter[] : [],
    aspectRatios: Array.isArray(value.aspectRatios) ? value.aspectRatios.filter((item): item is string => typeof item === "string") : [],
    inputRoles: Array.isArray(value.inputRoles) ? value.inputRoles.filter((item): item is string => typeof item === "string") : [],
  };
}

function validateCoreOptions(args: ParsedArgs, refs: string[], model: string) {
  const duration = parseInteger(args.duration, 5, "--duration");
  if (duration < 1 || duration > 15) die(2, "--duration must be between 1 and 15");
  const resolution = String(args.resolution ?? "480p");
  if (!VALID_RESOLUTIONS.has(resolution)) die(2, "--resolution must be one of: 480p, 720p, 1080p");
  const aspectRatio = String(args["aspect-ratio"] ?? "auto");
  if (!VALID_ASPECT_RATIOS.has(aspectRatio)) die(2, "--aspect-ratio must be one of: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, auto");
  if (refs.length > 7) die(2, "max 7 --ref attachments for video");
  if (refs.length >= 2 && duration > 10) die(2, "--duration must be between 1 and 10 when using 2 or more --ref attachments");
  const check = validateVideoResolutionForRequest(model, resolution as VideoResolution, deriveVideoMode(refs.length), { allowTextCanvasShim: true });
  if (!("ok" in check)) die(2, check.error);
  return { duration, resolution, aspectRatio };
}

async function coreReferences(serverBase: string, refs: string[]): Promise<string[]> {
  let latestPromise: Promise<string> | undefined;
  return Promise.all(refs.map(async (path) => {
    if (path === "@last") latestPromise ||= resolveHistoryReference(serverBase, path);
    let resolved = path === "@last" ? await latestPromise! : path;
    if (path === "@last") resolved = join(config.storage.generatedDir, resolved);
    return (await readFile(resolved)).toString("base64");
  })).catch((error: unknown) => {
    const typed = error as { code?: string; message?: string };
    return die(typed.code === "HISTORY_EMPTY" ? 5 : 1, typed.message || String(error));
  });
}

function coreBody(args: ParsedArgs, context: VideoContext, options: CoreOptions, references: string[], requestId: string) {
  const body: Record<string, unknown> = { prompt: context.prompt, provider: context.target.lane,
    duration: options.duration, resolution: options.resolution, aspectRatio: options.aspectRatio,
    requestId, model: context.target.model };
  if (args["planner-model"]) body.plannerModel = args["planner-model"];
  if (args.bg) body.backgroundPreset = String(args.bg);
  if (args.storyboard) body.storyboard = true;
  if (args.session) body.sessionId = args.session;
  if (args.topic) body.topic = args.topic;
  if (references.length === 1) body.sourceImage = references[0];
  else if (references.length > 1) body.referenceImages = references;
  return body;
}

async function consumeCoreSse(url: string, body: Record<string, unknown>, args: ParsedArgs, requestId: string) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutMs = parseInteger(args.timeout, 600, "--timeout") * 1000;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const onSignal = () => { controller.abort(); process.exit(130); };
  process.once("SIGINT", onSignal); process.once("SIGTERM", onSignal);
  let done: Record<string, unknown> | null = null; let lastProgress = -1;
  try {
    for await (const event of streamSse(url, { body, signal: controller.signal, headers: { "X-Request-Id": requestId } })) {
      if (event.event === "planning" && !args.json) {
        out(color.dim("[planning] preparing video generation..."));
      } else if (event.event === "submitted" && !args.json) {
        out(color.dim(`[submitted] xai request: ${event.data.xaiVideoRequestId || "..."}`));
      } else if (event.event === "progress") {
        const progress = typeof event.data.progress === "number" ? Math.round(event.data.progress * 100) : null;
        if (progress !== null && progress !== lastProgress && !args.json) {
          process.stdout.write(`\r  ${renderBar(progress)} ${progress}%`);
          lastProgress = progress;
        }
      } else if (event.event === "done") {
        if (!args.json && lastProgress >= 0) process.stdout.write("\n");
        done = event.data;
      } else if (event.event === "error") {
        if (!args.json && lastProgress >= 0) process.stdout.write("\n");
        die(1, `video error: ${event.data.error || event.data}${event.data.guidance ? `\n${event.data.guidance}` : ""}${event.data.code ? ` (${event.data.code})` : ""}`);
      }
    }
  } catch (error) {
    if ((error as Error).name === "AbortError" && !timedOut) return null;
    if (!args.json && lastProgress >= 0) process.stdout.write("\n");
    die(exitCodeForError(error), (error as Error).message);
  } finally {
    clearTimeout(timer); process.off("SIGINT", onSignal); process.off("SIGTERM", onSignal);
  }
  return done;
}

async function runCoreVideo(args: ParsedArgs, context: VideoContext): Promise<void> {
  const refs = (Array.isArray(args.ref) ? args.ref : []) as string[];
  const options = validateCoreOptions(args, refs, context.target.model);
  const references = await coreReferences(context.server.base, refs);
  const requestId = createCliRequestId("req_cli_video");
  const done = await consumeCoreSse(`${context.server.base}/api/video/generate`, coreBody(args, context, options, references, requestId), args, requestId);
  if (!done?.filename) die(1, "server did not return a video filename");
  const filename = String(done.filename);
  const target = args.out ? String(args.out) : args["out-dir"] ? join(String(args["out-dir"]), filename) : join(config.storage.generatedDir, filename);
  const response = await fetch(`${context.server.base}${done.url || `/generated/${encodeURIComponent(filename)}`}`,
    { signal: AbortSignal.timeout(parseInteger(args.timeout, 600, "--timeout") * 1000) });
  if (!response.ok) die(1, `failed to download video: HTTP ${response.status}`);
  await writeBuffer(target, Buffer.from(await response.arrayBuffer()));
  if (args.json) json({ ok: true, requestId: done.requestId, path: target, filename, elapsed: done.elapsed,
    video: done.video, revisedPrompt: done.revisedPrompt });
  else { out(color.green("✓ ") + target); if (done.elapsed) out(color.dim(`elapsed ${done.elapsed}s`));
    if (done.revisedPrompt) out(color.dim(`revised: ${String(done.revisedPrompt).slice(0, 80)}`)); }
}

function rejectMcpOnlyFlags(argv: string[], args: ParsedArgs): void {
  const forbidden = ["--planner-model", "--storyboard", "--topic", "--bg", "--session"];
  const flag = forbidden.find((name) => wasFlagPassed(argv, name));
  if (flag) fail({ json: Boolean(args.json), code: "FLAG_NOT_SUPPORTED", message: `${flag} is only supported on Grok lanes`, extra: { flag } });
}

function parameterFor(parameters: Parameter[], flag: string): Parameter | undefined {
  const names = flag === "aspect-ratio" ? ["ratio", "aspect_ratio", "aspect-ratio"] : [flag];
  return parameters.find((parameter) => names.includes(parameter.name));
}

function validateParameter(parameter: Parameter | undefined, value: string | number, flag: string, jsonMode: boolean): void {
  if (!parameter) fail({ json: jsonMode, code: "MCP_PARAMETER_UNSUPPORTED", message: `selected model does not support --${flag}`, extra: { parameter: flag } });
  if (parameter.type === "number" && typeof value !== "number") fail({ json: jsonMode, code: "MCP_PARAMETER_INVALID", message: `--${flag} must be numeric` });
  if (parameter.options && !parameter.options.some((option) => option === value)) fail({ json: jsonMode, code: "MCP_PARAMETER_INVALID", message: `unsupported --${flag} value: ${value}` });
  if (typeof value === "number" && ((parameter.min !== undefined && value < parameter.min) || (parameter.max !== undefined && value > parameter.max))) {
    fail({ json: jsonMode, code: "MCP_PARAMETER_INVALID", message: `--${flag} is outside the supported range` });
  }
}

function mcpParameters(argv: string[], args: ParsedArgs, capabilities: ModelCapabilities) {
  const parameters = capabilities.parameters;
  const body: Record<string, string | number> = {};
  let ratio: string | undefined;
  if (wasFlagPassed(argv, "--duration")) { const value = parseInteger(args.duration, 0, "--duration"); validateParameter(parameterFor(parameters, "duration"), value, "duration", Boolean(args.json)); body.duration = value; }
  if (wasFlagPassed(argv, "--resolution")) { const value = String(args.resolution); validateParameter(parameterFor(parameters, "resolution"), value, "resolution", Boolean(args.json)); body.resolution = value; }
  if (wasFlagPassed(argv, "--aspect-ratio")) {
    ratio = String(args["aspect-ratio"]);
    const parameter = parameterFor(parameters, "aspect-ratio");
    const ratios = capabilities.aspectRatios;
    if (parameter) validateParameter(parameter, ratio, "aspect-ratio", Boolean(args.json));
    else if (!ratios.includes(ratio)) fail({ json: Boolean(args.json), code: "MCP_PARAMETER_UNSUPPORTED", message: "selected model does not support --aspect-ratio" });
  }
  return { parameters: body, ratio };
}

function mcpReferences(refs: string[], roles: string[], jsonMode: boolean) {
  const invalid = refs.find((ref) => !generatedFilename(ref));
  if (invalid) fail({ json: jsonMode, code: "MCP_REF_MUST_BE_GENERATED", message: `MCP references must be generated filenames: ${invalid}` });
  const supportsStart = roles.includes("start_image");
  if (!refs.length && supportsStart && !roles.includes("text")) fail({ json: jsonMode, code: "MISSING_START_FRAME", message: "selected model requires a generated start frame" });
  const first = supportsStart ? refs[0] : undefined;
  const remaining = supportsStart ? refs.slice(1) : refs;
  if (remaining.length && !roles.includes("image_references")) fail({ json: jsonMode, code: "MCP_PARAMETER_UNSUPPORTED", message: "selected model does not support additional image references" });
  return { ...(first ? { startFrameFilename: first } : {}),
    ...(remaining.length ? { references: remaining.map((filename) => ({ filename })) } : {}) };
}

async function downloadMcpVideo(serverBase: string, url: string, target: string): Promise<void> {
  const response = await fetch(`${serverBase}${url}`);
  if (!response.ok) die(1, `failed to download video: HTTP ${response.status}`);
  await writeBuffer(target, Buffer.from(await response.arrayBuffer()));
}

async function runMcpVideo(argv: string[], args: ParsedArgs, context: VideoContext): Promise<void> {
  rejectMcpOnlyFlags(argv, args);
  const entry = context.catalog.lanes[context.target.lane]?.models.video.find((item) => item.id === context.target.model);
  const capabilities = modelCapabilities(entry);
  const selected = mcpParameters(argv, args, capabilities);
  const refs = (Array.isArray(args.ref) ? args.ref : []) as string[];
  const references = mcpReferences(refs, capabilities.inputRoles, Boolean(args.json));
  const requestId = createCliRequestId("req_cli_video");
  const body = { provider: context.target.lane, kind: "video", prompt: context.prompt, model: context.target.model,
    requestId, parameters: selected.parameters, ...(selected.ratio ? { ratio: selected.ratio } : {}), ...references };
  try {
    const result = await runMcpJob({ serverBase: context.server.base, kind: "video", body, requestId,
      timeoutMs: MCP_VIDEO_TIMEOUT_MS, json: Boolean(args.json), onProgress: (phase: unknown) => err(`[${String(phase)}]`) });
    const target = args.out ? String(args.out) : args["out-dir"] ? join(String(args["out-dir"]), result.filename) : undefined;
    if (target) await downloadMcpVideo(context.server.base, result.url, target);
    if (args.json) json({ ok: true, requestId, filename: result.filename, url: result.url, ...(target ? { path: target } : {}) });
    else out(color.green("✓ ") + (target ?? `${context.server.base}${result.url}`));
  } catch (error) {
    const typed = error as Error & { code?: string };
    fail({ json: Boolean(args.json), code: typed.code ?? "MCP_GENERATION_FAILED", message: typed.message, exitCode: 1 });
  }
}

export async function runVideoGenerate(argv: string[], args: ParsedArgs, prompt: string): Promise<void> {
  if (parseInteger(args.timeout, 600, "--timeout") < 1) die(2, "--timeout must be at least 1");
  const { server, catalog } = await fetchCatalog(args);
  const target = resolveVideoTarget(args, catalog);
  const context = { server, catalog, target, prompt };
  if (target.transport === "mcp") return runMcpVideo(argv, args, context);
  return runCoreVideo(args, context);
}
