import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { useStats } from "../../hooks/useStats.js";
import type { StatsRange, StatsCurrency } from "../../types/stats.js";
import { useAppStore } from "../../store/useAppStore";
import { CostSummaryCard } from "./CostSummaryCard.js";
import { DailyTrendCard } from "./DailyTrendCard.js";
import { ModelDistCard } from "./ModelDistCard.js";
import { ProviderDistCard } from "./ProviderDistCard.js";
import { TokenUsageCard } from "./TokenUsageCard.js";
import { PromptWordCloudCard } from "./PromptWordCloudCard.js";
import { SizeDistCard } from "./SizeDistCard.js";
import { QualityDistCard } from "./QualityDistCard.js";

const STATS_RANGE_KEY = "ima2.statsRange";

function loadStatsRange(): StatsRange {
  try {
    const raw = localStorage.getItem(STATS_RANGE_KEY);
    if (raw === "today" || raw === "7d" || raw === "30d" || raw === "all") return raw;
  } catch {}
  return "7d";
}

function saveStatsRange(range: StatsRange): void {
  try {
    localStorage.setItem(STATS_RANGE_KEY, range);
  } catch {}
}

interface RangeOption {
  value: StatsRange;
  key: string;
}

const RANGE_OPTIONS: RangeOption[] = [
  { value: "today", key: "dashboard.rangeToday" },
  { value: "7d", key: "dashboard.range7d" },
  { value: "30d", key: "dashboard.range30d" },
  { value: "all", key: "dashboard.rangeAll" },
];

export function DashboardPage() {
  const { t } = useI18n();
  const currency = useAppStore((s) => s.currency);
  const [range, setRange] = useState<StatsRange>(loadStatsRange);
  const { data, loading, error, refetch } = useStats(range, currency as StatsCurrency);

  useEffect(() => {
    saveStatsRange(range);
  }, [range]);

  return (
    <div className="dashboard-workspace">
      <div className="dashboard-workspace__inner">
        <header className="dashboard-header">
          <div className="dashboard-title-block">
            <h1>{t("dashboard.title")}</h1>
            <p>{t("dashboard.subtitle")}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span className="dashboard-currency-badge">
              {currency === "CNY" ? "¥ CNY" : "$ USD"}
            </span>
            <div className="dashboard-range-switch">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`dashboard-range-btn${range === opt.value ? " is-active" : ""}`}
                  onClick={() => setRange(opt.value)}
                >
                  {t(opt.key)}
                </button>
              ))}
            </div>
          </div>
        </header>

        {loading && !data && (
          <div className="dash-loading">{t("dashboard.loading")}</div>
        )}

        {error && !data && (
          <div className="dash-error">
            <span>{t("dashboard.error")}: {error}</span>
            <button className="dash-error__retry" onClick={() => refetch()}>
              {t("dashboard.retry")}
            </button>
          </div>
        )}

        {data && (
          data.totalImages === 0 && data.totalVideos === 0 ? (
            <div className="dash-empty" style={{ minHeight: "300px" }}>
              {t("dashboard.noData")}
            </div>
          ) : (
            <div className="dashboard-grid">
              <CostSummaryCard data={data} />
              <TokenUsageCard data={data} />
              <DailyTrendCard data={data} />
              <ModelDistCard data={data} />
              <ProviderDistCard data={data} />
              <SizeDistCard data={data} />
              <QualityDistCard data={data} />
              <PromptWordCloudCard data={data} />
            </div>
          )
        )}
      </div>
    </div>
  );
}
