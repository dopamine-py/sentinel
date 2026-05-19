"""
Technology stack change detector based on website HTML markers.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
import re
from datetime import datetime
from urllib.parse import urljoin

import requests

logger = logging.getLogger(__name__)

SNAPSHOT_DIR = Path(".cache/tech_stack")

TECH_MARKERS = {
    "Salesforce": [r"salesforce\\.com", r"force\\.com", r"pardot"],
    "HubSpot": [r"hubspot", r"hs-analytics", r"hsforms"],
    "Stripe": [r"js\\.stripe\\.com", r"stripe"],
    "Marketo": [r"marketo", r"munchkin"],
    "Segment": [r"segment\\.com", r"analytics\\.js"],
    "Intercom": [r"intercom", r"widget\\.intercom\\.io"],
    "Zendesk": [r"zendesk", r"zdassets"],
}

PAGES_TO_SCAN = ["/", "/pricing", "/product", "/features"]


def _snapshot_path(domain: str) -> Path:
    safe = domain.replace(".", "_").replace("/", "_")
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    return SNAPSHOT_DIR / f"{safe}.json"


def _fetch_pages(domain: str) -> dict[str, str]:
    base = f"https://{domain}"
    pages: dict[str, str] = {}
    for path in PAGES_TO_SCAN:
        url = urljoin(base, path)
        try:
            response = requests.get(url, timeout=10, headers={"User-Agent": "SignalIntel/1.0"})
            if response.status_code == 200 and response.text:
                pages[url] = response.text[:250000]
        except Exception as exc:
            logger.debug("Tech detector fetch failed for %s: %s", url, exc)
    return pages


def _detect_technologies(html_by_url: dict[str, str]) -> dict[str, list[str]]:
    detections: dict[str, list[str]] = {}
    for tech, markers in TECH_MARKERS.items():
        matched_urls: list[str] = []
        for url, html in html_by_url.items():
            haystack = html.lower()
            if any(re.search(pattern, haystack) for pattern in markers):
                matched_urls.append(url)
        if matched_urls:
            detections[tech] = matched_urls
    return detections


def detect_tech_stack_changes(company_name: str, domain: str) -> list[dict]:
    if not domain:
        return []

    html_by_url = _fetch_pages(domain)
    if not html_by_url:
        return []

    current = _detect_technologies(html_by_url)
    snapshot_file = _snapshot_path(domain)

    previous: dict = {}
    if snapshot_file.exists():
        try:
            previous = json.loads(snapshot_file.read_text())
        except Exception:
            previous = {}

    snapshot_payload = {
        "captured_at": datetime.utcnow().strftime("%Y-%m-%d"),
        "domain": domain,
        "technologies": current,
    }
    snapshot_file.write_text(json.dumps(snapshot_payload, indent=2))

    if not previous:
        return []

    previous_tech = set((previous.get("technologies") or {}).keys())
    current_tech = set(current.keys())
    newly_detected = sorted(current_tech - previous_tech)

    if not newly_detected:
        return []

    signal_url = current[newly_detected[0]][0] if current.get(newly_detected[0]) else f"https://{domain}"
    confidence = min(0.9, 0.68 + (0.06 * len(newly_detected)))
    today = datetime.utcnow().strftime("%Y-%m-%d")

    return [{
        "company": company_name,
        "signal_type": "tech_stack_change",
        "description": f"New technology markers detected on website: {', '.join(newly_detected)}.",
        "confidence": round(confidence, 2),
        "extraction_confidence": round(confidence, 2),
        "evidence_sentence": f"Detected new stack indicators on {signal_url}",
        "article_source": signal_url,
        "published_date": today,
        "source_url": signal_url,
        "date": today,
        "impact_level": "medium",
        "signal_category": "tech_stack_change",
        "sentiment": "positive",
    }]
