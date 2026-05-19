"""
Stage-2 signal extraction (strict JSON schema).
"""

from __future__ import annotations

import json
import logging
import re

from .llm_client import generate_json_completion, get_llm_provider

logger = logging.getLogger(__name__)

ALLOWED_SIGNAL_TYPES = {
    "hiring",
    "funding",
    "expansion",
    "partnership",
    "product_launch",
    "acquisition",
    "none",
}

_SIGNAL_ALIASES = {
    "merger": "acquisition",
    "m&a": "acquisition",
    "product": "product_launch",
    "launch": "product_launch",
    "investment": "funding",
}

EXTRACTION_SYSTEM_PROMPT = """You are an expert sales-intelligence signal extractor.

Return JSON only with this exact schema:
{
  "company": "",
  "signal_type": "",
  "description": "",
  "confidence": 0.0,
  "evidence_sentence": "",
  "article_source": "",
  "published_date": ""
}

Allowed signal_type values:
- hiring
- funding
- expansion
- partnership
- product_launch
- acquisition
- none

Rules:
- evidence_sentence must be copied from the article content verbatim.
- confidence must be between 0 and 1.
- if no signal exists, set signal_type to "none".
- JSON only, no markdown, no extra text.
"""

EXTRACTION_PROMPT_TEMPLATE = """Company: {company}

Extract one strongest business signal from this article.

Article source URL: {source_url}
Published date: {published_date}
Title: {title}
Content:
{content}

Return JSON only.
"""


def _parse_json(content: str) -> dict | None:
    content = (content or "").strip()
    if not content:
        return None

    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", content, flags=re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return None
    return None


def _normalize_signal_type(signal_type: str) -> str:
    if not signal_type:
        return "none"
    normalized = signal_type.strip().lower()
    normalized = _SIGNAL_ALIASES.get(normalized, normalized)
    return normalized if normalized in ALLOWED_SIGNAL_TYPES else "none"


def _heuristic_fallback(company_name: str, article: dict) -> dict:
    text = f"{article.get('title', '')} {article.get('content', '')}".lower()
    if "raised" in text or "series" in text or "funding" in text:
        signal_type = "funding"
    elif "acquired" in text or "merger" in text:
        signal_type = "acquisition"
    elif "partnership" in text or "collaboration" in text:
        signal_type = "partnership"
    elif "launch" in text or "new product" in text or "announced" in text:
        signal_type = "product_launch"
    elif "opening" in text or "new office" in text or "expansion" in text:
        signal_type = "expansion"
    elif "hiring" in text or "job" in text or "open roles" in text:
        signal_type = "hiring"
    else:
        signal_type = "none"

    sentences = re.split(r"(?<=[.!?])\s+", article.get("content", ""))
    evidence = sentences[0][:240] if sentences else ""

    return {
        "company": company_name,
        "signal_type": signal_type,
        "description": article.get("title", "")[:280],
        "confidence": 0.55 if signal_type != "none" else 0.3,
        "evidence_sentence": evidence,
        "article_source": article.get("url", ""),
        "published_date": article.get("date", ""),
    }


def _to_compat_signal(raw: dict, article: dict, tracked_company: str) -> dict:
    signal_type = _normalize_signal_type(raw.get("signal_type", "none"))
    confidence = raw.get("confidence", 0.5)
    try:
        confidence = float(confidence)
    except (TypeError, ValueError):
        confidence = 0.5
    confidence = max(0.0, min(1.0, confidence))

    description = (raw.get("description") or "").strip()
    evidence = (raw.get("evidence_sentence") or "").strip()

    if evidence and evidence not in article.get("content", ""):
        sentences = re.split(r"(?<=[.!?])\s+", article.get("content", ""))
        evidence = next((s for s in sentences if len(s) > 30), evidence)

    source_url = (raw.get("article_source") or article.get("url") or "").strip()
    published_date = (raw.get("published_date") or article.get("date") or "").strip()
    company = (raw.get("company") or tracked_company).strip()

    if not description:
        description = article.get("title", "")[:280]

    impact_level = "high" if signal_type in {"funding", "acquisition"} else "medium"
    sentiment = "positive" if signal_type != "none" else "neutral"

    return {
        "company": company,
        "signal_type": signal_type,
        "description": description,
        "confidence": confidence,
        "extraction_confidence": confidence,
        "evidence_sentence": evidence,
        "article_source": source_url,
        "published_date": published_date,
        "source_url": source_url,
        "date": published_date,
        "impact_level": impact_level,
        "signal_category": signal_type,
        "sentiment": sentiment,
    }


def extract_signal_from_article(company_name: str, article: dict) -> dict:
    """Extract structured signal from one article."""
    prompt = EXTRACTION_PROMPT_TEMPLATE.format(
        company=company_name,
        source_url=article.get("url", ""),
        published_date=article.get("date", ""),
        title=article.get("title", ""),
        content=(article.get("content", "") or "")[:2600],
    )

    parsed: dict | None = None
    try:
        model_response = generate_json_completion(
            system_prompt=EXTRACTION_SYSTEM_PROMPT,
            user_prompt=prompt,
            temperature=0.1,
            max_output_tokens=512,
            timeout=120,
        )
        parsed = _parse_json(model_response)
    except Exception as exc:
        logger.warning(
            "Signal extraction via %s failed for %s article %s: %s",
            get_llm_provider(),
            company_name,
            article.get("url", ""),
            exc,
        )

    if not parsed:
        parsed = _heuristic_fallback(company_name, article)

    normalized = _to_compat_signal(parsed, article, company_name)
    return normalized
