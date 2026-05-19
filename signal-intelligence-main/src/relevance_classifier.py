"""
Stage-1 relevance classifier for article-level signal detection.
"""

from __future__ import annotations

import json
import logging
import re

from .llm_client import generate_json_completion, get_llm_provider

logger = logging.getLogger(__name__)

RELEVANCE_SYSTEM_PROMPT = """You are a strict business-signal relevance classifier.
Decide whether the article contains a concrete company business signal.

Return JSON only in this exact format:
{"relevant": true}
or
{"relevant": false}
"""

RELEVANCE_PROMPT_TEMPLATE = """Company: {company}

Determine if this article includes at least one concrete business signal such as:
- hiring activity
- funding/investment
- expansion/new office/new market
- partnership/collaboration
- product launch/new feature
- acquisition/merger

Article title: {title}
Article date: {date}
Article source: {source}
Article content:
{content}

Return JSON only.
"""

_SIGNAL_KEYWORDS = {
    "hiring", "hired", "hiring spree", "open roles", "job openings", "careers",
    "raised", "series a", "series b", "series c", "funding", "investment", "valuation",
    "opening", "new office", "expansion", "facility", "new market",
    "partnership", "collaboration", "agreement", "alliance", "joint venture",
    "launched", "announced", "new product", "new feature", "release",
    "acquired", "acquisition", "merger", "m&a",
}


def _keyword_hits(text: str) -> int:
    haystack = text.lower()
    return sum(1 for kw in _SIGNAL_KEYWORDS if kw in haystack)


def _parse_relevance(content: str) -> bool | None:
    content = (content or "").strip()
    if not content:
        return None

    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict) and "relevant" in parsed:
            return bool(parsed["relevant"])
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{\s*\"relevant\"\s*:\s*(true|false)\s*\}", content, flags=re.IGNORECASE)
    if match:
        return match.group(1).lower() == "true"
    return None


def classify_relevance(company_name: str, article: dict) -> dict:
    """Classify article relevance with heuristic short-circuit + LLM fallback."""
    title = article.get("title", "")
    content = article.get("content", "")
    date = article.get("date", "")
    source = article.get("source", "")

    combined = f"{title}\n{content}"
    hits = _keyword_hits(combined)

    if hits == 0:
        return {"relevant": False, "method": "heuristic", "confidence": 0.95}

    if hits >= 3:
        return {"relevant": True, "method": "heuristic", "confidence": 0.85}

    prompt = RELEVANCE_PROMPT_TEMPLATE.format(
        company=company_name,
        title=title,
        date=date,
        source=source,
        content=content[:2200],
    )

    try:
        model_response = generate_json_completion(
            system_prompt=RELEVANCE_SYSTEM_PROMPT,
            user_prompt=prompt,
            temperature=0.0,
            max_output_tokens=128,
            timeout=90,
        )
        parsed = _parse_relevance(model_response)
        if parsed is not None:
            return {"relevant": parsed, "method": "llm", "confidence": 0.8}
    except Exception as exc:
        logger.warning(
            "Relevance classifier %s call failed for %s: %s",
            get_llm_provider(),
            company_name,
            exc,
        )

    return {"relevant": hits >= 1, "method": "heuristic_fallback", "confidence": 0.6}
