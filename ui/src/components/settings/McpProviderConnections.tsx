import { useState } from "react";
import {
  connectMcpProvider,
  disconnectMcpProvider,
  refreshMcpProvider,
  type McpConnectionState,
  type McpProviderRecord,
  useMcpProviders,
} from "../../lib/mcpProviders";
import { useI18n } from "../../i18n";

function statusTone(state: McpConnectionState): "ok" | "warn" | "err" {
  if (state === "connected") return "ok";
  if (state === "error" || state === "offline") return "err";
  return "warn";
}

function diffCount(provider: McpProviderRecord): number {
  const diff = provider.status.snapshotDiff;
  return diff ? diff.drifted.length + diff.missing.length + diff.added.length : 0;
}

export function McpProviderConnections() {
  const { t } = useI18n();
  const { providers, loading, error, refresh } = useMcpProviders();
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ provider: string; message: string } | null>(null);

  const runAction = async (provider: McpProviderRecord, action: "connect" | "refresh" | "disconnect") => {
    setBusyProvider(provider.id);
    setActionError(null);
    try {
      if (action === "connect") await connectMcpProvider(provider.id);
      else if (action === "refresh") await refreshMcpProvider(provider.id);
      else await disconnectMcpProvider(provider.id);
      await refresh();
    } catch (cause) {
      const message = cause instanceof Error && cause.message === "MCP_POPUP_BLOCKED"
        ? t("mcp.popupBlocked")
        : t("mcp.connectionActionFailed");
      setActionError({ provider: provider.id, message });
    } finally {
      setBusyProvider(null);
    }
  };

  return (
    <div aria-labelledby="mcp-provider-connections-title">
      <article className="settings-row">
        <div className="settings-row__copy">
          <h4 id="mcp-provider-connections-title">{t("mcp.connectionsTitle")}</h4>
          <p>{t("mcp.connectionsBody")}</p>
        </div>
        <div className="settings-row__control">
          <button type="button" className="settings-action-btn" onClick={() => void refresh()} disabled={loading}>
            {loading ? t("mcp.loadingProviders") : t("mcp.refreshList")}
          </button>
        </div>
      </article>

      {error && providers.length === 0 ? (
        <p role="alert" className="settings-row__microcopy">{t("mcp.providersLoadFailed")}</p>
      ) : null}

      {providers.map((provider) => {
        const state = provider.status.state;
        const locked = provider.id === "higgsfield" || !provider.enabled;
        const busy = busyProvider === provider.id;
        const changes = diffCount(provider);
        return (
          <article className="provider-card" key={provider.id}>
            <div className="provider-card__head">
              <h4>{provider.id}</h4>
              <span className="provider-card__eyebrow">MCP</span>
              <span className={`provider-chip provider-chip--${statusTone(state)}`}>
                {t(`mcp.status.${state}`)}
              </span>
            </div>
            <div className="settings-row__copy">
              <p>{provider.endpoint}</p>
              <p>
                {typeof provider.status.toolCount === "number"
                  ? t("mcp.toolCount", { count: provider.status.toolCount })
                  : t("mcp.toolCountUnknown")}
                {changes > 0 ? ` · ${t("mcp.snapshotChanges", { count: changes })}` : ""}
              </p>
              {locked ? (
                <p className="settings-row__microcopy">
                  {provider.id === "higgsfield" ? t("mcp.higgsfieldLocked") : t("mcp.disabledProvider")}
                </p>
              ) : provider.status.detail ? (
                <p className="settings-row__microcopy">{provider.status.detail}</p>
              ) : null}
              {actionError?.provider === provider.id ? (
                <p role="alert" className="settings-row__microcopy">{actionError.message}</p>
              ) : null}
            </div>
            <div className="provider-card__head">
              <span className="provider-card__eyebrow">{t("mcp.billingLabel")}</span>
              <span className="provider-chip provider-chip--warn">{t("mcp.billingUnknown")}</span>
            </div>
            <div className="settings-row__control" aria-live="polite">
              {state === "connected" && !locked ? (
                <>
                  <button
                    type="button"
                    className="settings-action-btn"
                    onClick={() => void runAction(provider, "refresh")}
                    disabled={busy}
                  >
                    {t("mcp.refreshConnection")}
                  </button>
                  <button
                    type="button"
                    className="settings-action-btn settings-action-btn--danger"
                    onClick={() => void runAction(provider, "disconnect")}
                    disabled={busy}
                  >
                    {t("mcp.disconnect")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="settings-action-btn"
                  onClick={() => void runAction(provider, "connect")}
                  disabled={busy || locked}
                  title={locked ? t("mcp.higgsfieldLocked") : t("mcp.connectOpensBrowser")}
                >
                  {busy ? t("mcp.connecting") : t("mcp.connect")}
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
