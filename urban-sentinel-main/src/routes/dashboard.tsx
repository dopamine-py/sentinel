import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  Command,
  Cpu,
  Database,
  Download,
  Gauge,
  History,
  Loader2,
  MapPin,
  Play,
  Radar,
  Radio,
  RefreshCw,
  Satellite,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Wifi,
  WifiOff,
  Workflow,
} from "lucide-react";

import {
  AGENTS,
  AGENT_ORDER,
  ConfidenceMeter,
  LiveSignalFeed,
  OrchestrationGraph,
  RadarDisplay,
  SentinelMark,
  SeverityChip,
  StatTile,
  StatusPill,
} from "../components/sentinel/primitives";
import {
  LIVE_SIGNALS,
  RESULTS,
  SCENARIOS,
  type Action,
  type Result,
  type Scenario,
  type TraceStep,
} from "../components/sentinel/data";
import {
  BackendUnavailable,
  isBackendOnline,
  runCrisisSync,
  runLiveScanSync,
  triggerCrisisAsync,
  triggerLiveScanAsync,
  getRun,
  adaptTraceStep,
} from "../components/sentinel/api";
import { InteractiveMap } from "../components/sentinel/InteractiveMap";
import {
  formatAgo,
  useLiveMetrics,
  useLiveRuns,
  useLiveSignals,
  type LiveMetrics,
} from "../components/sentinel/useLive";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Sentinel — Console" },
      { name: "description", content: "Live operations console." },
    ],
  }),
  component: Dashboard,
});

type TabKey = "overview" | "orchestration" | "actions" | "outcomes" | "resilience";
type BackendState = "checking" | "online" | "offline";

function Dashboard() {
  const [scenarioId, setScenarioId] = useState<string>(SCENARIOS[0].id);
  const [signal, setSignal] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ step: number; agent: string } | null>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const [active, setActive] = useState<Result | null>(null);
  const [liveTraces, setLiveTraces] = useState<TraceStep[]>([]);
  const [tab, setTab] = useState<TabKey>("overview");
  const [commandOpen, setCommandOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [backend, setBackend] = useState<BackendState>("checking");
  const [source, setSource] = useState<"live" | "demo">("demo");

  const scenario = useMemo(
    () => SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0],
    [scenarioId]
  );

  // Probe backend on mount + every 8s.
  // Debounced: a single slow/missed probe must NOT flip a working backend to
  // "offline" (that was disabling Scan everything even though :8000 was up).
  // Online is set on the first success; offline only after 2 consecutive fails.
  useEffect(() => {
    let cancelled = false;
    let consecutiveFails = 0;
    const probe = async () => {
      const ok = await isBackendOnline();
      if (cancelled) return;
      if (ok) {
        consecutiveFails = 0;
        setBackend("online");
      } else {
        consecutiveFails += 1;
        if (consecutiveFails >= 2) setBackend("offline");
      }
    };
    probe();
    const t = setInterval(probe, 8000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Live polling — drives every "live" indicator + real-data widgets.
  const { runs: livePulseRuns, lastUpdate: liveLastUpdate, online: liveOnline } = useLiveRuns({
    intervalMs: 6000,
  });
  const { metrics: liveMetrics } = useLiveMetrics({ intervalMs: 6000 });
  const { signals: liveSignals } = useLiveSignals({ intervalMs: 6000, max: 40 });

  // Seed one demo run so the console never opens empty
  useEffect(() => {
    if (history.length === 0 && !active) {
      const seed = seedResult("flood");
      setHistory([seed]);
      setActive(seed);
    }
  }, [history.length, active]);

  // ⌘K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      } else if (e.key === "Escape") {
        setCommandOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runMission = async () => {
    if (running) return;
    setScanError(null);
    setRunning(true);
    setTab("orchestration");
    setLiveTraces([]);

    // Animate orchestration progress while we wait
    const t0 = Date.now();
    const animateProgress = () => {
      const elapsed = Date.now() - t0;
      const stepDuration = 520;
      const step = Math.min(6, Math.floor(elapsed / stepDuration) + 1);
      setProgress({
        step,
        agent: AGENTS[AGENT_ORDER[Math.min(step - 1, 5)]].name,
      });
    };
    const tickHandle = setInterval(animateProgress, 200);
    animateProgress();

    try {
      let result: Result;
      const backendScenario = backendIdFor(scenarioId);

      if (backend === "online") {
        try {
          const startRes = await triggerCrisisAsync({
            scenario: backendScenario,
            custom_signals: signal.trim() ? [signal.trim()] : [],
          });
          const runId = startRes.run_id;

          await new Promise<void>((resolve) => {
            const evtSource = new EventSource(`/api/sentinel/ciro/runs/${runId}/stream`);
            evtSource.onmessage = (event) => {
              if (event.data === "[DONE]") {
                evtSource.close();
                resolve();
              } else {
                try {
                  const t = JSON.parse(event.data);
                  if (t.error) {
                    evtSource.close();
                    resolve();
                  } else {
                    setLiveTraces((prev) => {
                      const st = adaptTraceStep(t, prev.length);
                      const existing = prev.findIndex((x) => x.step === st.step);
                      if (existing >= 0) {
                        const copy = [...prev];
                        copy[existing] = st;
                        return copy;
                      }
                      return [...prev, st];
                    });
                  }
                } catch (e) {}
              }
            };
            evtSource.onerror = () => {
              evtSource.close();
              resolve();
            };
          });

          result = await getRun(runId);
          setSource("live");
        } catch (e) {
          if (!(e instanceof BackendUnavailable)) throw e;
          // Backend died mid-flight → graceful fallback
          result = mockResult(scenarioId, scenario.label);
          setSource("demo");
          setBackend("offline");
        }
      } else {
        // Offline → mock dataset with a small delay so progress feels real
        await new Promise((r) => setTimeout(r, 3000));
        result = mockResult(scenarioId, scenario.label);
        setSource("demo");
      }

      setHistory((h) => [result, ...h].slice(0, 10));
      setActive(result);
      // Land on the orchestration view so the agent run stays in focus.
      setTab("orchestration");
    } finally {
      clearInterval(tickHandle);
      setRunning(false);
      setProgress(null);
    }
  };

  const runLive = async () => {
    if (running) return;
    // Honest path even if the backend probe says offline — never silently
    // no-op (which would leave the seeded flood demo on screen and make it
    // look like "Scan everything" returned a flood).
    setScanError(null);
    setActive(null);            // clear the seeded demo so flood can't linger
    setLiveTraces([]);
    setRunning(true);
    setTab("orchestration");

    if (backend !== "online") {
      setRunning(false);
      setScanError(
        "Live scan needs the signal-intelligence backend online (port 8000). " +
          "Start it, then hit Scan everything again."
      );
      return;
    }

    const t0 = Date.now();
    const tickHandle = setInterval(() => {
      const elapsed = Date.now() - t0;
      const step = Math.min(6, Math.floor(elapsed / 800) + 1);
      setProgress({
        step,
        agent: AGENTS[AGENT_ORDER[Math.min(step - 1, 5)]].name,
      });
    }, 200);

    try {
      const startRes = await triggerLiveScanAsync();
      const runId = startRes.run_id;

      await new Promise<void>((resolve) => {
        const evtSource = new EventSource(`/api/sentinel/ciro/runs/${runId}/stream`);
        evtSource.onmessage = (event) => {
          if (event.data === "[DONE]") {
            evtSource.close();
            resolve();
          } else {
            try {
              const t = JSON.parse(event.data);
              if (t.error) {
                evtSource.close();
                resolve();
              } else {
                setLiveTraces((prev) => {
                  const st = adaptTraceStep(t, prev.length);
                  const existing = prev.findIndex((x) => x.step === st.step);
                  if (existing >= 0) {
                    const copy = [...prev];
                    copy[existing] = st;
                    return copy;
                  }
                  return [...prev, st];
                });
              }
            } catch (e) {}
          }
        };
        evtSource.onerror = () => {
          evtSource.close();
          resolve();
        };
      });

      const result = await getRun(runId);
      setSource("live");
      setHistory((h) => [result, ...h].slice(0, 10));
      setActive(result);
      // Stay on the orchestration view — the scan's agent run is the focus.
      setTab("orchestration");
    } catch {
      // Do NOT fall back to a canned scenario — that's exactly what made
      // "Scan everything" look like it always returned a flood. Surface an
      // honest error instead and keep the result area empty.
      setBackend("offline");
      setActive(null);
      setScanError(
        "Live scan couldn't complete — the backend didn't return a result. " +
          "Check that signal-intelligence is running on port 8000 and try again."
      );
    } finally {
      clearInterval(tickHandle);
      setRunning(false);
      setProgress(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashHeader running={running} onCommand={() => setCommandOpen(true)} backend={backend} source={source} />
      <SystemBar
        liveOnline={liveOnline}
        lastUpdate={liveLastUpdate}
        metrics={liveMetrics}
      />

      <div className="mx-auto max-w-[1600px] px-4 lg:px-6 py-5 grid lg:grid-cols-[300px_minmax(0,1fr)_300px] gap-5">
        <LeftRail
          scenario={scenario}
          scenarioId={scenarioId}
          setScenarioId={setScenarioId}
          signal={signal}
          setSignal={setSignal}
          run={runMission}
          runLive={runLive}
          running={running}
          progress={progress}
          history={history}
          activeId={active?.id}
          onPickRun={(r) => {
            setScanError(null);
            setActive(r);
            setTab("overview");
          }}
          backend={backend}
        />

        <main className="min-w-0 space-y-4">
          <TabBar tab={tab} setTab={setTab} hasResult={!!active} />
          {!active && !running && scanError && (
            <ScanError message={scanError} onRetry={runLive} />
          )}
          {!active && !running && !scanError && <Empty />}
          {running && <RunningState progress={progress} liveTraces={liveTraces} />}
          {active && !running && (
            <>
              {tab === "overview" && <OverviewTab r={active} source={source} metrics={liveMetrics} />}
              {tab === "orchestration" && <OrchestrationTab r={active} />}
              {tab === "actions" && <ActionsTab r={active} />}
              {tab === "outcomes" && <OutcomesTab r={active} />}
              {tab === "resilience" && <ResilienceTab r={active} liveSignals={liveSignals} />}
            </>
          )}
        </main>

        <RightRail active={active} liveSignals={liveSignals} />
      </div>

      {commandOpen && (
        <CommandPalette
          onClose={() => setCommandOpen(false)}
          onPickScenario={setScenarioId}
          setTab={setTab}
        />
      )}
    </div>
  );
}

/* ============================================================
   HEADER
   ============================================================ */
function DashHeader({
  running,
  onCommand,
  backend,
  source,
}: {
  running: boolean;
  onCommand: () => void;
  backend: BackendState;
  source: "live" | "demo";
}) {
  return (
    <header className="sticky top-0 z-40 bg-surface-0/90 backdrop-blur-md border-b border-line">
      <div className="mx-auto max-w-[1600px] px-4 lg:px-6 h-12 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SentinelMark />
          <span className="hidden md:inline label-eyebrow">/ Console</span>
        </div>

        <button
          onClick={onCommand}
          className="hidden md:flex items-center gap-2.5 surface-input px-3 py-1.5 rounded-md text-[12.5px] text-text-secondary hover:border-line-strong transition w-full max-w-md"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Jump to scenario, agent, incident…</span>
          <kbd className="kbd">⌘K</kbd>
        </button>

        <div className="flex items-center gap-2">
          <BackendBadge state={backend} source={source} />
          <StatusPill
            state={running ? "alert" : "online"}
            label={running ? "Pipeline running" : "Operational"}
          />
          <button className="relative h-8 w-8 rounded-md surface-input flex items-center justify-center hover:border-line-strong transition">
            <Bell className="h-3.5 w-3.5 text-text-secondary" />
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-status-alert" />
          </button>
          <Link to="/" className="btn-ghost text-[12.5px] hidden sm:inline-flex">
            Home
          </Link>
        </div>
      </div>
    </header>
  );
}

function BackendBadge({ state, source }: { state: BackendState; source: "live" | "demo" }) {
  const isOnline = state === "online";
  const Icon = isOnline ? Wifi : WifiOff;
  const text =
    state === "checking"
      ? "Probing backend…"
      : isOnline
      ? source === "live"
        ? "Live data · CIRO"
        : "Backend ready"
      : "Demo mode · backend offline";
  const dot = isOnline ? "dot-ok text-status-ok" : "dot-warn text-status-warn";
  return (
    <span className="hidden lg:inline-flex items-center gap-2 surface-input px-2.5 py-1 rounded-md text-[11.5px] text-text-secondary">
      <span className={`dot-pulse ${dot}`} style={{ width: 6, height: 6 }} />
      <Icon className="h-3 w-3" />
      {text}
    </span>
  );
}

/* ============================================================
   SYSTEM BAR
   ============================================================ */
function SystemBar({
  liveOnline,
  lastUpdate,
  metrics,
}: {
  liveOnline: boolean | null;
  lastUpdate: number | null;
  metrics: LiveMetrics;
}) {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  const latencyStr =
    metrics.avgDecisionLatencyMs == null
      ? "—"
      : metrics.avgDecisionLatencyMs >= 1000
      ? `${(metrics.avgDecisionLatencyMs / 1000).toFixed(2)}s`
      : `${metrics.avgDecisionLatencyMs}ms`;
  const stats: [string, string][] = [
    ["Mesh", "6 / 6 online"],
    ["Signals (last run)", metrics.totalSignalsLastRun != null ? `${metrics.totalSignalsLastRun}` : "—"],
    ["Crisis types", `${metrics.uniqueCrisisTypes}`],
    ["Avg decision step", latencyStr],
    ["Active incidents", `${metrics.activeIncidents}`],
    ["Backend runs", `${metrics.totalRuns}`],
  ];
  return (
    <div className="border-b border-line bg-surface-1/40">
      <div className="mx-auto max-w-[1600px] px-4 lg:px-6 py-1.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] font-mono text-text-tertiary">
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              liveOnline ? "bg-status-ok" : liveOnline === false ? "bg-status-warn" : "bg-text-tertiary"
            } ${liveOnline ? "animate-pulse" : ""}`}
          />
          <span className={liveOnline ? "text-status-ok" : liveOnline === false ? "text-status-warn" : "text-text-tertiary"}>
            {liveOnline === null ? "PROBING" : liveOnline ? `LIVE · ${formatAgo(lastUpdate)}` : "OFFLINE"}
          </span>
        </span>
        {stats.map(([k, v]) => (
          <span key={k}>
            <span className="text-accent-cyan mr-1.5">·</span>
            <span className="text-text-secondary">{k}</span> <span>{v}</span>
          </span>
        ))}
        <span className="ml-auto">{t.toUTCString().slice(17, 25)} UTC</span>
      </div>
    </div>
  );
}

/* ============================================================
   LEFT RAIL
   ============================================================ */
function LeftRail({
  scenario,
  scenarioId,
  setScenarioId,
  signal,
  setSignal,
  run,
  runLive,
  running,
  progress,
  history,
  activeId,
  onPickRun,
  backend,
}: {
  scenario: Scenario;
  scenarioId: string;
  setScenarioId: (s: string) => void;
  signal: string;
  setSignal: (s: string) => void;
  run: () => void;
  runLive: () => void;
  running: boolean;
  progress: { step: number; agent: string } | null;
  history: Result[];
  activeId?: string;
  onPickRun: (r: Result) => void;
  backend: BackendState;
}) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-[85px] self-start">
      <section className="surface p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent-cyan" />
            <h2 className="text-[13px] font-medium tracking-tight">Run a mission</h2>
          </div>
          <span className="label-eyebrow">{backend === "online" ? "live" : "demo"}</span>
        </div>

        <label className="label-eyebrow">Scenario</label>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {SCENARIOS.map((s) => {
            const active = scenarioId === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setScenarioId(s.id)}
                disabled={running}
                className={`text-left rounded-md px-2.5 py-2 border text-[11.5px] transition ${
                  active
                    ? "border-accent-cyan/40 bg-accent-cyan-soft text-text-primary"
                    : "border-line bg-surface-2 text-text-secondary hover:border-line-strong"
                }`}
              >
                <div className="text-[14px] leading-none">{s.emoji}</div>
                <div className="mt-1 font-medium text-text-primary leading-tight">
                  {s.label.split(" ")[0]}
                </div>
                <div className="mt-0.5 text-text-tertiary">{s.city}</div>
              </button>
            );
          })}
        </div>

        <label className="mt-4 block label-eyebrow">Custom signal</label>
        <textarea
          value={signal}
          onChange={(e) => setSignal(e.target.value)}
          placeholder={scenario.placeholder}
          rows={3}
          disabled={running}
          className="mt-1.5 w-full surface-input rounded-md px-2.5 py-2 text-[12.5px] font-mono resize-none placeholder:text-text-tertiary focus:outline-none"
        />

        {/* Primary: the omni-scan. No scenario — ingests every live source
            and detects whatever is actually unfolding. */}
        <button
          onClick={runLive}
          disabled={running || backend !== "online"}
          className="mt-4 btn-primary text-[13px] w-full justify-center disabled:opacity-50"
          title={
            backend === "online"
              ? "Ingest every live source and detect whatever's happening"
              : "Backend offline"
          }
        >
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning everything…
            </>
          ) : (
            <>
              <Radar className="h-3.5 w-3.5" /> Scan everything
            </>
          )}
        </button>
        <p className="mt-1.5 text-[10.5px] leading-snug text-text-tertiary">
          One scan, all sources — news, weather, traffic, sensors. Detects whatever's
          unfolding right now; no scenario needed.
        </p>

        {/* Secondary: rehearse one specific scenario instead. */}
        <button
          onClick={run}
          disabled={running}
          className="mt-2 btn-ghost text-[12px] w-full justify-center disabled:opacity-40"
          title="Run one specific scenario instead"
        >
          {running ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Running
            </>
          ) : (
            <>
              <Play className="h-3 w-3" /> Run a specific scenario
            </>
          )}
        </button>

        {running && (
          <div className="mt-3">
            <div className="progress-track">
              <div className="progress-indeterminate" />
            </div>
            <div className="mt-1.5 font-mono text-[10.5px] text-text-tertiary">
              <span className="text-accent-cyan">{String(progress?.step ?? 1).padStart(2, "0")} / 06</span>
              {" · "}
              {progress?.agent ?? "Boot"}
            </div>
          </div>
        )}
      </section>

      <section className="surface p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <History className="h-3.5 w-3.5 text-text-tertiary" />
            <h2 className="text-[13px] font-medium tracking-tight">Recent runs</h2>
          </div>
          {history.length > 0 && <span className="label-eyebrow">{history.length}</span>}
        </div>
        {history.length === 0 ? (
          <p className="text-[12px] text-text-tertiary">No runs yet.</p>
        ) : (
          <ul className="space-y-1 max-h-[280px] overflow-auto -mx-1.5">
            {history.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => onPickRun(r)}
                  className={`w-full text-left rounded-md px-2.5 py-2 row-hover ${
                    activeId === r.id ? "bg-surface-2" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-text-tertiary truncate">{r.id}</span>
                    <SeverityChip severity={r.detection.severity} />
                  </div>
                  <div className="mt-1 text-[12.5px] font-medium truncate">{r.scenarioLabel}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-tertiary">
                    <MapPin className="h-2.5 w-2.5" /> {r.detection.location}
                    <span className="ml-auto font-mono">{r.ts}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

/* ============================================================
   TAB BAR
   ============================================================ */
function TabBar({
  tab,
  setTab,
  hasResult,
}: {
  tab: TabKey;
  setTab: (t: TabKey) => void;
  hasResult: boolean;
}) {
  const tabs: { key: TabKey; label: string; icon: typeof Radar }[] = [
    { key: "overview", label: "Overview", icon: Radar },
    { key: "orchestration", label: "Orchestration", icon: Brain },
    { key: "actions", label: "Actions", icon: Workflow },
    { key: "outcomes", label: "Outcomes", icon: Gauge },
    { key: "resilience", label: "Resilience", icon: ShieldCheck },
  ];
  return (
    <nav className="surface p-1 flex flex-wrap gap-0.5">
      {tabs.map((t) => {
        const active = tab === t.key;
        return (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            disabled={!hasResult}
            className={`relative inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-[12.5px] transition ${
              active
                ? "bg-surface-2 text-text-primary"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-2/60"
            } disabled:opacity-40`}
          >
            <t.icon
              className={`h-3.5 w-3.5 ${active ? "text-accent-cyan" : "text-text-tertiary"}`}
              strokeWidth={1.75}
            />
            <span className="font-medium">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ============================================================
   STATES
   ============================================================ */
function Empty() {
  return (
    <section className="surface p-12 text-center">
      <div className="mx-auto h-12 w-12 rounded-md surface-input flex items-center justify-center">
        <Satellite className="h-5 w-5 text-text-secondary" strokeWidth={1.75} />
      </div>
      <h2 className="mt-5 font-display text-[20px] font-semibold tracking-tight">
        Console standing by
      </h2>
      <p className="mt-1.5 text-[13.5px] text-text-secondary max-w-md mx-auto leading-relaxed">
        Pick a scenario in the left rail, then run the mission. Live signals will populate as agents work.
      </p>
    </section>
  );
}

function ScanError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="surface p-12 text-center">
      <div className="mx-auto h-12 w-12 rounded-md surface-input flex items-center justify-center">
        <WifiOff className="h-5 w-5 text-status-warn" strokeWidth={1.75} />
      </div>
      <h2 className="mt-5 font-display text-[20px] font-semibold tracking-tight">
        Live scan unavailable
      </h2>
      <p className="mt-1.5 text-[13.5px] text-text-secondary max-w-md mx-auto leading-relaxed">
        {message}
      </p>
      <button onClick={onRetry} className="mt-5 btn-primary text-[12.5px] mx-auto">
        <Radar className="h-3.5 w-3.5" /> Try Scan everything again
      </button>
    </section>
  );
}

function RunningState({ progress, liveTraces }: { progress: { step: number; agent: string } | null, liveTraces: TraceStep[] }) {
  // Drive the mesh from REAL streamed traces — each node lights up only when
  // that agent has actually emitted its reasoning. Before the first trace
  // arrives, fall back to the time-based progress so it doesn't sit dead.
  const streamed = liveTraces.length;
  const activeIndex = streamed > 0
    ? Math.min(streamed, 5)
    : Math.min((progress?.step ?? 1) - 1, 5);
  const currentAgent = streamed > 0
    ? (liveTraces[streamed - 1]?.agentName ?? progress?.agent ?? "Scout")
    : (progress?.agent ?? "Scout");

  return (
    <div className="space-y-4">
      <section className="surface p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md surface-input flex items-center justify-center">
              <Brain className="h-4 w-4 text-accent-cyan animate-pulse-soft" strokeWidth={1.75} />
            </div>
            <div>
              <div className="label-eyebrow text-accent-cyan">Live agent orchestration</div>
              <h3 className="mt-1 font-display text-[18px] font-semibold tracking-tight">
                {Math.min(Math.max(streamed, progress?.step ?? 1), 6)} / 6 · {currentAgent}
              </h3>
            </div>
          </div>
          <span className="label-eyebrow">sentinel-ops v4.7</span>
        </div>
        <div className="mt-6">
          <OrchestrationGraph activeIndex={activeIndex} />
        </div>
        <div className="mt-4 progress-track">
          <div className="progress-indeterminate" />
        </div>
      </section>

      {liveTraces.length > 0 ? (
        <ReasoningTraces trace={liveTraces} autoExpandLast />
      ) : (
        <section className="surface p-6 text-center">
          <p className="text-[13px] text-text-secondary">
            Ingesting live sources — agent reasoning will stream here as each
            agent reports.
          </p>
        </section>
      )}
    </div>
  );
}

/* ============================================================
   OVERVIEW
   ============================================================ */
function OverviewTab({
  r,
  source,
  metrics,
}: {
  r: Result;
  source: "live" | "demo";
  metrics: LiveMetrics;
}) {
  return (
    <div className="space-y-4">
      <DetectionCard r={r} source={source} />
      <InteractiveMap run={r} />
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <ImpactCard r={r} />
        <SectorMap r={r} metrics={metrics} />
      </div>
      <SnapshotKpis r={r} />
    </div>
  );
}

function DetectionCard({ r, source }: { r: Result; source: "live" | "demo" }) {
  return (
    <section className="surface p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 text-status-alert" strokeWidth={1.75} />
          <h3 className="font-display text-[17px] font-semibold tracking-tight">Detected situation</h3>
          <span className="font-mono text-[10.5px] text-text-tertiary">{r.id}</span>
          {source === "live" && (
            <span className="pill pill-ok">Live</span>
          )}
        </div>
        <SeverityChip severity={r.detection.severity} />
      </div>
      <p className="mt-3 text-[13.5px] text-text-secondary leading-relaxed">{r.detection.description}</p>

      <div className="mt-5 grid sm:grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Type" value={<span className="text-[15px]">{r.detection.type}</span>} />
        <StatTile label="Location" value={<span className="text-[15px]">{r.detection.location}</span>} />
        <StatTile label="Signals" value={`${r.detection.signalCount}`} hint="cross-source" />
        <StatTile
          label="Coordinates"
          value={<span className="font-mono text-[14px]">{r.detection.coordinates.lat.toFixed(2)}°N</span>}
          hint={`${r.detection.coordinates.lng.toFixed(2)}°E`}
        />
      </div>

      <div className="mt-5 grid md:grid-cols-2 gap-5">
        <ConfidenceMeter value={r.detection.confidence} delta={0.04} label="Detection confidence" />
        <ConfidenceMeter value={r.kpis.composite} delta={0.06} label="Composite KPI" />
      </div>
    </section>
  );
}

function ImpactCard({ r }: { r: Result }) {
  return (
    <section className="surface p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[15px] font-semibold tracking-tight">Impact assessment</h3>
        <span className="label-eyebrow">Exposure brief</span>
      </div>
      <p className="mt-3 text-[13.5px] text-text-secondary leading-relaxed">{r.impact.summary}</p>
      <ul className="mt-4 space-y-1.5">
        {r.impact.bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] text-text-primary leading-relaxed">
            <span className="mt-1.5 h-1 w-1 rounded-full bg-status-warn shrink-0" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <MetaPill icon={Users} label="People" value={r.impact.people} />
        <MetaPill icon={Clock} label="Window" value={r.impact.time} />
        <MetaPill icon={Database} label="Infra risk" value={r.impact.infra} />
        <MetaPill icon={Activity} label="Economic" value={r.impact.economic} />
      </div>
    </section>
  );
}

function SectorMap({ r, metrics }: { r: Result; metrics: LiveMetrics }) {
  const fmt = (n: number) => String(n).padStart(2, "0");
  const watching = Math.max(0, metrics.severityCounts.total - metrics.severityCounts.critical - metrics.severityCounts.high);
  return (
    <section className="surface p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-[15px] font-semibold tracking-tight">Sector sweep</h3>
        <span className="label-eyebrow">{r.city}</span>
      </div>
      <div className="flex items-center justify-center py-2">
        <RadarDisplay size={200} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
        <ContactsCount tone="critical" label="Critical" n={fmt(metrics.severityCounts.critical)} />
        <ContactsCount tone="warn" label="High" n={fmt(metrics.severityCounts.high)} />
        <ContactsCount tone="ok" label="Watching" n={fmt(watching)} />
      </div>
    </section>
  );
}

function ContactsCount({
  tone,
  label,
  n,
}: {
  tone: "critical" | "warn" | "ok";
  label: string;
  n: string;
}) {
  const c =
    tone === "critical"
      ? "text-status-critical"
      : tone === "warn"
      ? "text-status-warn"
      : "text-accent-cyan";
  return (
    <div>
      <div className="label-eyebrow">{label}</div>
      <div className={`mt-1 font-mono text-[14px] ${c}`}>{n}</div>
    </div>
  );
}

function SnapshotKpis({ r }: { r: Result }) {
  return (
    <section className="surface p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-[15px] font-semibold tracking-tight">Mission snapshot</h3>
        <span className="label-eyebrow">Live KPI</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Mobility" value={`${(r.kpis.mobility * 100).toFixed(0)}%`} delta="↑ 12" hint="post-plan" />
        <StatTile label="Safety" value={`${(r.kpis.safety * 100).toFixed(0)}%`} delta="↑ 9" hint="post-plan" />
        <StatTile label="Equity" value={`${(r.kpis.equity * 100).toFixed(0)}%`} delta="↑ 4" hint="post-plan" />
        <StatTile label="Composite" value={`${(r.kpis.composite * 100).toFixed(0)}`} delta="greenlit" hint="approved" />
      </div>
    </section>
  );
}

function MetaPill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="surface-input rounded-md p-3 flex items-center gap-2.5">
      <div className="h-8 w-8 rounded-md border border-line bg-surface-2 flex items-center justify-center">
        <Icon className="h-3.5 w-3.5 text-text-secondary" strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <div className="label-eyebrow">{label}</div>
        <div className="mt-0.5 text-[13px] font-medium truncate">{value}</div>
      </div>
    </div>
  );
}

/* ============================================================
   ORCHESTRATION
   ============================================================ */
function OrchestrationTab({ r }: { r: Result }) {
  return (
    <div className="space-y-4">
      <section className="surface p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <Brain className="h-4 w-4 text-accent-cyan" strokeWidth={1.75} />
            <h3 className="font-display text-[17px] font-semibold tracking-tight">Agent orchestration</h3>
          </div>
          <span className="label-eyebrow">Mesh graph</span>
        </div>
        <OrchestrationGraph activeIndex={5} />
        <div className="mt-4 grid md:grid-cols-3 gap-2.5">
          {AGENT_ORDER.slice(0, 3).map((k) => {
            const a = AGENTS[k];
            return (
              <div key={k} className="surface-input rounded-md p-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-md border border-line bg-surface-2 flex items-center justify-center">
                  <a.icon className="h-3.5 w-3.5 text-text-secondary" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <div className="label-eyebrow">{a.code}</div>
                  <div className="mt-0.5 text-[13px] font-medium truncate">{a.name}</div>
                </div>
                <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-status-ok" strokeWidth={1.75} />
              </div>
            );
          })}
        </div>
      </section>

      <ReasoningTraces trace={r.trace} />
      <InterAgentChannel trace={r.trace} />
    </div>
  );
}

function ReasoningTraces({ trace, autoExpandLast = false }: { trace: TraceStep[], autoExpandLast?: boolean }) {
  const [open, setOpen] = useState<number | null>(0);
  
  useEffect(() => {
    if (autoExpandLast && trace.length > 0) {
      setOpen(trace[trace.length - 1].step);
    }
  }, [trace.length, autoExpandLast]);

  return (
    <section className="surface">
      <div className="flex items-center justify-between px-6 py-4 divider-y">
        <h3 className="font-display text-[15px] font-semibold tracking-tight">Reasoning trace</h3>
        <span className="label-eyebrow">Audit log {autoExpandLast && <span className="text-accent-cyan ml-1 animate-pulse">● LIVE</span>}</span>
      </div>
      <ul>
        {trace.map((t) => {
          const a = AGENTS[t.agent];
          const Icon = a.icon;
          const isOpen = open === t.step;
          return (
            <li key={t.step} className="border-b border-line last:border-b-0">
              <button
                onClick={() => setOpen(isOpen ? null : t.step)}
                className="w-full flex items-center gap-3 px-6 py-3 row-hover text-left"
              >
                <span className="font-mono text-[10.5px] text-text-tertiary w-8">
                  {String(t.step).padStart(2, "0")}
                </span>
                <Icon className="h-3.5 w-3.5 text-text-secondary shrink-0" strokeWidth={1.75} />
                <span className="text-[13px] font-medium truncate min-w-[120px]">{a.name}</span>
                <span className="hidden md:inline text-[12px] text-text-tertiary truncate flex-1 relative">
                   {autoExpandLast && isOpen ? <TypewriterText text={t.reasoning} /> : t.reasoning}
                </span>
                <span className="font-mono text-[10.5px] text-accent-cyan shrink-0">
                  {(t.confidence * 100).toFixed(0)}%
                </span>
                <span className="font-mono text-[10.5px] text-text-tertiary shrink-0 w-14 text-right">
                  {t.ms}ms
                </span>
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-text-tertiary" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-text-tertiary" />
                )}
              </button>
              {isOpen && (
                <div className="px-6 pb-5 pt-1 grid md:grid-cols-2 gap-3 animate-fade-in">
                  <TraceField label="Input" value={t.input} typewrite={autoExpandLast} />
                  <TraceField label="Reasoning" value={t.reasoning} typewrite={autoExpandLast} />
                  <TraceField label="Output" value={t.output} typewrite={autoExpandLast} />
                  <TraceField label="Tool calls" value={t.tools.join(" · ")} typewrite={autoExpandLast} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TypewriterText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    let i = 0;
    setDisplayed("");
    const timer = setInterval(() => {
      setDisplayed(text.substring(0, i));
      i += 3;
      if (i > text.length) clearInterval(timer);
    }, 10);
    return () => clearInterval(timer);
  }, [text]);
  return <>{displayed}{displayed.length < text.length && <span className="animate-pulse">_</span>}</>;
}

function TraceField({ label, value, typewrite = false }: { label: string; value: string; typewrite?: boolean }) {
  return (
    <div className="surface-input rounded-md p-3">
      <div className="label-eyebrow">{label}</div>
      <div className="mt-1 font-mono text-[11.5px] text-text-primary break-words leading-relaxed">
        {typewrite && value ? <TypewriterText text={value} /> : (value || "—")}
      </div>
    </div>
  );
}

function InterAgentChannel({ trace }: { trace: TraceStep[] }) {
  return (
    <section className="surface p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-[15px] font-semibold tracking-tight">Inter-agent channel</h3>
        <span className="label-eyebrow">Message bus</span>
      </div>
      <div className="space-y-1.5">
        {trace.map((t, i) => {
          const from = AGENTS[t.agent];
          const next = trace[i + 1];
          if (!next) return null;
          const to = AGENTS[next.agent];
          return (
            <div
              key={i}
              className="surface-input rounded-md px-3 py-2 flex flex-wrap items-center gap-2 text-[12px]"
            >
              <span className="font-mono text-[10px] text-text-tertiary w-14">
                +{String(t.ms).padStart(4, "0")}ms
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-secondary">
                {from.code}
              </span>
              <ArrowRight className="h-2.5 w-2.5 text-text-tertiary" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-secondary">
                {to.code}
              </span>
              <span className="text-text-primary truncate flex-1">{t.output}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ============================================================
   ACTIONS
   ============================================================ */
function ActionsTab({ r }: { r: Result }) {
  const total = r.actions.items.length;
  const done = r.actions.items.filter((a) => a.status === "complete").length;

  return (
    <div className="space-y-4">
      <section className="surface p-6">
        <div className="grid md:grid-cols-[1fr_auto] items-center gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Workflow className="h-4 w-4 text-accent-cyan" strokeWidth={1.75} />
              <h3 className="font-display text-[17px] font-semibold tracking-tight">Action execution</h3>
            </div>
            <p className="mt-2 text-[13px] text-text-secondary max-w-2xl leading-relaxed">
              {r.actions.coord}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 min-w-[240px]">
            <StatTile label="Queued" value={`${total - done}`} />
            <StatTile label="Complete" value={`${done}`} />
            <StatTile label="Total" value={`${total}`} />
          </div>
        </div>
      </section>

      <section className="surface">
        <div className="flex items-center justify-between px-6 py-4 divider-y">
          <h3 className="font-display text-[15px] font-semibold tracking-tight">Dispatch queue</h3>
          <button className="btn-ghost text-[11.5px] py-1 px-2.5">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
        <ul>
          {r.actions.items.map((a) => (
            <ActionRow key={`${a.p}-${a.action}`} a={a} />
          ))}
        </ul>
      </section>

      <ChannelGrid r={r} />
    </div>
  );
}

function ActionRow({ a }: { a: Action }) {
  const pill =
    a.status === "complete"
      ? "pill-ok"
      : a.status === "ack"
      ? "pill-low"
      : a.status === "dispatched"
      ? "pill-high"
      : "pill-medium";
  return (
    <li className="px-6 py-3 border-b border-line last:border-b-0 row-hover">
      <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-4">
        <span className="h-7 w-7 rounded-md surface-input border border-line text-[12px] font-mono text-text-secondary flex items-center justify-center">
          {a.p}
        </span>
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium leading-tight">{a.action}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-tertiary">
            <span>→ <span className="text-text-secondary">{a.assignee}</span></span>
            <span>· {a.channel}</span>
            <span>· ETA {a.eta}</span>
            <span className="text-accent-cyan">· {a.impact}</span>
          </div>
        </div>
        <span className={`pill ${pill}`}>{a.status.toUpperCase()}</span>
      </div>
    </li>
  );
}

function ChannelGrid({ r }: { r: Result }) {
  // Derive real channel load from the action plan: count actions per channel,
  // surface load = count / total.
  const channelMeta: Record<string, { icon: typeof Radio; label: string }> = {
    RADIO_DISPATCH:  { icon: Radio,         label: "DISPATCH_RADIO" },
    DISPATCH:        { icon: Radio,         label: "DISPATCH_RADIO" },
    DISPATCH_RADIO:  { icon: Radio,         label: "DISPATCH_RADIO" },
    SMS_BROADCAST:   { icon: Bell,          label: "SMS_BROADCAST" },
    TRAFFIC_API:     { icon: Workflow,      label: "TRAFFIC_API" },
    GRID_SCADA:      { icon: Cpu,           label: "GRID_SCADA" },
    HOSPITAL_QUEUE:  { icon: ClipboardList, label: "HOSPITAL_QUEUE" },
    HOSPITAL:        { icon: ClipboardList, label: "HOSPITAL_QUEUE" },
    RESOURCE:        { icon: Database,      label: "RESOURCE_DEPOT" },
    RESOURCE_DEPOT:  { icon: Database,      label: "RESOURCE_DEPOT" },
    API:             { icon: Workflow,      label: "API" },
  };

  // Bucket actions per channel
  const counts = new Map<string, { count: number; complete: number }>();
  for (const a of r.actions.items) {
    const key = a.channel?.toUpperCase() ?? "API";
    const c = counts.get(key) ?? { count: 0, complete: 0 };
    c.count += 1;
    if (a.status === "complete") c.complete += 1;
    counts.set(key, c);
  }
  const total = Math.max(1, r.actions.items.length);

  const channels = Array.from(counts.entries()).map(([key, { count, complete }]) => {
    const meta = channelMeta[key] ?? { icon: Workflow, label: key };
    const load = count / total;
    const status = complete === count ? "online" : "online"; // backend doesn't expose channel health; everything that ran is online
    return { name: meta.label, icon: meta.icon, status, load, count, complete };
  });

  if (channels.length === 0) {
    return (
      <section className="surface p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-[15px] font-semibold tracking-tight">Channels</h3>
          <span className="label-eyebrow">Execution fabric</span>
        </div>
        <p className="text-[12.5px] text-text-tertiary">No actions dispatched yet on this run.</p>
      </section>
    );
  }
  return (
    <section className="surface p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-[15px] font-semibold tracking-tight">Channels</h3>
        <span className="label-eyebrow">Execution fabric</span>
      </div>
      <div className="grid md:grid-cols-3 gap-2.5">
        {channels.map((c) => (
          <div key={c.name} className="surface-input rounded-md p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <c.icon className="h-3.5 w-3.5 text-text-secondary" strokeWidth={1.75} />
                <span className="font-mono text-[10.5px] text-text-secondary">{c.name}</span>
              </div>
              <span
                className={`pill ${
                  c.status === "online" ? "pill-ok" : c.status === "degraded" ? "pill-medium" : "pill-critical"
                }`}
              >
                {c.status}
              </span>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-[10.5px] text-text-tertiary">
                <span>{c.complete} / {c.count} complete</span>
                <span className="font-mono">{Math.round(c.load * 100)}%</span>
              </div>
              <div className="mt-1.5 confidence-track">
                <div className="confidence-fill" style={{ width: `${Math.round(c.load * 100)}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   OUTCOMES
   ============================================================ */
function OutcomesTab({ r }: { r: Result }) {
  return (
    <div className="space-y-4">
      <section className="surface p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Gauge className="h-4 w-4 text-accent-cyan" strokeWidth={1.75} />
            <h3 className="font-display text-[17px] font-semibold tracking-tight">Outcome simulation</h3>
          </div>
          <span className="label-eyebrow">{r.sim.monteCarloRuns.toLocaleString()} trials</span>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <SimulationCardBig r={r} kind="before" />
          <SimulationCardBig r={r} kind="after" />
        </div>
      </section>

      <ImpactTimeline r={r} />
      <OutcomeSummary r={r} />
    </div>
  );
}

function SimulationCardBig({ r, kind }: { r: Result; kind: "before" | "after" }) {
  const isAfter = kind === "after";
  const data = isAfter ? r.sim.after : r.sim.before;
  const color = isAfter ? "text-accent-cyan" : "text-status-alert";
  return (
    <div className="surface-input rounded-lg p-5">
      <div className="flex items-center justify-between">
        <span className="label-eyebrow">{isAfter ? "After · Sentinel plan" : "Before · unmanaged"}</span>
        <span className={`font-mono text-[10.5px] ${color}`}>{data.status}</span>
      </div>
      <div className="mt-5 flex items-end justify-between gap-6">
        <div>
          <div className="label-eyebrow">Congestion</div>
          <div className={`mt-1 font-display text-[40px] font-semibold tracking-tight leading-none ${color}`}>
            {data.congestion}
          </div>
          <div className="mt-3 label-eyebrow">Throughput</div>
          <div className={`mt-1 font-mono text-[15px] ${color}`}>{data.speed}</div>
        </div>
        <SparkColumn isAfter={isAfter} />
      </div>
    </div>
  );
}

function SparkColumn({ isAfter }: { isAfter: boolean }) {
  const bars = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) =>
        isAfter ? Math.max(15, 78 - i * 4 + (i % 3) * 5) : Math.min(92, 38 + i * 3 + (i % 4) * 7)
      ),
    [isAfter]
  );
  return (
    <div className="flex items-end gap-1 h-24">
      {bars.map((h, i) => (
        <div
          key={i}
          className={`w-1.5 rounded-sm ${isAfter ? "bg-accent-cyan/65" : "bg-status-alert/60"}`}
          style={{ height: `${h}%`, transition: "height 700ms ease" }}
        />
      ))}
    </div>
  );
}

function ImpactTimeline({ r }: { r: Result }) {
  return (
    <section className="surface p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-[15px] font-semibold tracking-tight">Impact timeline</h3>
        <span className="label-eyebrow">Ticket trail</span>
      </div>
      <ol className="relative pl-5 space-y-2">
        <span className="absolute left-[5px] top-1 bottom-1 w-px bg-line" />
        {r.sim.log.map((l) => (
          <li key={l.ticket} className="relative">
            <span className="absolute -left-[15px] top-1.5 h-2 w-2 rounded-full bg-surface-0 border border-accent-cyan" />
            <div className="surface-input rounded-md p-3 flex items-start gap-3">
              <span className="font-mono text-[10.5px] text-accent-cyan shrink-0">{l.ticket}</span>
              <span className="text-[12.5px] text-text-primary flex-1 leading-relaxed">{l.text}</span>
              <span className="font-mono text-[10.5px] text-text-tertiary shrink-0">{l.ts}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function OutcomeSummary({ r }: { r: Result }) {
  return (
    <section className="surface p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-status-ok" strokeWidth={1.75} />
          <h3 className="font-display text-[15px] font-semibold tracking-tight">After-action summary</h3>
        </div>
        <button className="btn-ghost text-[11.5px] py-1 px-2.5">
          <Download className="h-3 w-3" /> Export brief
        </button>
      </div>
      <p className="text-[13px] text-text-secondary leading-relaxed">{r.outcome}</p>
      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiRing label="Mobility" value={r.kpis.mobility} />
        <KpiRing label="Safety" value={r.kpis.safety} />
        <KpiRing label="Equity" value={r.kpis.equity} />
        <KpiRing label="Composite" value={r.kpis.composite} />
      </div>
    </section>
  );
}

function KpiRing({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const dash = (pct / 100) * 251;
  return (
    <div className="surface-input rounded-md p-4 flex items-center gap-3">
      <svg width="56" height="56" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r="40" stroke="rgba(255,255,255,0.06)" strokeWidth="5" fill="none" />
        <circle
          cx="45"
          cy="45"
          r="40"
          stroke="var(--accent-cyan)"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} 251`}
          transform="rotate(-90 45 45)"
          style={{ transition: "stroke-dasharray 900ms ease" }}
        />
        <text
          x="45"
          y="50"
          fill="white"
          textAnchor="middle"
          fontFamily="JetBrains Mono"
          fontSize="13"
          fontWeight="500"
        >
          {pct}
        </text>
      </svg>
      <div>
        <div className="label-eyebrow">{label}</div>
        <div className="mt-0.5 text-[12px] text-text-secondary">composite</div>
      </div>
    </div>
  );
}

/* ============================================================
   RESILIENCE
   ============================================================ */
function ResilienceTab({
  r,
  liveSignals,
}: {
  r: Result;
  liveSignals: Parameters<typeof LiveSignalFeed>[0]["signals"];
}) {
  const failures = r.failures ?? [
    {
      signal: "Conflicting reports across citizen and sensor sources.",
      resolution:
        "Verification reduced trust; Adaptation rerouted to a corroborating channel before continuing dispatch.",
    },
  ];

  // Compute real "Signal sources" distribution from live backend signals.
  // Trust = min(1, count / median * 1.0) as a coverage proxy — degraded if below half median.
  const sourceCounts = new Map<string, number>();
  for (const s of liveSignals) sourceCounts.set(s.src, (sourceCounts.get(s.src) ?? 0) + 1);
  const totals = Array.from(sourceCounts.entries()).map(([k, v]) => ({ name: k, count: v }));
  totals.sort((a, b) => b.count - a.count);
  const max = totals[0]?.count || 1;
  const sourceRows = totals.map(({ name, count }) => ({
    name,
    count,
    coverage: count / max,
    degraded: count / max < 0.35,
  }));
  return (
    <div className="space-y-4">
      <section className="surface p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-accent-cyan" strokeWidth={1.75} />
            <h3 className="font-display text-[17px] font-semibold tracking-tight">Failure recovery</h3>
          </div>
          <span className="label-eyebrow">Confidence gate</span>
        </div>
        <p className="mt-3 text-[13.5px] text-text-secondary max-w-3xl leading-relaxed">
          Sentinel doesn't pretend signals are clean. When confidence drops, the mesh requests evidence,
          switches sources, and re-issues a revised plan — every adaptation is logged and broadcast.
        </p>
      </section>

      <section className="surface p-6 space-y-2.5">
        {failures.map((f, i) => (
          <div key={i} className="surface-input rounded-md p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-status-warn" strokeWidth={1.75} />
              <span className="label-eyebrow">Conflict · #{String(i + 1).padStart(2, "0")}</span>
            </div>
            <p className="mt-2 text-[13px] text-text-primary leading-relaxed">
              <span className="font-medium">Signal: </span>
              {f.signal}
            </p>
            <p className="mt-2 text-[13px] text-text-secondary leading-relaxed">
              <span className="text-accent-cyan font-medium">Resolution: </span>
              {f.resolution}
            </p>
            <pre className="mt-3 surface-input rounded-md p-3 font-mono text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap">
{`sentinel.adapt(
  trust_floor=0.71,
  fallback="alt_source"
) → plan_v2`}
            </pre>
          </div>
        ))}
      </section>

      <section className="surface p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-[15px] font-semibold tracking-tight">Signal sources</h3>
          <span className="label-eyebrow">Last run · coverage</span>
        </div>
        <p className="text-[12.5px] text-text-tertiary mb-4">
          Distribution of signals ingested into the most recent run, by source.
        </p>
        {sourceRows.length === 0 ? (
          <p className="text-[12.5px] text-text-tertiary">
            No signal sources yet — kick off a run from the left rail.
          </p>
        ) : (
          <div className="grid md:grid-cols-3 gap-3">
            {sourceRows.map((row) => (
              <TrustItem
                key={row.name}
                label={row.name}
                value={row.coverage}
                state={row.degraded ? "degraded" : "ok"}
                rawCount={row.count}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TrustItem({
  label,
  value,
  state,
  rawCount,
}: {
  label: string;
  value: number;
  state?: "ok" | "degraded";
  rawCount?: number;
}) {
  const pct = Math.round(value * 100);
  const isDeg = state === "degraded";
  return (
    <div className="surface-input rounded-md p-3">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-medium">{label}</span>
        <span className={`pill ${isDeg ? "pill-medium" : "pill-ok"}`}>
          {isDeg ? "Low" : "Active"}
        </span>
      </div>
      {typeof rawCount === "number" && (
        <div className="mt-1 text-[10.5px] text-text-tertiary font-mono">{rawCount} signals</div>
      )}
      <div className="mt-3 confidence-track">
        <div
          className="confidence-fill"
          style={{
            width: `${pct}%`,
            background: isDeg ? "var(--status-warn)" : "var(--accent-cyan)",
          }}
        />
      </div>
      <div className="mt-1.5 text-[10.5px] text-text-tertiary font-mono">coverage = {value.toFixed(2)}</div>
    </div>
  );
}

/* ============================================================
   RIGHT RAIL
   ============================================================ */
function RightRail({
  active,
  liveSignals,
}: {
  active: Result | null;
  liveSignals: Parameters<typeof LiveSignalFeed>[0]["signals"];
}) {
  // Real backend signals if we have any, otherwise fall back to demo loop so the
  // panel doesn't look broken in offline mode.
  const signals = liveSignals.length > 0 ? liveSignals : LIVE_SIGNALS;
  return (
    <aside className="hidden xl:flex flex-col gap-4 lg:sticky lg:top-[85px] self-start">
      <LiveSignalFeed signals={signals} max={4} intervalMs={7000} />

      <div className="surface p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-medium tracking-tight">Active mesh</h3>
          <span className="label-eyebrow">6 / 6</span>
        </div>
        <ul className="space-y-0.5">
          {AGENT_ORDER.map((k) => {
            const a = AGENTS[k];
            return (
              <li
                key={k}
                className="px-2 py-1.5 rounded-md row-hover flex items-center gap-2.5"
              >
                <a.icon className="h-3.5 w-3.5 text-text-secondary shrink-0" strokeWidth={1.75} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium truncate">{a.name}</div>
                  <div className="label-eyebrow">{a.code}</div>
                </div>
                <span className="dot-pulse dot-ok text-status-ok" />
              </li>
            );
          })}
        </ul>
      </div>

      {active && (
        <div className="surface p-4 space-y-3">
          <div>
            <div className="label-eyebrow">Mission heartbeat</div>
            <div className="mt-1.5 text-[13px] font-medium leading-tight">{active.scenarioLabel}</div>
            <div className="mt-0.5 text-[11.5px] text-text-tertiary">{active.detection.location}</div>
          </div>
          <ConfidenceMeter value={active.detection.confidence} label="Confidence" />
          <ConfidenceMeter value={active.kpis.composite} label="Composite KPI" />
        </div>
      )}
    </aside>
  );
}

/* ============================================================
   COMMAND PALETTE
   ============================================================ */
function CommandPalette({
  onClose,
  onPickScenario,
  setTab,
}: {
  onClose: () => void;
  onPickScenario: (id: string) => void;
  setTab: (t: TabKey) => void;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const scenarios = SCENARIOS.filter((s) =>
    `${s.label} ${s.city}`.toLowerCase().includes(q.toLowerCase())
  );
  const sections: { key: TabKey; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "orchestration", label: "Agent orchestration" },
    { key: "actions", label: "Action execution" },
    { key: "outcomes", label: "Outcomes" },
    { key: "resilience", label: "Resilience" },
  ].filter((s) => s.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 bg-background/75 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-auto mt-[10vh] max-w-xl surface-raised overflow-hidden border border-line-strong"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line">
          <Command className="h-3.5 w-3.5 text-text-secondary" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search scenarios, sections, agents…"
            className="flex-1 bg-transparent outline-none text-[13.5px] placeholder:text-text-tertiary"
          />
          <kbd className="kbd">ESC</kbd>
        </div>
        <div className="max-h-[60vh] overflow-auto py-2">
          <PaletteSection title="Scenarios">
            {scenarios.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  onPickScenario(s.id);
                  onClose();
                }}
                className="w-full text-left px-3 py-2 row-hover flex items-center gap-3"
              >
                <span className="text-[15px]">{s.emoji}</span>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">{s.label}</div>
                  <div className="text-[11px] text-text-tertiary truncate">
                    {s.city} · {s.placeholder.slice(0, 40)}…
                  </div>
                </div>
              </button>
            ))}
          </PaletteSection>
          <PaletteSection title="Sections">
            {sections.map((s) => (
              <button
                key={s.key}
                onClick={() => {
                  setTab(s.key);
                  onClose();
                }}
                className="w-full text-left px-3 py-2 row-hover flex items-center gap-3"
              >
                <ArrowRight className="h-3.5 w-3.5 text-text-tertiary" />
                <span className="text-[13px]">{s.label}</span>
              </button>
            ))}
          </PaletteSection>
        </div>
      </div>
    </div>
  );
}

function PaletteSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 py-1.5 label-eyebrow">{title}</div>
      <div>{children}</div>
    </div>
  );
}

/* ============================================================
   HELPERS
   ============================================================ */
function backendIdFor(id: string): string {
  // Maps frontend scenario id → backend mock_sources scenario name.
  switch (id) {
    case "flood": return "urban_flooding";
    case "heat": return "heatwave";
    case "accident": return "accident";
    case "block": return "road_blockage";
    case "infra": return "infrastructure_failure";
    default: return "urban_flooding";
  }
}

function mockResult(id: string, label: string): Result {
  const base = RESULTS[id] ?? RESULTS.flood;
  return {
    ...base,
    id: `RUN-${Date.now().toString().slice(-6)}`,
    ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    scenarioLabel: label,
  };
}

function seedResult(id: string): Result {
  const base = RESULTS[id] ?? RESULTS.flood;
  const scenario = SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
  return {
    ...base,
    id: `RUN-${Date.now().toString().slice(-6)}-S`,
    ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    scenarioLabel: scenario.label,
  };
}
