import { useI18n } from "../../i18n";
import { StatCard } from "./StatCard.js";
import type { StatsResponse, WordCloudEntry } from "../../types/stats.js";

interface Props {
  data: StatsResponse;
}

const FONT_SIZES = [28, 24, 20, 17, 14, 12];

export function PromptWordCloudCard({ data }: Props) {
  const { t } = useI18n();
  const words = data.promptWordCloud;
  if (!words || words.length === 0) {
    return (
      <StatCard title={t("dashboard.promptCloud")} wide>
        <div className="dash-empty">{t("dashboard.noData")}</div>
      </StatCard>
    );
  }
  const maxCount = words[0].count || 1;
  return (
    <StatCard title={t("dashboard.promptCloud")} wide>
      <div className="dash-word-cloud">
        {words.map((w: WordCloudEntry) => {
          const ratio = w.count / maxCount;
          const sizeIdx = Math.min(
            Math.floor((1 - ratio) * FONT_SIZES.length),
            FONT_SIZES.length - 1,
          );
          return (
            <span
              key={w.word}
              className="dash-word-cloud__tag"
              style={{
                fontSize: `${FONT_SIZES[sizeIdx]}px`,
                opacity: 0.5 + ratio * 0.5,
              }}
            >
              {w.word} <span style={{ fontSize: "0.7em", color: "var(--text-muted)" }}>{w.count}</span>
            </span>
          );
        })}
      </div>
    </StatCard>
  );
}
