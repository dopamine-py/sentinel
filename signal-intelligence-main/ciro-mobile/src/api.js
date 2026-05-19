// Sentinel mobile API client — talks to the signal-intelligence FastAPI backend.
// Base URL is overrideable via AsyncStorage at runtime (Settings screen).

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sentinel.apiBase';

// Defaults: web ↦ localhost, native ↦ hosted ngrok tunnel.
// Override at runtime in Settings (great for plugging your own IP during dev).
const DEFAULTS = {
  web: 'http://localhost:8000',
  native: 'https://nonvocationally-semicommercial-avery.ngrok-free.dev',
};

let _override = null;

export async function loadApiBase() {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v) _override = v;
  } catch {}
  return getApiBase();
}

export function getApiBase() {
  if (_override) return _override;
  return Platform.OS === 'web' ? DEFAULTS.web : DEFAULTS.native;
}

export async function setApiBase(url) {
  _override = (url || '').trim();
  try {
    if (_override) await AsyncStorage.setItem(KEY, _override);
    else await AsyncStorage.removeItem(KEY);
  } catch {}
}

export function getDefaultApiBase() {
  return Platform.OS === 'web' ? DEFAULTS.web : DEFAULTS.native;
}

/* ============================================================
   META — for UI badges
   ============================================================ */
export const CRISIS_META = {
  urban_flooding:         { icon: '🌊', label: 'Urban Flooding' },
  heatwave:               { icon: '🔥', label: 'Heatwave' },
  accident:               { icon: '🚗', label: 'Road Accident' },
  road_blockage:          { icon: '🚧', label: 'Road Blockage' },
  infrastructure_failure: { icon: '⚡', label: 'Infrastructure Failure' },
};

/* ============================================================
   FETCH
   ============================================================ */
async function apiFetch(path, options = {}, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${getApiBase()}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      ...options,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ============================================================
   ENDPOINTS
   ============================================================ */
export async function isBackendOnline() {
  try {
    await apiFetch('/api/ciro/status', {}, 3500);
    return true;
  } catch {
    return false;
  }
}

export async function fetchScenarios() {
  const d = await apiFetch('/api/ciro/scenarios', {}, 5000);
  return d.scenarios || [];
}

export async function fetchRuns() {
  const d = await apiFetch('/api/ciro/runs', {}, 10000);
  return d.data || [];
}

export async function fetchRun(runId) {
  const d = await apiFetch(`/api/ciro/runs/${runId}`, {}, 10000);
  return d.data;
}

export async function fetchStatus() {
  return apiFetch('/api/ciro/status', {}, 5000);
}

export async function runLiveScan() {
  return apiFetch('/api/ciro/scan/live/sync', { method: 'POST' }, 120000);
}

export async function runScenario(scenario, customSignal) {
  return apiFetch(
    '/api/ciro/run/sync',
    {
      method: 'POST',
      body: JSON.stringify({
        scenario,
        custom_signals: customSignal ? [customSignal] : [],
        social_count: 4,
      }),
    },
    120000
  );
}

/* ============================================================
   ADAPTER — backend CIRORunResult → screen-friendly shape
   ============================================================ */

const SEVERITY_MAP = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH', critical: 'CRITICAL' };

const AGENT_NAME_TO_KEY = {
  signalingestionagent: 'scout',
  scoutagent: 'scout',
  scout: 'scout',
  verificationagent: 'verification',
  verification: 'verification',
  crisisdetectionagent: 'decision',
  situationanalysisagent: 'decision',
  decisionagent: 'decision',
  decision: 'decision',
  actionplanningagent: 'decision',
  actionexecutionagent: 'execution',
  executionagent: 'execution',
  execution: 'execution',
  simulationagent: 'monitoring',
  monitoringagent: 'monitoring',
  monitoring: 'monitoring',
  outcomeevaluationagent: 'monitoring',
  adaptationagent: 'adaptation',
  adaptation: 'adaptation',
};

function mapAgent(name) {
  const norm = (name || '').toLowerCase().replace(/[^a-z]/g, '');
  return AGENT_NAME_TO_KEY[norm] || 'decision';
}

function extractCoords(loc = '') {
  const lc = loc.toLowerCase();
  if (lc.includes('karachi'))   return { lat: 24.86, lng: 67.01 };
  if (lc.includes('lahore'))    return { lat: 31.55, lng: 74.34 };
  if (lc.includes('multan'))    return { lat: 30.16, lng: 71.50 };
  if (lc.includes('islamabad')) return { lat: 33.69, lng: 73.05 };
  if (lc.includes('peshawar'))  return { lat: 34.01, lng: 71.58 };
  return { lat: 24.86, lng: 67.01 };
}

function fmtRel(at, since) {
  try {
    const min = Math.max(0, Math.round((new Date(at).getTime() - new Date(since).getTime()) / 60000));
    return `+${min}m`;
  } catch { return '—'; }
}

export function adaptRun(b) {
  if (!b) return null;
  const crisis = b.detected_crisis;
  const sit = b.situation_report;
  const plan = b.action_plan;
  const severity = crisis ? (SEVERITY_MAP[String(crisis.severity).toLowerCase()] || 'MEDIUM') : 'MEDIUM';

  const trace = (b.agent_traces || []).map((t, idx) => ({
    agent: mapAgent(t.agent_name),
    agentName: t.agent_name,
    step: t.step || idx + 1,
    ms: Math.max(1, t.duration_ms || 0),
    input: t.input_summary || '',
    reasoning: t.reasoning || '',
    output: t.output_summary || '',
    tools: (t.tool_calls || []).map((c) => String((c && c.name) || 'tool')),
    confidence: Math.max(0, Math.min(1, (crisis && crisis.confidence) || 0.85)),
  }));

  const actions = ((plan && plan.actions) || []).map((a, i) => ({
    p: a.priority || i + 1,
    action: a.description,
    assignee: a.assigned_to,
    impact: a.estimated_impact,
    channel: (a.action_type || 'channel').toUpperCase(),
    status: i === 0 ? 'complete' : i === 1 ? 'ack' : i === 2 ? 'dispatched' : 'queued',
  }));

  if (b.simulation_results && b.simulation_results.length) {
    b.simulation_results.forEach((sim, i) => {
      if (actions[i]) {
        const s = (sim.status || '').toLowerCase();
        actions[i].status = s.includes('complete') || s.includes('executed') ? 'complete'
          : s.includes('ack') ? 'ack'
          : s.includes('dispatch') ? 'dispatched'
          : 'queued';
      }
    });
  }

  const confidence = Math.max(0, Math.min(1, (crisis && crisis.confidence) || 0.5));
  const composite = Math.max(0.5, Math.min(0.99, confidence));

  return {
    id: b.run_id,
    scenarioId: (crisis && crisis.crisis_type) || 'unknown',
    scenarioLabel: crisis ? (CRISIS_META[crisis.crisis_type]?.label || crisis.crisis_type) : 'Unknown',
    icon: crisis ? (CRISIS_META[crisis.crisis_type]?.icon || '◆') : '◆',
    ts: (() => {
      try { return new Date(b.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
      catch { return '—'; }
    })(),
    detection: {
      type: crisis ? (CRISIS_META[crisis.crisis_type]?.label || crisis.crisis_type) : 'Unknown',
      location: (crisis && crisis.location) || '—',
      severity,
      confidence,
      description: (crisis && crisis.description) || 'No crisis detected.',
      coordinates: extractCoords((crisis && crisis.location) || ''),
      signalCount: (b.input_signals || []).length,
    },
    impact: {
      summary: (sit && sit.impact_summary) || '—',
      bullets: (sit && sit.impacts) || [],
      people: (sit && sit.people_affected_estimate) || '—',
      time: (sit && sit.time_sensitivity) || '—',
      infra: (sit && sit.infrastructure_risk) || '—',
    },
    actions: {
      coord: (plan && plan.coordination_note) || '—',
      items: actions,
    },
    trace,
    log: (b.simulation_results || []).map((s, i) => ({
      ticket: s.ticket_id || `TKT-${1000 + i}`,
      text: s.outcome,
      ts: fmtRel(s.timestamp, b.started_at),
    })),
    outcome: b.outcome_summary || 'Pipeline completed.',
    kpis: { mobility: composite, safety: composite - 0.01, equity: composite - 0.05, composite },
  };
}
