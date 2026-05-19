"""
Job posting signal detector.

Detects hiring-related sales signals:
- rapid hiring increases
- new department hiring
- executive hiring
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime
import re

_EXEC_RE = re.compile(r"\b(chief|vp|vice president|head|director|cxo|coo|cto|cfo)\b", re.IGNORECASE)

_DEPARTMENT_PATTERNS = {
    "engineering": re.compile(r"\b(engineer|engineering|developer|software|platform|devops)\b", re.IGNORECASE),
    "sales": re.compile(r"\b(sales|account executive|business development|sdr|bdr)\b", re.IGNORECASE),
    "marketing": re.compile(r"\b(marketing|growth|demand generation|content)\b", re.IGNORECASE),
    "operations": re.compile(r"\b(operations|logistics|supply chain|procurement)\b", re.IGNORECASE),
    "product": re.compile(r"\b(product manager|product|ux|ui|design)\b", re.IGNORECASE),
    "data": re.compile(r"\b(data|analytics|ml|ai|scientist)\b", re.IGNORECASE),
}


def _detect_department(title: str) -> str:
    for department, pattern in _DEPARTMENT_PATTERNS.items():
        if pattern.search(title or ""):
            return department
    return "other"


def _build_signal(
    company_name: str,
    description: str,
    evidence: str,
    confidence: float,
    source_url: str,
    signal_category: str,
) -> dict:
    today = datetime.utcnow().strftime("%Y-%m-%d")
    return {
        "company": company_name,
        "signal_type": "hiring",
        "description": description,
        "confidence": confidence,
        "extraction_confidence": confidence,
        "evidence_sentence": evidence,
        "article_source": source_url,
        "published_date": today,
        "source_url": source_url,
        "date": today,
        "impact_level": "medium",
        "signal_category": signal_category,
        "sentiment": "positive",
    }


def detect_job_posting_signals(company_name: str, new_jobs: list[dict], recent_jobs: list[dict] | None = None) -> list[dict]:
    if not new_jobs:
        return []

    recent_jobs = recent_jobs or []
    signals: list[dict] = []

    new_titles = [j.get("title", "") for j in new_jobs if j.get("title")]
    recent_titles = [j.get("title", "") for j in recent_jobs if j.get("title")]

    new_count = len(new_titles)
    recent_count = len(recent_titles)
    baseline = max(1, int(recent_count / 4))

    if new_count >= 8 or (new_count >= 4 and new_count >= baseline * 1.5):
        sample = "; ".join(new_titles[:3])
        signals.append(
            _build_signal(
                company_name=company_name,
                description=f"Hiring velocity increased with {new_count} newly detected openings.",
                evidence=f"Recent openings include: {sample}",
                confidence=0.78,
                source_url=(new_jobs[0].get("url", "") if new_jobs else ""),
                signal_category="mass_hiring",
            )
        )

    current_departments = Counter(_detect_department(title) for title in new_titles)
    historical_departments = set(_detect_department(title) for title in recent_titles)
    newly_seen_departments = [d for d in current_departments if d not in historical_departments and d != "other"]

    if newly_seen_departments:
        dep = newly_seen_departments[0]
        examples = [t for t in new_titles if _detect_department(t) == dep][:2]
        signals.append(
            _build_signal(
                company_name=company_name,
                description=f"New hiring demand detected in {dep} roles.",
                evidence=f"Representative roles: {'; '.join(examples)}",
                confidence=0.72,
                source_url=(new_jobs[0].get("url", "") if new_jobs else ""),
                signal_category="job_opening",
            )
        )

    executive_titles = [title for title in new_titles if _EXEC_RE.search(title or "")]
    if len(executive_titles) >= 2:
        signals.append(
            _build_signal(
                company_name=company_name,
                description="Executive-level hiring detected, indicating strategic growth initiatives.",
                evidence=f"Executive openings include: {'; '.join(executive_titles[:3])}",
                confidence=0.82,
                source_url=(new_jobs[0].get("url", "") if new_jobs else ""),
                signal_category="executive_hire",
            )
        )

    return signals
