// 030 — connection status strip pinned at the top of the right-panel Settings
// tab (devlog/_plan/260716_mcp-model-surface-ui/030). MCP provider records are
// received via props so the parent owns the single useMcpProviders poller.
import { useProviderAvailability } from "../ProviderSelect";
import type { McpProviderRecord } from "../../lib/mcpProviders";
import { useI18n } from "../../i18n";

const CORE_ENTRIES: ReadonlyArray<{ key: "oauth" | "api" | "grok" | "grok-api" | "agy" | "gemini-api"; label: string }> = [
  { key: "oauth", label: "GPT" },
  { key: "api", label: "API" },
  { key: "grok", label: "Grok" },
  { key: "grok-api", label: "xAI" },
  { key: "agy", label: "agy" },
  { key: "gemini-api", label: "Gem" },
];

function mcpDotState(record: McpProviderRecord): "ok" | "warn" | "bad" {
  if (record.status.state === "connected") return "ok";
  if (record.status.state === "connecting" || record.status.state === "auth_required") return "warn";
  return "bad";
}

function displayProviderId(id: string): string {
  return id.replace(/(^|-)([a-z])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

export function ProviderStatusStrip({ mcpProviders }: { mcpProviders: McpProviderRecord[] }) {
  const { t } = useI18n();
  const availability = useProviderAvailability();

  return (
    <div className="provider-status-strip" data-testid="provider-status-strip">
      {CORE_ENTRIES.map((entry) => {
        const state = availability[entry.key];
        return (
          <span
            key={entry.key}
            className="provider-status-strip__item"
            title={state.ok ? t("provider.availableAria", { name: entry.label }) : state.reason}
          >
            <span
              className={`status-dot ${state.ok ? "status-dot--ok" : "status-dot--bad"}`}
              aria-hidden="true"
            />
            {entry.label}
          </span>
        );
      })}
      {mcpProviders.filter((record) => record.enabled).map((record) => {
        const dot = mcpDotState(record);
        return (
          <span
            key={record.id}
            className="provider-status-strip__item provider-status-strip__item--mcp"
            title={record.status.detail ?? record.status.state}
          >
            <span
              className={`status-dot ${dot === "ok" ? "status-dot--ok" : dot === "warn" ? "status-dot--warn" : "status-dot--bad"}`}
              aria-hidden="true"
            />
            {displayProviderId(record.id)}
          </span>
        );
      })}
    </div>
  );
}
