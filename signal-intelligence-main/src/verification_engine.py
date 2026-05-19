"""
Verification engine:
- source authority scoring
- entity validation
- multi-source verification boosts
"""

from __future__ import annotations

import logging
import re
from difflib import SequenceMatcher
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

SOURCE_AUTHORITY_MAP = {
    "reuters.com": 1.0,
    "bloomberg.com": 0.95,
    "techcrunch.com": 0.9,
    "businesswire.com": 0.85,
    "prnewswire.com": 0.85,
}
DEFAULT_AUTHORITY = 0.5

_STOPWORDS = {
    "the", "and", "for", "with", "from", "that", "this", "into", "over", "after",
    "company", "announced", "announces", "new", "its", "their", "about",
}


def _normalize_name(name: str) -> str:
    text = (name or "").lower().strip()
    text = re.sub(r"\b(inc|llc|ltd|corp|corporation|company|co)\b", "", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def get_source_authority(source_url: str) -> float:
    """Return authority score (0-1) by source domain."""
    try:
        domain = urlparse(source_url).netloc.lower().replace("www.", "")
    except Exception:
        domain = ""

    for trusted_domain, score in SOURCE_AUTHORITY_MAP.items():
        if domain == trusted_domain or domain.endswith(f".{trusted_domain}"):
            return score
    return DEFAULT_AUTHORITY


def validate_entity(signal_company: str, tracked_company: str, tracked_domain: str = "", source_url: str = "") -> bool:
    """Validate that extracted company matches tracked company/domain."""
    extracted = _normalize_name(signal_company)
    tracked = _normalize_name(tracked_company)

    if not extracted or not tracked:
        return False

    if extracted == tracked:
        return True

    if extracted in tracked or tracked in extracted:
        return True

    extracted_tokens = set(extracted.split())
    tracked_tokens = set(tracked.split())
    overlap = len(extracted_tokens & tracked_tokens)
    if overlap >= 2:
        return True

    if tracked_domain and source_url and tracked_domain.lower() in source_url.lower():
        return True

    similarity = SequenceMatcher(None, extracted, tracked).ratio()
    return similarity >= 0.8


def filter_valid_entities(signals: list[dict], tracked_company: str, tracked_domain: str = "") -> list[dict]:
    valid: list[dict] = []
    for signal in signals:
        company = signal.get("company") or tracked_company
        source_url = signal.get("article_source") or signal.get("source_url") or ""
        if validate_entity(company, tracked_company, tracked_domain, source_url):
            valid.append(signal)
        else:
            logger.debug("Entity validation dropped signal: %s", signal.get("description", "")[:120])
    return valid


def _semantic_similarity(a: str, b: str) -> float:
    aa = re.sub(r"\s+", " ", (a or "").lower()).strip()
    bb = re.sub(r"\s+", " ", (b or "").lower()).strip()
    seq = SequenceMatcher(None, aa, bb).ratio()

    tokens_a = {t for t in re.findall(r"[a-z0-9]+", aa) if t not in _STOPWORDS}
    tokens_b = {t for t in re.findall(r"[a-z0-9]+", bb) if t not in _STOPWORDS}
    if not tokens_a or not tokens_b:
        return seq
    jaccard = len(tokens_a & tokens_b) / max(1, len(tokens_a | tokens_b))
    return (seq * 0.6) + (jaccard * 0.4)


def apply_multi_source_verification(signals: list[dict], similarity_threshold: float = 0.82) -> list[dict]:
    """Boost verification if same signal appears in multiple sources."""
    if not signals:
        return []

    clusters: list[dict] = []

    for signal in signals:
        source_url = signal.get("article_source") or signal.get("source_url") or ""
        signal["source_authority"] = get_source_authority(source_url)

        assigned = False
        for cluster in clusters:
            same_company = (signal.get("company", "").lower() == cluster["company"].lower())
            same_type = signal.get("signal_type") == cluster["signal_type"]
            if not (same_company and same_type):
                continue

            similarity = _semantic_similarity(signal.get("description", ""), cluster["description"])
            if similarity >= similarity_threshold:
                cluster["signals"].append(signal)
                cluster["sources"].add(source_url)
                assigned = True
                break

        if not assigned:
            clusters.append({
                "company": signal.get("company", ""),
                "signal_type": signal.get("signal_type", "none"),
                "description": signal.get("description", ""),
                "signals": [signal],
                "sources": {source_url} if source_url else set(),
            })

    enriched: list[dict] = []
    for cluster in clusters:
        source_count = max(1, len(cluster["sources"]))
        verification_score = 0.6
        if source_count == 2:
            verification_score += 0.15
        elif source_count >= 3:
            verification_score += 0.25

        for signal in cluster["signals"]:
            signal["source_count"] = source_count
            signal["verification_score"] = min(1.0, verification_score)
            boost = 0.0
            if source_count == 2:
                boost = 0.05
            elif source_count >= 3:
                boost = 0.1
            signal["confidence"] = min(1.0, float(signal.get("confidence", 0.5)) + boost)
            signal["extraction_confidence"] = signal["confidence"]
            enriched.append(signal)

    return enriched
