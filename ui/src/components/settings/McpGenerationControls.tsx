// 030 — MCP-lane generation controls for the right-panel Settings tab.
// Rendered instead of the core provider controls while an MCP provider is
// selected (devlog/_fin/260716_mcp-model-surface-ui/030).
import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import {
  setMcpMediaKindImpl,
  setMcpParameterImpl,
  setMcpProviderImpl,
  setMcpRatioImpl,
} from "../../store/storeSettingsImpl";
import {
  getMcpModelCatalog,
  type McpPresetValue,
  type McpModelCatalog,
  type McpProviderRecord,
} from "../../lib/mcpProviders";
import { type McpMediaKind } from "../../lib/mcpSelection";
import { useI18n } from "../../i18n";
import { McpModelPresetControls } from "./McpModelPresetControls";

const EMPTY_CATALOG: McpModelCatalog = { image: [], video: [] };
const EMPTY_PARAMETERS: Record<string, McpPresetValue> = {};

function displayProviderId(id: string): string {
  return id.replace(/(^|-)([a-z])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

export function McpGenerationControls({ record }: { record: McpProviderRecord | null }) {
  const { t } = useI18n();
  const mcpProvider = useAppStore((s) => s.mcpProvider ?? null);
  const mcpModel = useAppStore((s) => s.mcpModel ?? null);
  const mcpMediaKind = useAppStore((s) => s.mcpMediaKind ?? "image");
  const mcpRatio = useAppStore((s) => s.mcpRatio ?? null);
  const storedMcpParameters = useAppStore((s) => s.mcpParameters);
  const mcpParameters = storedMcpParameters ?? EMPTY_PARAMETERS;
  const [catalog, setCatalog] = useState<McpModelCatalog>(EMPTY_CATALOG);
  const [catalogState, setCatalogState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [catalogRetryToken, setCatalogRetryToken] = useState(0);

  const locked = mcpProvider === "higgsfield";
  const connected = record?.status.state === "connected";

  useEffect(() => {
    // Catalog browsing is allowed while generation is locked (040).
    if (!mcpProvider || !connected) {
      setCatalog(EMPTY_CATALOG);
      setCatalogState("idle");
      return;
    }
    const controller = new AbortController();
    setCatalog(EMPTY_CATALOG);
    setCatalogState("loading");
    void getMcpModelCatalog(mcpProvider, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setCatalog(next);
        setCatalogState("ready");
      })
      .catch((cause) => {
        if ((cause as { name?: string }).name === "AbortError") return;
        if (!controller.signal.aborted) {
          setCatalog(EMPTY_CATALOG);
          setCatalogState("error");
        }
      });
    return () => controller.abort();
  }, [mcpProvider, connected, catalogRetryToken]);

  if (!mcpProvider) return null;

  const models = mcpMediaKind === "video" ? catalog.video : catalog.image;
  const selectedEntry = models.find((entry) => entry.id === mcpModel) ?? null;
  const setKind = (kind: McpMediaKind) =>
    setMcpMediaKindImpl(kind, useAppStore.setState, useAppStore.getState);

  return (
    <div className="mcp-generation-controls" data-testid="mcp-generation-controls">
      <div className="option-group">
        <div className="section-title mcp-generation-controls__header">
          <span>{displayProviderId(mcpProvider)} · MCP</span>
          <button
            type="button"
            className="mcp-generation-controls__exit"
            onClick={() => setMcpProviderImpl(null, useAppStore.setState, useAppStore.getState)}
          >
            {t("mcp.exitLane")}
          </button>
        </div>
        {!connected ? (
          <p className="option-help">{t("mcp.disconnectedSelection")}</p>
        ) : null}
        {locked ? (
          <p className="option-help">{t("mcp.higgsfieldLocked")}</p>
        ) : null}
      </div>
      <>
          <div className="option-group">
            <div className="option-row">
              <button
                type="button"
                className={`option-btn${mcpMediaKind === "image" ? " active" : ""}`}
                aria-pressed={mcpMediaKind === "image"}
                onClick={() => setKind("image")}
              >
                {t("grokMode.image")}
              </button>
              <button
                type="button"
                className={`option-btn${mcpMediaKind === "video" ? " active" : ""}`}
                aria-pressed={mcpMediaKind === "video"}
                onClick={() => setKind("video")}
              >
                {t("grokMode.video")}
              </button>
            </div>
          </div>
          <div className="option-group">
            <div className="section-title">{t("mcp.modelSectionTitle")}</div>
            {catalogState === "loading" ? (
              <p className="option-help" role="status">{t("mcp.loadingModels")}</p>
            ) : catalogState === "error" ? (
              <div className="mcp-catalog-state" role="alert">
                <span>{t("mcp.modelsLoadFailed")}</span>
                <button
                  type="button"
                  className="settings-action-btn"
                  onClick={() => setCatalogRetryToken((value) => value + 1)}
                >
                  {t("mcp.retryModels")}
                </button>
              </div>
            ) : catalogState === "ready" && models.length === 0 ? (
              <p className="option-help">{t("mcp.noModels")}</p>
            ) : selectedEntry ? (
              <>
                <div className="mcp-selected-model">
                  <strong>{selectedEntry.label}</strong>
                  {selectedEntry.description ? <span>{selectedEntry.description}</span> : null}
                </div>
                <McpModelPresetControls
                  entry={selectedEntry}
                  ratio={mcpRatio}
                  parameters={mcpParameters}
                  disabled={locked}
                  onRatio={(value) => setMcpRatioImpl(value, useAppStore.setState)}
                  onParameter={(name, value) => setMcpParameterImpl(name, value, useAppStore.setState, useAppStore.getState)}
                />
              </>
            ) : (
              <p className="option-help">{mcpModel ? t("mcp.providerDefaultsHelp") : t("mcp.chooseModelForPresets")}</p>
            )}
          </div>
      </>
    </div>
  );
}
