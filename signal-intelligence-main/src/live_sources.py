"""
CIRO — Live Signal Sources
Pulls real data from Pakistani news RSS, live weather (OpenWeatherMap),
and Tavily web search. No manual input needed.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime

import feedparser
import requests

from .crisis_models import CrisisSignal, SignalSource

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config — read dynamically at call time so .env reloads work
# ---------------------------------------------------------------------------

def _owm_key() -> str:
    return os.getenv("OPENWEATHER_API_KEY", "")

def _tavily_key() -> str:
    return os.getenv("TAVILY_API_KEY", "")

PAKISTAN_CITIES = [
    {"name": "Karachi",    "lat": 24.8607, "lon": 67.0011},
    {"name": "Lahore",     "lat": 31.5497, "lon": 74.3436},
    {"name": "Islamabad",  "lat": 33.6844, "lon": 73.0479},
    {"name": "Rawalpindi", "lat": 33.5651, "lon": 73.0169},
    {"name": "Peshawar",   "lat": 34.0151, "lon": 71.5249},
    {"name": "Multan",     "lat": 30.1575, "lon": 71.5249},
]

NEWS_RSS_FEEDS = [
    {"name": "Dawn",             "url": "https://www.dawn.com/feeds/latest-news"},
    {"name": "Geo News",         "url": "https://www.geo.tv/rss/10"},
    {"name": "ARY News",         "url": "https://arynews.tv/feed/"},
    {"name": "The News",         "url": "https://www.thenews.com.pk/rss/1/7"},
    {"name": "Express Tribune",  "url": "https://tribune.com.pk/feed/pakistan"},
    {"name": "Pakistan Today",   "url": "https://www.pakistantoday.com.pk/feed/"},
]

# ---------------------------------------------------------------------------
# Keyword matching — tiered for precision
# ---------------------------------------------------------------------------

# HIGH-CONFIDENCE: single keyword is enough (very specific to crises)
# Urban crisis scope — what CIRO handles
# Excludes: terrorism, security incidents, crime, politics
HIGH_CONFIDENCE_KEYWORDS = [
    # Flooding
    "flash flood", "urban flooding", "waterlogging", "inundated", "submerged",
    "torrential rain", "monsoon flood", "sewage overflow", "roads flooded", "area flooded",
    "rainwater accumulation", "drainage overflow",
    # Heat
    "heatwave", "heat stroke", "heat wave", "extreme temperature", "scorching heat",
    # Road / traffic incidents
    "road accident", "motorway accident", "traffic accident", "car crash",
    "head-on collision", "overturned vehicle", "overturned truck", "pile-up",
    "vehicles collide", "highway accident",
    # Infrastructure
    "power outage", "power breakdown", "blackout", "load shedding", "electricity failure",
    "gas shortage", "gas leak", "gas pipeline burst",
    "water shortage", "water supply disruption",
    "bridge collapse", "building collapse", "structure collapse", "road collapse",
    # Traffic / road
    "road closed", "road blocked", "traffic jam", "gridlock", "highway closed",
    # Urdu
    "barish ki wajah", "paani bhar", "sailaab", "haadsa", "bijli band",
]

# Location context required for medium-confidence matches
PAKISTAN_LOCATIONS = [
    "karachi", "lahore", "islamabad", "rawalpindi", "peshawar",
    "multan", "quetta", "faisalabad", "hyderabad", "sialkot", "gujranwala",
    "abbottabad", "murree", "g-10", "g-11", "f-10", "dha", "gulshan",
    "clifton", "defence", "motorway", "m-2", "m-9", "n-5",
]

# MEDIUM-CONFIDENCE: specific enough + location required
MEDIUM_KEYWORDS = [
    "waterlogged", "road flooded",
    "road accident", "car accident", "vehicle accident", "injured in crash",
    "power breakdown", "power failure", "electricity breakdown",
    "road blocked", "road closed", "traffic blocked",
    "extreme heat", "heatstroke victim",
]

# Explicit exclusions — not urban crisis management domain
NOISE_TERMS = [
    # Sports
    "cricket", "test match", "wicket", "innings", "batting", "bowling",
    "football", "hockey", "psl ", "t20",
    # Security / terrorism — law enforcement domain, not CIRO
    "blast", "bomb", "explosion", "attack", "militant", "terrorist",
    "suicide bomber", "ied", "martyred", "killed in attack",
    "security forces", "police operation", "encounter",
    # Politics / economy
    "imf", "budget", "stock exchange", "dollar", "rupee",
    "election", "parliament", "prime minister said", "diplomatic",
    "petroleum", "sanctions",
    # Media / celebrity
    "tiktok", "viral video", "social media post", "actor", "drama",
]


def _is_crisis_relevant(title: str, summary: str) -> tuple[bool, list[str]]:
    """
    Returns (is_relevant, matched_keywords).
    Applies 3-tier filter: noise removal → high-confidence → location+medium.
    """
    combined = (title + " " + summary).lower()

    # Tier 0: reject if it's clearly noise
    if any(noise in combined for noise in NOISE_TERMS):
        return False, []

    # Tier 1: high-confidence keyword alone is enough
    high_matches = [kw for kw in HIGH_CONFIDENCE_KEYWORDS if kw in combined]
    if high_matches:
        return True, high_matches

    # Tier 2: medium keyword + Pakistan location required
    medium_matches = [kw for kw in MEDIUM_KEYWORDS if kw in combined]
    location_match = any(loc in combined for loc in PAKISTAN_LOCATIONS)
    if medium_matches and location_match:
        return True, medium_matches

    return False, []


def _now_iso() -> str:
    return datetime.now().isoformat()


# ---------------------------------------------------------------------------
# Source 1: Pakistani News RSS
# ---------------------------------------------------------------------------

def fetch_news_rss(max_per_feed: int = 5) -> list[CrisisSignal]:
    """Fetch latest headlines from Pakistani news RSS feeds, filtered for genuine crises."""
    signals = []

    for feed_cfg in NEWS_RSS_FEEDS:
        try:
            feed = feedparser.parse(feed_cfg["url"])
            count = 0
            for entry in feed.entries[:20]:
                title = entry.get("title", "")
                summary = entry.get("summary", entry.get("description", ""))

                relevant, matched = _is_crisis_relevant(title, summary)
                if not relevant:
                    continue

                signals.append(CrisisSignal(
                    id=f"rss-{uuid.uuid4().hex[:8]}",
                    source=SignalSource.SOCIAL_MEDIA,
                    raw_text=f"{title}. {summary[:250]}".strip(),
                    location="Pakistan",
                    timestamp=_now_iso(),
                    metadata={
                        "source_name": feed_cfg["name"],
                        "url": entry.get("link", ""),
                        "published": entry.get("published", _now_iso()),
                        "matched_keywords": matched[:5],
                    },
                ))
                count += 1
                if count >= max_per_feed:
                    break

            logger.info("[LiveRSS] %s: %d crisis signals", feed_cfg["name"], count)

        except Exception as exc:
            logger.warning("[LiveRSS] %s failed: %s", feed_cfg["name"], exc)

    return signals


# ---------------------------------------------------------------------------
# Source 2: OpenWeatherMap — real-time weather for Pakistani cities
# ---------------------------------------------------------------------------

def fetch_live_weather() -> list[CrisisSignal]:
    """Fetch real weather for major Pakistani cities. Always returns data — alert or not."""
    key = _owm_key()
    if not key:
        logger.info("[LiveWeather] No OPENWEATHER_API_KEY — skipping.")
        return []

    signals = []
    for city in PAKISTAN_CITIES:
        try:
            r = requests.get(
                "https://api.openweathermap.org/data/2.5/weather",
                params={"lat": city["lat"], "lon": city["lon"], "appid": key, "units": "metric"},
                timeout=6,
            )
            if r.status_code == 401:
                logger.warning("[LiveWeather] API key not yet activated (401). Try again in a few minutes.")
                break
            r.raise_for_status()
            d = r.json()

            temp      = d["main"]["temp"]
            feels     = d["main"]["feels_like"]
            humidity  = d["main"]["humidity"]
            condition = d["weather"][0]["description"]
            wind      = d["wind"]["speed"]
            rain_1h   = d.get("rain", {}).get("1h", 0)

            alert_parts = []
            alert_level = "GREEN"

            if rain_1h > 10:
                alert_parts.append(f"Heavy rainfall {rain_1h:.1f}mm/hr — flooding risk HIGH")
                alert_level = "RED"
            elif rain_1h > 3:
                alert_parts.append(f"Moderate rainfall {rain_1h:.1f}mm/hr")
                alert_level = "AMBER"

            if temp > 42:
                alert_parts.append(f"Extreme heat {temp:.0f}°C (feels {feels:.0f}°C) — heat stroke risk")
                alert_level = "RED"
            elif temp > 38:
                alert_parts.append(f"High temperature {temp:.0f}°C")
                if alert_level == "GREEN":
                    alert_level = "AMBER"

            if wind > 20:
                alert_parts.append(f"Strong winds {wind:.0f} m/s")

            # Always emit a weather signal (even clear) so dashboard shows real data
            status_str = f"[{alert_level}] " + (", ".join(alert_parts) if alert_parts else "Conditions normal")
            signals.append(CrisisSignal(
                id=f"wx-{uuid.uuid4().hex[:8]}",
                source=SignalSource.WEATHER_API,
                raw_text=(
                    f"LIVE WEATHER — {city['name']}: {condition.title()}. "
                    f"Temp: {temp:.0f}°C (feels {feels:.0f}°C). "
                    f"Humidity: {humidity}%. Wind: {wind:.0f} m/s. "
                    f"Rain (1h): {rain_1h:.1f}mm. Status: {status_str}."
                ),
                location=city["name"],
                timestamp=_now_iso(),
                metadata={
                    "city": city["name"],
                    "temp_c": temp,
                    "feels_like_c": feels,
                    "humidity_pct": humidity,
                    "wind_speed_ms": wind,
                    "rain_1h_mm": rain_1h,
                    "condition": condition,
                    "alert_level": alert_level,
                    "source_name": "OpenWeatherMap",
                    "is_alert": len(alert_parts) > 0,
                },
            ))
            logger.info("[LiveWeather] %s: %.0f°C, rain=%.1fmm/hr, %s", city["name"], temp, rain_1h, alert_level)

        except Exception as exc:
            logger.warning("[LiveWeather] %s failed: %s. Using fallback data.", city["name"], exc)
            # Fallback to simulated weather so the dashboard always has data
            import random
            temp = random.randint(30, 43)
            feels = temp + random.randint(1, 4)
            condition = random.choice(["clear sky", "few clouds", "scattered clouds", "heavy rain"])
            rain_1h = random.uniform(5.0, 15.0) if "rain" in condition else 0.0
            
            alert_parts = []
            alert_level = "GREEN"
            if rain_1h > 10:
                alert_parts.append(f"Heavy rainfall {rain_1h:.1f}mm/hr — flooding risk HIGH")
                alert_level = "RED"
            if temp > 42:
                alert_parts.append(f"Extreme heat {temp:.0f}°C — heat stroke risk")
                alert_level = "RED"
                
            status_str = f"[{alert_level}] " + (", ".join(alert_parts) if alert_parts else "Conditions normal")
            signals.append(CrisisSignal(
                id=f"wx-{uuid.uuid4().hex[:8]}",
                source=SignalSource.WEATHER_API,
                raw_text=(
                    f"LIVE WEATHER (SIMULATED) — {city['name']}: {condition.title()}. "
                    f"Temp: {temp:.0f}°C (feels {feels:.0f}°C). "
                    f"Rain (1h): {rain_1h:.1f}mm. Status: {status_str}."
                ),
                location=city["name"],
                timestamp=_now_iso(),
                metadata={
                    "city": city["name"],
                    "temp_c": temp,
                    "condition": condition,
                    "alert_level": alert_level,
                    "source_name": "SimWeatherMap",
                    "is_alert": len(alert_parts) > 0,
                },
            ))

    # If no key, still generate mock data for all cities
    if not key and not signals:
        for city in PAKISTAN_CITIES:
            import random
            temp = random.randint(30, 43)
            feels = temp + random.randint(1, 4)
            condition = random.choice(["clear sky", "few clouds", "scattered clouds", "heavy rain"])
            rain_1h = random.uniform(5.0, 15.0) if "rain" in condition else 0.0
            
            alert_parts = []
            alert_level = "GREEN"
            if rain_1h > 10:
                alert_parts.append(f"Heavy rainfall {rain_1h:.1f}mm/hr — flooding risk HIGH")
                alert_level = "RED"
            if temp > 42:
                alert_parts.append(f"Extreme heat {temp:.0f}°C — heat stroke risk")
                alert_level = "RED"
                
            status_str = f"[{alert_level}] " + (", ".join(alert_parts) if alert_parts else "Conditions normal")
            signals.append(CrisisSignal(
                id=f"wx-{uuid.uuid4().hex[:8]}",
                source=SignalSource.WEATHER_API,
                raw_text=(
                    f"LIVE WEATHER (SIMULATED) — {city['name']}: {condition.title()}. "
                    f"Temp: {temp:.0f}°C (feels {feels:.0f}°C). "
                    f"Rain (1h): {rain_1h:.1f}mm. Status: {status_str}."
                ),
                location=city["name"],
                timestamp=_now_iso(),
                metadata={
                    "city": city["name"],
                    "temp_c": temp,
                    "condition": condition,
                    "alert_level": alert_level,
                    "source_name": "SimWeatherMap",
                    "is_alert": len(alert_parts) > 0,
                },
            ))

    return signals


# ---------------------------------------------------------------------------
# Source 3: Tavily web search
# ---------------------------------------------------------------------------

def fetch_tavily_crisis_news() -> list[CrisisSignal]:
    """Search for current Pakistan crisis events via Tavily."""
    key = _tavily_key()
    if not key:
        return []

    queries = [
        "Pakistan flood accident emergency today",
        "Karachi Lahore Islamabad road accident flood today",
    ]
    signals = []
    for query in queries:
        try:
            r = requests.post(
                "https://api.tavily.com/search",
                json={"api_key": key, "query": query, "search_depth": "basic", "max_results": 5},
                timeout=10,
            )
            r.raise_for_status()
            for item in r.json().get("results", []):
                title = item.get("title", "")
                content = item.get("content", "")
                relevant, matched = _is_crisis_relevant(title, content)
                if not relevant:
                    continue
                signals.append(CrisisSignal(
                    id=f"tv-{uuid.uuid4().hex[:8]}",
                    source=SignalSource.SOCIAL_MEDIA,
                    raw_text=f"{title}. {content[:300]}",
                    location="Pakistan",
                    timestamp=_now_iso(),
                    metadata={"source_name": "Tavily", "url": item.get("url", ""), "matched_keywords": matched[:5]},
                ))
        except Exception as exc:
            logger.warning("[LiveTavily] %s", exc)

    # Deduplicate
    seen, unique = set(), []
    for s in signals:
        k = s.raw_text[:80]
        if k not in seen:
            seen.add(k)
            unique.append(s)
    return unique


# ---------------------------------------------------------------------------
# Source 4: Simulated Traffic Congestion API
# Mimics what a real Maps/Traffic API would provide (Google Maps Traffic, HERE, etc.)
# ---------------------------------------------------------------------------

import random as _random

# Major corridors with baseline congestion levels
_TRAFFIC_CORRIDORS = [
    {"city": "Islamabad", "corridor": "G-10 Main Road", "lat": 33.693, "lon": 73.033, "baseline": 0.4},
    {"city": "Islamabad", "corridor": "Kashmir Highway",  "lat": 33.720, "lon": 73.090, "baseline": 0.3},
    {"city": "Islamabad", "corridor": "Jinnah Avenue",    "lat": 33.709, "lon": 73.061, "baseline": 0.5},
    {"city": "Karachi",   "corridor": "Shahrae Faisal",   "lat": 24.861, "lon": 67.010, "baseline": 0.6},
    {"city": "Karachi",   "corridor": "M-9 Motorway",     "lat": 24.950, "lon": 67.130, "baseline": 0.35},
    {"city": "Lahore",    "corridor": "Canal Road",        "lat": 31.510, "lon": 74.340, "baseline": 0.55},
    {"city": "Rawalpindi","corridor": "GT Road",           "lat": 33.597, "lon": 73.044, "baseline": 0.5},
]

_CONGESTION_LABELS = {
    (0.0, 0.3): ("GREEN",  "Free flowing"),
    (0.3, 0.6): ("AMBER",  "Moderate congestion"),
    (0.6, 0.8): ("ORANGE", "Heavy congestion — slowdowns reported"),
    (0.8, 1.0): ("RED",    "Severe gridlock — possible incident"),
}

def _congestion_label(index: float) -> tuple[str, str]:
    for (lo, hi), (level, desc) in _CONGESTION_LABELS.items():
        if lo <= index < hi:
            return level, desc
    return "RED", "Extreme gridlock"


def fetch_traffic_congestion() -> list[CrisisSignal]:
    """
    Simulated traffic congestion feed — mimics a real Maps/Traffic API.
    Generates realistic congestion spikes with some randomness to simulate
    real-world variability. Only emits signals for congested corridors.
    """
    import datetime as _dt
    hour = _dt.datetime.now().hour
    # Peak hours: 8-10am, 5-8pm — boost congestion
    peak_boost = 0.25 if (8 <= hour <= 10 or 17 <= hour <= 20) else 0.0

    signals = []
    for corridor in _TRAFFIC_CORRIDORS:
        # Simulate congestion: baseline + peak + noise
        noise = _random.uniform(-0.1, 0.2)
        congestion_index = min(1.0, corridor["baseline"] + peak_boost + noise)

        # Only emit signal if moderately congested or worse
        if congestion_index < 0.4:
            continue

        level, description = _congestion_label(congestion_index)
        speed_kmh = max(2, int((1 - congestion_index) * 60))
        delay_min = int(congestion_index * 25)

        raw_text = (
            f"TRAFFIC [{level}] — {corridor['city']}: {corridor['corridor']}. "
            f"{description}. "
            f"Avg speed: {speed_kmh} km/h. "
            f"Estimated delay: {delay_min} min. "
            f"Congestion index: {congestion_index:.2f}/1.00."
        )

        signals.append(CrisisSignal(
            id=f"trf-{uuid.uuid4().hex[:8]}",
            source=SignalSource.TRAFFIC_API,
            raw_text=raw_text,
            location=f"{corridor['city']} — {corridor['corridor']}",
            timestamp=_now_iso(),
            metadata={
                "source_name": "Traffic API (Simulated)",
                "city": corridor["city"],
                "corridor": corridor["corridor"],
                "congestion_index": round(congestion_index, 2),
                "speed_kmh": speed_kmh,
                "delay_min": delay_min,
                "alert_level": level,
                "lat": corridor["lat"],
                "lon": corridor["lon"],
                "matched_keywords": ["traffic", "congestion", "gridlock"] if congestion_index > 0.7 else ["traffic"],
            },
        ))
        logger.info("[LiveTraffic] %s %s: %.0f%% congestion (%s)", corridor["city"], corridor["corridor"], congestion_index * 100, level)

    return signals


# ---------------------------------------------------------------------------
# Combined ingestion
# ---------------------------------------------------------------------------

def fetch_all_live_signals() -> list[CrisisSignal]:
    signals = []
    signals.extend(fetch_news_rss())
    signals.extend(fetch_live_weather())
    signals.extend(fetch_traffic_congestion())
    signals.extend(fetch_tavily_crisis_news())
    logger.info("[LiveSources] Total: %d signals", len(signals))
    return signals
