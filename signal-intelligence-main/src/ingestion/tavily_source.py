"""
Tavily News Search data source.
Uses the Tavily API to search for company-related news and articles.
"""

import time
import logging
import requests
from .base import DataSource, RawArticle
from ..config import TAVILY_API_KEY, SEARCH_QUERY_TEMPLATES
from ..search_layer import build_structured_queries

logger = logging.getLogger(__name__)


class TavilySource(DataSource):
    """Fetches news articles via the Tavily Search API."""

    source_name = "tavily"

    def __init__(self, api_key: str = None):
        self.api_key = api_key or TAVILY_API_KEY
        if not self.api_key:
            logger.warning("Tavily API key not configured. TavilySource will be disabled.")

    def fetch(self, company_name: str, keywords: list[str] = None) -> list[RawArticle]:
        if not self.api_key:
            return []

        articles = []
        query_specs = build_structured_queries(company_name, keywords)
        if not query_specs:
            query_specs = [{"signal_type": "general", "query": tpl.format(company=company_name)} for tpl in SEARCH_QUERY_TEMPLATES]

        for spec in query_specs:
            query = spec["query"]
            signal_hint = spec.get("signal_type", "general")
            try:
                response = requests.post(
                    "https://api.tavily.com/search",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "query": query,
                        "max_results": 5,
                        "include_raw_content": True,
                        "days": 365,
                    },
                    timeout=15,
                )

                if response.status_code == 200:
                    payload = response.json()
                    results = payload.get("results") or payload.get("data") or []
                    for r in results:
                        title = r.get("title", "")
                        content = (
                            r.get("content", "")
                            or r.get("raw_content", "")
                            or r.get("snippet", "")
                            or ""
                        )
                        url = r.get("url", "")

                        # Strict company check
                        if company_name.lower() not in title.lower() and company_name.lower() not in content.lower() and company_name.lower() not in url.lower():
                            logger.debug(f"Skipping Tavily article because '{company_name}' not found: {title}")
                            continue

                        fallback_text = content or title
                        content_with_hint = (
                            f"Signal intent: {signal_hint}\n{fallback_text}"
                            if fallback_text
                            else f"Signal intent: {signal_hint}"
                        )

                        articles.append(
                            RawArticle(
                                title=title,
                                url=url,
                                content=content_with_hint,
                                date=r.get("published_date", ""),
                                source_name=self.source_name,
                                company=company_name,
                            )
                        )
                else:
                    logger.warning(
                        f"Tavily returned {response.status_code} for query: {query}"
                    )

            except requests.RequestException as e:
                logger.error(f"Tavily request failed for '{query}': {e}")

            time.sleep(1)  # Rate limiting

        logger.info(f"Tavily fetched {len(articles)} articles for {company_name}")
        return articles
