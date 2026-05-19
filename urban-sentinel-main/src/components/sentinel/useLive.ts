// Live polling hooks for the web dashboard. Mirror of the mobile hook.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackendUnavailable, getCiroStatus, getRun, type BackendCIRORunResult } from "./api";
import type { Signal } from "./primitives";

const SENTINEL_BASE = "/api/sentinel";

export function formatAgo(ts: number | null): string {
  if (!ts) return "—";
  const d = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (d < 5) return "just now";
  if (d < 60) return `${d}s ago`;
  const m = Math.round(d / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

type LiveRun = { run_id: string; started_at: string; crisis_type?: string | null; severity?: string };

export function useLiveRuns({
  intervalMs = 6000,
  onNewRun,
}: {
  intervalMs?: number;
  onNewRun?: (r: LiveRun) => void;
} = {}) {
  const [runs, setRuns] = useState<LiveRun[]>([]);
  const [newestId, setNewestId] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const stoppedRef = useRef(false);
  const onNewRunRef = useRef(onNewRun);
  onNewRunRef.current = onNewRun;

  const tick = useCallback(async () => {
    try {
      const res = await fetch(`${SENTINEL_BASE}/ciro/runs`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new BackendUnavailable(`HTTP ${res.status}`);
      const j = (await res.json()) as { status: string; data: LiveRun[] };
      if (stoppedRef.current) return;
      const list = Array.isArray(j.data) ? j.data : [];
      setRuns(list);
      setOnline(true);
      setLastUpdate(Date.now());
      if (list[0]?.run_id !== newestId) {
        if (list[0]?.run_id) setNewestId(list[0].run_id);
        if (seen.current.size > 0) {
          for (const r of list) {
            if (!seen.current.has(r.run_id)) {
              seen.current.add(r.run_id);
              onNewRunRef.current?.(r);
            }
          }
        } else {
          list.forEach((r) => seen.current.add(r.run_id));
        }
      }
    } catch {
      if (!stoppedRef.current) setOnline(false);
    }
  }, [newestId]);

  useEffect(() => {
    stoppedRef.current = false;
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      stoppedRef.current = true;
      clearInterval(id);
    };
  }, [intervalMs, tick]);

  return { runs, newestId, lastUpdate, online, refresh: tick };
}

/* ============================================================
   useLiveSignals — pull real input_signals from the latest run.
   When a newer run lands, swap to its signals.
   ============================================================ */

const SOURCE_COLOR: Record<string, string> = {
  social_media: "rgb(99, 102, 241)",
  weather_api:  "rgb(251, 191, 36)",
  traffic_api:  "rgb(167, 139, 250)",
  complaint:    "rgb(244, 63, 94)",
  sensor:       "rgb(52, 211, 153)",
};

function sourceLabel(src: string): string {
  switch (src) {
    case "social_media": return "Twitter";
    case "weather_api":  return "Weather";
    case "traffic_api":  return "Traffic";
    case "complaint":    return "Citizen";
    case "sensor":       return "Sensor";
    default:             return src.replace(/_/g, " ");
  }
}

function relTime(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    const d = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (d < 60) return `${d}s`;
    const m = Math.round(d / 60);
    if (m < 60) return `${m}m`;
    const h = Math.round(m / 60);
    return `${h}h`;
  } catch { return "—"; }
}

export function useLiveSignals({
  intervalMs = 6000,
  max = 80,
}: { intervalMs?: number; max?: number } = {}): { signals: Signal[]; online: boolean | null } {
  const { runs, online } = useLiveRuns({ intervalMs });
  const [detail, setDetail] = useState<BackendCIRORunResult | null>(null);
  const inflight = useRef<string | null>(null);

  // Fetch the newest run's detail whenever the head of the list changes
  const newestId = runs[0]?.run_id ?? null;
  useEffect(() => {
    if (!newestId) return;
    if (inflight.current === newestId) return;
    inflight.current = newestId;
    let cancelled = false;
    getRun(newestId)
      // The API client returns adapted Result; we need the raw backend shape for signals.
      // Fall through to a direct fetch since /runs/{id} response.data IS the raw shape.
      .catch(() => null)
      .then(async () => {
        try {
          const r = await fetch(`${SENTINEL_BASE}/ciro/runs/${newestId}`, {
            headers: { Accept: "application/json" },
          });
          if (!r.ok) return;
          const j = (await r.json()) as { status: string; data: BackendCIRORunResult };
          if (!cancelled && j?.data) setDetail(j.data);
        } catch {}
      });
    return () => {
      cancelled = true;
    };
  }, [newestId]);

  const signals: Signal[] = useMemo(() => {
    if (!detail?.input_signals?.length) return [];
    const list = detail.input_signals
      .slice(0, max)
      .map((s) => ({
        src: sourceLabel(String(s.source)),
        color: SOURCE_COLOR[String(s.source)] ?? "rgb(103, 232, 249)",
        text: String(s.raw_text || ""),
        geo: String(s.location || ""),
        ts: relTime(String(s.timestamp || "")),
      }))
      .filter((s) => s.text);
    return list;
  }, [detail, max]);

  return { signals, online };
}

/* ============================================================
   useLiveMetrics — derive real SystemBar stats from runs.
   ============================================================ */

export interface LiveMetrics {
  totalRuns: number;
  activeIncidents: number;
  uniqueCrisisTypes: number;
  avgDecisionLatencyMs: number | null;
  totalSignalsLastRun: number | null;
  severityCounts: { critical: number; high: number; medium: number; low: number; total: number };
  latestRunId: string | null;
}

export function useLiveMetrics({ intervalMs = 6000 }: { intervalMs?: number } = {}): {
  metrics: LiveMetrics;
  online: boolean | null;
  lastUpdate: number | null;
} {
  const { runs, online, lastUpdate } = useLiveRuns({ intervalMs });
  const [detail, setDetail] = useState<BackendCIRORunResult | null>(null);
  const newestId = runs[0]?.run_id ?? null;

  useEffect(() => {
    if (!newestId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${SENTINEL_BASE}/ciro/runs/${newestId}`, {
          headers: { Accept: "application/json" },
        });
        if (!r.ok) return;
        const j = (await r.json()) as { status: string; data: BackendCIRORunResult };
        if (!cancelled && j?.data) setDetail(j.data);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [newestId]);

  const metrics = useMemo<LiveMetrics>(() => {
    const recent = runs.slice(0, 25);
    const sevCounts = recent.reduce(
      (acc, r) => {
        const s = String((r as { severity?: string }).severity || "").toLowerCase();
        if (s in acc) (acc as Record<string, number>)[s] += 1;
        return acc;
      },
      { critical: 0, high: 0, medium: 0, low: 0 } as Record<"critical" | "high" | "medium" | "low", number>
    );
    const activeIncidents = sevCounts.critical + sevCounts.high;
    const types = new Set(recent.map((r) => (r as { crisis_type?: string }).crisis_type).filter(Boolean));
    const totalSignals = detail?.input_signals?.length ?? null;
    const traceTimes = detail?.agent_traces?.map((t) => t.duration_ms || 0).filter((n) => n > 0) ?? [];
    const avgLatency =
      traceTimes.length > 0
        ? Math.round(traceTimes.reduce((a, b) => a + b, 0) / traceTimes.length)
        : null;

    return {
      totalRuns: runs.length,
      activeIncidents,
      uniqueCrisisTypes: types.size,
      avgDecisionLatencyMs: avgLatency,
      totalSignalsLastRun: totalSignals,
      severityCounts: { ...sevCounts, total: recent.length },
      latestRunId: newestId,
    };
  }, [runs, detail, newestId]);

  return { metrics, online, lastUpdate };
}

/* ============================================================
   useBackendHeartbeat — light status probe.
   ============================================================ */

export function useBackendHeartbeat({ intervalMs = 8000 }: { intervalMs?: number } = {}) {
  const [online, setOnline] = useState<boolean | null>(null);
  const [latestRun, setLatestRun] = useState<{ run_id: string; started_at: string } | null>(null);
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const s = await getCiroStatus();
        if (!stopped) {
          setOnline(true);
          setLatestRun(s.latest_run);
        }
      } catch {
        if (!stopped) setOnline(false);
      }
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [intervalMs]);
  return { online, latestRun };
}
