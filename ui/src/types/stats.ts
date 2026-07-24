// Shared types for the stats/dashboard feature.
// Used by both server (lib/statsAggregator.ts) and client (ui/).

export type StatsRange = "today" | "7d" | "30d" | "all";
export type StatsCurrency = "CNY" | "USD";

export interface DailyStat {
  date: string; // "YYYY-MM-DD"
  count: number;
  costUsd: number;
  tokens: number;
}

export interface DistributionEntry {
  key: string; // model / provider / size / quality
  count: number;
  costUsd: number;
}

export interface WordCloudEntry {
  word: string;
  count: number;
}

export interface StatsResponse {
  range: string;
  totalImages: number;
  totalVideos: number;
  totalTokens: number;
  totalCostUsd: number;
  totalCostDisplay: string;
  currency: StatsCurrency;
  avgElapsedSeconds: number;
  dailyBreakdown: DailyStat[];
  modelDistribution: DistributionEntry[];
  providerDistribution: DistributionEntry[];
  sizeDistribution: DistributionEntry[];
  qualityDistribution: DistributionEntry[];
  promptWordCloud: WordCloudEntry[];
}
