import { logEvent } from "./logger.js";
import type { RuntimeContext } from "./runtimeContext.js";
import { detectImageMimeFromB64 } from "./refs.js";

export interface DashscopeGenerateResult {
  b64: string;
  revisedPrompt?: string;
  usage: Record<string, number> | null;
  webSearchCalls: number;
  mime?: string;
}

interface DashscopeRefDetail {
  b64: string;
  declaredMime?: string | null;
  detectedMime?: string | null;
}

const DEFAULT_DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com";

const DASHSCOPE_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 3_000;

const T2I_MODELS = new Set([
  "wanx2.1-t2i-turbo",
  "wanx2.1-t2i-plus",
  "wanx-v1.1-t2i-turbo",
  "wanx2.1-t2i-turbo-auto",
]);

const I2I_MODELS = new Set([
  "wanx2.1-imageedit",
  "wanx2.1-imageedit-plus",
]);

// Models that use the sync multimodal-generation endpoint (not the async text2image endpoint)
const SYNC_MODELS = new Set([
  "qwen-image-2.0",
  "qwen-image-2.0-pro",
  "qwen-image-max",
  "z-image-turbo",
  "wan2.7-image-pro",
]);

// qwen-image-2.0 series only accepts these exact sizes (width*height with asterisk)
const SYNC_SUPPORTED_SIZES: string[] = [
  "2048*2048",
  "2688*1536",
  "1536*2688",
  "2368*1728",
  "1728*2368",
];

function getDashscopeBaseUrl(ctx: RuntimeContext): string {
  const baseUrl = (ctx as any).dashscopeBaseUrl as string | undefined;
  if (baseUrl && baseUrl.trim()) return baseUrl.replace(/\/+$/, "");
  return DEFAULT_DASHSCOPE_BASE_URL;
}

function getT2IUrl(baseUrl: string): string {
  return `${baseUrl}/api/v1/services/aigc/text2image/image-synthesis`;
}

function getI2IUrl(baseUrl: string): string {
  return `${baseUrl}/api/v1/services/aigc/image2image/image-synthesis`;
}

function getTaskUrl(baseUrl: string): string {
  return `${baseUrl}/api/v1/tasks/`;
}

function getMultimodalGenUrl(baseUrl: string): string {
  return `${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`;
}

function dashscopeError(message: string, status: number, code: string): Error {
  const err: any = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function isI2IModel(model: string): boolean {
  return I2I_MODELS.has(model);
}

function parseSize(size?: string): { width: number; height: number } {
  if (!size || size === "auto") return { width: 1024, height: 1024 };
  const match = size.match(/^(\d+)x(\d+)$/);
  if (!match) return { width: 1024, height: 1024 };
  return { width: Number(match[1]), height: Number(match[2]) };
}

function buildT2IBody(
  prompt: string,
  model: string,
  size: string,
  n: number,
): Record<string, unknown> {
  const { width, height } = parseSize(size);
  return {
    model,
    input: { prompt },
    parameters: {
      size: `${width}*${height}`,
      n,
    },
  };
}

function buildI2IBody(
  prompt: string,
  model: string,
  references: DashscopeRefDetail[],
  mask?: string | null,
): Record<string, unknown> {
  const refImages = references.slice(0, 1).map((ref) => {
    const mime = ref.declaredMime || ref.detectedMime || detectImageMimeFromB64(ref.b64) || "image/png";
    return `data:${mime};base64,${ref.b64}`;
  });

  const params: Record<string, unknown> = {
    prompt,
    ref_img_url: refImages[0] || undefined,
  };

  if (mask) {
    params.mask = `data:image/png;base64,${mask}`;
  }

  return {
    model,
    input: params,
  };
}

function normalizeSyncSize(size?: string): string {
  if (!size || size === "auto") return "2048*2048";
  const { width, height } = parseSize(size);
  const target = `${width}*${height}`;
  if (SYNC_SUPPORTED_SIZES.includes(target)) return target;

  // Map the requested aspect ratio to the nearest supported DashScope size
  // instead of silently falling back to 2048*2048 (1:1).
  if (height > 0) {
    const ratio = width / height;
    let best = SYNC_SUPPORTED_SIZES[0];
    let bestDiff = Infinity;
    for (const s of SYNC_SUPPORTED_SIZES) {
      const [w, h] = s.split("*").map(Number);
      const diff = Math.abs(w / h - ratio);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = s;
      }
    }
    return best;
  }

  return "2048*2048";
}

function buildMultimodalBody(
  prompt: string,
  model: string,
  size: string,
  n: number,
): Record<string, unknown> {
  return {
    model,
    input: {
      messages: [
        { role: "user", content: [{ text: prompt }] },
      ],
    },
    parameters: {
      size: normalizeSyncSize(size),
      n,
      prompt_extend: true,
      watermark: false,
    },
  };
}

async function submitTask(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  const timeoutSignal = AbortSignal.timeout(30_000);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify(body),
    signal: combinedSignal,
  });

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    if (res.status === 429) {
      throw dashscopeError(`DashScope rate limited: ${text.slice(0, 200)}`, 429, "DASHSCOPE_RATE_LIMITED");
    }
    if (res.status === 401 || res.status === 403) {
      throw dashscopeError(`DashScope auth error: ${text.slice(0, 200)}`, res.status, "DASHSCOPE_AUTH_ERROR");
    }
    throw dashscopeError(`DashScope submit error (${res.status}): ${text.slice(0, 200)}`, 502, "DASHSCOPE_SUBMIT_ERROR");
  }

  const json = JSON.parse(text) as any;
  const taskId = json?.output?.task_id;
  if (!taskId) {
    throw dashscopeError(
      `DashScope: no task_id in response: ${text.slice(0, 200)}`,
      502,
      "DASHSCOPE_NO_TASK_ID",
    );
  }
  return taskId;
}

async function pollTask(
  taskId: string,
  apiKey: string,
  taskUrl: string,
  signal?: AbortSignal,
): Promise<{ imageUrl: string; revisedPrompt?: string }> {
  const deadline = Date.now() + DASHSCOPE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw dashscopeError("Generation canceled", 499, "GENERATION_CANCELED");
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const timeoutSignal = AbortSignal.timeout(15_000);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    const res = await fetch(`${taskUrl}${taskId}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal: combinedSignal,
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw dashscopeError(`DashScope poll error (${res.status}): ${text.slice(0, 200)}`, 502, "DASHSCOPE_POLL_ERROR");
    }

    const json = JSON.parse(text) as any;
    const status = json?.output?.task_status;

    if (status === "SUCCEEDED") {
      const results = json?.output?.results;
      if (!Array.isArray(results) || results.length === 0) {
        throw dashscopeError("DashScope: task succeeded but no results", 502, "DASHSCOPE_NO_RESULTS");
      }
      const imageUrl = results[0]?.url;
      if (!imageUrl) {
        throw dashscopeError("DashScope: no image URL in results", 502, "DASHSCOPE_NO_IMAGE_URL");
      }
      return { imageUrl, revisedPrompt: json?.output?.revised_prompt };
    }

    if (status === "FAILED") {
      const errMsg = json?.output?.message || json?.message || "Unknown error";
      throw dashscopeError(`DashScope task failed: ${errMsg}`, 502, "DASHSCOPE_TASK_FAILED");
    }
  }

  throw dashscopeError("DashScope task timed out", 504, "DASHSCOPE_TIMEOUT");
}

async function downloadImageAsB64(imageUrl: string, signal?: AbortSignal): Promise<{ b64: string; mime: string }> {
  const timeoutSignal = AbortSignal.timeout(60_000);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const res = await fetch(imageUrl, { signal: combinedSignal });
  if (!res.ok) {
    throw dashscopeError(`DashScope image download failed (${res.status})`, 502, "DASHSCOPE_DOWNLOAD_FAILED");
  }
  const contentType = res.headers.get("content-type") || "image/png";
  const mime = contentType.startsWith("image/") ? contentType : "image/png";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { b64: buffer.toString("base64"), mime };
}

async function generateSync(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ imageUrl: string; revisedPrompt?: string }> {
  const timeoutSignal = AbortSignal.timeout(DASHSCOPE_TIMEOUT_MS);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: combinedSignal,
  });

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    if (res.status === 429) {
      throw dashscopeError(`DashScope rate limited: ${text.slice(0, 200)}`, 429, "DASHSCOPE_RATE_LIMITED");
    }
    if (res.status === 401 || res.status === 403) {
      throw dashscopeError(`DashScope auth error: ${text.slice(0, 200)}`, res.status, "DASHSCOPE_AUTH_ERROR");
    }
    throw dashscopeError(`DashScope sync error (${res.status}): ${text.slice(0, 200)}`, 502, "DASHSCOPE_SYNC_ERROR");
  }

  const json = JSON.parse(text) as any;
  const choices = json?.output?.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw dashscopeError(`DashScope: no choices in sync response: ${text.slice(0, 200)}`, 502, "DASHSCOPE_NO_CHOICES");
  }

  const content = choices[0]?.message?.content;
  if (!Array.isArray(content) || content.length === 0) {
    throw dashscopeError(`DashScope: empty content in sync response: ${text.slice(0, 200)}`, 502, "DASHSCOPE_EMPTY_CONTENT");
  }

  const imageUrl = content[0]?.image;
  if (!imageUrl) {
    throw dashscopeError(`DashScope: no image URL in sync response: ${text.slice(0, 200)}`, 502, "DASHSCOPE_NO_IMAGE_URL");
  }

  return { imageUrl, revisedPrompt: json?.output?.revised_prompt };
}

export async function generateViaDashscope(
  prompt: string,
  ctx: RuntimeContext,
  options: {
    model?: string;
    size?: string;
    signal?: AbortSignal;
    requestId?: string;
    references?: DashscopeRefDetail[];
    mask?: string | null;
    n?: number;
  } = {},
): Promise<DashscopeGenerateResult> {
  const apiKey = (ctx as any).dashscopeApiKey as string | undefined;
  if (!apiKey) {
    throw dashscopeError("DashScope API key not configured", 401, "DASHSCOPE_API_KEY_MISSING");
  }

  const baseUrl = getDashscopeBaseUrl(ctx);
  const t2iUrl = getT2IUrl(baseUrl);
  const i2iUrl = getI2IUrl(baseUrl);
  const taskUrl = getTaskUrl(baseUrl);

  const model = options.model || "wanx2.1-t2i-turbo";
  const references = (options.references || []).slice(0, 1);
  const hasRefs = references.length > 0;
  const useI2I = isI2IModel(model) || (hasRefs && !T2I_MODELS.has(model));

  logEvent("dashscope", "generate:start", {
    requestId: options.requestId,
    model,
    promptChars: prompt.length,
    refs: references.length,
    useI2I,
    hasMask: !!options.mask,
    baseUrl,
  });

  try {
    // Sync multimodal-generation path for newer models (qwen-image-2.0 series, etc.)
    if (SYNC_MODELS.has(model) && !hasRefs) {
      const syncUrl = getMultimodalGenUrl(baseUrl);
      const syncBody = buildMultimodalBody(prompt, model, options.size || "1024x1024", options.n || 1);

      logEvent("dashscope", "sync:start", {
        requestId: options.requestId,
        model,
        syncUrl,
        size: normalizeSyncSize(options.size),
      });

      const { imageUrl, revisedPrompt } = await generateSync(syncUrl, apiKey, syncBody, options.signal);

      logEvent("dashscope", "sync:imageReady", {
        requestId: options.requestId,
        model,
        urlLen: imageUrl.length,
      });

      const { b64, mime } = await downloadImageAsB64(imageUrl, options.signal);

      logEvent("dashscope", "generate:done", {
        requestId: options.requestId,
        model,
        b64Len: b64.length,
        mime,
        sync: true,
      });

      return {
        b64,
        revisedPrompt: revisedPrompt || prompt,
        usage: { dashscope_sync: 1 },
        webSearchCalls: 0,
        mime,
      };
    }

    let body: Record<string, unknown>;
    let submitUrl: string;

    if (useI2I || hasRefs) {
      body = buildI2IBody(prompt, useI2I ? model : "wanx2.1-imageedit", references, options.mask);
      submitUrl = i2iUrl;
    } else {
      body = buildT2IBody(prompt, model, options.size || "1024x1024", options.n || 1);
      submitUrl = t2iUrl;
    }

    const taskId = await submitTask(submitUrl, apiKey, body, options.signal);

    logEvent("dashscope", "task:submitted", {
      requestId: options.requestId,
      taskId,
      useI2I: useI2I || hasRefs,
    });

    const { imageUrl, revisedPrompt } = await pollTask(taskId, apiKey, taskUrl, options.signal);

    const { b64, mime } = await downloadImageAsB64(imageUrl, options.signal);

    logEvent("dashscope", "generate:done", {
      requestId: options.requestId,
      model,
      b64Len: b64.length,
      mime,
    });

    return {
      b64,
      revisedPrompt: revisedPrompt || prompt,
      usage: { dashscope_task_id: 0 },
      webSearchCalls: 0,
      mime,
    };
  } catch (e: any) {
    if (e.name === "AbortError") {
      if (options.signal?.aborted) {
        throw dashscopeError("Generation canceled", 499, "GENERATION_CANCELED");
      }
      throw dashscopeError("DashScope generation timed out", 504, "GENERATION_TIMEOUT");
    }
    if (e.code && e.status) throw e;
    throw dashscopeError(`DashScope request failed: ${e.message}`, 502, "DASHSCOPE_NETWORK_FAILED");
  }
}
