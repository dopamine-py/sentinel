// Live data hooks — poll the CIRO backend on an interval and surface fresh state.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchRuns, fetchRun, fetchStatus } from '../api';

/**
 * useLiveRuns
 *   Polls /api/ciro/runs every `intervalMs`, surfaces:
 *     - runs: list (newest first)
 *     - newestId: most recent run_id, useful for change detection
 *     - lastUpdate: timestamp of the last successful poll
 *     - online: boolean — last poll succeeded
 *     - refresh(): manual refresh
 *   onNewRun fires once per *newly observed* run (great for haptics / notifications).
 */
export function useLiveRuns({ intervalMs = 6000, onNewRun } = {}) {
  const [runs, setRuns] = useState([]);
  const [newestId, setNewestId] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [online, setOnline] = useState(null);
  const seenIds = useRef(new Set());
  const stopped = useRef(false);
  const onNewRunRef = useRef(onNewRun);
  onNewRunRef.current = onNewRun;

  const tick = useCallback(async () => {
    try {
      const list = await fetchRuns();
      if (stopped.current) return;
      const safe = Array.isArray(list) ? list : [];
      setRuns(safe);
      setOnline(true);
      setLastUpdate(Date.now());
      if (safe.length) {
        const id = safe[0].run_id;
        if (id !== newestId) {
          setNewestId(id);
          // Fire onNewRun for entries we haven't seen before
          for (const r of safe) {
            if (!seenIds.current.has(r.run_id)) {
              seenIds.current.add(r.run_id);
              // Only notify if this isn't the very first poll
              if (seenIds.current.size > safe.length) {
                onNewRunRef.current?.(r);
              }
            }
          }
        }
      }
    } catch {
      if (!stopped.current) setOnline(false);
    }
  }, [newestId]);

  useEffect(() => {
    stopped.current = false;
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      stopped.current = true;
      clearInterval(id);
    };
  }, [intervalMs, tick]);

  // Seed seen set on first successful population
  useEffect(() => {
    if (runs.length && seenIds.current.size === 0) {
      runs.forEach((r) => seenIds.current.add(r.run_id));
    }
  }, [runs]);

  return { runs, newestId, lastUpdate, online, refresh: tick };
}

/**
 * useLiveRun
 *   Polls /api/ciro/runs/{id} every `intervalMs`. Useful for the Detail screen
 *   so the report keeps updating as the backend completes the pipeline.
 */
export function useLiveRun(runId, { intervalMs = 4000 } = {}) {
  const [run, setRun] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [online, setOnline] = useState(null);

  useEffect(() => {
    if (!runId) return;
    let stopped = false;
    const tick = async () => {
      try {
        const r = await fetchRun(runId);
        if (stopped) return;
        if (r) {
          setRun(r);
          setOnline(true);
          setLastUpdate(Date.now());
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
  }, [runId, intervalMs]);

  return { run, lastUpdate, online };
}

/**
 * useBackendHeartbeat
 *   Light-weight backend status probe (just /status, much smaller payload).
 */
export function useBackendHeartbeat({ intervalMs = 8000 } = {}) {
  const [online, setOnline] = useState(null);
  const [latestRun, setLatestRun] = useState(null);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const r = await fetchStatus();
        if (stopped) return;
        setOnline(true);
        setLatestRun(r?.latest_run ?? null);
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

/**
 * Human-readable "Xs ago" formatter for live badges.
 */
export function formatAgo(ts) {
  if (!ts) return '—';
  const d = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (d < 5) return 'just now';
  if (d < 60) return `${d}s ago`;
  const m = Math.round(d / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

/* ============================================================
   useLiveSignals — pull real input_signals from the latest run.
   Mirrors the web dashboard's right-rail live signal ticker.
   ============================================================ */

const SOURCE_COLOR = {
  social_media: '#818cf8',  // indigo
  weather_api:  '#fbbf24',  // amber
  traffic_api:  '#a78bfa',  // violet
  complaint:    '#fb7185',  // rose
  sensor:       '#34d399',  // emerald
};

const SOURCE_LABEL = {
  social_media: 'Social',
  weather_api:  'Weather',
  traffic_api:  'Traffic',
  complaint:    'Citizen',
  sensor:       'Sensor',
};

function relTime(iso) {
  try {
    const d = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (d < 60) return `${d}s`;
    const m = Math.round(d / 60);
    if (m < 60) return `${m}m`;
    const h = Math.round(m / 60);
    return `${h}h`;
  } catch { return '—'; }
}

export function useLiveSignals({ intervalMs = 6000, max = 40 } = {}) {
  const { runs, online } = useLiveRuns({ intervalMs });
  const [signals, setSignals] = useState([]);
  const inflight = useRef(null);

  const newestId = (runs[0] && runs[0].run_id) || null;

  useEffect(() => {
    if (!newestId) return;
    if (inflight.current === newestId) return;
    inflight.current = newestId;
    let cancelled = false;

    (async () => {
      try {
        const detail = await fetchRun(newestId);
        if (cancelled || !detail) return;
        const inputSignals = detail.input_signals || [];
        const mapped = inputSignals.slice(0, max).map((s) => ({
          id: s.id || `sig-${Math.random().toString(36).slice(2, 8)}`,
          src: SOURCE_LABEL[String(s.source)] || String(s.source || '').replace(/_/g, ' '),
          color: SOURCE_COLOR[String(s.source)] || '#67e8f9',
          text: String(s.raw_text || ''),
          geo: String(s.location || ''),
          ts: relTime(String(s.timestamp || '')),
          meta: s.metadata || {},
        })).filter((s) => s.text);
        setSignals(mapped);
      } catch {}
    })();

    return () => { cancelled = true; };
  }, [newestId, max]);

  return { signals, online };
}

