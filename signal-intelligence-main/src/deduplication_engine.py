"""
Signal deduplication engine.

Deduplicates by:
- company
- signal_type
- semantic similarity(description)
Keeps the highest-scoring signal.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher


def _semantic_similarity(a: str, b: str) -> float:
    aa = re.sub(r"\s+", " ", (a or "").lower()).strip()
    bb = re.sub(r"\s+", " ", (b or "").lower()).strip()

    seq = SequenceMatcher(None, aa, bb).ratio()

    tokens_a = set(re.findall(r"[a-z0-9]+", aa))
    tokens_b = set(re.findall(r"[a-z0-9]+", bb))
    if not tokens_a or not tokens_b:
        return seq

    jaccard = len(tokens_a & tokens_b) / max(1, len(tokens_a | tokens_b))
    return (seq * 0.7) + (jaccard * 0.3)


def deduplicate_signals(signals: list[dict], similarity_threshold: float = 0.84) -> list[dict]:
    if not signals:
        return []

    ordered = sorted(signals, key=lambda s: float(s.get("final_score", s.get("score", 0.0))), reverse=True)
    deduped: list[dict] = []

    for candidate in ordered:
        is_duplicate = False
        for existing in deduped:
            if candidate.get("company", "").lower() != existing.get("company", "").lower():
                continue
            if candidate.get("signal_type") != existing.get("signal_type"):
                continue

            similarity = _semantic_similarity(candidate.get("description", ""), existing.get("description", ""))
            if similarity >= similarity_threshold:
                if candidate.get("source_count", 1) > existing.get("source_count", 1):
                    existing["source_count"] = candidate.get("source_count", 1)
                    existing["verification_score"] = max(
                        float(existing.get("verification_score", 0.6)),
                        float(candidate.get("verification_score", 0.6)),
                    )
                is_duplicate = True
                break

        if not is_duplicate:
            deduped.append(candidate)

    return sorted(deduped, key=lambda s: float(s.get("final_score", s.get("score", 0.0))), reverse=True)
