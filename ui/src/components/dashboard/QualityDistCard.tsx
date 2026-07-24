import { useI18n } from "../../i18n";
import { StatCard } from "./StatCard.js";
import type { StatsResponse, DistributionEntry } from "../../types/stats.js";

interface Props {
  data: StatsResponse;
}

export function QualityDistCard({ data }: Props) {
  const { t } = useI18n();
  const qualities = data.qualityDistribution;
  if (!qualities || qualities.length === 0) {
    return (
      <StatCard title={t("dashboard.qualityDist")}>
        <div className="dash-empty">{t("dashboard.noData")}</div>
      </StatCard>
    );
  }
  const total = qualities.reduce((s: number, q: DistributionEntry) => s + q.count, 0) || 1;
  return (
    <StatCard title={t("dashboard.qualityDist")}>
      <div className="dash-stat-row" style={{ flexWrap: "wrap", gap: "16px" }}>
        {qualities.map((q: DistributionEntry) => {
          const pct = (q.count / total) * 100;
          return (
            <div key={q.key} className="dash-stat-item" style={{ gap: "2px" }}>
              <span className="dash-stat-item__value" style={{ fontSize: "20px" }}>
                {pct.toFixed(0)}%
              </span>
              <span className="dash-stat-item__label" style={{ fontSize: "10px", textTransform: "capitalize" }}>
                {q.key}
              </span>
            </div>
          );
        })}
      </div>
    </StatCard>
  );
}
