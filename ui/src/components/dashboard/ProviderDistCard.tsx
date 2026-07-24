import { useI18n } from "../../i18n";
import { StatCard } from "./StatCard.js";
import type { StatsResponse, DistributionEntry } from "../../types/stats.js";

const PROVIDER_LABELS: Record<string, string> = {
  oauth: "ChatGPT OAuth",
  api: "OpenAI API",
  grok: "Grok",
  "grok-api": "Grok API",
  agy: "AGY",
  "gemini-api": "Gemini",
  dashscope: "DashScope",
};

interface Props {
  data: StatsResponse;
}

export function ProviderDistCard({ data }: Props) {
  const { t } = useI18n();
  const providers = data.providerDistribution;
  if (!providers || providers.length === 0) {
    return (
      <StatCard title={t("dashboard.providerDist")}>
        <div className="dash-empty">{t("dashboard.noData")}</div>
      </StatCard>
    );
  }
  const total = providers.reduce((s: number, p: DistributionEntry) => s + p.count, 0) || 1;
  return (
    <StatCard title={t("dashboard.providerDist")}>
      <div className="dash-stat-row" style={{ flexWrap: "wrap", gap: "16px" }}>
        {providers.map((p: DistributionEntry) => {
          const pct = (p.count / total) * 100;
          return (
            <div key={p.key} className="dash-stat-item" style={{ gap: "2px" }}>
              <span className="dash-stat-item__value" style={{ fontSize: "20px" }}>
                {pct.toFixed(0)}%
              </span>
              <span className="dash-stat-item__label" style={{ fontSize: "10px" }}>
                {PROVIDER_LABELS[p.key] || p.key}
              </span>
            </div>
          );
        })}
      </div>
    </StatCard>
  );
}
