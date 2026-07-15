import { useEffect, useMemo, useState } from "react";
import type { Provider } from "../types";
import {
  getImageModelOptionsForProvider,
  VIDEO_MODEL_OPTIONS,
} from "../lib/imageModels";
import { REASONING_EFFORT_OPTIONS, type ReasoningEffort } from "../lib/reasoning";
import { getMcpModelOptions, useMcpProviders } from "../lib/mcpProviders";
import { useAppStore } from "../store/useAppStore";
import {
  hydrateMcpSelectionImpl,
  setMcpModelImpl,
  setMcpProviderImpl,
} from "../store/storeSettingsImpl";
import { useI18n } from "../i18n";

const CORE_PROVIDER_OPTIONS: ReadonlyArray<{ value: Provider; label: string }> = [
  { value: "oauth", label: "GPT" },
  { value: "api", label: "GPT API" },
  { value: "grok", label: "Grok" },
  { value: "grok-api", label: "xAI API" },
  { value: "agy", label: "agy" },
  { value: "gemini-api", label: "Gem API" },
];

const MCP_PREFIX = "mcp:";
const CORE_PREFIX = "core:";
const VIDEO_PREFIX = "video:";
const EFFORT_PREFIX = "effort:";

function applyMcpProvider(provider: string | null): void {
  setMcpProviderImpl(provider, useAppStore.setState, useAppStore.getState);
}

function applyMcpModel(model: string | null): void {
  setMcpModelImpl(model, useAppStore.setState, useAppStore.getState);
}

function displayProviderId(id: string): string {
  return id.replace(/(^|-)([a-z])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

export function GenProviderModelSelect({ compact = false }: { compact?: boolean } = {}) {
  const { t } = useI18n();
  const provider = useAppStore((state) => state.provider);
  const imageModel = useAppStore((state) => state.imageModel);
  const videoModel = useAppStore((state) => state.videoModelSelected);
  const mcpProvider = useAppStore((state) => state.mcpProvider ?? null);
  const mcpModel = useAppStore((state) => state.mcpModel ?? null);
  const setProvider = useAppStore((state) => state.setProvider);
  const setImageModel = useAppStore((state) => state.setImageModel);
  const selectVideoModel = useAppStore((state) => state.selectVideoModel);
  const setReasoningEffort = useAppStore((state) => state.setReasoningEffort);
  const { providers, loading, error } = useMcpProviders();
  const [mcpModels, setMcpModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const mediaKind = videoModel ? "video" : "image";

  useEffect(() => {
    hydrateMcpSelectionImpl(useAppStore.setState, useAppStore.getState);
  }, []);

  const selectedMcpRecord = mcpProvider
    ? providers.find((entry) => entry.id === mcpProvider) ?? null
    : null;
  const mcpSelectionAvailable = Boolean(
    selectedMcpRecord?.enabled &&
    selectedMcpRecord.status.state === "connected" &&
    selectedMcpRecord.id !== "higgsfield",
  );

  useEffect(() => {
    if (!mcpProvider || !mcpSelectionAvailable) {
      setMcpModels([]);
      return;
    }
    const controller = new AbortController();
    setModelsLoading(true);
    void getMcpModelOptions(mcpProvider, mediaKind, controller.signal)
      .then((models) => setMcpModels(models))
      .catch((cause) => {
        if ((cause as { name?: string }).name !== "AbortError") setMcpModels([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setModelsLoading(false);
      });
    return () => controller.abort();
  }, [mcpProvider, mcpSelectionAvailable, mediaKind]);

  const connectedMcpProviders = useMemo(
    () => providers.filter((entry) => entry.enabled && entry.status.state === "connected"),
    [providers],
  );
  const providerValue = mcpProvider ? `${MCP_PREFIX}${mcpProvider}` : `${CORE_PREFIX}${provider}`;
  const coreModels = getImageModelOptionsForProvider(provider);
  const coreModelValue = videoModel ? `${VIDEO_PREFIX}${videoModel}` : imageModel;
  const modelValue = mcpProvider ? (mcpModel ?? "") : coreModelValue;
  const isGptFamily = !mcpProvider && (provider === "oauth" || provider === "api") && !videoModel;

  const unavailableReason = !mcpProvider
    ? null
    : selectedMcpRecord?.id === "higgsfield"
      ? t("mcp.higgsfieldLocked")
      : !selectedMcpRecord
        ? t("mcp.unknownProvider", { provider: mcpProvider })
        : selectedMcpRecord.status.state !== "connected"
          ? t("mcp.disconnectedSelection")
          : !selectedMcpRecord.enabled
            ? t("mcp.disabledProvider")
            : null;

  const onProviderChange = (value: string) => {
    if (value.startsWith(CORE_PREFIX)) {
      setProvider(value.slice(CORE_PREFIX.length) as Provider);
      return;
    }
    const next = value.slice(MCP_PREFIX.length);
    const record = providers.find((entry) => entry.id === next);
    if (!record || record.id === "higgsfield" || record.status.state !== "connected") return;
    applyMcpProvider(next);
  };

  const onModelChange = (value: string) => {
    if (value.startsWith(EFFORT_PREFIX)) {
      setReasoningEffort(value.slice(EFFORT_PREFIX.length) as ReasoningEffort);
      return;
    }
    if (mcpProvider) {
      applyMcpModel(value || null);
      return;
    }
    if (value.startsWith(VIDEO_PREFIX)) {
      selectVideoModel(value.slice(VIDEO_PREFIX.length));
      return;
    }
    setImageModel(value as Parameters<typeof setImageModel>[0]);
  };

  return (
    <div
      className="image-model-select image-model-select--sidebar"
      style={{ gap: 4, minWidth: 0, maxWidth: compact ? 92 : 178 }}
    >
      <select
        id="sidebar-generation-provider"
        className="image-model-select__trigger image-model-select__trigger--pill"
        value={providerValue}
        onChange={(event) => onProviderChange(event.target.value)}
        aria-label={t("mcp.providerLabel")}
        title={unavailableReason ?? t("mcp.providerLabel")}
        style={{ width: compact ? 42 : 82, minWidth: 0, maxWidth: compact ? 42 : 82 }}
      >
        <optgroup label={t("mcp.coreProviders")}>
          {CORE_PROVIDER_OPTIONS.map((option) => (
            <option key={option.value} value={`${CORE_PREFIX}${option.value}`}>{option.label}</option>
          ))}
        </optgroup>
        {connectedMcpProviders.length > 0 ? (
          <optgroup label={t("mcp.connectedProviders")}>
            {connectedMcpProviders.map((entry) => (
              <option
                key={entry.id}
                value={`${MCP_PREFIX}${entry.id}`}
                disabled={entry.id === "higgsfield"}
              >
                {displayProviderId(entry.id)}{entry.id === "higgsfield" ? ` — ${t("mcp.locked")}` : ""}
              </option>
            ))}
          </optgroup>
        ) : null}
        {mcpProvider && !connectedMcpProviders.some((entry) => entry.id === mcpProvider) ? (
          <option value={`${MCP_PREFIX}${mcpProvider}`} disabled>
            {displayProviderId(mcpProvider)} — {t("mcp.unavailable")}
          </option>
        ) : null}
      </select>

      <select
        id="sidebar-generation-model"
        className="image-model-select__trigger image-model-select__trigger--pill"
        value={modelValue}
        onChange={(event) => onModelChange(event.target.value)}
        aria-label={t("mcp.modelLabel")}
        title={unavailableReason ?? t("mcp.modelLabel")}
        disabled={Boolean(unavailableReason)}
        style={{ width: compact ? 46 : 92, minWidth: 0, maxWidth: compact ? 46 : 92 }}
      >
        {mcpProvider ? (
          <>
            {mcpModel && !mcpModels.includes(mcpModel) ? (
              <option value={mcpModel}>{mcpModel}</option>
            ) : null}
            {!mcpModel ? <option value="">{modelsLoading ? t("mcp.loadingModels") : t("mcp.chooseModel")}</option> : null}
            {mcpModels.map((model) => <option key={model} value={model}>{model}</option>)}
            {selectedMcpRecord?.id === "higgsfield" ? (
              <option value="" disabled>{t("mcp.higgsfieldLocked")}</option>
            ) : null}
          </>
        ) : (
          <>
            <optgroup label={videoModel ? t("mcp.videoModels") : t("mcp.imageModels")}>
              {(videoModel ? VIDEO_MODEL_OPTIONS : coreModels).map((option) => (
                <option
                  key={`${option.value}-${"providerHint" in option ? option.providerHint ?? "" : ""}`}
                  value={videoModel ? `${VIDEO_PREFIX}${option.value}` : option.value}
                >
                  {option.shortLabel}
                </option>
              ))}
            </optgroup>
            {isGptFamily ? (
              <optgroup label={t("sidebar.reasoningLabel")}>
                {REASONING_EFFORT_OPTIONS.map((option) => (
                  <option key={option.value} value={`${EFFORT_PREFIX}${option.value}`}>
                    {option.shortLabel}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </>
        )}
      </select>

      {(unavailableReason || error) ? (
        <span className="image-model-select__trigger-effort" role="status">
          {unavailableReason ?? (loading ? t("mcp.loadingProviders") : t("mcp.providersLoadFailed"))}
        </span>
      ) : null}
    </div>
  );
}
