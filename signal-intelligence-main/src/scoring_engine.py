"""
Multi-factor signal scoring and ranking engine.
"""

from __future__ import annotations

from datetime import datetime


def freshness_score(published_date: str) -> float:
    """Bucketized freshness scoring.

    0–1 days  -> 1.0
    2–3 days  -> 0.9
    4–7 days  -> 0.8
    8–30 days -> 0.6
    30+ days  -> 0.4
    """
    if not published_date:
        return 0.4

    try:
        sig_dt = datetime.strptime(published_date[:10], "%Y-%m-%d")
    except Exception:
        return 0.4

    days_old = max(0, (datetime.utcnow() - sig_dt).days)
    if days_old <= 1:
        return 1.0
    if days_old <= 3:
        return 0.9
    if days_old <= 7:
        return 0.8
    if days_old <= 30:
        return 0.6
    return 0.4


def _derive_impact_level(final_score: float) -> str:
    if final_score >= 0.75:
        return "high"
    if final_score >= 0.5:
        return "medium"
    return "low"


def compute_final_signal_score(signal: dict) -> float:
    extraction_confidence = float(signal.get("extraction_confidence", signal.get("confidence", 0.5)))
    source_authority = float(signal.get("source_authority", 0.5))
    verification = float(signal.get("verification_score", 0.6))
    freshness = freshness_score(signal.get("published_date") or signal.get("date") or "")

    final = (
        0.4 * extraction_confidence
        + 0.2 * source_authority
        + 0.2 * freshness
        + 0.2 * verification
    )
    return round(max(0.0, min(1.0, final)), 4)


def rank_signals(signals: list[dict]) -> list[dict]:
    ranked: list[dict] = []
    for signal in signals:
        final = compute_final_signal_score(signal)
        signal["freshness_score"] = freshness_score(signal.get("published_date") or signal.get("date") or "")
        signal["final_score"] = final
        signal["score"] = round(final * 100, 2)
        signal["impact_level"] = signal.get("impact_level") or _derive_impact_level(final)
        ranked.append(signal)

    ranked.sort(key=lambda s: float(s.get("final_score", 0.0)), reverse=True)
    return ranked


def calculate_company_score_from_signals(signals: list[dict]) -> tuple[float, int]:
    if not signals:
        return (0.0, 0)

    final_scores = [float(s.get("final_score", 0.0)) for s in signals]
    avg_quality = sum(final_scores) / len(final_scores)
    volume_factor = min(1.0, len(final_scores) / 8.0)

    company_score = ((avg_quality * 0.8) + (volume_factor * 0.2)) * 100
    return (round(company_score, 1), len(final_scores))
