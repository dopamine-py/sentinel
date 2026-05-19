"""
Content Cleaning & Normalization Layer.
Processes raw articles before sending to the LLM.
"""

import re
import hashlib
import logging
from html import unescape
from datetime import datetime
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from dateutil import parser as dateparser
from .config import CLEAN_CONTENT_MAX_CHARS

logger = logging.getLogger(__name__)

_TRACKING_QUERY_PARAMS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "fbclid",
    "mc_cid",
    "mc_eid",
}


def clean_html(text: str) -> str:
    """Remove all HTML tags and decode HTML entities."""
    if not text:
        return ""
    # Remove HTML tags
    text = re.sub(r"<[^>]+>", " ", text)
    # Decode HTML entities
    text = unescape(text)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def safe_truncate(text: str, max_chars: int = CLEAN_CONTENT_MAX_CHARS) -> str:
    """Safely truncate long content without cutting in the middle of a word."""
    if not text:
        return ""
    if max_chars <= 0 or len(text) <= max_chars:
        return text
    head = text[:max_chars]
    truncated = head.rsplit(" ", 1)[0].strip()
    return truncated or head.strip()


def normalize_url(url: str) -> str:
    """Canonicalize URLs to improve URL-first deduplication accuracy."""
    raw = (url or "").strip()
    if not raw:
        return ""

    try:
        parsed = urlparse(raw)
        scheme = parsed.scheme.lower() if parsed.scheme else "https"
        netloc = parsed.netloc.lower().replace("www.", "")
        path = parsed.path.rstrip("/") or "/"

        filtered_query = []
        for key, value in parse_qsl(parsed.query, keep_blank_values=False):
            if key.lower() not in _TRACKING_QUERY_PARAMS:
                filtered_query.append((key, value))
        query = urlencode(filtered_query, doseq=True)

        normalized = urlunparse((scheme, netloc, path, "", query, ""))
        return normalized
    except Exception:
        return raw


def normalize_date(date_str: str) -> str:
    """Parse various date formats and return ISO 8601 (YYYY-MM-DD)."""
    if not date_str:
        return datetime.now().strftime("%Y-%m-%d")
    try:
        parsed = dateparser.parse(date_str, fuzzy=True)
        return parsed.strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return datetime.now().strftime("%Y-%m-%d")


def content_hash(text: str) -> str:
    """Generate SHA-256 hash for deduplication."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def deduplicate_articles(articles: list[dict], seen_hashes: set = None) -> list[dict]:
    """Deduplicate primarily by normalized URL, fallback to content for URL-less rows."""
    if seen_hashes is None:
        seen_hashes = set()

    seen_urls: set[str] = set()
    by_url_index: dict[str, int] = {}
    unique: list[dict] = []
    merged_url_duplicates = 0
    dropped_no_url_duplicates = 0

    for article in articles:
        normalized_url = normalize_url(article.get("url", ""))
        article["url"] = normalized_url

        if normalized_url:
            if normalized_url in seen_urls:
                merged_url_duplicates += 1
                existing_idx = by_url_index.get(normalized_url)
                if existing_idx is not None:
                    existing = unique[existing_idx]

                    existing_sources = set(existing.get("sources") or [])
                    if existing.get("source"):
                        existing_sources.add(existing["source"])
                    if article.get("source"):
                        existing_sources.add(article["source"])
                    if existing_sources:
                        existing["sources"] = sorted(s for s in existing_sources if s)

                    if len(article.get("content", "")) > len(existing.get("content", "")):
                        existing["content"] = article.get("content", "")
                        if article.get("title"):
                            existing["title"] = article.get("title", "")
                        if article.get("date"):
                            existing["date"] = article.get("date", "")
                logger.debug("Merged duplicate URL article: %s", normalized_url)
                continue

            seen_urls.add(normalized_url)
            by_url_index[normalized_url] = len(unique)
            unique.append(article)
            continue

        fallback_hash = content_hash(
            f"{article.get('title', '').strip().lower()}|{article.get('content', '').strip().lower()}"
        )
        if fallback_hash in seen_hashes:
            dropped_no_url_duplicates += 1
            logger.debug("Dropped duplicate URL-less article: %s", article.get("title", "")[:80])
            continue

        seen_hashes.add(fallback_hash)
        unique.append(article)

    logger.info(
        "Article dedup summary: input=%d unique=%d merged_url_duplicates=%d dropped_no_url_duplicates=%d",
        len(articles),
        len(unique),
        merged_url_duplicates,
        dropped_no_url_duplicates,
    )
    return unique


def to_structured_object(article) -> dict:
    """Convert a RawArticle (or dict) to a clean structured object for LLM input."""
    if hasattr(article, "__dict__"):
        title = clean_html(getattr(article, "title", "") or "")
        raw_content = (
            getattr(article, "content", "")
            or getattr(article, "raw_content", "")
            or getattr(article, "snippet", "")
            or ""
        )
        content = clean_html(raw_content)
        content_from_title = False
        if not content and title:
            content = title
            content_from_title = True
        content = safe_truncate(content)

        # Convert dataclass to dict
        data = {
            "company": article.company,
            "source": article.source_name,
            "url": normalize_url(article.url),
            "type": "news",
            "date": normalize_date(article.date),
            "title": title,
            "content": content,
            "content_from_title": content_from_title,
        }
    else:
        title = clean_html(article.get("title", ""))
        raw_content = (
            article.get("content", "")
            or article.get("raw_content", "")
            or article.get("snippet", "")
            or article.get("summary", "")
            or ""
        )
        content = clean_html(raw_content)
        content_from_title = False
        if not content and title:
            content = title
            content_from_title = True
        content = safe_truncate(content)

        data = {
            "company": article.get("company", ""),
            "source": article.get("source_name", article.get("source", "")),
            "url": normalize_url(article.get("url", "")),
            "type": article.get("type", "news"),
            "date": normalize_date(article.get("date", "")),
            "title": title,
            "content": content,
            "content_from_title": content_from_title,
        }
    return data


def clean_and_normalize(articles) -> list[dict]:
    """Full cleaning pipeline: clean, normalize, deduplicate."""
    structured = [to_structured_object(a) for a in articles]

    # Preserve title-only articles (content may be a title fallback).
    before_nonempty = len(structured)
    structured = [a for a in structured if a.get("content") or a.get("title")]
    dropped_empty = before_nonempty - len(structured)

    # Deduplicate
    structured = deduplicate_articles(structured)

    logger.info(
        "Cleaning funnel: input=%d after_nonempty=%d dropped_empty=%d after_dedup=%d",
        len(articles),
        before_nonempty - dropped_empty,
        dropped_empty,
        len(structured),
    )
    return structured
