"""
CIRO — Simulated crisis data sources.
Provides realistic mock data for social media, weather, and traffic signals
so the system works end-to-end without real external API keys.
"""

from __future__ import annotations

import random
import uuid
from datetime import datetime

from .crisis_models import CrisisSignal, SignalSource

# ---------------------------------------------------------------------------
# Scenario templates
# ---------------------------------------------------------------------------

FLOOD_SIGNALS = [
    # English social posts
    "Flash flood happening at George Town for past 30 mins, cars are stuck!",
    "The road near G-10 markaz is completely flooded. Can't pass through.",
    "Massive waterlogging on Jinnah Avenue near F-7. Water level rising fast.",
    "Someone help! Khayaban-e-Iqbal totally submerged. Stranded with kids.",
    # Urdu/mixed social posts
    "G-10 mein pani bhar gaya hai, gaariyan phans gayi hain",
    "Bhai I-8 wala underpass bilkul band ho gaya, paani hi paani",
    "Main G-9 mein hoon, ghar ka darwaza bhi band nahi ho raha flood ki wajah se",
    "Sab log F-6 walay area se dor raho, saari roads band hain",
]

HEATWAVE_SIGNALS = [
    "Temperature hitting 48°C in Karachi today. Multiple heat exhaustion cases reported.",
    "Heatwave alert: Lahore records 46°C, hospitals overwhelmed with heat stroke patients.",
    "No power for 8 hours in Defence area, people suffering in extreme heat.",
    "Karachi mein aaj garmi ka record toot gaya, 49 degree Celsius. Bahar mat niklo.",
    "3 deaths reported due to heat stroke in Lyari. Water supply also disrupted.",
]

ACCIDENT_SIGNALS = [
    "Major accident on M-2 motorway near Sheikhupura toll. 3 vehicles involved, road blocked.",
    "Head-on collision on Shahrah-e-Faisal, police and ambulance needed urgently.",
    "Truck overturned on I-9 industrial area bridge. Blocking all lanes.",
    "Bhai motorway pe bohat bura accident hua hai, road completely jam hai",
    "Multi-vehicle crash near NUST chowk, avoid that route.",
]

ROAD_BLOCKAGE_SIGNALS = [
    "Sewage line burst on Main Boulevard Gulberg. Road closed for emergency repairs.",
    "Tree fallen on Margalla Road after last night's storm. Single lane passable only.",
    "Gas pipeline work blocking F-11 main road. Diversion via Kashmir Highway.",
    "Constitution Avenue closed for VIP movement, seek alternate route.",
    "Shahrah-e-Quaid-e-Azam band hai construction ki wajah se. Koi alternative batao?",
]

INFRASTRUCTURE_SIGNALS = [
    "Power grid failure in North Karachi. 50,000 homes without electricity.",
    "Water pump station malfunction in G-6/1. No water supply for past 6 hours.",
    "Gas pressure drop across I-8, I-9, I-10 sectors. No cooking gas since morning.",
    "Sui gas supply cut in Blue Area and F-7. Please conserve.",
    "Major cable fault in Rawalpindi cantonment. Telecom and internet disrupted.",
]

WEATHER_ALERTS = {
    "urban_flooding": {
        "condition": "Heavy Rainfall",
        "intensity_mm_per_hr": 45,
        "wind_speed_kmh": 30,
        "alert_level": "RED",
        "advisory": "Urban flooding likely. Avoid low-lying areas.",
        "duration_hours": 3,
    },
    "heatwave": {
        "condition": "Extreme Heat",
        "temperature_c": 48,
        "humidity_pct": 20,
        "alert_level": "RED",
        "advisory": "Life-threatening heat. Stay indoors, hydrate.",
        "duration_hours": 12,
    },
    "normal": {
        "condition": "Clear",
        "temperature_c": 28,
        "humidity_pct": 55,
        "alert_level": "GREEN",
        "advisory": "Normal conditions.",
        "duration_hours": 0,
    },
}

TRAFFIC_STATES = {
    "urban_flooding": {
        "congestion_index": 9.2,      # 0-10
        "blocked_routes": ["G-10 Main Road", "Jinnah Avenue (I-8 to I-10)", "Khayaban-e-Iqbal"],
        "avg_speed_kmh": 4,
        "incident_count": 7,
        "severity": "CRITICAL",
    },
    "accident": {
        "congestion_index": 7.5,
        "blocked_routes": ["M-2 Motorway Km 45-52", "Shahrah-e-Faisal"],
        "avg_speed_kmh": 12,
        "incident_count": 3,
        "severity": "HIGH",
    },
    "road_blockage": {
        "congestion_index": 6.0,
        "blocked_routes": ["Main Boulevard Gulberg", "Constitution Avenue"],
        "avg_speed_kmh": 18,
        "incident_count": 2,
        "severity": "MEDIUM",
    },
    "normal": {
        "congestion_index": 2.1,
        "blocked_routes": [],
        "avg_speed_kmh": 45,
        "incident_count": 0,
        "severity": "NONE",
    },
}


# ---------------------------------------------------------------------------
# Source functions (callable by the ingestion agent)
# ---------------------------------------------------------------------------

def fetch_social_media_signals(scenario: str = "urban_flooding", count: int = 4) -> list[CrisisSignal]:
    """Return mock social-media posts relevant to the given scenario."""
    pool_map = {
        "urban_flooding": FLOOD_SIGNALS,
        "heatwave": HEATWAVE_SIGNALS,
        "accident": ACCIDENT_SIGNALS,
        "road_blockage": ROAD_BLOCKAGE_SIGNALS,
        "infrastructure_failure": INFRASTRUCTURE_SIGNALS,
    }
    pool = pool_map.get(scenario, FLOOD_SIGNALS)
    selected = random.sample(pool, min(count, len(pool)))

    location_map = {
        "urban_flooding": "G-10 / George Town, Islamabad",
        "heatwave": "Karachi Central",
        "accident": "M-2 Motorway / Shahrah-e-Faisal",
        "road_blockage": "Gulberg Main Boulevard, Lahore",
        "infrastructure_failure": "North Karachi",
    }

    signals = []
    for text in selected:
        signals.append(CrisisSignal(
            id=f"sm-{uuid.uuid4().hex[:8]}",
            source=SignalSource.SOCIAL_MEDIA,
            raw_text=text,
            location=location_map.get(scenario, "Unknown"),
            timestamp=datetime.now().isoformat(),
            metadata={"platform": random.choice(["Twitter/X", "Facebook", "WhatsApp"]), "engagement": random.randint(10, 400)},
        ))
    return signals


def fetch_weather_alert(scenario: str = "urban_flooding") -> CrisisSignal:
    """Return a mock weather alert signal."""
    weather_key = scenario if scenario in WEATHER_ALERTS else "normal"
    data = WEATHER_ALERTS[weather_key]
    return CrisisSignal(
        id=f"wx-{uuid.uuid4().hex[:8]}",
        source=SignalSource.WEATHER_API,
        raw_text=f"WEATHER ALERT [{data['alert_level']}]: {data['condition']}. {data['advisory']}",
        location="Metropolitan Area",
        timestamp=datetime.now().isoformat(),
        metadata=data,
    )


def fetch_traffic_data(scenario: str = "urban_flooding") -> CrisisSignal:
    """Return mock traffic API data as a CrisisSignal."""
    traffic_key = scenario if scenario in TRAFFIC_STATES else "normal"
    data = TRAFFIC_STATES[traffic_key]
    blocked = ", ".join(data["blocked_routes"]) if data["blocked_routes"] else "None"
    return CrisisSignal(
        id=f"tr-{uuid.uuid4().hex[:8]}",
        source=SignalSource.TRAFFIC_API,
        raw_text=(
            f"TRAFFIC REPORT: Congestion index {data['congestion_index']}/10. "
            f"Severity: {data['severity']}. Blocked routes: {blocked}. "
            f"Avg speed: {data['avg_speed_kmh']} km/h. Incidents: {data['incident_count']}."
        ),
        location="City-Wide",
        timestamp=datetime.now().isoformat(),
        metadata=data,
    )


def ingest_all_signals(scenario: str = "urban_flooding", social_count: int = 4) -> list[CrisisSignal]:
    """Collect all simulated signals for the given scenario."""
    signals = []
    signals.extend(fetch_social_media_signals(scenario, count=social_count))
    signals.append(fetch_weather_alert(scenario))
    signals.append(fetch_traffic_data(scenario))
    return signals


def get_available_scenarios() -> list[str]:
    return ["urban_flooding", "heatwave", "accident", "road_blockage", "infrastructure_failure"]
