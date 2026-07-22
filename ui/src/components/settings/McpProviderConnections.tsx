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
  const [busyAction, setBusyAction] = useState<{ provider: string; action: "connect" | "refresh" | "disconnect" } | null>(null);
  const [listRefreshBusy, setListRefreshBusy] = useState(false);
  const [actionError, setActionError] = useState<{ provider: string; message: string } | null>(null);

  const runListRefresh = async () => {
    if (listRefreshBusy) return;
    setListRefreshBusy(true);
    try {
      await refresh();
    } finally {
      setListRefreshBusy(false);
    }
  };

  const runAction = async (provider: McpProviderRecord, action: "connect" | "refresh" | "disconnect") => {
    setBusyAction({ provider: provider.id, action });
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
      setBusyAction(null);
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
          <button
            type="button"
            className="settings-action-btn"
            onClick={() => void runListRefresh()}
            disabled={loading || listRefreshBusy}
            aria-busy={loading || listRefreshBusy}
          >
            {loading || listRefreshBusy ? t("mcp.loadingProviders") : t("mcp.refreshList")}
          </button>
        </div>
      </article>

      {error ? (
        <p role="alert" className="settings-row__microcopy">{t("mcp.providersLoadFailed")}</p>
      ) : null}

      {providers.map((provider) => {
        const state = provider.status.state;
        // Lock state comes from the server record (executable/lockReason), not
        // a provider-id hardcode (260723).
        const locked = !provider.enabled || provider.executable === false;
        const activeAction = busyAction?.provider === provider.id ? busyAction.action : null;
        const busy = activeAction !== null;
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
                  {provider.enabled
                    ? (provider.lockReason ?? t("mcp.higgsfieldLocked"))
                    : t("mcp.disabledProvider")}
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
                    aria-busy={activeAction === "refresh"}
                  >
                    {activeAction === "refresh" ? t("mcp.refreshingConnection") : t("mcp.refreshConnection")}
                  </button>
                  <button
                    type="button"
                    className="settings-action-btn settings-action-btn--danger"
                    onClick={() => void runAction(provider, "disconnect")}
                    disabled={busy}
                    aria-busy={activeAction === "disconnect"}
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
                  aria-busy={activeAction === "connect"}
                  title={locked ? t("mcp.higgsfieldLocked") : t("mcp.connectOpensBrowser")}
                >
                  {activeAction === "connect" ? t("mcp.connecting") : t("mcp.connect")}
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
