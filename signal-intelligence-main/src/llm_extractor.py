"""
Two-stage LLM extraction orchestrator.

Stage 1: relevance classifier
Stage 2: structured signal extractor
"""

import logging

from .relevance_classifier import (
    RELEVANCE_PROMPT_TEMPLATE,
    RELEVANCE_SYSTEM_PROMPT,
    classify_relevance,
)
from .signal_extractor import (
    EXTRACTION_PROMPT_TEMPLATE,
    EXTRACTION_SYSTEM_PROMPT,
    extract_signal_from_article,
)

logger = logging.getLogger(__name__)


SYSTEM_PROMPT_RELEVANCE = RELEVANCE_SYSTEM_PROMPT
SYSTEM_PROMPT_EXTRACTION = EXTRACTION_SYSTEM_PROMPT
RELEVANCE_PROMPT = RELEVANCE_PROMPT_TEMPLATE
EXTRACTION_PROMPT = EXTRACTION_PROMPT_TEMPLATE


def extract_signals_from_content(company: str, articles: list[dict]) -> list[dict]:
    """Two-stage extraction pipeline (article-level)."""
    if not articles:
        return []

    capped_articles = articles[:25]
    signals: list[dict] = []
    relevant_count = 0

    for article in capped_articles:
        relevance = classify_relevance(company, article)
        if not relevance.get("relevant", False):
            continue

        relevant_count += 1
        extracted = extract_signal_from_article(company, article)
        if not extracted:
            continue
        if extracted.get("signal_type") == "none":
            continue
        if not extracted.get("description"):
            continue

        extracted["relevance_method"] = relevance.get("method", "unknown")
        extracted["relevance_confidence"] = relevance.get("confidence", 0.5)
        signals.append(extracted)

    logger.info(
        "Two-stage extraction for %s: considered=%d relevant=%d extracted=%d",
        company,
        len(capped_articles),
        relevant_count,
        len(signals),
    )
    return signals
