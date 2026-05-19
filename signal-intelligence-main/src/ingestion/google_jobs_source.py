"""
Google Jobs data source via Tavily Search.
Fetches executive / leadership job openings for a company.
Filters to C-suite, VP, Director, Head-of, and other senior roles only.
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
# Only these specific roles are tracked. Each entry maps to:
#   Head/VP/Director Transportation
#   Head/VP/Director Logistics  /  Chief Logistics Officer
#   Head/VP/Director Supply Chain / Procurement
#   Head/VP/Director Strategic Sourcing
#   Head/VP/Director Strategic Planning
#   Head/VP/Director Continuous Improvement
#   Head/VP/Director 3PL
#   Head/VP/Director Third-Party Vendors
#   Head/VP/Director Procurement
#   COO / Head of Operations
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

_EXEC_TITLE_PATTERNS = [
    # Head of / VP / Vice President / Director  +  domain
    r"\b(Head(\s+of)?|VP|Vice\s*President|Director)\s+(of\s+)?("
    + "|".join(_TARGET_DOMAINS)
    + r")\b",
    # Chief Logistics Officer / CLO
    r"\bChief\s+Logistics\s+Officer\b",
    r"\bCLO\b",
    # COO / Chief Operating Officer
    r"\bCOO\b",
    r"\bChief\s+Operating\s+Officer\b",
]

_EXEC_RE = re.compile("|".join(_EXEC_TITLE_PATTERNS), re.IGNORECASE)


def _is_executive_title(title: str) -> bool:
    """Return True if the title looks like a C-suite / director / leadership role."""
    return bool(_EXEC_RE.search(title))


class GoogleJobsSource(DataSource):
    """Fetches job listings via Tavily's Search API."""

    source_name = "google_jobs"

    def __init__(self, api_key: str = None, max_results: int = 5):
        self.api_key = api_key or TAVILY_API_KEY
        self.max_results = max_results
        if not self.api_key:
            logger.warning("Tavily API key not configured. GoogleJobsSource will be disabled.")

    def fetch(self, company_name: str, keywords: list[str] = None) -> list[RawArticle]:
        """Fetch executive / leadership job openings for a company from Google Jobs.

        Args:
            company_name: Name of the company to search jobs for.
            keywords: Optional keywords (unused for jobs, kept for interface compat).

        Returns:
            List of RawArticle objects representing executive-level job listings.
        """
        if not self.api_key:
            return []

        articles = []
        query = f'"{company_name}" AND ("Logistics" OR "Supply Chain" OR "Procurement" OR "Operations" OR "Transportation" OR "Sourcing") AND ("VP" OR "Director" OR "Head" OR "Chief" OR "COO") AND ("job" OR "hiring" OR "careers")'

        try:
            response = requests.post(
                TAVILY_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "query": query,
                    "max_results": self.max_results * 3, # Request more to account for non-exec filtering
                    "include_raw_content": False,
                    "search_depth": "basic",
                    "days": 14, # Recent jobs
                },
                timeout=20,
            )

            if response.status_code == 200:
                payload = response.json()
                results = payload.get("results") or payload.get("data") or []
                
                added = 0
                for item in results:
                    if added >= self.max_results:
                        break
                        
                    title = item.get("title", "")
                    content_snippet = item.get("content", "")
                    
                    # Strict company check
                    if company_name.lower() not in title.lower() and company_name.lower() not in content_snippet.lower() and company_name.lower() not in item.get("url", "").lower():
                        logger.debug(f"Skipping because company name '{company_name}' not found in result")
                        continue

                    # For Tavily, check if the title OR content snippet looks like an executive job
                    combined = f"{title} {content_snippet}"
                    if not _is_executive_title(combined):
                        logger.debug(f"Skipping non-executive or non-supply-chain job: {title}")
                        continue

                    url = item.get("url", "")
                    published_date = item.get("published_date") or datetime.now().strftime("%Y-%m-%d")

                    # Build a rich content string for downstream LLM processing
                    content = (
                        f"Job Posting Found\n"
                        f"Company: {company_name}\n"
                        f"Title Snippet: {title}\n"
                        f"Date: {published_date}\n"
                        f"URL: {url}\n\n"
                        f"{content_snippet}"
                    )

                    articles.append(
                        RawArticle(
                            title=f"[Job] {title}",
                            url=url,
                            content=content,
                            date=published_date,
                            source_name=self.source_name,
                            company=company_name,
                        )
                    )
                    added += 1
            else:
                logger.warning(f"Tavily returned {response.status_code} for jobs query: {query}")

        except requests.RequestException as e:
            logger.error(f"Tavily Jobs request failed for '{query}': {e}")

        logger.info(f"Tavily Jobs fetched {len(articles)} listings for {company_name}")
        return articles

    def fetch_structured(self, company_name: str) -> list[dict]:
        """Fetch job listings as structured dicts (for direct DB storage).

        Returns richer data than fetch() — includes location, posted_at, etc.
        as separate fields for the job_listings table.
        """
        if not self.api_key:
            return []

        jobs_data = []
        query = f'"{company_name}" AND ("Logistics" OR "Supply Chain" OR "Procurement" OR "Operations" OR "Transportation" OR "Sourcing") AND ("VP" OR "Director" OR "Head" OR "Chief" OR "COO") AND ("job" OR "hiring" OR "careers")'

        try:
            response = requests.post(
                TAVILY_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "query": query,
                    "max_results": self.max_results * 3,
                    "include_raw_content": False,
                    "search_depth": "basic",
                    "days": 14,
                },
                timeout=20,
            )

            if response.status_code == 200:
                payload = response.json()
                results = payload.get("results") or payload.get("data") or []
                
                added = 0
                for item in results:
                    if added >= self.max_results:
                        break
                        
                    title = item.get("title", "")
                    content_snippet = item.get("content", "")

                    # Strict company check
                    if company_name.lower() not in title.lower() and company_name.lower() not in content_snippet.lower() and company_name.lower() not in item.get("url", "").lower():
                        continue

                    # Skip non-executive roles
                    combined = f"{title} {content_snippet}"
                    if not _is_executive_title(combined):
                        logger.debug(f"Skipping non-executive or non-supply-chain job: {title}")
                        continue

                    url = item.get("url", "")
                    published_date = item.get("published_date") or datetime.now().strftime("%Y-%m-%d")

                    jobs_data.append({
                        "title": title[:255],
                        "company_name": company_name,
                        "location": "Unknown", # Tavily doesn't parse specific location easily
                        "description": content_snippet[:2000],
                        "url": url,
                        "date_posted": published_date,
                    })
                    added += 1
            else:
                logger.warning(f"Tavily returned {response.status_code} for jobs query: {query}")

        except requests.RequestException as e:
            logger.error(f"Tavily Jobs request failed for '{query}': {e}")

        return jobs_data
