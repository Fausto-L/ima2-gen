import { useEffect, useMemo, useState } from "react";
import type { Provider } from "../types";
import {
  getImageModelOptionsForProvider,
  VIDEO_MODEL_OPTIONS,
} from "../lib/imageModels";
import { REASONING_EFFORT_OPTIONS, type ReasoningEffort } from "../lib/reasoning";
import { Select, type SelectGroup } from "./controls/Select";
import { getMcpModelCatalog, useMcpProviders, type McpModelCatalog } from "../lib/mcpProviders";
import {
  encodeMcpModelValue,
  parseMcpModelValue,
  type McpMediaKind,
} from "../lib/mcpSelection";
import { useAppStore } from "../store/useAppStore";
import {
  hydrateMcpSelectionImpl,
  setMcpModelImpl,
  setMcpModelWithKindImpl,
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

function applyMcpModelWithKind(model: string, kind: McpMediaKind): void {
  setMcpModelWithKindImpl(model, kind, useAppStore.setState, useAppStore.getState);
}

const EMPTY_CATALOG: McpModelCatalog = { image: [], video: [] };

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
  const mcpMediaKind = useAppStore((state) => state.mcpMediaKind ?? "image");
  const setProvider = useAppStore((state) => state.setProvider);
  const setImageModel = useAppStore((state) => state.setImageModel);
  const selectVideoModel = useAppStore((state) => state.selectVideoModel);
  const setReasoningEffort = useAppStore((state) => state.setReasoningEffort);
  const reasoningEffort = useAppStore((state) => state.reasoningEffort);
  const { providers, loading, error } = useMcpProviders();
  const [mcpCatalog, setMcpCatalog] = useState<McpModelCatalog>(EMPTY_CATALOG);
  const [catalogError, setCatalogError] = useState(false);
  const [catalogRetryToken, setCatalogRetryToken] = useState(0);
  const [modelsLoading, setModelsLoading] = useState(false);

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
      setMcpCatalog(EMPTY_CATALOG);
      setCatalogError(false);
      return;
    }
    const controller = new AbortController();
    setModelsLoading(true);
    setCatalogError(false);
    void getMcpModelCatalog(mcpProvider, controller.signal)
      .then((catalog) => {
        if (!controller.signal.aborted) setMcpCatalog(catalog);
      })
      .catch((cause) => {
        if ((cause as { name?: string }).name === "AbortError") return;
        if (!controller.signal.aborted) {
          setMcpCatalog(EMPTY_CATALOG);
          setCatalogError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setModelsLoading(false);
      });
    return () => controller.abort();
  }, [mcpProvider, mcpSelectionAvailable, catalogRetryToken]);

  const connectedMcpProviders = useMemo(
    () => providers.filter((entry) => entry.enabled && entry.status.state === "connected"),
    [providers],
  );
  const providerValue = mcpProvider ? `${MCP_PREFIX}${mcpProvider}` : `${CORE_PREFIX}${provider}`;
  const coreModels = getImageModelOptionsForProvider(provider);
  const coreModelValue = videoModel ? `${VIDEO_PREFIX}${videoModel}` : imageModel;
  const modelValue = mcpProvider
    ? (mcpModel ? encodeMcpModelValue(mcpMediaKind, mcpModel) : "")
    : coreModelValue;
  const isGptFamily = !mcpProvider && (provider === "oauth" || provider === "api") && !videoModel;
  const mcpModelKnown = Boolean(
    mcpModel && (mcpCatalog.image.includes(mcpModel) || mcpCatalog.video.includes(mcpModel)),
  );

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
      const parsed = parseMcpModelValue(value);
      if (parsed) applyMcpModelWithKind(parsed.model, parsed.kind);
      else applyMcpModel(value || null);
      return;
    }
    if (value.startsWith(VIDEO_PREFIX)) {
      selectVideoModel(value.slice(VIDEO_PREFIX.length));
      return;
    }
    setImageModel(value as Parameters<typeof setImageModel>[0]);
  };

  const providerGroups: SelectGroup<string>[] = [
    {
      label: t("mcp.coreProviders"),
      items: CORE_PROVIDER_OPTIONS.map((option) => ({
        value: `${CORE_PREFIX}${option.value}`,
        label: option.label,
      })),
    },
  ];
  if (connectedMcpProviders.length > 0) {
    providerGroups.push({
      label: t("mcp.connectedProviders"),
      items: connectedMcpProviders.map((entry) => ({
        value: `${MCP_PREFIX}${entry.id}`,
        label: displayProviderId(entry.id),
        disabled: entry.id === "higgsfield",
        sub: entry.id === "higgsfield" ? t("mcp.locked") : undefined,
      })),
    });
  }
  if (mcpProvider && !connectedMcpProviders.some((entry) => entry.id === mcpProvider)) {
    providerGroups.push({
      items: [{
        value: `${MCP_PREFIX}${mcpProvider}`,
        label: displayProviderId(mcpProvider),
        sub: t("mcp.unavailable"),
        disabled: true,
      }],
    });
  }

  const modelGroups: SelectGroup<string>[] = [];
  if (mcpProvider) {
    if (mcpModel && !mcpModelKnown) {
      modelGroups.push({
        items: [{ value: encodeMcpModelValue(mcpMediaKind, mcpModel), label: mcpModel }],
      });
    }
    modelGroups.push({
      label: t("mcp.imageModels"),
      items: mcpCatalog.image.map((model) => ({
        value: encodeMcpModelValue("image", model),
        label: model,
      })),
    });
    modelGroups.push({
      label: t("mcp.videoModels"),
      items: mcpCatalog.video.map((model) => ({
        value: encodeMcpModelValue("video", model),
        label: model,
      })),
    });
    if (selectedMcpRecord?.id === "higgsfield") {
      modelGroups.push({
        items: [{ value: "higgsfield-locked", label: t("mcp.higgsfieldLocked"), disabled: true }],
      });
    }
  } else {
    modelGroups.push({
      label: videoModel ? t("mcp.videoModels") : t("mcp.imageModels"),
      items: (videoModel ? VIDEO_MODEL_OPTIONS : coreModels).map((option) => ({
        value: videoModel ? `${VIDEO_PREFIX}${option.value}` : option.value,
        label: option.shortLabel,
      })),
    });
    if (isGptFamily) {
      modelGroups.push({
        label: t("sidebar.reasoningLabel"),
        items: REASONING_EFFORT_OPTIONS.map((option) => ({
          value: `${EFFORT_PREFIX}${option.value}`,
          label: option.shortLabel,
          sub: option.value === reasoningEffort ? "●" : undefined,
        })),
      });
    }
  }

  const currentEffort = REASONING_EFFORT_OPTIONS.find((option) => option.value === reasoningEffort);

  return (
    <div
      className={`image-model-select image-model-select--sidebar gen-provider-model${compact ? " is-compact" : ""}`}
    >
      <Select
        id="sidebar-generation-provider"
        className="gen-provider-model__select gen-provider-model__select--provider"
        groups={providerGroups}
        value={providerValue}
        onChange={onProviderChange}
        ariaLabel={t("mcp.providerLabel")}
        title={unavailableReason ?? t("mcp.providerLabel")}
        portal
      />

      <Select
        id="sidebar-generation-model"
        className="gen-provider-model__select gen-provider-model__select--model"
        groups={modelGroups}
        value={modelValue}
        onChange={onModelChange}
        ariaLabel={t("mcp.modelLabel")}
        title={unavailableReason ?? t("mcp.modelLabel")}
        disabled={Boolean(unavailableReason)}
        placeholder={mcpProvider
          ? (modelsLoading ? t("mcp.loadingModels") : t("mcp.chooseModel"))
          : undefined}
        triggerSub={isGptFamily && currentEffort ? currentEffort.shortLabel : undefined}
        portal
      />

      {(unavailableReason || error || catalogError) ? (
        <span className="image-model-select__trigger-effort" role="status">
          {unavailableReason
            ?? (catalogError ? (
              <button
                type="button"
                className="image-model-select__retry"
                onClick={() => setCatalogRetryToken((token) => token + 1)}
              >
                {t("mcp.modelsLoadFailed")}
              </button>
            ) : (loading ? t("mcp.loadingProviders") : t("mcp.providersLoadFailed")))}
        </span>
      ) : null}
    </div>
  );
}
