import { useI18n } from "../../i18n";
import { StatCard } from "./StatCard.js";
import type { StatsResponse, DailyStat } from "../../types/stats.js";

interface Props {
  data: StatsResponse;
}

export function DailyTrendCard({ data }: Props) {
  const { t } = useI18n();
  const daily = data.dailyBreakdown;
  if (!daily || daily.length === 0) {
    return (
      <StatCard title={t("dashboard.dailyTrend")} wide>
        <div className="dash-empty">{t("dashboard.noData")}</div>
      </StatCard>
    );
  }
  const maxCount = Math.max(...daily.map((d: DailyStat) => d.count), 1);
  return (
    <StatCard title={t("dashboard.dailyTrend")} wide>
      <div className="dash-chart dash-chart--tall">
        <div style={{ display: "flex", gap: "2px", alignItems: "flex-end", height: "100%" }}>
          {daily.map((d: DailyStat) => {
            const height = (d.count / maxCount) * 100;
            return (
              <div key={d.date} style={{
                flex: "1 1 0",
                minWidth: "8px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                alignItems: "center",
                height: "100%",
              }}>
                <div style={{
                  width: "70%",
                  height: `${height}%`,
                  background: "var(--accent)",
                  borderRadius: "3px 3px 0 0",
                  minHeight: "2px",
                }} title={`${d.date}: ${d.count} images`} />
                {daily.length <= 20 && (
                  <span style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "4px" }}>
                    {d.date.slice(5)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </StatCard>
  );
}
