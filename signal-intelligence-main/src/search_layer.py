"""
Structured search layer for targeted signal discovery.

Builds signal-specific Tavily queries so we avoid broad, noisy searches.
"""

from __future__ import annotations

from typing import Dict, List


SIGNAL_SEARCH_TEMPLATES: Dict[str, List[str]] = {
    "hiring": [
        '"{company}" hiring OR "expanding team" OR "job openings"',
        '"{company}" "we are hiring" OR careers OR "open roles"',
    ],
    "funding": [
        '"{company}" raised OR "Series A" OR "Series B" OR funding',
        '"{company}" investment OR valuation OR "venture capital"',
    ],
    "expansion": [
        '"{company}" opening new office OR expansion OR "new facility"',
        '"{company}" "new market" OR "international expansion"',
    ],
    "partnership": [
        '"{company}" partnership OR collaboration OR agreement',
        '"{company}" "strategic alliance" OR "joint venture"',
    ],
    "product_launch": [
        '"{company}" launched OR "announced new product"',
        '"{company}" "new feature" OR "product update" OR "release"',
    ],
    "acquisition": [
        '"{company}" acquired OR acquisition OR merger',
        '"{company}" "M&A" OR "acquires" OR "to acquire"',
    ],
}


def build_structured_queries(company_name: str, keywords: list[str] | None = None) -> list[dict]:
    """Return de-duplicated, signal-specific search queries for a company."""
    queries: list[dict] = []
    seen: set[str] = set()

    for signal_type, templates in SIGNAL_SEARCH_TEMPLATES.items():
        for template in templates:
            base_query = template.format(company=company_name)
            query = base_query
            if keywords:
                keyword_clause = " OR ".join(f'"{kw}"' for kw in keywords[:4] if kw)
                if keyword_clause:
                    query = f"({base_query}) AND ({keyword_clause})"

            norm = query.strip().lower()
            if norm in seen:
                continue
            seen.add(norm)
            queries.append({"signal_type": signal_type, "query": query})

    return queries
