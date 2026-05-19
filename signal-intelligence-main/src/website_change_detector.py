"""
Website change detector using HTML snapshots and diffs.
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
import re
from datetime import datetime
from difflib import SequenceMatcher
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

SNAPSHOT_DIR = Path(".cache/website_changes")
PAGES_TO_SCAN = ["/", "/pricing", "/product", "/features", "/solutions"]
MEANINGFUL_PATH_HINTS = ("pricing", "product", "feature", "release", "launch")


def _snapshot_path(domain: str) -> Path:
    safe = domain.replace(".", "_").replace("/", "_")
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    return SNAPSHOT_DIR / f"{safe}.json"


def _fetch_page(url: str) -> str:
    try:
        response = requests.get(url, timeout=10, headers={"User-Agent": "SignalIntel/1.0"})
        if response.status_code == 200:
            return response.text[:300000]
    except Exception as exc:
        logger.debug("Website change fetch failed for %s: %s", url, exc)
    return ""


def _extract_visible_text(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    text = soup.get_text(" ", strip=True)
    return re.sub(r"\s+", " ", text)[:20000]


def _extract_internal_links(base_domain: str, html: str, base_url: str) -> list[str]:
    soup = BeautifulSoup(html, "lxml")
    links: set[str] = set()
    for tag in soup.find_all("a", href=True):
        full = urljoin(base_url, tag["href"])
        parsed = urlparse(full)
        if base_domain in parsed.netloc:
            links.add(parsed.path or "/")
    return sorted(links)


def _hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def detect_website_changes(company_name: str, domain: str) -> list[dict]:
    if not domain:
        return []

    base = f"https://{domain}"
    pages: dict[str, dict] = {}

    for path in PAGES_TO_SCAN:
        url = urljoin(base, path)
        html = _fetch_page(url)
        if not html:
            continue
        text = _extract_visible_text(html)
        links = _extract_internal_links(domain, html, url)
        pages[url] = {
            "text": text,
            "text_hash": _hash_text(text),
            "links": links,
        }

    if not pages:
        return []

    snapshot_file = _snapshot_path(domain)
    previous = {}
    if snapshot_file.exists():
        try:
            previous = json.loads(snapshot_file.read_text())
        except Exception:
            previous = {}

    snapshot_payload = {
        "captured_at": datetime.utcnow().strftime("%Y-%m-%d"),
        "domain": domain,
        "pages": pages,
    }
    snapshot_file.write_text(json.dumps(snapshot_payload, indent=2))

    if not previous:
        return []

    prev_pages = previous.get("pages", {})

    changed_urls: list[str] = []
    for url, payload in pages.items():
        prev_payload = prev_pages.get(url)
        if not prev_payload:
            changed_urls.append(url)
            continue
        if payload.get("text_hash") != prev_payload.get("text_hash"):
            changed_urls.append(url)

    prev_links = set()
    curr_links = set()
    for payload in prev_pages.values():
        prev_links.update(payload.get("links", []))
    for payload in pages.values():
        curr_links.update(payload.get("links", []))

    new_links = sorted(curr_links - prev_links)
    meaningful_new_links = [
        link for link in new_links if any(hint in link.lower() for hint in MEANINGFUL_PATH_HINTS)
    ]

    home_url = f"https://{domain}/"
    old_home = (prev_pages.get(home_url) or {}).get("text", "")
    new_home = (pages.get(home_url) or {}).get("text", "")
    home_change_ratio = 0.0
    if old_home and new_home:
        home_change_ratio = 1 - SequenceMatcher(None, old_home[:6000], new_home[:6000]).ratio()

    meaningful = bool(meaningful_new_links) or len(changed_urls) >= 2 or home_change_ratio >= 0.18
    if not meaningful:
        return []

    confidence = 0.62
    if meaningful_new_links:
        confidence += 0.12
    if len(changed_urls) >= 2:
        confidence += 0.08
    if home_change_ratio >= 0.18:
        confidence += 0.08
    confidence = min(0.9, confidence)

    evidence_parts: list[str] = []
    if meaningful_new_links:
        evidence_parts.append(f"New key pages: {', '.join(meaningful_new_links[:3])}")
    if changed_urls:
        evidence_parts.append(f"Changed pages detected: {', '.join(changed_urls[:3])}")

    today = datetime.utcnow().strftime("%Y-%m-%d")
    source_url = changed_urls[0] if changed_urls else base

    return [{
        "company": company_name,
        "signal_type": "website_change",
        "description": "Meaningful website updates detected that may indicate new product, pricing, or go-to-market activity.",
        "confidence": round(confidence, 2),
        "extraction_confidence": round(confidence, 2),
        "evidence_sentence": " | ".join(evidence_parts)[:500],
        "article_source": source_url,
        "published_date": today,
        "source_url": source_url,
        "date": today,
        "impact_level": "medium",
        "signal_category": "website_change",
        "sentiment": "positive",
    }]
