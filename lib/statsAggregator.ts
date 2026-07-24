import { listHistoryRows } from "./historyList.js";
import { estimateCost } from "./costTable.js";
import { formatPrice } from "./currencyFormatter.js";
import type {
  StatsRange,
  StatsCurrency,
  StatsResponse,
  DailyStat,
  DistributionEntry,
  WordCloudEntry,
} from "./statsTypes.js";

// ── English stopwords ─────────────────────────────────────────────────────
const ENGLISH_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "are", "was", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "must", "can", "shall",
  "this", "that", "these", "those", "i", "you", "he", "she", "it",
  "we", "they", "what", "which", "who", "whom", "whose", "where",
  "when", "why", "how", "all", "both", "each", "few", "more", "most",
  "other", "some", "such", "no", "nor", "not", "only", "own", "same",
  "so", "than", "too", "very", "just", "about", "above", "after",
  "again", "against", "below", "during", "into", "off", "out", "over",
  "under", "up", "down", "further", "then", "once", "here", "there",
  "image", "prompt", "generate", "generation", "picture", "photo",
  "looking", "like", "style", "very", "much", "using", "use",
]);

// ── Chinese stopwords ─────────────────────────────────────────────────────
const CJK_STOPWORDS = new Set([
  "的", "了", "在", "是", "我", "他", "她", "它", "们", "这", "那", "些",
  "和", "与", "或", "但", "不", "也", "都", "就", "而", "则", "把", "被",
  "让", "使", "给", "为", "以", "于", "及", "或", "等", "之", "其", "所",
  "一", "个", "中", "上", "下", "里", "外", "前", "后", "内", "间",
]);

const MAX_WORD_CLOUD_ENTRIES = 50;

function getRangeStartMs(range: StatsRange): number {
  const now = Date.now();
  switch (range) {
    case "today": {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case "7d":
      return now - 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return now - 30 * 24 * 60 * 60 * 1000;
    case "all":
    default:
      return 0;
  }
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Word cloud tokenization ──────────────────────────────────────────────
function tokenizePrompt(text: string): string[] {
  const tokens: string[] = [];

  // English/Latin tokenization: split on whitespace + punctuation
  const latinWords = text.match(/[a-zA-Z]{2,}/g) || [];
  for (const word of latinWords) {
    const lower = word.toLowerCase();
    if (ENGLISH_STOPWORDS.has(lower)) continue;
    if (lower.length < 2) continue;
    tokens.push(lower);
  }

  // CJK tokenization: 2-gram (bigram) for frequency
  // Extract CJK character runs
  const cjkRuns = text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g) || [];
  for (const run of cjkRuns) {
    if (run.length === 1) {
      // Single CJK char — skip if stopword
      if (!CJK_STOPWORDS.has(run)) tokens.push(run);
    } else {
      // 2-gram bigrams
      for (let i = 0; i < run.length - 1; i++) {
        const bigram = run.slice(i, i + 2);
        if (CJK_STOPWORDS.has(bigram)) continue;
        tokens.push(bigram);
      }
      // Also add the whole run if short (≤ 4 chars, likely a word)
      if (run.length <= 4 && !CJK_STOPWORDS.has(run)) {
        tokens.push(run);
      }
    }
  }

  return tokens;
}

// ── Cache ────────────────────────────────────────────────────────────────
interface CacheEntry {
  data: StatsResponse;
  expiry: number;
}

const CACHE_TTL_MS = 60_000; // 60s
const cache = new Map<string, CacheEntry>();

export function invalidateStatsCache(): void {
  cache.clear();
}

// ── Main aggregator ──────────────────────────────────────────────────────
export async function aggregateStats(
  generatedDir: string,
  range: StatsRange,
  currency: StatsCurrency,
): Promise<StatsResponse> {
  const cacheKey = `${range}:${currency}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  const rangeStart = getRangeStartMs(range);
  const rows = await listHistoryRows(generatedDir);

  const filtered = rows.filter((r) => {
    const createdAt = r.createdAt || 0;
    return createdAt >= rangeStart;
  });

  let totalImages = 0;
  let totalVideos = 0;
  let totalTokens = 0;
  let totalCostUsd = 0;
  let totalElapsed = 0;
  let elapsedCount = 0;

  const dailyMap = new Map<string, DailyStat>();
  const modelMap = new Map<string, DistributionEntry>();
  const providerMap = new Map<string, DistributionEntry>();
  const sizeMap = new Map<string, DistributionEntry>();
  const qualityMap = new Map<string, DistributionEntry>();
  const wordFreq = new Map<string, number>();

  for (const row of filtered) {
    const isVideo = (row.mediaType === "video" || /\.mp4$/i.test(row.filename || ""));
    if (isVideo) totalVideos++;
    else totalImages++;

    const cost = estimateCost(
      row.quality || "medium",
      row.size || "1024x1024",
      row.provider,
      row.model,
    );
    totalCostUsd += cost;

    const tokens = row.usage?.total_tokens || 0;
    totalTokens += tokens;

    const elapsed = row.elapsed;
    if (elapsed != null && Number.isFinite(elapsed) && elapsed > 0) {
      totalElapsed += elapsed;
      elapsedCount++;
    }

    // ── Daily breakdown ────────────────────────────────────────────────
    const dateKey = formatDate(row.createdAt || Date.now());
    let daily = dailyMap.get(dateKey);
    if (!daily) {
      daily = { date: dateKey, count: 0, costUsd: 0, tokens: 0 };
      dailyMap.set(dateKey, daily);
    }
    daily.count++;
    daily.costUsd += cost;
    daily.tokens += tokens;

    // ── Model distribution ─────────────────────────────────────────────
    const modelKey = row.model || "unknown";
    let modelEntry = modelMap.get(modelKey);
    if (!modelEntry) {
      modelEntry = { key: modelKey, count: 0, costUsd: 0 };
      modelMap.set(modelKey, modelEntry);
    }
    modelEntry.count++;
    modelEntry.costUsd += cost;

    // ── Provider distribution ──────────────────────────────────────────
    const providerKey = row.provider || "oauth";
    let provEntry = providerMap.get(providerKey);
    if (!provEntry) {
      provEntry = { key: providerKey, count: 0, costUsd: 0 };
      providerMap.set(providerKey, provEntry);
    }
    provEntry.count++;
    provEntry.costUsd += cost;

    // ── Size distribution ──────────────────────────────────────────────
    const sizeKey = row.size || "unknown";
    let sizeEntry = sizeMap.get(sizeKey);
    if (!sizeEntry) {
      sizeEntry = { key: sizeKey, count: 0, costUsd: 0 };
      sizeMap.set(sizeKey, sizeEntry);
    }
    sizeEntry.count++;
    sizeEntry.costUsd += cost;

    // ── Quality distribution ──────────────────────────────────────────
    const qualityKey = row.quality || "auto";
    let qEntry = qualityMap.get(qualityKey);
    if (!qEntry) {
      qEntry = { key: qualityKey, count: 0, costUsd: 0 };
      qualityMap.set(qualityKey, qEntry);
    }
    qEntry.count++;
    qEntry.costUsd += cost;

    // ── Word cloud ─────────────────────────────────────────────────────
    const promptText = [row.prompt, row.revisedPrompt]
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .join(" ");
    if (promptText) {
      const tokens = tokenizePrompt(promptText);
      for (const tok of tokens) {
        wordFreq.set(tok, (wordFreq.get(tok) || 0) + 1);
      }
    }
  }

  // Sort all distributions by count descending
  const sortByCountDesc = (a: DistributionEntry, b: DistributionEntry) => b.count - a.count;
  const modelDistribution = Array.from(modelMap.values()).sort(sortByCountDesc);
  const providerDistribution = Array.from(providerMap.values()).sort(sortByCountDesc);
  const sizeDistribution = Array.from(sizeMap.values()).sort(sortByCountDesc);
  const qualityDistribution = Array.from(qualityMap.values()).sort(sortByCountDesc);

  // Word cloud: top N by frequency
  const promptWordCloud: WordCloudEntry[] = Array.from(wordFreq.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_WORD_CLOUD_ENTRIES);

  // Daily breakdown: sorted ascending by date
  const dailyBreakdown = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const avgElapsedSeconds = elapsedCount > 0 ? totalElapsed / elapsedCount : 0;
  const totalCostDisplay = formatPrice(totalCostUsd, currency);

  const result: StatsResponse = {
    range,
    totalImages,
    totalVideos,
    totalTokens,
    totalCostUsd,
    totalCostDisplay,
    currency,
    avgElapsedSeconds,
    dailyBreakdown,
    modelDistribution,
    providerDistribution,
    sizeDistribution,
    qualityDistribution,
    promptWordCloud,
  };

  cache.set(cacheKey, { data: result, expiry: Date.now() + CACHE_TTL_MS });
  return result;
}
