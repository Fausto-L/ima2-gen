// 030 — MCP-lane generation controls for the right-panel Settings tab.
// Rendered instead of the core provider controls while an MCP provider is
// selected (devlog/_plan/260716_mcp-model-surface-ui/030).
import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import {
  setMcpMediaKindImpl,
  setMcpModelWithKindImpl,
  setMcpProviderImpl,
  setMcpRatioImpl,
} from "../../store/storeSettingsImpl";
import {
  getMcpModelCatalog,
  type McpModelCatalog,
  type McpProviderRecord,
} from "../../lib/mcpProviders";
import { MCP_RATIO_PRESETS, type McpMediaKind } from "../../lib/mcpSelection";
import { useI18n } from "../../i18n";

const EMPTY_CATALOG: McpModelCatalog = { image: [], video: [] };

function displayProviderId(id: string): string {
  return id.replace(/(^|-)([a-z])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

export function McpGenerationControls({ record }: { record: McpProviderRecord | null }) {
  const { t } = useI18n();
  const mcpProvider = useAppStore((s) => s.mcpProvider ?? null);
  const mcpModel = useAppStore((s) => s.mcpModel ?? null);
  const mcpMediaKind = useAppStore((s) => s.mcpMediaKind ?? "image");
  const mcpRatio = useAppStore((s) => s.mcpRatio ?? null);
  const [catalog, setCatalog] = useState<McpModelCatalog>(EMPTY_CATALOG);
  const [catalogFailed, setCatalogFailed] = useState(false);

  const locked = mcpProvider === "higgsfield";
  const connected = record?.status.state === "connected";

  useEffect(() => {
    // Catalog browsing is allowed while generation is locked (040).
    if (!mcpProvider || !connected) {
      setCatalog(EMPTY_CATALOG);
      return;
    }
    const controller = new AbortController();
    setCatalogFailed(false);
    void getMcpModelCatalog(mcpProvider, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setCatalog(next);
      })
      .catch((cause) => {
        if ((cause as { name?: string }).name === "AbortError") return;
        if (!controller.signal.aborted) {
          setCatalog(EMPTY_CATALOG);
          setCatalogFailed(true);
        }
      });
    return () => controller.abort();
  }, [mcpProvider, connected]);

  if (!mcpProvider) return null;

  const models = mcpMediaKind === "video" ? catalog.video : catalog.image;
  const setKind = (kind: McpMediaKind) =>
    setMcpMediaKindImpl(kind, useAppStore.setState, useAppStore.getState);
  const showRatio = mcpProvider === "runway";

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
                onClick={() => setKind("image")}
              >
                {t("grokMode.image")}
              </button>
              <button
                type="button"
                className={`option-btn${mcpMediaKind === "video" ? " active" : ""}`}
                onClick={() => setKind("video")}
              >
                {t("grokMode.video")}
              </button>
            </div>
          </div>
          <div className="option-group">
            <div className="section-title">{t("mcp.modelSectionTitle")}</div>
            {catalogFailed ? <p className="option-help">{t("mcp.modelsLoadFailed")}</p> : null}
            <div className="mcp-generation-controls__models">
              {models.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`option-btn${mcpModel === entry.id ? " active" : ""}`}
                  title={entry.description ?? entry.id}
                  onClick={() =>
                    setMcpModelWithKindImpl(entry.id, mcpMediaKind, useAppStore.setState, useAppStore.getState)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
          {showRatio ? (
          <div className="option-group">
            <div className="section-title">{t("size.grokAspectTitle")}</div>
            <div className="option-row">
              <button
                type="button"
                className={`option-btn${mcpRatio === null ? " active" : ""}`}
                onClick={() => setMcpRatioImpl(null, useAppStore.setState)}
              >
                {t("size.autoLabel")}
              </button>
              {MCP_RATIO_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`option-btn${mcpRatio === preset ? " active" : ""}`}
                  onClick={() => setMcpRatioImpl(preset, useAppStore.setState)}
                >
                  {preset}
                </button>
              ))}
            </div>
            <p className="option-help">{t("mcp.ratioAutoHelp")}</p>
          </div>
          ) : null}
      </>
    </div>
  );
}
