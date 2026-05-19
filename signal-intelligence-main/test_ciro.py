"""
CIRO Pipeline Test Script
Run: python3 test_ciro.py

Tests each layer independently so failures are isolated.
"""

import json
import sys
import os
import time

# Make src importable
sys.path.insert(0, os.path.dirname(__file__))

print("=" * 60)
print("CIRO PIPELINE TEST")
print("=" * 60)

# ── Test 1: Imports ──────────────────────────────────────────
print("\n[1/6] Testing imports...")
try:
    from src.crisis_models import CrisisType, SeverityLevel, CrisisSignal, SignalSource
    from src.mock_sources import ingest_all_signals, get_available_scenarios
    from src.crisis_agents import (
        SignalIngestionAgent, CrisisDetectionAgent, SituationAnalysisAgent,
        ActionPlanningAgent, SimulationAgent, OutcomeEvaluationAgent,
    )
    from src.crisis_pipeline import run_crisis_pipeline
    print("  ✅ All imports OK")
except Exception as e:
    print(f"  ❌ Import failed: {e}")
    sys.exit(1)

# ── Test 2: Mock sources ─────────────────────────────────────
print("\n[2/6] Testing mock signal sources...")
scenarios = get_available_scenarios()
print(f"  Available scenarios: {scenarios}")
for scenario in scenarios:
    signals = ingest_all_signals(scenario)
    assert len(signals) >= 3, f"Expected >=3 signals, got {len(signals)}"
    sources = {s.source.value for s in signals}
    print(f"  ✅ {scenario}: {len(signals)} signals from {sources}")

# ── Test 3: LLM connectivity ─────────────────────────────────
print("\n[3/6] Testing LLM connectivity...")
try:
    from src.llm_client import generate_json_completion, get_llm_provider, get_llm_model
    provider = get_llm_provider()
    model = get_llm_model()
    print(f"  Provider: {provider} | Model: {model}")

    t0 = time.time()
    raw = generate_json_completion(
        system_prompt='You are a test agent. Return valid JSON only.',
        user_prompt='Return: {"status": "ok", "message": "LLM is working"}',
        max_output_tokens=64,
        timeout=15,
    )
    elapsed = time.time() - t0
    data = json.loads(raw)
    print(f"  ✅ LLM responded in {elapsed:.1f}s: {data}")
    LLM_OK = True
except Exception as e:
    print(f"  ⚠️  LLM unavailable: {e}")
    print("     Pipeline will use fallback logic (no LLM calls).")
    LLM_OK = False

# ── Test 4: Individual agents ────────────────────────────────
print("\n[4/6] Testing individual agents (urban_flooding scenario)...")
signals = ingest_all_signals("urban_flooding", social_count=3)
traces = []

# Agent 1
try:
    a1 = SignalIngestionAgent()
    parsed = a1.run(signals, traces)
    assert isinstance(parsed, list) and len(parsed) > 0
    print(f"  ✅ SignalIngestionAgent: parsed {len(parsed)} signals")
except Exception as e:
    print(f"  ❌ SignalIngestionAgent: {e}")
    parsed = [{"id": s.id, "source": s.source.value, "normalized_text": s.raw_text,
                "location_mentioned": s.location, "urgency": "high", "keywords": [], "language": "mixed"}
               for s in signals]

# Agent 2
try:
    a2 = CrisisDetectionAgent()
    crisis = a2.run(parsed, signals, traces)
    if crisis:
        print(f"  ✅ CrisisDetectionAgent: {crisis.crisis_type.value} @ {crisis.location} ({crisis.confidence:.0%} conf)")
    else:
        print("  ⚠️  CrisisDetectionAgent: No crisis detected (LLM may be degraded)")
except Exception as e:
    print(f"  ❌ CrisisDetectionAgent: {e}")
    crisis = None

# Agent 3
if crisis:
    try:
        a3 = SituationAnalysisAgent()
        sit = a3.run(crisis, signals, traces)
        print(f"  ✅ SituationAnalysisAgent: {sit.time_sensitivity} | people={sit.people_affected_estimate}")
    except Exception as e:
        print(f"  ❌ SituationAnalysisAgent: {e}")
        sit = None
else:
    sit = None
    print("  ⏭️  SituationAnalysisAgent: skipped (no crisis)")

# Agent 4
if sit:
    try:
        a4 = ActionPlanningAgent()
        plan = a4.run(sit, traces)
        print(f"  ✅ ActionPlanningAgent: {len(plan.actions)} actions in plan {plan.plan_id}")
    except Exception as e:
        print(f"  ❌ ActionPlanningAgent: {e}")
        plan = None
else:
    plan = None
    print("  ⏭️  ActionPlanningAgent: skipped")

# Agent 5
if plan:
    try:
        a5 = SimulationAgent()
        results, before, after = a5.run(plan, traces)
        cong_before = before.get("traffic_congestion_index", "?")
        cong_after = after.get("traffic_congestion_index", "?")
        print(f"  ✅ SimulationAgent: {len(results)} actions executed | congestion {cong_before} → {cong_after:.1f}")
    except Exception as e:
        print(f"  ❌ SimulationAgent: {e}")
        results, before, after = [], {}, {}
else:
    results, before, after = [], {}, {}
    print("  ⏭️  SimulationAgent: skipped")

# Agent 6
if plan and results:
    try:
        a6 = OutcomeEvaluationAgent()
        outcome = a6.run(plan, results, before, after, traces)
        print(f"  ✅ OutcomeEvaluationAgent: {outcome[:80]}...")
    except Exception as e:
        print(f"  ❌ OutcomeEvaluationAgent: {e}")
else:
    print("  ⏭️  OutcomeEvaluationAgent: skipped")

print(f"\n  Agent traces collected: {len(traces)}")
for t in traces:
    print(f"    Step {t.step} | {t.agent_name} | {t.duration_ms}ms")

# ── Test 5: Full pipeline ────────────────────────────────────
print("\n[5/6] Testing full pipeline (end-to-end)...")
try:
    t0 = time.time()
    result = run_crisis_pipeline(scenario="urban_flooding", social_count=3)
    elapsed = time.time() - t0
    print(f"  ✅ Pipeline completed in {elapsed:.1f}s")
    print(f"     Run ID     : {result.run_id}")
    print(f"     Signals    : {len(result.input_signals)}")
    print(f"     Crisis     : {result.detected_crisis.crisis_type.value if result.detected_crisis else 'None'}")
    print(f"     Actions    : {len(result.action_plan.actions) if result.action_plan else 0}")
    print(f"     Sim results: {len(result.simulation_results)}")
    print(f"     Agent steps: {len(result.agent_traces)}")
    print(f"     Outcome    : {result.outcome_summary[:100]}")
except Exception as e:
    import traceback
    print(f"  ❌ Full pipeline failed: {e}")
    traceback.print_exc()

# ── Test 6: Custom signal injection ─────────────────────────
print("\n[6/6] Testing custom Urdu signal injection...")
try:
    result2 = run_crisis_pipeline(
        scenario="urban_flooding",
        custom_signals=["G-10 mein pani bhar gaya hai, gaariyan phans gayi hain"],
        social_count=2,
    )
    custom_found = any("G-10" in s.raw_text or "pani" in s.raw_text for s in result2.input_signals)
    print(f"  ✅ Custom signal injected: {custom_found}")
    print(f"     Total signals: {len(result2.input_signals)}")
    print(f"     Run ID: {result2.run_id}")
except Exception as e:
    print(f"  ❌ Custom signal test failed: {e}")

# ── Summary ──────────────────────────────────────────────────
print("\n" + "=" * 60)
print("TEST COMPLETE")
print(f"LLM available: {'YES (' + get_llm_model() + ')' if LLM_OK else 'NO (fallback mode)'}")
print("=" * 60)
