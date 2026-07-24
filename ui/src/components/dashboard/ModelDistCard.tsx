import { useI18n } from "../../i18n";
import { StatCard } from "./StatCard.js";
import type { StatsResponse, DistributionEntry } from "../../types/stats.js";

const MODEL_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#ec4899",
  "#f43f5e", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#10b981", "#14b8a6",
  "#06b6d4", "#0ea5e9", "#3b82f6", "#64748b",
];

interface Props {
  data: StatsResponse;
}

export function ModelDistCard({ data }: Props) {
  const { t } = useI18n();
  const models = data.modelDistribution;
  if (!models || models.length === 0) {
    return (
      <StatCard title={t("dashboard.modelDist")}>
        <div className="dash-empty">{t("dashboard.noData")}</div>
      </StatCard>
    );
  }
  const total = models.reduce((s: number, m: DistributionEntry) => s + m.count, 0) || 1;
  return (
    <StatCard title={t("dashboard.modelDist")}>
      <div className="dash-chart">
        {models.map((m: DistributionEntry, i: number) => {
          const pct = (m.count / total) * 100;
          return (
            <div key={m.key} style={{ marginBottom: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "3px" }}>
                <span style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: "8px" }}>
                  {m.key}
                </span>
                <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                  {pct.toFixed(1)}%
                </span>
              </div>
              <div style={{ height: "6px", borderRadius: "3px", background: "var(--surface-2, #1c1c23)", overflow: "hidden" }}>
                <div style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: MODEL_COLORS[i % MODEL_COLORS.length],
                  borderRadius: "3px",
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </StatCard>
  );
}
