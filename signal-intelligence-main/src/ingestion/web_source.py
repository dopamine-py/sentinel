"""
Company Website/Blog data source.
Scrapes public blog and press pages to find recent articles.
Respects robots.txt.
"""

import logging
import urllib.robotparser
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup
from .base import DataSource, RawArticle

logger = logging.getLogger(__name__)


class WebSource(DataSource):
    """Fetches articles from company blog/press pages."""

    source_name = "web"

    BLOG_PATHS = ["/blog", "/press", "/newsroom", "/news", "/press-releases"]

    def _check_robots(self, base_url: str, target_url: str) -> bool:
        """Respect robots.txt before scraping."""
        try:
            rp = urllib.robotparser.RobotFileParser()
            rp.set_url(urljoin(base_url, "/robots.txt"))
            rp.read()
            return rp.can_fetch("*", target_url)
        except Exception:
            return True  # If we can't read robots.txt, assume allowed

    def fetch(self, company_name: str, keywords: list[str] = None,
              domain: str = None) -> list[RawArticle]:
        if not domain:
            return []

        base_url = f"https://{domain}"
        articles = []

        for path in self.BLOG_PATHS:
            page_url = urljoin(base_url, path)

            if not self._check_robots(base_url, page_url):
                logger.info(f"Robots.txt disallows: {page_url}")
                continue

            try:
                resp = requests.get(
                    page_url,
                    headers={"User-Agent": "SignalIntel/1.0 (corporate-intelligence)"},
                    timeout=10,
                    allow_redirects=True,
                )
                if resp.status_code != 200:
                    continue

                soup = BeautifulSoup(resp.text, "lxml")

                # Find article links
                links = set()
                for a in soup.find_all("a", href=True):
                    href = a["href"]
                    full = urljoin(page_url, href)
                    parsed = urlparse(full)
                    # Only links on the same domain
                    if domain in parsed.netloc and len(parsed.path) > len(path) + 1:
                        links.add(full)

                # Fetch each article (cap at 5 per path)
                for link in list(links)[:5]:
                    try:
                        art_resp = requests.get(
                            link,
                            headers={"User-Agent": "SignalIntel/1.0"},
                            timeout=10,
                        )
                        if art_resp.status_code != 200:
                            continue
                        art_soup = BeautifulSoup(art_resp.text, "lxml")

                        # Extract title
                        title = ""
                        if art_soup.title:
                            title = art_soup.title.string or ""

                        # Extract main text content
                        for tag in art_soup(["script", "style", "nav", "footer", "header"]):
                            tag.decompose()
                        text = art_soup.get_text(separator=" ", strip=True)
                        # Truncate to reasonable length
                        text = text[:3000]

                        articles.append(
                            RawArticle(
                                title=title.strip(),
                                url=link,
                                content=text,
                                date="",
                                source_name=self.source_name,
                                company=company_name,
                            )
                        )
                    except Exception as e:
                        logger.debug(f"Failed to fetch article {link}: {e}")

            except requests.RequestException as e:
                logger.debug(f"WebSource: Could not reach {page_url}: {e}")

        logger.info(f"Web fetched {len(articles)} articles for {company_name}")
        return articles
