"""
CIRO — Crisis Intelligence Pipeline Orchestrator
Chains all 6 agents in sequence, tracks a full run result with traces.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from datetime import datetime
from typing import Any

from .crisis_agents import (
    ActionPlanningAgent,
    CrisisDetectionAgent,
    OutcomeEvaluationAgent,
    SignalIngestionAgent,
    SimulationAgent,
    SituationAnalysisAgent,
)
from .crisis_models import AgentTrace, CIRORunResult, CrisisSignal
from .mock_sources import ingest_all_signals
from .live_sources import fetch_all_live_signals

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Run registry (in-memory; keyed by run_id)
# ---------------------------------------------------------------------------
_runs: dict[str, CIRORunResult] = {}
_runs_lock = threading.Lock()
_active_traces: dict[str, list[AgentTrace]] = {}
_current_run_id: str | None = None
_pipeline_running = False
_pipeline_started_at: float | None = None  # monotonic; for stale-run watchdog
_pipeline_lock = threading.Lock()

# A real run is ~30–90s. If the flag stays True far longer than any run could
# legitimately take, a previous run leaked it (crash before finally, killed
# worker, etc.). Treat it as stale so it can never permanently block scans.
MAX_RUN_SECONDS = 300


def _is_stale_locked() -> bool:
    """True if _pipeline_running looks leaked. Caller must hold _pipeline_lock."""
    if not _pipeline_running or _pipeline_started_at is None:
        return False
    return (time.monotonic() - _pipeline_started_at) > MAX_RUN_SECONDS


def get_run(run_id: str) -> CIRORunResult | None:
    with _runs_lock:
        return _runs.get(run_id)


def list_runs() -> list[dict]:
    with _runs_lock:
        return [
            {
                "run_id": r.run_id,
                "started_at": r.started_at,
                "completed_at": r.completed_at,
                "crisis_type": r.detected_crisis.crisis_type.value if r.detected_crisis else None,
                "severity": r.detected_crisis.severity.value if r.detected_crisis else None,
                "confidence": r.detected_crisis.confidence if r.detected_crisis else None,
                "location": r.detected_crisis.location if r.detected_crisis else None,
                "signal_count": len(r.input_signals or []),
                "action_count": len(r.action_plan.actions) if r.action_plan else 0,
                "outcome": r.outcome_summary[:120] if r.outcome_summary else None,
            }
            for r in sorted(_runs.values(), key=lambda x: x.started_at, reverse=True)
        ]


def is_pipeline_running() -> bool:
    # A stale (leaked) flag reports as NOT running, so /api/ciro/status is
    # honest and a phantom run can't block the UI or future scans.
    with _pipeline_lock:
        return _pipeline_running and not _is_stale_locked()


# ---------------------------------------------------------------------------
# Main pipeline function
# ---------------------------------------------------------------------------

def run_crisis_pipeline(
    scenario: str = "urban_flooding",
    custom_signals: list[str] | None = None,
    social_count: int = 4,
    run_id: str | None = None,
) -> CIRORunResult:
    """
    Execute the full CIRO multi-agent pipeline.

    Args:
        scenario:        One of the mock scenario names (or "custom")
        custom_signals:  Optional list of raw text strings to inject as social-media signals
        social_count:    Number of mock social media signals to include
    Returns:
        CIRORunResult — the complete run artefact
    """
    global _pipeline_running, _pipeline_started_at, _current_run_id

    if not run_id:
        run_id = f"CIRO-{uuid.uuid4().hex[:8].upper()}"
    started_at = datetime.now().isoformat()
    traces: list[AgentTrace] = []

    logger.info("=" * 60)
    logger.info("CIRO PIPELINE — Run %s | Scenario: %s", run_id, scenario)
    logger.info("=" * 60)

    with _pipeline_lock:
        _pipeline_running = True
        _pipeline_started_at = time.monotonic()
        _current_run_id = run_id
    with _runs_lock:
        _active_traces[run_id] = traces

    try:
        # ── Step 0: Collect signals ───────────────────────────────────────
        raw_signals: list[CrisisSignal] = ingest_all_signals(scenario, social_count=social_count)

        # Inject any custom user-provided text as additional social-media signals
        if custom_signals:
            import random as _rnd
            from .crisis_models import SignalSource
            for i, text in enumerate(custom_signals):
                from .crisis_models import CrisisSignal as _CS
                raw_signals.insert(i, _CS(
                    id=f"usr-{i:03d}",
                    source=SignalSource.SOCIAL_MEDIA,
                    raw_text=text,
                    location="User-Reported",
                    timestamp=datetime.now().isoformat(),
                    metadata={"platform": "direct_input"},
                ))

        logger.info("Collected %d signals", len(raw_signals))

        # ── Agent 1: Ingestion ────────────────────────────────────────────
        ingestion_agent = SignalIngestionAgent()
        parsed_signals = ingestion_agent.run(raw_signals, traces)

        # ── Agent 2: Detection ────────────────────────────────────────────
        detection_agent = CrisisDetectionAgent()
        detected_crisis = detection_agent.run(parsed_signals, raw_signals, traces)

        if not detected_crisis:
            logger.info("No crisis detected. Pipeline ending early.")
            result = CIRORunResult(
                run_id=run_id,
                started_at=started_at,
                completed_at=datetime.now().isoformat(),
                input_signals=raw_signals,
                detected_crisis=None,
                situation_report=None,
                action_plan=None,
                simulation_results=[],
                outcome_summary="No crisis situation detected from the provided signals.",
                agent_traces=traces,
                before_snapshot={},
                after_snapshot={},
            )
            with _runs_lock:
                _runs[run_id] = result
            return result

        # ── Agent 3: Situation Analysis ───────────────────────────────────
        analysis_agent = SituationAnalysisAgent()
        situation_report = analysis_agent.run(detected_crisis, raw_signals, traces)

        # ── Agent 4: Action Planning ──────────────────────────────────────
        planning_agent = ActionPlanningAgent()
        action_plan = planning_agent.run(situation_report, traces)

        # ── Agent 5: Simulation ───────────────────────────────────────────
        simulation_agent = SimulationAgent()
        sim_results, before_snapshot, after_snapshot = simulation_agent.run(action_plan, traces)

        # ── Agent 6: Outcome Evaluation ───────────────────────────────────
        evaluation_agent = OutcomeEvaluationAgent()
        outcome_summary = evaluation_agent.run(
            action_plan, sim_results, before_snapshot, after_snapshot, traces
        )

        result = CIRORunResult(
            run_id=run_id,
            started_at=started_at,
            completed_at=datetime.now().isoformat(),
            input_signals=raw_signals,
            detected_crisis=detected_crisis,
            situation_report=situation_report,
            action_plan=action_plan,
            simulation_results=sim_results,
            outcome_summary=outcome_summary,
            agent_traces=traces,
            before_snapshot=before_snapshot,
            after_snapshot=after_snapshot,
        )

        with _runs_lock:
            _runs[run_id] = result

        logger.info("CIRO Run %s COMPLETE — %d agents, %d actions simulated", run_id, len(traces), len(sim_results))
        return result

    except Exception as exc:
        logger.exception("CIRO pipeline failed: %s", exc)
        # Store partial result so traces are still accessible
        result = CIRORunResult(
            run_id=run_id,
            started_at=started_at,
            completed_at=datetime.now().isoformat(),
            input_signals=raw_signals if "raw_signals" in locals() else [],
            detected_crisis=None,
            situation_report=None,
            action_plan=None,
            simulation_results=[],
            outcome_summary=f"Pipeline error: {exc}",
            agent_traces=traces,
            before_snapshot={},
            after_snapshot={},
        )
        with _runs_lock:
            _runs[run_id] = result
        return result

    finally:
        with _pipeline_lock:
            _pipeline_running = False
            _pipeline_started_at = None
            _current_run_id = None
        with _runs_lock:
            if run_id in _active_traces:
                del _active_traces[run_id]


# ---------------------------------------------------------------------------
# Autonomous live scan — no user input needed
# ---------------------------------------------------------------------------

def run_live_scan(run_id: str | None = None) -> CIRORunResult:
    """
    Autonomously scan live sources (RSS news, weather, Tavily) and run
    the full agent pipeline if any crisis signals are detected.
    This is called by the background scheduler every N minutes.
    """
    global _pipeline_running, _pipeline_started_at, _current_run_id

    if not run_id:
        run_id = f"LIVE-{uuid.uuid4().hex[:8].upper()}"
    started_at = datetime.now().isoformat()
    traces: list[AgentTrace] = []

    logger.info("=" * 60)
    logger.info("CIRO LIVE SCAN — Run %s", run_id)
    logger.info("=" * 60)

    with _pipeline_lock:
        if _pipeline_running and not _is_stale_locked():
            logger.info("Pipeline already running, skipping live scan.")
            return None
        # Either nothing running, or a previous run leaked the flag — take over.
        _pipeline_running = True
        _pipeline_started_at = time.monotonic()
        _current_run_id = run_id
    with _runs_lock:
        _active_traces[run_id] = traces

    try:
        # Pull live signals from all real sources
        raw_signals = fetch_all_live_signals()

        if not raw_signals:
            logger.info("[LiveScan] No signals found — all clear.")
            result = CIRORunResult(
                run_id=run_id,
                started_at=started_at,
                completed_at=datetime.now().isoformat(),
                input_signals=[],
                detected_crisis=None,
                situation_report=None,
                action_plan=None,
                simulation_results=[],
                outcome_summary="Live scan complete. No crisis signals detected.",
                agent_traces=traces,
                before_snapshot={},
                after_snapshot={},
            )
            with _runs_lock:
                _runs[run_id] = result
            return result

        logger.info("[LiveScan] %d live signals found. Running agent pipeline...", len(raw_signals))

        # Run the same 6-agent pipeline on live signals
        ingestion_agent = SignalIngestionAgent()
        parsed_signals = ingestion_agent.run(raw_signals, traces)

        detection_agent = CrisisDetectionAgent()
        detected_crisis = detection_agent.run(parsed_signals, raw_signals, traces)

        if not detected_crisis:
            result = CIRORunResult(
                run_id=run_id,
                started_at=started_at,
                completed_at=datetime.now().isoformat(),
                input_signals=raw_signals,
                detected_crisis=None,
                situation_report=None,
                action_plan=None,
                simulation_results=[],
                outcome_summary=f"Live scan: {len(raw_signals)} signals analysed. No confirmed crisis.",
                agent_traces=traces,
                before_snapshot={},
                after_snapshot={},
            )
            with _runs_lock:
                _runs[run_id] = result
            return result

        analysis_agent = SituationAnalysisAgent()
        situation_report = analysis_agent.run(detected_crisis, raw_signals, traces)

        planning_agent = ActionPlanningAgent()
        action_plan = planning_agent.run(situation_report, traces)

        simulation_agent = SimulationAgent()
        sim_results, before_snapshot, after_snapshot = simulation_agent.run(action_plan, traces)

        evaluation_agent = OutcomeEvaluationAgent()
        outcome_summary = evaluation_agent.run(action_plan, sim_results, before_snapshot, after_snapshot, traces)

        result = CIRORunResult(
            run_id=run_id,
            started_at=started_at,
            completed_at=datetime.now().isoformat(),
            input_signals=raw_signals,
            detected_crisis=detected_crisis,
            situation_report=situation_report,
            action_plan=action_plan,
            simulation_results=sim_results,
            outcome_summary=outcome_summary,
            agent_traces=traces,
            before_snapshot=before_snapshot,
            after_snapshot=after_snapshot,
        )

        with _runs_lock:
            _runs[run_id] = result

        logger.info("[LiveScan] %s COMPLETE — crisis=%s @ %s",
                    run_id, detected_crisis.crisis_type.value, detected_crisis.location)
        return result

    except Exception as exc:
        logger.exception("[LiveScan] Failed: %s", exc)
        result = CIRORunResult(
            run_id=run_id,
            started_at=started_at,
            completed_at=datetime.now().isoformat(),
            input_signals=[],
            detected_crisis=None,
            situation_report=None,
            action_plan=None,
            simulation_results=[],
            outcome_summary=f"Live scan error: {exc}",
            agent_traces=traces,
            before_snapshot={},
            after_snapshot={},
        )
        with _runs_lock:
            _runs[run_id] = result
        return result

    finally:
        with _pipeline_lock:
            _pipeline_running = False
            _pipeline_started_at = None
            _current_run_id = None
        with _runs_lock:
            if run_id in _active_traces:
                del _active_traces[run_id]
