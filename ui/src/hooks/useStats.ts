import { useCallback, useEffect, useRef, useState } from "react";
import type { StatsResponse, StatsRange, StatsCurrency } from "../types/stats.js";

interface UseStatsResult {
  data: StatsResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const REFRESH_MS = 60_000;

export function useStats(
  range: StatsRange,
  currency: StatsCurrency,
): UseStatsResult {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `/api/stats?range=${range}&currency=${currency}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: StatsResponse = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [range, currency]);

  useEffect(() => {
    void fetchData();

    // Auto-refresh every 60s
    const tick = (): void => {
      void fetchData();
      timerRef.current = setTimeout(tick, REFRESH_MS);
    };
    timerRef.current = setTimeout(tick, REFRESH_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
