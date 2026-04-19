"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/app/lib/api-client";

interface UsePollingOptions<T> {
  url: string | null;
  interval?: number;
  enabled?: boolean;
  transform?: (json: unknown) => T;
}

interface UsePollingResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  lastUpdated: number | null;
}

export function usePolling<T>({
  url,
  interval = 30000,
  enabled = true,
  transform,
}: UsePollingOptions<T>): UsePollingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!url) return;

    try {
      const response = await apiFetch(url);
      if (!mountedRef.current) return;

      if (!response.ok) {
        setError(`HTTP ${response.status}`);
        return;
      }

      const json = await response.json();
      const result = transform ? transform(json) : (json.data ?? json) as T;
      setData(result);
      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [url, transform]);

  const refresh = useCallback(() => {
    setLoading(true);
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled || !url) {
      setLoading(false);
      return;
    }

    void fetchData();

    if (interval > 0) {
      intervalRef.current = setInterval(() => void fetchData(), interval);
    }

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [url, interval, enabled, fetchData]);

  return { data, loading, error, refresh, lastUpdated };
}
