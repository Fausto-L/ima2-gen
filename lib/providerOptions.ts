import type { RuntimeContext } from "./runtimeContext.js";
import { ATLASCLOUD_TEXT_TO_IMAGE_MODEL } from "./atlasCloudImageAdapter.js";
import { FALLBACK_IMAGE_MODEL, normalizeImageModel, normalizeReasoningEffort, normalizeGrokImageModel, normalizeGeminiApiModel, normalizeDashscopeModel } from "./imageModels.js";

export function resolveProviderOptions(ctx: RuntimeContext | null | undefined, {
  provider = "oauth",
  rawModel,
  rawReasoningEffort,
  rawSize = "1024x1024",
  rawWebSearchEnabled = true,
  searchMode = "on",
}: any = {}) {
  if (provider === "agy") {
    return {
      provider: "agy" as const,
      model: "nano-banana-2",
      reasoningEffort: "none",
      size: "1024x1024",
      webSearchEnabled: false,
    };
  }

  if (provider === "gemini-api") {
    const geminiModelCheck = normalizeGeminiApiModel(rawModel || "nano-banana-2");
    if (geminiModelCheck.error) return { error: geminiModelCheck.error, code: geminiModelCheck.code, status: geminiModelCheck.status };
    return {
      provider: "gemini-api" as const,
      model: geminiModelCheck.model,
      reasoningEffort: "none",
      size: rawSize || "1024x1024",
      webSearchEnabled: false,
    };
  }

  if (provider === "atlascloud") {
    return {
      provider: "atlascloud" as const,
      model: rawModel || ATLASCLOUD_TEXT_TO_IMAGE_MODEL,
      reasoningEffort: "none",
      size: rawSize || "1024x1024",
      webSearchEnabled: false,
    };
  }

  if (provider === "dashscope") {
    const dashscopeCfg: { defaultImageModel?: string } = (ctx?.config as any)?.dashscopeProvider || {};
    const modelInput = rawModel || dashscopeCfg.defaultImageModel || "wanx2.1-t2i-turbo";
    const dashscopeModelCheck = normalizeDashscopeModel(modelInput, ctx as any);
    if (dashscopeModelCheck.error) return { error: dashscopeModelCheck.error, code: dashscopeModelCheck.code, status: dashscopeModelCheck.status };
    return {
      provider: "dashscope" as const,
      model: dashscopeModelCheck.model,
      reasoningEffort: "none",
      size: rawSize || "1024x1024",
      webSearchEnabled: false,
    };
  }

  if (provider === "grok") {
    const grokCfg: { defaultImageModel?: string } = (ctx?.config as any)?.grokProvider || {};
    const modelInput = rawModel || grokCfg.defaultImageModel;
    const grokModelCheck = normalizeGrokImageModel(modelInput);
    if (grokModelCheck.error) return { error: grokModelCheck.error, code: grokModelCheck.code, status: grokModelCheck.status };
    return {
      provider: "grok" as const,
      model: grokModelCheck.model,
      reasoningEffort: "none",
      size: rawSize,
      // Honor the caller's toggle (070 QA: forced true ran a real web search
      // on every grok generation, ignoring webSearchEnabled:false).
      webSearchEnabled: rawWebSearchEnabled !== false && searchMode !== "off",
    };
  }

  if (provider === "grok-api") {
    const grokCfg: { defaultImageModel?: string } = (ctx?.config as any)?.grokProvider || {};
    const modelInput = rawModel || grokCfg.defaultImageModel;
    const grokModelCheck = normalizeGrokImageModel(modelInput);
    if (grokModelCheck.error) return { error: grokModelCheck.error, code: grokModelCheck.code, status: grokModelCheck.status };
    return {
      provider: "grok-api" as const,
      model: grokModelCheck.model,
      reasoningEffort: "none",
      size: rawSize,
      webSearchEnabled: rawWebSearchEnabled !== false && searchMode !== "off",
    };
  }

  const activeProvider = provider === "api" ? "api" : "oauth";
  const apiConfig: { defaultImageModel?: string; defaultReasoningEffort?: string; defaultSize?: string; allowWebSearch?: boolean } = (ctx?.config as { apiProvider?: any })?.apiProvider || {};
  const modelInput = activeProvider === "api"
    ? (rawModel || apiConfig.defaultImageModel || FALLBACK_IMAGE_MODEL)
    : rawModel;
  const modelCheck = normalizeImageModel(ctx, modelInput);
  if (modelCheck.error) return { error: modelCheck.error, code: modelCheck.code, status: modelCheck.status };

  const reasoningInput = activeProvider === "api"
    ? (rawReasoningEffort || apiConfig.defaultReasoningEffort || "low")
    : rawReasoningEffort;
  const reasoningCheck = normalizeReasoningEffort(ctx, reasoningInput);
  if (reasoningCheck.error) {
    return { error: reasoningCheck.error, code: reasoningCheck.code, status: reasoningCheck.status };
  }

  const size = activeProvider === "api" && (typeof rawSize !== "string" || rawSize.length === 0)
    ? (apiConfig.defaultSize || "1024x1024")
    : rawSize;
  const webSearchEnabled = activeProvider === "api"
    ? apiConfig.allowWebSearch !== false && rawWebSearchEnabled !== false && searchMode !== "off"
    : rawWebSearchEnabled !== false && searchMode !== "off";

  return {
    provider: activeProvider,
    model: modelCheck.model,
    reasoningEffort: reasoningCheck.effort,
    size,
    webSearchEnabled,
  };
}
