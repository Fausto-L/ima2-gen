# Dashboard & Prompt Library Expansion Design

**Date**: 2026-07-24  
**Branch**: `feat/dashboard-and-prompt-library`  
**Author**: Fausto-L

## Overview

Two new features for the Chinese-user customized fork:

1. **Dashboard** — A new `#dashboard` page accessible from the NavRail, showing aggregated statistics from generation history: cost totals, daily trends, token usage, prompt word cloud, model/provider distributions, quality/size breakdowns, and image counts. Supports time-range switching (today / 7d / 30d / all).

2. **Prompt Library Expansion** — Extend the existing curated GitHub sources system with more repositories, upgrade manual-review sources to curated status, and improve the import UI.

---

## Feature A: Dashboard

### Architecture

```
NavRail (📊 icon) → #dashboard route → DashboardPage.tsx
                                              │
                                    ┌─────────┴──────────┐
                                    │  Stats Card Grid    │
                                    │  (8 cards, 2-col)   │
                                    └─────────┬──────────┘
                                              │
                                     fetch via useStats hook
                                              │
                                    GET /api/stats?range=7d
                                              │
                                    ┌─────────┴──────────┐
                                    │ routes/stats.ts     │
                                    │ 60s cache per range  │
                                    └─────────┬──────────┘
                                              │
                                    ┌─────────┴──────────┐
                                    │ lib/statsAggregator │
                                    │  - listHistoryRows  │
                                    │  - filter by range  │
                                    │  - estimateCost()   │
                                    │  - aggregate       │
                                    └─────────────────────┘
```

### Server-side Components

#### `lib/costTable.ts` (new)

Pricing tables extracted from `ui/src/lib/cost.ts` into a framework-agnostic TypeScript module importable by both server and client. Contains:

- `GPT_COST: Record<Quality, Record<string, number>>` — per-image USD by quality × size
- `GEMINI_FLASH_COST`, `GEMINI_PRO_COST` — per-image USD by resolution tier
- `DASHSCOPE_PRICING: Record<string, number>` — flat per-image USD
- `GROK_COST: Record<string, number>` — flat per-image USD
- `DOUBAO_COST: Record<string, number>` — flat per-image USD
- `estimateCost(quality, size, provider, model): number` — same logic as the UI version
- `USD_TO_CNY = 7.2`

The UI's `ui/src/lib/cost.ts` will be refactored to import from `lib/costTable.ts`. Since the server uses NodeNext (`.js` extensions) and the UI uses Vite (no extensions), a copy of pricing data will live in `lib/costTable.ts` (server-importable). The UI's `cost.ts` will re-export `estimateCost` by importing the function via a Vike/Vite-compatible path or by maintaining a thin re-export. If import path incompatibilities arise, the fallback is to keep the pricing data duplicated in both files with a shared test verifying they stay in sync.

#### `lib/statsAggregator.ts` (new)

Core aggregation engine. Pure functions, no Express dependency.

**Inputs:**
- `generatedDir: string` — the `~/.ima2/generated` path
- `range: "today" | "7d" | "30d" | "all"` — time filter
- `currencyRate: number` — CNY conversion rate (default 7.2)

**Process:**
1. Call `listHistoryRows(generatedDir)` to get all generation records (reuses existing `lib/historyList.ts`)
2. Filter by time range:
   - `today`: createdAt >= start of current day (local midnight)
   - `7d`: createdAt >= now - 7 days
   - `30d`: createdAt >= now - 30 days
   - `all`: no filter
3. For each record, derive cost via `estimateCost(quality, size, provider, model)` from `lib/costTable.ts`
4. Token usage: read `usage.total_tokens` from sidecar if present; if absent (OAuth providers, older records), treat as 0
5. Aggregate into the response shape

**Output — `StatsResponse` type:**

```typescript
interface StatsResponse {
  range: string;
  totalImages: number;
  totalVideos: number;
  totalTokens: number;
  totalCostUsd: number;
  totalCostDisplay: string;    // formatted with currency symbol
  currency: "CNY" | "USD";
  dailyBreakdown: DailyStat[];  // per-day aggregation, sorted ascending
  modelDistribution: DistributionEntry[];
  providerDistribution: DistributionEntry[];
  sizeDistribution: DistributionEntry[];
  qualityDistribution: DistributionEntry[];
  promptWordCloud: WordCloudEntry[];
  avgElapsedSeconds: number;
}

interface DailyStat {
  date: string;        // "YYYY-MM-DD"
  count: number;
  costUsd: number;
  tokens: number;
}

interface DistributionEntry {
  key: string;         // model name / provider name / size / quality
  count: number;
  costUsd: number;
}

interface WordCloudEntry {
  word: string;
  count: number;
}
```

**Prompt word cloud algorithm:**
- Collect all `prompt` and `revisedPrompt` fields from sidecars in range
- Tokenize: split on whitespace, strip punctuation, lowercase
- Remove stopwords (common English + Chinese stopwords list, ~100 entries)
- Remove tokens shorter than 2 chars (English) or 1 char (CJK)
- Count frequency, return top 50 entries
- CJK text: split by character for bigrams frequency (2-gram), since CJK doesn't use whitespace

**Caching:**
- In-memory cache: `Map<string, { data: StatsResponse; expiry: number }>` keyed by range string
- TTL: 60 seconds
- Cache invalidated when new generation completes (the existing `invalidateHistoryIndex()` pattern from `lib/historyIndex.ts` can be shared)

#### `routes/stats.ts` (new)

```typescript
export function registerStatsRoutes(app: Express, ctx: RouteRuntimeContext) {
  app.get("/api/stats", async (req, res) => {
    const range = parseRange(req.query.range);  // default "7d"
    const currency = req.query.currency === "USD" ? "USD" : "CNY";
    // ... call statsAggregator, return JSON
  });
}
```

Registered in `server.ts` alongside other route modules.

### Client-side Components

#### `ui/src/hooks/useStats.ts` (new)

```typescript
export function useStats(range: Range): {
  data: StatsResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}
```

Fetches `GET /api/stats?range=${range}&currency=${currency}`. Refetches on range or currency change. 60s auto-refresh interval.

#### `ui/src/components/dashboard/DashboardPage.tsx` (new)

Top-level page component:
- Time range switcher (4 buttons: 今天 / 7天 / 30天 / 全部)
- Currency indicator (shows current ¥ or $)
- Responsive 2-column grid of stat cards
- Loading skeleton state, error state

Layout:
```
┌─────────────────────────────────────────────┐
│  [今天] [7天] [30天] [全部]   ¥ CNY | $ USD │
├──────────────────┬──────────────────────────┤
│  费用汇总         │  每日趋势                 │
│  ¥12.34 / $1.71   │  📈折线图               │
├──────────────────┼──────────────────────────┤
│  模型分布         │  API 来源               │
│  🥧饼图           │  📊条形图               │
├──────────────────┼──────────────────────────┤
│  Token 用量      │  提示词词云              │
│  12,345           │  🏷️ Treemap            │
├──────────────────┼──────────────────────────┤
│  尺寸分布         │  质量分布                 │
│  📊条形图         │  🥧饼图                  │
├──────────────────┴──────────────────────────┤
│  总张数: 42  |  视频: 3  |  平均耗时: 4.2s   │
└───────────────────────────────────────────────┘
```

#### Stat Card Components (each in `ui/src/components/dashboard/`)

| Component | Chart Type | Data Source |
|-----------|-----------|-------------|
| `StatCard.tsx` | Generic shell (title, value, chart area) | — |
| `CostSummaryCard.tsx` | Big number + currency | `totalCostDisplay` |
| `DailyTrendCard.tsx` | Line chart (count + cost dual-axis) | `dailyBreakdown[]` |
| `ModelDistCard.tsx` | Pie chart | `modelDistribution[]` |
| `ProviderDistCard.tsx` | Bar chart | `providerDistribution[]` |
| `TokenUsageCard.tsx` | Big number + mini trend | `totalTokens` + `dailyBreakdown[]` |
| `PromptWordCloudCard.tsx` | Treemap (recharts) | `promptWordCloud[]` |
| `SizeDistCard.tsx` | Bar chart | `sizeDistribution[]` |
| `QualityDistCard.tsx` | Pie chart | `qualityDistribution[]` |

#### NavRail Integration

`ui/src/components/NavRail.tsx` — add a new item between "Home" and "Create":

```typescript
{ to: "#dashboard", icon: "chart", label: "dashboard" }
```

Icon: a bar-chart SVG, 16×16, matching the existing NavRail icon style.

#### App.tsx Route Integration

`ui/src/App.tsx` — add dashboard mode:
```typescript
uiMode === "dashboard" ? <DashboardPage /> : ...
```

Triggered by `#dashboard` hash route.

#### Store Integration

`ui/src/store/storeTypes.ts` — add:
```typescript
statsRange: "today" | "7d" | "30d" | "all";
setStatsRange: (r: typeof this.statsRange) => void;
```

Persisted in localStorage via the existing persistence registry.

### Dependency

Add to `ui/package.json`:
```json
"recharts": "^2.12.0"
```

### Error Handling

- If no sidecars exist (fresh install): show empty state ("暂无生成记录，开始创作后这里会显示统计数据")
- If sidecar is corrupted/unreadable: skip that record (already handled by `listHistoryRows`)
- If `estimateCost` returns 0 (OAuth provider): count images but show cost as 0, not an error
- If stats API fails: show error card with retry button

### Testing

- `tests/statsAggregator.test.ts` — unit tests for aggregation logic:
  - Empty directory → empty stats
  - Single image → correct counts
  - Time range filtering (today / 7d / 30d / all)
  - Cost calculation for GPT / DashScope / Grok providers
  - Word cloud tokenization (English + CJK)
- `tests/statsRoute.test.ts` — integration test for `GET /api/stats` endpoint

---

## Feature B: Prompt Library Expansion

### Architecture

The existing `lib/promptImport/curatedSources.ts` has 6 GitHub repos, 2 with `defaultSearch: true` and 4 with `trustTier: "manual-review"`. This feature:

1. Upgrades manual-review sources to curated
2. Adds more public prompt repositories
3. Improves the import UI

### Changes to `lib/promptImport/curatedSources.ts`

**Upgrade existing manual-review sources to curated:**

| Source ID | Current Tier | Action |
|-----------|-------------|--------|
| `stable-diffusion-awesome-manual` | manual-review | Upgrade to curated, set `defaultSearch: true`, add `allowedPaths` |
| `stable-diffusion-templates-manual` | manual-review | Upgrade to curated, set `defaultSearch: false` |
| `midjourney-awesome-manual` | manual-review | Upgrade to curated, set `defaultSearch: true`, add `allowedPaths` |
| `diagram-image-prompts-manual` | manual-review | Upgrade to curated, set `defaultSearch: false` |

**New curated sources to add:**

```typescript
// New curated sources to add (exact repos TBC — need GitHub verification before merge):
// Listed below are the planned categories. Each will be populated with a real
// GitHub repo after verifying: public access, license, prompt collection quality.
// Sources without a verified repo will remain `trustTier: "manual-review"`.
//
// Categories planned:
// - DALL-E 3 prompt collections
// - Animation/Motion prompts for video generation
// - Landscape & photography prompts
// - Character & portrait prompts
// - Architecture & interior design prompts
// - Chinese-style art prompts (国风/水墨/工笔)
```

Each new source will be verified for:
- Public GitHub repo with README or prompt collection
- License compatibility (MIT, Apache-2.0, CC0 preferred)
- `lastVerifiedAt` set to today
- `trustTier: "curated"` after manual review

### UI Improvements — `PromptImportDialog.tsx`

Current import dialog enhanced to show:
- Source metadata (license, lastVerifiedAt, note)
- Enabled/disabled toggle per source
- Search within source before importing
- Progress indicator for ongoing import
- Imported prompts count feedback

### Testing

- `tests/curatedSources.test.ts` — verify all curated sources have required fields, licenses are SPDX-valid, no duplicate IDs

---

## Implementation Order

1. **Phase 1 — Dashboard server-side** (costTable + statsAggregator + stats route)
2. **Phase 2 — Dashboard client-side** (useStats hook + DashboardPage + card components + NavRail/App integration)
3. **Phase 3 — Prompt library expansion** (extend curatedSources + UI improvements)

This order ensures the data layer is ready before the UI consumes it, and the prompt library work is independent.

---

## Out of Scope

- Real-time stats streaming (stats are cached 60s, not pushed via WebSocket)
- Budget alerts / spending limits (future feature)
- Auto-sync of GitHub prompt repos (manual import only for now)
- Custom date range picker (only 4 preset ranges)
- Per-session cost breakdown (future drill-down)
- Sharing/exporting stats (future feature)
