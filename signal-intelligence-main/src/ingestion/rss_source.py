"""
RSS Feed data source.
Reads RSS/Atom feeds for company blogs, press releases, and industry news.
"""

import logging
import feedparser
from .base import DataSource, RawArticle

logger = logging.getLogger(__name__)


class RSSSource(DataSource):
    """Fetches articles from configured RSS/Atom feeds."""

    source_name = "rss"

    def fetch(self, company_name: str, keywords: list[str] = None,
              feed_urls: list[str] = None) -> list[RawArticle]:
        if not feed_urls:
            return []

        articles = []
        for url in feed_urls:
            try:
                feed = feedparser.parse(url)
                if feed.bozo:
                    logger.warning(f"RSS parse error for {url}: {feed.bozo_exception}")

                for entry in feed.entries[:10]:  # Cap at 10 per feed
                    # Extract content — try content field, then summary
                    content = ""
                    if hasattr(entry, "content") and entry.content:
                        content = entry.content[0].get("value", "")
                    elif hasattr(entry, "summary"):
                        content = entry.summary or ""

                    # Extract date
                    date = ""
                    if hasattr(entry, "published"):
                        date = entry.published
                    elif hasattr(entry, "updated"):
                        date = entry.updated

                    articles.append(
                        RawArticle(
                            title=getattr(entry, "title", ""),
                            url=getattr(entry, "link", ""),
                            content=content,
                            date=date,
                            source_name=self.source_name,
                            company=company_name,
                        )
                    )

            except Exception as e:
                logger.error(f"RSS fetch failed for {url}: {e}")

        logger.info(f"RSS fetched {len(articles)} articles for {company_name}")
        return articles
