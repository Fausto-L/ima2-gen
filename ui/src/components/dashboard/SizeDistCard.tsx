import { useI18n } from "../../i18n";
import { StatCard } from "./StatCard.js";
import type { StatsResponse, DistributionEntry } from "../../types/stats.js";

interface Props {
  data: StatsResponse;
}

export function SizeDistCard({ data }: Props) {
  const { t } = useI18n();
  const sizes = data.sizeDistribution;
  if (!sizes || sizes.length === 0) {
    return (
      <StatCard title={t("dashboard.sizeDist")}>
        <div className="dash-empty">{t("dashboard.noData")}</div>
      </StatCard>
    );
  }
  const total = sizes.reduce((s: number, x: DistributionEntry) => s + x.count, 0) || 1;
  return (
    <StatCard title={t("dashboard.sizeDist")}>
      <div className="dash-chart">
        {sizes.map((s: DistributionEntry) => {
          const pct = (s.count / total) * 100;
          return (
            <div key={s.key} style={{ marginBottom: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "3px" }}>
                <span style={{ color: "var(--text)" }}>{s.key}</span>
                <span style={{ color: "var(--text-muted)" }}>
                  {s.count} ({pct.toFixed(0)}%)
                </span>
              </div>
              <div style={{ height: "6px", borderRadius: "3px", background: "var(--surface-2, #1c1c23)", overflow: "hidden" }}>
                <div style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: "var(--accent)",
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
