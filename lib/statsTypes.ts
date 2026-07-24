// Server-side stats types — mirrors ui/src/types/stats.ts.
// Duplicated because server uses NodeNext (.js imports) and UI uses Vite.
// If you update one, update the other.

export type StatsRange = "today" | "7d" | "30d" | "all";
export type StatsCurrency = "CNY" | "USD";

export interface DailyStat {
  date: string;
  count: number;
  costUsd: number;
  tokens: number;
}

export interface DistributionEntry {
  key: string;
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
