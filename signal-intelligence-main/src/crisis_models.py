"""
Crisis Intelligence & Response Orchestrator (CIRO) — Data Models
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class CrisisType(str, Enum):
    URBAN_FLOODING = "urban_flooding"
    HEATWAVE = "heatwave"
    ROAD_BLOCKAGE = "road_blockage"
    ACCIDENT = "accident"
    INFRASTRUCTURE_FAILURE = "infrastructure_failure"
    UNKNOWN = "unknown"


class SeverityLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SignalSource(str, Enum):
    SOCIAL_MEDIA = "social_media"
    WEATHER_API = "weather_api"
    TRAFFIC_API = "traffic_api"
    COMPLAINT = "complaint"
    SENSOR = "sensor"


@dataclass
class CrisisSignal:
    id: str
    source: SignalSource
    raw_text: str
    location: str
    timestamp: str
    metadata: dict = field(default_factory=dict)


@dataclass
class DetectedCrisis:
    crisis_type: CrisisType
    location: str
    confidence: float          # 0.0 – 1.0
    confidence_label: str      # "Low" / "Medium" / "High"
    severity: SeverityLevel
    description: str
    affected_area: str
    contributing_signals: list[str]
    reasoning: str


@dataclass
class SituationReport:
    crisis: DetectedCrisis
    impact_summary: str
    impacts: list[str]
    people_affected_estimate: str
    infrastructure_risk: str
    time_sensitivity: str
    reasoning: str


@dataclass
class ResponseAction:
    action_id: str
    action_type: str           # "traffic_reroute" | "emergency_dispatch" | "alert" | "resource_allocation"
    description: str
    priority: int              # 1 = highest
    target_area: str
    assigned_to: str           # "Traffic Control" | "Emergency Services" | "Notification System"
    estimated_impact: str


@dataclass
class ActionPlan:
    plan_id: str
    situation: SituationReport
    actions: list[ResponseAction]
    coordination_note: str
    reasoning: str


@dataclass
class SimulationResult:
    action: ResponseAction
    status: str                # "executed" | "failed" | "pending"
    outcome: str
    before_state: dict
    after_state: dict
    timestamp: str
    ticket_id: str | None = None
    alert_recipients: int = 0


@dataclass
class AgentTrace:
    agent_name: str
    step: int
    input_summary: str
    reasoning: str
    output_summary: str
    tool_calls: list[dict]
    duration_ms: int
    timestamp: str


@dataclass
class CIRORunResult:
    run_id: str
    started_at: str
    completed_at: str
    input_signals: list[CrisisSignal]
    detected_crisis: DetectedCrisis | None
    situation_report: SituationReport | None
    action_plan: ActionPlan | None
    simulation_results: list[SimulationResult]
    outcome_summary: str
    agent_traces: list[AgentTrace]
    before_snapshot: dict
    after_snapshot: dict

    def to_dict(self) -> dict:
        """Serialize to a JSON-safe dict for API responses."""
        import dataclasses
        def _serialize(obj: Any) -> Any:
            if dataclasses.is_dataclass(obj):
                return {k: _serialize(v) for k, v in dataclasses.asdict(obj).items()}
            if isinstance(obj, list):
                return [_serialize(i) for i in obj]
            if isinstance(obj, Enum):
                return obj.value
            return obj
        return _serialize(self)
