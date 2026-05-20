"""
CIRO — Multi-Agent System
Each agent is a class with a `.run()` method that:
  1. Receives structured input
  2. Calls the LLM via llm_client (JSON mode)
  3. Returns a structured output
  4. Appends an AgentTrace entry

Agents:
  1. SignalIngestionAgent     — parse & normalise raw signals
  2. CrisisDetectionAgent     — cluster & classify crisis type
  3. SituationAnalysisAgent   — severity, impact, confidence
  4. ActionPlanningAgent      — coordinated response plan
  5. SimulationAgent          — mock-execute actions
  6. OutcomeEvaluationAgent   — before/after comparison, logs
"""

from __future__ import annotations

import json
import logging
import random
import time
import uuid
from datetime import datetime
from typing import Any

from .crisis_models import (
    ActionPlan,
    AgentTrace,
    CrisisSignal,
    CrisisType,
    DetectedCrisis,
    ResponseAction,
    SeverityLevel,
    SimulationResult,
    SituationReport,
)
from .llm_client import generate_json_completion

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now().isoformat()


def _signals_to_text(signals: list[CrisisSignal]) -> str:
    lines = []
    for s in signals:
        lines.append(f"[{s.source.value.upper()}] {s.raw_text} (location: {s.location})")
    return "\n".join(lines)


def _safe_llm(system: str, user: str, max_tokens: int = 512, retries: int = 1) -> tuple[dict, str | None]:
    """Call LLM with retry + backoff for 429s.

    Returns (result, error). On success: (parsed_dict, None). On failure:
    ({}, "short error reason") — callers MUST check the error and surface
    the fallback path honestly instead of pretending the LLM reasoned.
    """
    import time as _time
    last_err = "unknown error"
    for attempt in range(retries + 1):
        try:
            raw = generate_json_completion(
                system_prompt=system,
                user_prompt=user,
                temperature=0.1,
                max_output_tokens=max_tokens,
            )
            # Some models still emit markdown fences (```json …```) even
            # when asked for application/json — strip them defensively so
            # one stray fence doesn't trigger the whole fallback path.
            text = raw.strip()
            if text.startswith("```"):
                text = text.strip("`")
                if text.lower().startswith("json"):
                    text = text[4:]
                text = text.strip()
            return json.loads(text), None
        except Exception as exc:
            msg = str(exc)
            last_err = msg.splitlines()[0][:200] if msg else exc.__class__.__name__
            is_rate_limit = "429" in msg or "quota" in msg.lower() or "rate" in msg.lower()
            wait = 5 if is_rate_limit else 2
            logger.warning("LLM attempt %d failed (%s). %s",
                           attempt + 1, "rate-limit" if is_rate_limit else "error",
                           f"Retrying in {wait}s..." if attempt < retries else "Using fallback.")
            if attempt < retries:
                _time.sleep(wait)
    return {}, last_err


def _tool_call(success: bool, prompt_label: str, error: str | None = None) -> dict:
    """Build an honest trace tool_calls entry — fail state isn't hidden."""
    if success:
        return {"tool": "generate_json_completion", "prompt": prompt_label, "status": "ok"}
    return {"tool": "generate_json_completion", "prompt": prompt_label, "status": "failed", "error": error or "LLM unavailable"}


_LLM_FALLBACK_TAG = "[fallback · LLM unavailable]"


# ---------------------------------------------------------------------------
# Agent 1 — SignalIngestionAgent
# ---------------------------------------------------------------------------

INGESTION_SYSTEM = """You are a crisis signal parser for an emergency response system in Pakistan.
Your job is to parse incoming raw signals (social media posts, weather alerts, traffic data).
Signals may be in English, Urdu, or a mix of both.
Return a JSON object with:
{
  "parsed_signals": [
    {
      "id": "<original id>",
      "source": "<source type>",
      "language": "english|urdu|mixed",
      "normalized_text": "<English translation/summary of the raw text>",
      "location_mentioned": "<specific location if mentioned, else null>",
      "keywords": ["<key crisis words>"],
      "urgency": "low|medium|high|critical"
    }
  ],
  "total_signals": <int>,
  "locations_mentioned": ["<list of unique locations>"]
}"""


class SignalIngestionAgent:
    name = "SignalIngestionAgent"

    def run(self, signals: list[CrisisSignal], traces: list[AgentTrace]) -> list[dict]:
        t0 = time.time()
        signal_text = _signals_to_text(signals)

        user_prompt = f"""Parse and normalize the following crisis signals. 
Translate any Urdu text to English in the 'normalized_text' field.
Signals:
{signal_text}"""

        result, llm_err = _safe_llm(INGESTION_SYSTEM, user_prompt, max_tokens=2048)
        parsed = result.get("parsed_signals", [])
        locations = result.get("locations_mentioned", [])

        # Fallback: pass through each signal with no transformation. Honest
        # because it's a deterministic identity map of what came in, not
        # invented analysis.
        used_fallback = llm_err is not None or not parsed
        if not parsed:
            parsed = [
                {
                    "id": s.id,
                    "source": s.source.value,
                    "language": "mixed",
                    "normalized_text": s.raw_text,
                    "location_mentioned": s.location,
                    "keywords": [],
                    "urgency": "high",
                }
                for s in signals
            ]
            locations = list({s.location for s in signals})

        reasoning = (
            f"{_LLM_FALLBACK_TAG} {llm_err or 'no parse'} — passed signals through unchanged."
            if used_fallback
            else "Normalized multilingual signals; extracted locations and urgency levels."
        )
        output_summary = (
            f"{_LLM_FALLBACK_TAG} {len(parsed)} signals passed through; locations: {locations}"
            if used_fallback
            else f"Parsed {len(parsed)} signals; locations: {locations}"
        )

        traces.append(AgentTrace(
            agent_name=self.name,
            step=1,
            input_summary=f"{len(signals)} raw signals from {len({s.source for s in signals})} source types",
            reasoning=reasoning,
            output_summary=output_summary,
            tool_calls=[_tool_call(not used_fallback, "INGESTION_SYSTEM", llm_err)],
            duration_ms=int((time.time() - t0) * 1000),
            timestamp=_now_iso(),
        ))

        logger.info("[%s] Parsed %d signals, locations: %s", self.name, len(parsed), locations)
        return parsed


# ---------------------------------------------------------------------------
# Agent 2 — CrisisDetectionAgent
# ---------------------------------------------------------------------------

DETECTION_SYSTEM = """You are a crisis detection agent for an emergency management system.
Given parsed signals from multiple sources, determine if a crisis is occurring.
Cluster related signals and classify the crisis type.
Return a JSON object with:
{
  "crisis_detected": true|false,
  "crisis_type": "urban_flooding|heatwave|road_blockage|accident|infrastructure_failure|unknown",
  "location": "<primary affected location>",
  "confidence": <float 0.0-1.0>,
  "confidence_label": "Low|Medium|High",
  "severity": "low|medium|high|critical",
  "description": "<1-2 sentence crisis description>",
  "affected_area": "<geographic scope>",
  "contributing_signals": ["<signal ids that confirm crisis>"],
  "reasoning": "<step-by-step reasoning for your determination>"
}
Consider: signal convergence (multiple sources agreeing), location clustering, keyword density, weather + traffic correlation."""


_CRISIS_KEYWORDS = {
    "urban_flooding": ["flood", "pani", "waterlog", "bhar gaya", "submerged", "stranded", "paani", "underpass"],
    "heatwave": ["heat", "garmi", "temperature", "celsius", "heat stroke", "heatwave", "heat exhaustion"],
    "accident": ["accident", "collision", "crash", "overturned", "vehicle", "motorway", "truck"],
    "road_blockage": ["blockage", "blocked", "road closed", "band hai", "construction", "fallen", "closure"],
    "infrastructure_failure": ["power", "gas", "water supply", "failure", "malfunction", "electricity", "outage"],
}

_CRISIS_LOCATIONS = {
    "urban_flooding": "G-10 / George Town, Islamabad",
    "heatwave": "Karachi",
    "accident": "M-2 Motorway",
    "road_blockage": "Main Boulevard, Lahore",
    "infrastructure_failure": "North Karachi",
}

_CRISIS_SEVERITY = {
    "urban_flooding": "critical",
    "heatwave": "high",
    "accident": "high",
    "road_blockage": "medium",
    "infrastructure_failure": "high",
}


def _keyword_detect(parsed_signals: list[dict], raw_signals) -> dict:
    """Deterministic keyword-based crisis classification. Used when LLM is unavailable."""
    all_text = " ".join(
        (s.get("normalized_text", "") + " " + s.get("raw_text", "")).lower()
        for s in parsed_signals
    )
    for sig in raw_signals:
        all_text += " " + sig.raw_text.lower()

    scores: dict[str, int] = {ct: 0 for ct in _CRISIS_KEYWORDS}
    for crisis_type, keywords in _CRISIS_KEYWORDS.items():
        for kw in keywords:
            if kw in all_text:
                scores[crisis_type] += 1

    best = max(scores, key=lambda k: scores[k])
    if scores[best] == 0:
        return {"crisis_detected": False}

    confidence = min(0.95, 0.55 + scores[best] * 0.08)
    location = next(
        (s.get("location_mentioned") for s in parsed_signals if s.get("location_mentioned") and s["location_mentioned"] != "User-Reported"),
        _CRISIS_LOCATIONS.get(best, "Unknown"),
    )
    descriptions = {
        "urban_flooding": f"Urban flooding detected at {location}. Multiple social media reports and weather/traffic data confirm waterlogging and stranded vehicles.",
        "heatwave": f"Extreme heatwave conditions detected at {location}. High temperatures and public health impacts reported.",
        "accident": f"Major road accident detected at {location}. Multiple vehicles involved; route blockage confirmed by traffic data.",
        "road_blockage": f"Significant road blockage at {location}. Infrastructure works or obstructions confirmed across multiple signals.",
        "infrastructure_failure": f"Critical infrastructure failure at {location}. Utility disruption affecting large residential areas.",
    }
    signal_ids = [s.get("id", "") for s in parsed_signals[:4]]
    return {
        "crisis_detected": True,
        "crisis_type": best,
        "location": location,
        "confidence": confidence,
        "confidence_label": "High" if confidence >= 0.8 else "Medium",
        "severity": _CRISIS_SEVERITY.get(best, "high"),
        "description": descriptions.get(best, "Crisis situation detected."),
        "affected_area": location,
        "contributing_signals": signal_ids,
        "reasoning": (
            f"Keyword analysis matched {scores[best]} indicator(s) for '{best}'. "
            f"Top signals: {', '.join(_CRISIS_KEYWORDS[best][:3])}. "
            f"LLM fallback used due to rate-limit or unavailability."
        ),
    }


class CrisisDetectionAgent:
    name = "CrisisDetectionAgent"

    def run(self, parsed_signals: list[dict], raw_signals: list[CrisisSignal], traces: list[AgentTrace]) -> DetectedCrisis | None:
        t0 = time.time()

        signals_json = json.dumps(parsed_signals, indent=2)
        user_prompt = f"""Analyze these parsed signals and detect any crisis situation:
{signals_json}

Also available: {len(raw_signals)} raw signals including weather and traffic data."""

        result, llm_err = _safe_llm(DETECTION_SYSTEM, user_prompt, max_tokens=1500)
        used_kw_fallback = False

        if not result.get("crisis_detected", False):
            # ── Deterministic fallback: keyword-based classification ──────────
            result = _keyword_detect(parsed_signals, raw_signals)
            used_kw_fallback = True

        if not result.get("crisis_detected", False):
            traces.append(AgentTrace(
                agent_name=self.name,
                step=2,
                input_summary=f"{len(parsed_signals)} parsed signals",
                reasoning=(
                    f"{_LLM_FALLBACK_TAG} {llm_err}. Keyword fallback also found no crisis pattern."
                    if llm_err
                    else "No crisis pattern detected by LLM or keyword analysis"
                ),
                output_summary="No crisis detected",
                tool_calls=[_tool_call(llm_err is None, "DETECTION_SYSTEM", llm_err), {"tool": "_keyword_detect", "status": "no_match"}],
                duration_ms=int((time.time() - t0) * 1000),
                timestamp=_now_iso(),
            ))
            return None

        # Map to enum safely
        ct_map = {e.value: e for e in CrisisType}
        sv_map = {e.value: e for e in SeverityLevel}

        crisis = DetectedCrisis(
            crisis_type=ct_map.get(result.get("crisis_type", "unknown"), CrisisType.UNKNOWN),
            location=result.get("location", "Unknown"),
            confidence=float(result.get("confidence", 0.5)),
            confidence_label=result.get("confidence_label", "Medium"),
            severity=sv_map.get(result.get("severity", "medium"), SeverityLevel.MEDIUM),
            description=result.get("description", "Crisis situation detected."),
            affected_area=result.get("affected_area", "Unknown"),
            contributing_signals=result.get("contributing_signals", []),
            reasoning=result.get("reasoning", ""),
        )

        traces.append(AgentTrace(
            agent_name=self.name,
            step=2,
            input_summary=f"{len(parsed_signals)} parsed signals",
            reasoning=crisis.reasoning,
            output_summary=(
                f"{_LLM_FALLBACK_TAG} Detected by keyword fallback: {crisis.crisis_type.value} at {crisis.location} | confidence={crisis.confidence:.0%} | severity={crisis.severity.value}"
                if used_kw_fallback
                else f"Detected: {crisis.crisis_type.value} at {crisis.location} | confidence={crisis.confidence:.0%} | severity={crisis.severity.value}"
            ),
            tool_calls=(
                [_tool_call(False, "DETECTION_SYSTEM", llm_err), {"tool": "_keyword_detect", "status": "ok"}]
                if used_kw_fallback
                else [_tool_call(True, "DETECTION_SYSTEM")]
            ),
            duration_ms=int((time.time() - t0) * 1000),
            timestamp=_now_iso(),
        ))

        logger.info("[%s] %s at %s (conf=%.0f%%, sev=%s)", self.name, crisis.crisis_type.value, crisis.location, crisis.confidence * 100, crisis.severity.value)
        return crisis


# ---------------------------------------------------------------------------
# Agent 3 — SituationAnalysisAgent
# ---------------------------------------------------------------------------

SITUATION_SYSTEM = """You are a situation analysis agent for urban crisis management.
Given a detected crisis, produce a detailed impact assessment.
Return a JSON object with:
{
  "impact_summary": "<2-3 sentence summary of overall impact>",
  "impacts": ["<specific impact 1>", "<specific impact 2>", ...],
  "people_affected_estimate": "<e.g. 5,000-10,000 people>",
  "infrastructure_risk": "<description of infrastructure at risk>",
  "time_sensitivity": "<immediate|within_1hr|within_4hr|within_24hr>",
  "reasoning": "<analytical reasoning combining all signals>"
}"""


class SituationAnalysisAgent:
    name = "SituationAnalysisAgent"

    def run(self, crisis: DetectedCrisis, raw_signals: list[CrisisSignal], traces: list[AgentTrace]) -> SituationReport:
        t0 = time.time()

        import dataclasses
        crisis_dict = dataclasses.asdict(crisis)
        signal_text = _signals_to_text(raw_signals)

        user_prompt = f"""Crisis detected:
{json.dumps(crisis_dict, indent=2, default=str)}

Supporting signals:
{signal_text}

Provide a detailed situation analysis and impact assessment."""

        result, llm_err = _safe_llm(SITUATION_SYSTEM, user_prompt, max_tokens=1500)
        used_fallback = llm_err is not None or not result

        if used_fallback:
            # Honest fallback — no fabricated impact text. The UI/trace will
            # show the fallback tag so it's clear this isn't model reasoning.
            report = SituationReport(
                crisis=crisis,
                impact_summary=f"{_LLM_FALLBACK_TAG} No situation analysis available.",
                impacts=[],
                people_affected_estimate="—",
                infrastructure_risk="—",
                time_sensitivity="unknown",
                reasoning=f"LLM call failed: {llm_err or 'no result'}. No analyst reasoning produced.",
            )
        else:
            report = SituationReport(
                crisis=crisis,
                impact_summary=result.get("impact_summary", ""),
                impacts=result.get("impacts", []),
                people_affected_estimate=result.get("people_affected_estimate", "Unknown"),
                infrastructure_risk=result.get("infrastructure_risk", ""),
                time_sensitivity=result.get("time_sensitivity", "immediate"),
                reasoning=result.get("reasoning", ""),
            )

        traces.append(AgentTrace(
            agent_name=self.name,
            step=3,
            input_summary=f"Crisis: {crisis.crisis_type.value} at {crisis.location}",
            reasoning=report.reasoning,
            output_summary=(
                f"{_LLM_FALLBACK_TAG} situation analysis skipped — {llm_err or 'no result'}"
                if used_fallback
                else f"Impact: {report.impact_summary[:100]}... | Sensitivity: {report.time_sensitivity}"
            ),
            tool_calls=[_tool_call(not used_fallback, "SITUATION_SYSTEM", llm_err)],
            duration_ms=int((time.time() - t0) * 1000),
            timestamp=_now_iso(),
        ))

        logger.info("[%s] Impact: %s | Sensitivity: %s", self.name, report.impact_summary[:80], report.time_sensitivity)
        return report


# ---------------------------------------------------------------------------
# Agent 4 — ActionPlanningAgent
# ---------------------------------------------------------------------------

ACTION_SYSTEM = """You are an action planning agent for urban emergency response coordination.
Given a situation report, generate a prioritized, coordinated response plan.
Return a JSON object with:
{
  "actions": [
    {
      "action_type": "traffic_reroute|emergency_dispatch|alert|resource_allocation",
      "description": "<specific actionable description>",
      "priority": <1-5, 1=highest>,
      "target_area": "<specific area>",
      "assigned_to": "<Traffic Control|Emergency Services|Notification System|Resource Management>",
      "estimated_impact": "<expected outcome of this action>"
    }
  ],
  "coordination_note": "<how these actions work together>",
  "reasoning": "<planning rationale>"
}
Generate 4-6 concrete, realistic actions. Be specific about roads, areas, and resources."""
_DEFAULT_ACTIONS: dict[str, list[dict]] = {
    "urban_flooding": [
        {"action_type": "traffic_reroute", "description": "Redirect traffic from G-10 Main Road via Kashmir Highway and IJP Road", "priority": 1, "target_area": "G-10, I-8 Corridor", "assigned_to": "Traffic Control", "estimated_impact": "~60% congestion reduction within 30 min"},
        {"action_type": "emergency_dispatch", "description": "Deploy 4 rescue boats and 6 emergency response units to flooded areas", "priority": 2, "target_area": "G-10 Markaz, Khayaban-e-Iqbal", "assigned_to": "Emergency Services", "estimated_impact": "Rescue stranded vehicles; reduce casualty risk"},
        {"action_type": "alert", "description": "Broadcast flood warning via SMS, radio, and app to all G-9/G-10/I-8 residents", "priority": 3, "target_area": "G-9, G-10, G-11, I-8 Sectors", "assigned_to": "Notification System", "estimated_impact": "Alert 25,000+ residents; reduce foot traffic"},
        {"action_type": "resource_allocation", "description": "Pre-position water pumps and relief supplies at Sector G-10 community center", "priority": 4, "target_area": "G-10 Community Center", "assigned_to": "Resource Management", "estimated_impact": "Drainage acceleration; relief provision within 1 hour"},
        {"action_type": "traffic_reroute", "description": "Close Jinnah Avenue underpass; activate alternate route signs", "priority": 5, "target_area": "Jinnah Avenue Underpass", "assigned_to": "Traffic Control", "estimated_impact": "Prevent additional vehicle entrapment"},
    ],
    "heatwave": [
        {"action_type": "alert", "description": "Issue extreme heat advisory across all city zones via SMS and emergency broadcast", "priority": 1, "target_area": "City-wide", "assigned_to": "Notification System", "estimated_impact": "Reduce outdoor activity; prevent heat strokes"},
        {"action_type": "resource_allocation", "description": "Open 12 cooling centers in public buildings; deploy water tankers to 8 locations", "priority": 2, "target_area": "Lyari, Defence, Korangi", "assigned_to": "Resource Management", "estimated_impact": "Capacity for 5,000 people; reduce heat casualties by 40%"},
        {"action_type": "emergency_dispatch", "description": "Deploy medical teams and ambulances to high-density residential areas", "priority": 3, "target_area": "Lyari, Orangi Town", "assigned_to": "Emergency Services", "estimated_impact": "Rapid response to heat stroke cases"},
        {"action_type": "resource_allocation", "description": "Coordinate with WAPDA for rolling load-shedding suspension during peak heat hours", "priority": 4, "target_area": "Residential zones", "assigned_to": "Resource Management", "estimated_impact": "Maintain cooling appliances; reduce heat fatalities"},
    ],
    "accident": [
        {"action_type": "emergency_dispatch", "description": "Dispatch 3 ambulances and 2 fire engines to accident site", "priority": 1, "target_area": "M-2 Motorway Km 45", "assigned_to": "Emergency Services", "estimated_impact": "Casualty care within 8 min; fire risk containment"},
        {"action_type": "traffic_reroute", "description": "Close M-2 affected lanes; divert via GT Road and alternate motorway entry", "priority": 2, "target_area": "M-2 Km 42-50", "assigned_to": "Traffic Control", "estimated_impact": "Clear 3km backup within 45 min"},
        {"action_type": "alert", "description": "Issue motorway accident alert; warn drivers of 40+ min delay", "priority": 3, "target_area": "M-2 Users", "assigned_to": "Notification System", "estimated_impact": "Reduce additional vehicles entering blocked zone"},
        {"action_type": "resource_allocation", "description": "Deploy highway maintenance crew for debris clearance", "priority": 4, "target_area": "M-2 Km 45", "assigned_to": "Resource Management", "estimated_impact": "Full lane restoration in 2-3 hours"},
    ],
    "road_blockage": [
        {"action_type": "traffic_reroute", "description": "Activate alternate route signs; divert via Ring Road", "priority": 1, "target_area": "Affected Route", "assigned_to": "Traffic Control", "estimated_impact": "50% congestion relief within 20 min"},
        {"action_type": "alert", "description": "Notify commuters of road closure via app and SMS", "priority": 2, "target_area": "City-wide", "assigned_to": "Notification System", "estimated_impact": "Reduce vehicles entering blocked area"},
        {"action_type": "resource_allocation", "description": "Expedite construction/repair work; add night shift crew", "priority": 3, "target_area": "Blockage Site", "assigned_to": "Resource Management", "estimated_impact": "Reduce closure duration by 30%"},
    ],
    "infrastructure_failure": [
        {"action_type": "emergency_dispatch", "description": "Deploy utility repair teams to affected substations/pumping stations", "priority": 1, "target_area": "Failure Site", "assigned_to": "Emergency Services", "estimated_impact": "Restore service within 4-6 hours"},
        {"action_type": "alert", "description": "Notify affected residents of outage duration and safety protocols", "priority": 2, "target_area": "Affected Sectors", "assigned_to": "Notification System", "estimated_impact": "Prevent panic; provide timeline"},
        {"action_type": "resource_allocation", "description": "Deploy mobile generator units to hospitals and critical facilities", "priority": 3, "target_area": "Hospitals, Schools", "assigned_to": "Resource Management", "estimated_impact": "Maintain critical services during outage"},
    ],
}


def _default_actions(crisis_type: str, location: str) -> list[dict]:
    import copy
    actions = copy.deepcopy(_DEFAULT_ACTIONS.get(crisis_type, _DEFAULT_ACTIONS["road_blockage"]))
    for a in actions:
        if "Affected" in a["target_area"]:
            a["target_area"] = a["target_area"].replace("Affected Route", location).replace("Affected Sectors", location).replace("Affected Site", location)
    return actions


class ActionPlanningAgent:
    name = "ActionPlanningAgent"

    def run(self, situation: SituationReport, traces: list[AgentTrace]) -> ActionPlan:
        t0 = time.time()

        import dataclasses
        sit_dict = dataclasses.asdict(situation)

        user_prompt = f"""Situation Report:
{json.dumps(sit_dict, indent=2, default=str)}

Generate a coordinated emergency response action plan."""

        result, llm_err = _safe_llm(ACTION_SYSTEM, user_prompt, max_tokens=2048)

        raw_actions = result.get("actions", [])
        used_fallback = bool(llm_err) or not raw_actions
        # ── Deterministic fallback: predefined actions per crisis type.
        # Kept for graceful demo robustness, but each description is tagged
        # with [fallback] so the UI/trace makes it obvious that this is a
        # template — not LLM-generated planning.
        if not raw_actions:
            raw_actions = _default_actions(situation.crisis.crisis_type.value, situation.crisis.location)
        actions = []
        for i, a in enumerate(raw_actions):
            desc = a.get("description", "")
            if used_fallback and desc and not desc.startswith(_LLM_FALLBACK_TAG):
                desc = f"{_LLM_FALLBACK_TAG} {desc}"
            actions.append(ResponseAction(
                action_id=f"ACT-{uuid.uuid4().hex[:6].upper()}",
                action_type=a.get("action_type", "alert"),
                description=desc,
                priority=int(a.get("priority", i + 1)),
                target_area=a.get("target_area", situation.crisis.location),
                assigned_to=a.get("assigned_to", "Emergency Services"),
                estimated_impact=a.get("estimated_impact", ""),
            ))

        # Sort by priority
        actions.sort(key=lambda x: x.priority)

        plan = ActionPlan(
            plan_id=f"PLAN-{uuid.uuid4().hex[:8].upper()}",
            situation=situation,
            actions=actions,
            coordination_note=(
                f"{_LLM_FALLBACK_TAG} LLM unavailable ({llm_err or 'no result'}) — actions below are deterministic templates for this crisis type, not model-generated planning."
                if used_fallback
                else result.get("coordination_note", "")
            ),
            reasoning=(
                f"LLM call failed: {llm_err or 'no result'}. Returned predefined template actions for {situation.crisis.crisis_type.value}."
                if used_fallback
                else result.get("reasoning", "")
            ),
        )

        traces.append(AgentTrace(
            agent_name=self.name,
            step=4,
            input_summary=f"Situation: {situation.crisis.crisis_type.value}, sensitivity={situation.time_sensitivity}",
            reasoning=plan.reasoning,
            output_summary=(
                f"{_LLM_FALLBACK_TAG} Plan {plan.plan_id}: {len(actions)} template actions"
                if used_fallback
                else f"Plan {plan.plan_id}: {len(actions)} actions | Top: {actions[0].description[:80] if actions else 'None'}"
            ),
            tool_calls=[_tool_call(not used_fallback, "ACTION_SYSTEM", llm_err)],
            duration_ms=int((time.time() - t0) * 1000),
            timestamp=_now_iso(),
        ))

        logger.info("[%s] Plan %s: %d actions generated", self.name, plan.plan_id, len(actions))
        return plan


# ---------------------------------------------------------------------------
# Agent 5 — SimulationAgent
# ---------------------------------------------------------------------------

class SimulationAgent:
    """Executes simulated actions and returns before/after state."""
    name = "SimulationAgent"

    # Shared mock city state (mutated during simulation)
    _INITIAL_STATE = {
        "traffic_congestion_index": 9.2,
        "avg_speed_kmh": 4,
        "blocked_routes": ["G-10 Main Road", "Jinnah Avenue", "Khayaban-e-Iqbal"],
        "emergency_units_deployed": 0,
        "alerts_sent": 0,
        "rerouted_vehicles_estimate": 0,
        "system_status": "CRISIS_UNMANAGED",
    }

    # Named alternate routes per crisis location keywords
    _ALTERNATE_ROUTES: dict[str, list[str]] = {
        "g-10":       ["Kashmir Highway → IJP Road", "Golra Road → Peshawar Road"],
        "g-11":       ["Margalla Road → Islamabad Highway", "IJP Road → N-5"],
        "islamabad":  ["Kashmir Highway", "Margalla Road", "IJP Road"],
        "karachi":    ["Shahrae Faisal → Korangi Road", "M-9 Motorway alternate"],
        "lahore":     ["Canal Road → Walton Road", "Ferozepur Road → Ring Road"],
        "motorway":   ["GT Road via Gujranwala", "N-5 alternate"],
        "rawalpindi": ["Peshawar Road → GT Road", "Ring Road East"],
        "default":    ["Ring Road alternate", "GT Road bypass"],
    }

    def _get_alternate_routes(self, location: str) -> list[str]:
        loc = location.lower()
        for key, routes in self._ALTERNATE_ROUTES.items():
            if key in loc:
                return routes
        return self._ALTERNATE_ROUTES["default"]

    def _simulate_action(self, action: ResponseAction, state: dict) -> SimulationResult:
        before = dict(state)
        ticket_id = None
        alert_recipients = 0
        date_str = datetime.now().strftime("%Y%m%d")

        if action.action_type == "traffic_reroute":
            improvement = random.uniform(1.5, 3.0)
            state["traffic_congestion_index"] = max(0, state["traffic_congestion_index"] - improvement)
            state["avg_speed_kmh"] = min(60, state["avg_speed_kmh"] + int(improvement * 5))
            rerouted = random.randint(300, 900)
            state["rerouted_vehicles_estimate"] += rerouted
            alt = state.get("_alternate_routes", ["Ring Road alternate"])
            route_name = alt[0] if alt else "alternate route"
            ticket_id = f"TRF-{date_str}-{uuid.uuid4().hex[:4].upper()}"
            if state["blocked_routes"]:
                state["blocked_routes"].pop(0)
            state.setdefault("active_reroutes", []).append(route_name)
            outcome = (
                f"REROUTE ACTIVE [{ticket_id}]: {route_name}. "
                f"~{rerouted:,} vehicles redirected. "
                f"Congestion index: {before['traffic_congestion_index']:.1f} → {state['traffic_congestion_index']:.1f}. "
                f"Avg speed: {before['avg_speed_kmh']} → {state['avg_speed_kmh']} km/h."
            )

        elif action.action_type == "emergency_dispatch":
            units = random.randint(2, 6)
            eta = random.randint(5, 15)
            state["emergency_units_deployed"] += units
            ticket_id = f"EMG-{date_str}-{uuid.uuid4().hex[:4].upper()}"
            state.setdefault("dispatch_tickets", []).append(ticket_id)
            outcome = (
                f"DISPATCH TICKET [{ticket_id}]: {units} unit(s) en route. "
                f"ETA: {eta} min to {action.target_area}. "
                f"Total deployed: {state['emergency_units_deployed']}."
            )

        elif action.action_type == "alert":
            alert_recipients = random.randint(8000, 60000)
            sms = int(alert_recipients * 0.6)
            app = int(alert_recipients * 0.3)
            radio = int(alert_recipients * 0.1)
            state["alerts_sent"] += alert_recipients
            ticket_id = f"ALT-{date_str}-{uuid.uuid4().hex[:4].upper()}"
            outcome = (
                f"ALERT SENT [{ticket_id}]: {alert_recipients:,} residents notified. "
                f"SMS: {sms:,} | App push: {app:,} | Radio: {radio:,}. "
                f"Target: {action.target_area}."
            )

        elif action.action_type == "resource_allocation":
            added = random.randint(1, 4)
            state["emergency_units_deployed"] += added
            ticket_id = f"RES-{date_str}-{uuid.uuid4().hex[:4].upper()}"
            outcome = (
                f"RESOURCE TICKET [{ticket_id}]: {added} resource unit(s) allocated to {action.target_area}. "
                f"Pre-positioned relief supplies and equipment deployed."
            )

        else:
            ticket_id = f"GEN-{date_str}-{uuid.uuid4().hex[:4].upper()}"
            outcome = f"Action executed [{ticket_id}]."

        # Update system status
        if state["traffic_congestion_index"] < 4.5:
            state["system_status"] = "CRISIS_MANAGED"
        elif state["emergency_units_deployed"] > 2:
            state["system_status"] = "RESPONSE_IN_PROGRESS"

        return SimulationResult(
            action=action,
            status="executed",
            outcome=outcome,
            before_state=before,
            after_state=dict(state),
            timestamp=_now_iso(),
            ticket_id=ticket_id,
            alert_recipients=alert_recipients,
        )


    def run(self, plan: ActionPlan, traces: list[AgentTrace]) -> tuple[list[SimulationResult], dict, dict]:
        t0 = time.time()
        alt_routes = self._get_alternate_routes(plan.situation.crisis.location)

        state = {
            "traffic_congestion_index": 9.2,
            "avg_speed_kmh": 4,
            "blocked_routes": [
                r.strip() for r in plan.situation.crisis.affected_area.split(",") if r.strip()
            ][:3] or ["Primary Route A", "Route B"],
            "emergency_units_deployed": 0,
            "alerts_sent": 0,
            "rerouted_vehicles_estimate": 0,
            "system_status": "CRISIS_UNMANAGED",
            "_alternate_routes": alt_routes,
            "active_reroutes": [],
            "dispatch_tickets": [],
        }

        before_snapshot = dict(state)
        results = []

        for action in plan.actions:
            result = self._simulate_action(action, state)
            results.append(result)
            logger.info("[%s] %s → %s", self.name, action.action_type, result.outcome[:80])

        after_snapshot = dict(state)

        # Build human-readable artifact summary
        all_tickets   = [r.ticket_id for r in results if r.ticket_id]
        total_alerts  = sum(r.alert_recipients for r in results)
        total_rerouted = after_snapshot.get("rerouted_vehicles_estimate", 0)

        after_snapshot["simulation_artifact"] = {
            "tickets_generated": all_tickets,
            "total_alerts_sent": total_alerts,
            "total_vehicles_rerouted": total_rerouted,
            "alternate_routes_activated": after_snapshot.get("active_reroutes", []),
            "units_deployed": after_snapshot["emergency_units_deployed"],
        }

        traces.append(AgentTrace(
            agent_name=self.name,
            step=5,
            input_summary=f"Plan {plan.plan_id}: {len(plan.actions)} actions",
            reasoning="Sequential simulation; each action updates city state. Tickets generated for every execution.",
            output_summary=(
                f"{len(results)} actions executed | "
                f"Congestion {before_snapshot['traffic_congestion_index']} → {after_snapshot['traffic_congestion_index']:.1f} | "
                f"{total_alerts:,} alerts sent | "
                f"{len(all_tickets)} tickets: {', '.join(all_tickets[:3])}"
            ),
            tool_calls=[{"tool": "_simulate_action", "calls": len(results)}],
            duration_ms=int((time.time() - t0) * 1000),
            timestamp=_now_iso(),
        ))

        return results, before_snapshot, after_snapshot


# ---------------------------------------------------------------------------
# Agent 6 — OutcomeEvaluationAgent
# ---------------------------------------------------------------------------

OUTCOME_SYSTEM = """You are an outcome evaluation agent for emergency response systems.
Given the before and after system state following crisis response actions, provide an evaluation.
Return a JSON object with:
{
  "outcome_summary": "<2-3 sentence overall outcome description>",
  "effectiveness_score": <int 0-100>,
  "key_improvements": ["<improvement 1>", "<improvement 2>", ...],
  "remaining_risks": ["<risk 1>", "<risk 2>"],
  "recommendations": ["<follow-up recommendation 1>", ...],
  "reasoning": "<evaluation rationale>"
}"""


class OutcomeEvaluationAgent:
    name = "OutcomeEvaluationAgent"

    def run(
        self,
        plan: ActionPlan,
        results: list[SimulationResult],
        before: dict,
        after: dict,
        traces: list[AgentTrace],
    ) -> str:
        t0 = time.time()

        results_summary = [
            {"action": r.action.description, "outcome": r.outcome, "status": r.status}
            for r in results
        ]

        user_prompt = f"""Action Plan: {plan.plan_id}
Crisis: {plan.situation.crisis.crisis_type.value} at {plan.situation.crisis.location}

Before State: {json.dumps(before, indent=2)}
After State: {json.dumps(after, indent=2)}

Actions Executed:
{json.dumps(results_summary, indent=2)}

Evaluate the response effectiveness."""

        result, llm_err = _safe_llm(OUTCOME_SYSTEM, user_prompt, max_tokens=1500)
        used_fallback = llm_err is not None

        # The fallback summary below is honest — it's built from real
        # before/after numbers from the simulation, not invented text.
        # Still tag it so the UI signals that no LLM evaluation occurred.
        derived_summary = (
            f"Response to {plan.situation.crisis.crisis_type.value} initiated. "
            f"Traffic congestion reduced from {before.get('traffic_congestion_index', '?')} "
            f"to {after.get('traffic_congestion_index', '?'):.1f}. "
            f"{after.get('emergency_units_deployed', 0)} emergency units deployed. "
            f"{after.get('alerts_sent', 0):,} residents notified."
        )
        summary = result.get("outcome_summary", derived_summary)
        if used_fallback:
            summary = f"{_LLM_FALLBACK_TAG} {derived_summary}"

        traces.append(AgentTrace(
            agent_name=self.name,
            step=6,
            input_summary=f"{len(results)} simulation results; before/after state comparison",
            reasoning=(
                f"LLM call failed: {llm_err}. Summary below is derived from simulation state, not model-evaluated."
                if used_fallback
                else result.get("reasoning", "Compared before/after state metrics to assess response impact")
            ),
            output_summary=summary[:150],
            tool_calls=[_tool_call(not used_fallback, "OUTCOME_SYSTEM", llm_err)],
            duration_ms=int((time.time() - t0) * 1000),
            timestamp=_now_iso(),
        ))

        logger.info("[%s] Outcome: %s", self.name, summary[:100])
        return summary
