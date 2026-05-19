"""
Backward-compatible scoring API.

Delegates to the new multi-factor scoring engine.
"""

from .scoring_engine import calculate_company_score_from_signals, compute_final_signal_score


def calculate_signal_score(signal: dict) -> float:
    """Legacy wrapper returning the multi-factor score on a 0-100 scale."""
    return round(compute_final_signal_score(signal) * 100, 2)


def calculate_company_score(signals: list[dict]) -> tuple[float, int]:
    """Legacy wrapper for company-level score calculation."""
    return calculate_company_score_from_signals(signals)


def rank_companies(company_scores: dict[str, tuple[float, int]]) -> list[dict]:
    ranked = [
        {
            "name": name,
            "score": score,
            "signal_count": count,
        }
        for name, (score, count) in company_scores.items()
    ]
    ranked.sort(key=lambda x: x["score"], reverse=True)
    for i, entry in enumerate(ranked, 1):
        entry["rank"] = i
    return ranked
