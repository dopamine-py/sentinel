/**
 * Sentinel ↔ signal-intelligence (CIRO) API client.
 *
 * The backend is the FastAPI app at signal-intelligence-main/src/api.py.
 * In dev, /api/sentinel/* is proxied to http://localhost:8000/api/* by vite.config.ts.
 *
 * All methods degrade gracefully:
 *  - if the backend is reachable → return live data
 *  - if the backend is offline   → throw a typed `BackendUnavailable` error
 *
 * The dashboard catches `BackendUnavailable` and falls back to the bundled mock dataset.
 */

import type { AgentKey } from "./primitives";
import type { Result, TraceStep, Severity, Action } from "./data";

const BASE = "/api/sentinel";

const FETCH_TIMEOUT_MS = 4500;

export class BackendUnavailable extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "BackendUnavailable";
  }
}

async function call<T>(path: string, init?: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<T> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "content-type": "application/json", ...(init?.headers || {}) },
    });
    if (!res.ok) throw new BackendUnavailable(`HTTP ${res.status} on ${path}`);
    return (await res.json()) as T;
  } catch (e: unknown) {
    if (e instanceof BackendUnavailable) throw e;
    throw new BackendUnavailable(`Backend unreachable at ${path}`, e);
  } finally {
    clearTimeout(tid);
  }
}

/* ------------------------------------------------------------
   RAW BACKEND SHAPES (mirrors crisis_models.py)
   ------------------------------------------------------------ */

interface BackendCrisisSignal {
  id: string;
  source: string;
  raw_text: string;
  location: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
interface BackendDetectedCrisis {
  crisis_type: string;
  location: string;
  confidence: number;
  confidence_label: string;
  severity: string;
  description: string;
  affected_area: string;
  contributing_signals: string[];
  reasoning: string;
}
interface BackendSituationReport {
  crisis: BackendDetectedCrisis;
  impact_summary: string;
  impacts: string[];
  people_affected_estimate: string;
  infrastructure_risk: string;
  time_sensitivity: string;
  reasoning: string;
}
interface BackendResponseAction {
  action_id: string;
  action_type: string;
  description: string;
  priority: number;
  target_area: string;
  assigned_to: string;
  estimated_impact: string;
}
interface BackendActionPlan {
  plan_id: string;
  situation: BackendSituationReport;
  actions: BackendResponseAction[];
  coordination_note: string;
  reasoning: string;
}
interface BackendSimulationResult {
  action: BackendResponseAction;
  status: string;
  outcome: string;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  timestamp: string;
  ticket_id: string | null;
  alert_recipients: number;
}
interface BackendAgentTrace {
  agent_name: string;
  step: number;
  input_summary: string;
  reasoning: string;
  output_summary: string;
  tool_calls: Array<Record<string, unknown>>;
  duration_ms: number;
  timestamp: string;
}
export interface BackendCIRORunResult {
  run_id: string;
  started_at: string;
  completed_at: string;
  input_signals: BackendCrisisSignal[];
  detected_crisis: BackendDetectedCrisis | null;
  situation_report: BackendSituationReport | null;
  action_plan: BackendActionPlan | null;
  simulation_results: BackendSimulationResult[];
  outcome_summary: string;
  agent_traces: BackendAgentTrace[];
  before_snapshot: Record<string, unknown>;
  after_snapshot: Record<string, unknown>;
}

/* ------------------------------------------------------------
   ENDPOINTS
   ------------------------------------------------------------ */

export async function getScenarios(): Promise<{
  scenarios: string[];
  descriptions: Record<string, string>;
}> {
  const r = await call<{ status: string; scenarios: string[]; descriptions: Record<string, string> }>(
    "/ciro/scenarios"
  );
  return { scenarios: r.scenarios, descriptions: r.descriptions };
}

export async function triggerCrisisAsync(payload: {
  scenario: string;
  custom_signals?: string[];
  social_count?: number;
}): Promise<{ run_id: string }> {
  const r = await call<{ status: string; run_id: string }>("/ciro/run", {
    method: "POST",
    body: JSON.stringify(payload),
  }, 10_000);
  return r;
}

export async function triggerLiveScanAsync(): Promise<{ run_id: string }> {
  const r = await call<{ status: string; run_id: string }>("/ciro/scan/live", { method: "POST" }, 10_000);
  return r;
}

export async function runCrisisSync(payload: {
  scenario: string;
  custom_signals?: string[];
  social_count?: number;
}): Promise<Result> {
  const r = await call<{ status: string; data: BackendCIRORunResult }>("/ciro/run/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  }, 90_000);
  return adaptRun(r.data);
}

export async function runLiveScanSync(): Promise<Result> {
  const r = await call<{
    status: string;
    data?: BackendCIRORunResult;
    message?: string;
  }>("/ciro/scan/live/sync", { method: "POST" }, 120_000);
  if (!r.data) throw new BackendUnavailable(r.message || "no live data");
  return adaptRun(r.data);
}

export async function listRuns(): Promise<{ run_id: string; started_at: string; crisis: string | null }[]> {
  const r = await call<{ status: string; data: { run_id: string; started_at: string; crisis: string | null }[] }>(
    "/ciro/runs"
  );
  return r.data;
}

export async function getRun(runId: string): Promise<Result> {
  const r = await call<{ status: string; data: BackendCIRORunResult }>(`/ciro/runs/${runId}`);
  return adaptRun(r.data);
}

export async function getCiroStatus(): Promise<{
  running: boolean;
  total_runs: number;
  latest_run: { run_id: string; started_at: string } | null;
}> {
  const r = await call<{
    status: string;
    running: boolean;
    total_runs: number;
    latest_run: { run_id: string; started_at: string } | null;
  }>("/ciro/status");
  return { running: r.running, total_runs: r.total_runs, latest_run: r.latest_run };
}

/* ------------------------------------------------------------
   POLLING UTILITIES — for SSE-less progress feedback
   ------------------------------------------------------------ */

export function pollCiroStatus(
  onUpdate: (s: { running: boolean }) => void,
  intervalMs = 900
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const tick = async () => {
    if (stopped) return;
    try {
      const s = await getCiroStatus();
      onUpdate({ running: s.running });
    } catch {
      onUpdate({ running: false });
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  tick();
  return () => {
    stopped = true;
    if (timer!) clearTimeout(timer);
  };
}

/* ------------------------------------------------------------
   ADAPTER — backend → frontend Result
   ------------------------------------------------------------ */

const SEVERITY_MAP: Record<string, Severity> = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  critical: "CRITICAL",
};

const CRISIS_LABEL: Record<string, string> = {
  urban_flooding: "Urban Flooding",
  heatwave: "Heatwave",
  road_blockage: "Road Blockage",
  accident: "Multi-Vehicle Collision",
  infrastructure_failure: "Infrastructure Failure",
  unknown: "Unknown",
};

const AGENT_NAME_TO_KEY: Record<string, AgentKey> = {
  // matches signal-intelligence/src/crisis_agents.py naming
  signalingestionagent: "scout",
  scoutagent: "scout",
  scout: "scout",
  verificationagent: "verification",
  verification: "verification",
  crisisdetectionagent: "decision",
  situationanalysisagent: "decision",
  decisionagent: "decision",
  decision: "decision",
  actionplanningagent: "decision",
  actionexecutionagent: "execution",
  executionagent: "execution",
  execution: "execution",
  simulationagent: "monitoring",
  monitoringagent: "monitoring",
  monitoring: "monitoring",
  outcomeevaluationagent: "monitoring",
  adaptationagent: "adaptation",
  adaptation: "adaptation",
};

function mapAgent(name: string): AgentKey {
  const norm = (name || "").toLowerCase().replace(/[^a-z]/g, "");
  return AGENT_NAME_TO_KEY[norm] ?? "decision";
}

function ratioFromState(s: Record<string, unknown>): number {
  // Best-effort: try `congestion_index`, `congestion`, `outage_percent`, `er_load`, etc.
  const candidates = ["congestion_index", "congestion", "score", "outage_percent", "er_load"];
  for (const k of candidates) {
    const v = s?.[k];
    if (typeof v === "number") return v <= 1 ? v * 100 : v;
  }
  return 50;
}

function describeState(s: Record<string, unknown>): { congestion: string; speed: string; status: string; raw: number } {
  const raw = Math.round(ratioFromState(s));
  const status = String(s.status ?? (raw > 60 ? "DEGRADED" : "MANAGED")).toUpperCase();
  const speed = String(s.avg_speed ?? s.speed ?? s.eta ?? `${Math.max(2, 100 - raw)} km/h`);
  return { congestion: `${(raw / 10).toFixed(1)} / 10`, speed, status, raw };
}

function mapActionStatus(s: string): Action["status"] {
  const n = s.toLowerCase();
  if (n.includes("complete") || n.includes("executed")) return "complete";
  if (n.includes("ack")) return "ack";
  if (n.includes("dispatch") || n.includes("sent")) return "dispatched";
  return "queued";
}

export function adaptRun(b: BackendCIRORunResult): Result {
  const crisis = b.detected_crisis;
  const sit = b.situation_report;
  const plan = b.action_plan;

  const severity: Severity = crisis
    ? SEVERITY_MAP[String(crisis.severity).toLowerCase()] ?? "MEDIUM"
    : "MEDIUM";

  const trace: TraceStep[] = (b.agent_traces ?? []).map((t, idx) => ({
    agent: mapAgent(t.agent_name),
    agentName: t.agent_name,
    step: t.step ?? idx + 1,
    ms: Math.max(1, t.duration_ms ?? 0),
    input: t.input_summary ?? "",
    reasoning: t.reasoning ?? "",
    output: t.output_summary ?? "",
    tools: (t.tool_calls ?? []).map((c) => String((c as { name?: string }).name ?? "tool")),
    confidence: clamp01((crisis?.confidence ?? 0.85) - idx * 0.005),
  }));

  const actions: Action[] = (plan?.actions ?? []).map((a, i) => ({
    p: a.priority ?? i + 1,
    action: a.description,
    assignee: a.assigned_to,
    impact: a.estimated_impact,
    channel: a.action_type.toUpperCase(),
    eta: estimateEta(i),
    status: i === 0 ? "complete" : i === 1 ? "ack" : i === 2 ? "dispatched" : "queued",
  }));

  // Backend may include simulation_results — surface their status into actions if we have them
  if (b.simulation_results?.length) {
    b.simulation_results.forEach((sim, i) => {
      if (actions[i]) actions[i].status = mapActionStatus(sim.status);
    });
  }

  const before = describeState(b.before_snapshot ?? {});
  const after = describeState(b.after_snapshot ?? {});

  const compositeKpi = clamp01(crisis?.confidence ?? 0.82);

  return {
    id: b.run_id,
    scenarioId: crisis?.crisis_type ?? "unknown",
    scenarioLabel: crisis ? CRISIS_LABEL[crisis.crisis_type] ?? crisis.crisis_type : "Unknown",
    ts: formatTs(b.started_at),
    city: extractCity(crisis?.location ?? "—"),
    detection: {
      type: crisis ? CRISIS_LABEL[crisis.crisis_type] ?? crisis.crisis_type : "Unknown",
      location: crisis?.location ?? "—",
      confidence: clamp01(crisis?.confidence ?? 0.5),
      severity,
      description: crisis?.description ?? "No crisis detected.",
      coordinates: extractCoords(crisis?.location ?? ""),
      signalCount: (b.input_signals ?? []).length,
    },
    impact: {
      summary: sit?.impact_summary ?? "—",
      bullets: sit?.impacts ?? [],
      people: sit?.people_affected_estimate ?? "—",
      time: sit?.time_sensitivity ?? "—",
      infra: sit?.infrastructure_risk ?? "—",
      economic: "—",
    },
    actions: {
      coord: plan?.coordination_note ?? "—",
      items: actions,
    },
    sim: {
      before,
      after,
      log: (b.simulation_results ?? []).map((s, i) => ({
        ticket: s.ticket_id ?? `TKT-${1000 + i}`,
        text: s.outcome,
        ts: relTime(s.timestamp, b.started_at),
      })),
      monteCarloRuns: 1000,
    },
    outcome: b.outcome_summary || "Pipeline completed.",
    kpis: {
      mobility: compositeKpi,
      safety: compositeKpi - 0.01,
      equity: compositeKpi - 0.05,
      composite: compositeKpi,
    },
    trace,
  };
}

export function adaptTraceStep(t: any, idx: number, confidence: number = 0.85): TraceStep {
  return {
    agent: mapAgent(t.agent_name),
    agentName: t.agent_name,
    step: t.step || idx + 1,
    ms: Math.max(1, t.duration_ms ?? 0),
    input: t.input_summary ?? "",
    reasoning: t.reasoning ?? "",
    output: t.output_summary ?? "",
    tools: (t.tool_calls ?? []).map((c: any) => String(c.name ?? "tool")),
    confidence: clamp01(confidence - idx * 0.005),
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function relTime(at: string, since: string): string {
  try {
    const a = new Date(at).getTime();
    const s = new Date(since).getTime();
    const min = Math.max(0, Math.round((a - s) / 60_000));
    return `+${min}m`;
  } catch {
    return "—";
  }
}

function extractCity(location: string): string {
  // Heuristic — location is usually "Saddar, Karachi" or "Karachi" or "Lahore, PK"
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] || "—";
}

function extractCoords(location: string): { lat: number; lng: number } {
  // Backend doesn't return numeric coords today — return a city-level default
  const lc = location.toLowerCase();
  if (lc.includes("karachi"))   return { lat: 24.86, lng: 67.01 };
  if (lc.includes("lahore"))    return { lat: 31.55, lng: 74.34 };
  if (lc.includes("multan"))    return { lat: 30.16, lng: 71.50 };
  if (lc.includes("islamabad")) return { lat: 33.69, lng: 73.05 };
  if (lc.includes("peshawar"))  return { lat: 34.01, lng: 71.58 };
  return { lat: 24.86, lng: 67.01 };
}

function estimateEta(i: number): string {
  return `T+${String(2 + i * 4).padStart(2, "0")} min`;
}

/* ------------------------------------------------------------
   HEALTH PROBE
   ------------------------------------------------------------ */

export async function isBackendOnline(): Promise<boolean> {
  try {
    // 1.5s was too tight: when the backend is busy (running a scan, many
    // in-memory runs) the proxied status round-trip can exceed it and the
    // UI wrongly concludes "offline". Give it real headroom.
    await call<unknown>("/ciro/status", undefined, 6000);
    return true;
  } catch {
    return false;
  }
}
