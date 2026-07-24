import { useI18n } from "../../i18n";
import { StatCard } from "./StatCard.js";
import type { StatsResponse } from "../../types/stats.js";

interface Props {
  data: StatsResponse;
}

export function TokenUsageCard({ data }: Props) {
  const { t } = useI18n();
  const hasTokens = data.totalTokens > 0;
  return (
    <StatCard title={t("dashboard.totalTokens")}>
      {hasTokens ? (
        <div className="dash-stat-row">
          <div className="dash-stat-item">
            <span className="dash-stat-item__value">
              {data.totalTokens.toLocaleString()}
            </span>
            <span className="dash-stat-item__label">{t("dashboard.totalTokens")}</span>
          </div>
          <div className="dash-stat-item">
            <span className="dash-stat-item__value">
              {data.totalImages > 0
                ? Math.round(data.totalTokens / data.totalImages).toLocaleString()
                : "0"}
            </span>
            <span className="dash-stat-item__label">Avg / Img</span>
          </div>
        </div>
      ) : (
        <div className="dash-empty">{t("dashboard.noData")}</div>
      )}
    </StatCard>
  );
}
