import { useI18n } from "../../i18n";
import { StatCard } from "./StatCard.js";
import type { StatsResponse } from "../../types/stats.js";

interface Props {
  data: StatsResponse;
}

export function CostSummaryCard({ data }: Props) {
  const { t } = useI18n();
  return (
    <StatCard title={t("dashboard.costSummary")}>
      <div className="dash-stat-row">
        <div className="dash-stat-item">
          <span className="dash-stat-item__value">{data.totalCostDisplay}</span>
          <span className="dash-stat-item__label">{t("dashboard.totalCost")}</span>
        </div>
        <div className="dash-stat-item">
          <span className="dash-stat-item__value">{data.totalImages}</span>
          <span className="dash-stat-item__label">{t("dashboard.totalImages")}</span>
        </div>
        <div className="dash-stat-item">
          <span className="dash-stat-item__value">
            {data.totalTokens.toLocaleString()}
          </span>
          <span className="dash-stat-item__label">{t("dashboard.totalTokens")}</span>
        </div>
        <div className="dash-stat-item">
          <span className="dash-stat-item__value">
            {data.avgElapsedSeconds.toFixed(1)}{t("dashboard.seconds")}
          </span>
          <span className="dash-stat-item__label">{t("dashboard.avgElapsed")}</span>
        </div>
      </div>
    </StatCard>
  );
}
