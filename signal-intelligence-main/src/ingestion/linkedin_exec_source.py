"""
LinkedIn Executive Changes data source via Tavily Search.
Searches for C-suite, director, and decision-maker role changes
at tracked companies within the last 9 months using Tavily search results.
"""

import re
import logging
import requests
from datetime import datetime
from .base import DataSource, RawArticle
from ..config import TAVILY_API_KEY

logger = logging.getLogger(__name__)

TAVILY_ENDPOINT = "https://api.tavily.com/search"

# ── Hardcoded target titles ──
_TARGET_DOMAINS = [
    r"Transportation",
    r"Logistics",
    r"Supply\s*Chain",
    r"Procurement",
    r"Strategic\s*Sourcing",
    r"Strategic\s*Planning",
    r"Continuous\s*Improvement",
    r"3PL",
    r"Third[- ]?Party\s*Vendors?",
    r"Operations?",
]

EXECUTIVE_TITLE_PATTERNS = [
    r"\b(Head(\s+of)?|VP|Vice\s*President|Director)\s+(of\s+)?("
    + "|".join(_TARGET_DOMAINS)
    + r")\b",
    r"\bChief\s+Logistics\s+Officer\b",
    r"\bCLO\b",
    r"\bCOO\b",
    r"\bChief\s+Operating\s+Officer\b",
]

_EXEC_RE = re.compile("|".join(EXECUTIVE_TITLE_PATTERNS), re.IGNORECASE)


def _is_executive_title(title: str) -> bool:
    """Return True if the title looks like a C-suite / director role."""
    return bool(_EXEC_RE.search(title))


def _parse_change_type(snippet: str) -> str:
    """Best-effort guess of joined / left / promoted from the search snippet."""
    s = snippet.lower()
    if any(kw in s for kw in ["left", "departed", "stepped down", "resigned",
                               "former", "leaving", "exits"]):
        return "left"
    if any(kw in s for kw in ["promoted", "elevated", "appointed",
                               "named", "transition"]):
        return "promoted"
    # Default assumption for LinkedIn profile updates
    return "joined"


class LinkedInExecSource(DataSource):
    """Discovers executive role changes via Tavily Search results.

    Uses Tavily Search engine with site:linkedin.com queries
    to find people who recently joined or left high-ranking roles
    at the given company.
    """

    source_name = "linkedin_exec"

    # Search query templates – {company} gets replaced
    QUERY_TEMPLATES = [
        'site:linkedin.com/in/ "{company}" ("joined" OR "started") ("VP" OR "Director" OR "Head" OR "Chief" OR "COO") ("Logistics" OR "Supply Chain" OR "Procurement" OR "Operations" OR "Transportation" OR "Sourcing")',
        'site:linkedin.com/in/ "{company}" ("left" OR "departed" OR "former") ("VP" OR "Director" OR "Head" OR "Chief" OR "COO") ("Logistics" OR "Supply Chain" OR "Procurement" OR "Operations" OR "Transportation" OR "Sourcing")',
        '"{company}" ("hire" OR "appointment" OR "departure") ("VP" OR "Director" OR "Head" OR "Chief" OR "COO") ("Logistics" OR "Supply Chain" OR "Procurement" OR "Operations") site:linkedin.com/in/',
    ]

    def __init__(self, api_key: str = None, max_results: int = 10):
        self.api_key = api_key or TAVILY_API_KEY
        self.max_results = max_results
        if not self.api_key:
            logger.warning(
                "Tavily API key not configured. LinkedInExecSource will be disabled."
            )

    def fetch(self, company_name: str, keywords: list[str] = None) -> list[RawArticle]:
        """Fetch executive changes as RawArticle objects for the LLM pipeline."""
        if not self.api_key:
            return []

        articles = []
        seen_urls: set[str] = set()

        for tpl in self.QUERY_TEMPLATES:
            query = tpl.format(company=company_name)
            try:
                response = requests.post(
                    TAVILY_ENDPOINT,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "query": query,
                        "max_results": self.max_results,
                        "include_raw_content": False,
                        "search_depth": "basic",
                        "days": 270, # approx 9 months
                    },
                    timeout=20,
                )
                if response.status_code != 200:
                    logger.warning(
                        f"Tavily returned {response.status_code} for exec query: {query}"
                    )
                    continue

                payload = response.json()
                results = payload.get("results") or payload.get("data") or []

                for item in results:
                    url = item.get("url", "")
                    if url in seen_urls:
                        continue
                    seen_urls.add(url)

                    title = item.get("title", "")
                    content_snippet = item.get("content", "")

                    # Strict company check
                    if company_name.lower() not in title.lower() and company_name.lower() not in content_snippet.lower() and company_name.lower() not in url.lower():
                        continue

                    content = (
                        f"Executive Change Detected\n"
                        f"Profile: {title}\n"
                        f"Details: {content_snippet}\n"
                        f"Company: {company_name}\n"
                        f"URL: {url}\n"
                    )

                    articles.append(
                        RawArticle(
                            title=f"[Exec] {title}",
                            url=url,
                            content=content,
                            date=item.get("published_date") or datetime.now().strftime("%Y-%m-%d"),
                            source_name=self.source_name,
                            company=company_name,
                        )
                    )

            except requests.RequestException as e:
                logger.error(f"Tavily exec search failed for '{query}': {e}")

        logger.info(
            f"LinkedIn exec search found {len(articles)} results for {company_name}"
        )
        return articles

    def fetch_structured(self, company_name: str) -> list[dict]:
        """Fetch executive changes as structured dicts for direct DB storage.

        Each dict has: person_name, title, change_type, previous_info,
        source_url, change_date.  Only high-ranking roles are returned.
        """
        if not self.api_key:
            return []

        results_list: list[dict] = []
        seen_urls: set[str] = set()

        for tpl in self.QUERY_TEMPLATES:
            query = tpl.format(company=company_name)
            try:
                response = requests.post(
                    TAVILY_ENDPOINT,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "query": query,
                        "max_results": self.max_results,
                        "include_raw_content": False,
                        "search_depth": "basic",
                        "days": 270,
                    },
                    timeout=20,
                )
                if response.status_code != 200:
                    continue

                payload = response.json()
                results = payload.get("results") or payload.get("data") or []

                for item in results:
                    url = item.get("url", "")
                    if url in seen_urls:
                        continue
                    seen_urls.add(url)

                    title_raw = item.get("title", "")
                    content_snippet = item.get("content", "")

                    # Strict company check
                    if company_name.lower() not in title_raw.lower() and company_name.lower() not in content_snippet.lower() and company_name.lower() not in url.lower():
                        continue

                    # LinkedIn titles usually look like:
                    #   "Jane Doe - Chief Technology Officer - Acme Corp | LinkedIn"
                    parts = [p.strip() for p in title_raw.split(" - ")]

                    person_name = parts[0] if parts else title_raw
                    # Remove trailing "| LinkedIn"
                    person_name = person_name.split("|")[0].strip()

                    role_title = parts[1] if len(parts) > 1 else ""
                    role_title = role_title.split("|")[0].strip()

                    # Filter: only keep executive / director-level roles
                    combined = f"{role_title} {content_snippet}"
                    if not _is_executive_title(combined):
                        continue

                    change_type = _parse_change_type(content_snippet)
                    published_date = item.get("published_date") or datetime.now().strftime("%Y-%m-%d")

                    results_list.append({
                        "person_name": person_name,
                        "title": role_title or title_raw,
                        "change_type": change_type,
                        "previous_info": content_snippet[:500],
                        "source_url": url,
                        "change_date": published_date,
                    })

            except requests.RequestException as e:
                logger.error(f"Tavily exec search failed for '{query}': {e}")

        logger.info(
            f"Tavily exec search: {len(results_list)} executive changes for {company_name}"
        )
        return results_list
