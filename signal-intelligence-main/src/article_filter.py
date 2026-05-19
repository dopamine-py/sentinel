"""
Fast article pre-filtering before LLM calls.

Rejects low-quality results using:
- min content length
- recency
- company mention count
- duplicate content
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timedelta
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from dateutil import parser as dateparser

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


def _parse_date_safe(date_str: str) -> datetime:
    if not date_str:
        return datetime.utcnow()
    try:
        parsed = dateparser.parse(date_str, fuzzy=True)
        if parsed is None:
            return datetime.utcnow()
        return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed
    except Exception:
        return datetime.utcnow()


def _mention_count(company_name: str, text: str) -> int:
    if not company_name:
        return 0
    exact = len(re.findall(re.escape(company_name), text, flags=re.IGNORECASE))
    if exact > 0:
        return exact

    normalized_company = re.sub(r"[^a-z0-9]+", " ", company_name.lower()).strip()
    normalized_text = re.sub(r"[^a-z0-9]+", " ", text.lower())
    return len(re.findall(re.escape(normalized_company), normalized_text))


def _content_fingerprint(title: str, content: str) -> str:
    normalized = re.sub(r"\s+", " ", f"{title} {content}".lower()).strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _canonical_url(url: str) -> str:
    raw = (url or "").strip()
    if not raw:
        return ""
    try:
        parsed = urlparse(raw)
        scheme = parsed.scheme.lower() if parsed.scheme else "https"
        netloc = parsed.netloc.lower().replace("www.", "")
        path = parsed.path.rstrip("/") or "/"
        query = urlencode(
            [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=False) if k.lower() not in _TRACKING_QUERY_PARAMS],
            doseq=True,
        )
        return urlunparse((scheme, netloc, path, "", query, ""))
    except Exception:
        return raw


def _record_rejection(stats: dict, reason_key: str, article: dict, sample_limit: int = 12, details: str = ""):
    stats[reason_key] += 1
    if len(stats["rejection_samples"]) < sample_limit:
        stats["rejection_samples"].append({
            "reason": reason_key,
            "title": (article.get("title") or "")[:120],
            "url": (article.get("url") or "")[:200],
            "details": details,
        })
    logger.debug(
        "Prefilter rejected (%s): title=%s url=%s details=%s",
        reason_key,
        (article.get("title") or "")[:120],
        article.get("url") or "",
        details,
    )


def _fallback_rank(company_name: str, article: dict) -> tuple[int, int, float]:
    title = (article.get("title") or "").strip()
    content = (article.get("content") or "").strip()
    text = f"{title}\n{content}"
    mentions = _mention_count(company_name, text)
    text_len = len(content or title)
    published = _parse_date_safe(article.get("date") or "")
    return mentions, text_len, published.timestamp()


def filter_articles(
    company_name: str,
    articles: list[dict],
    min_chars: int = 300,
    max_age_months: int = 12,
    min_company_mentions: int = 2,
    ensure_min_kept: int = 1,
) -> tuple[list[dict], dict]:
    """Filter noisy articles before relevance/extraction LLM stages."""
    cutoff = datetime.utcnow() - timedelta(days=max_age_months * 30)
    filtered: list[dict] = []
    seen_url_keys: set[str] = set()
    seen_no_url_hashes: set[str] = set()

    stats = {
        "input": len(articles),
        "kept": 0,
        "forced_kept": 0,
        "rejected_short": 0,
        "rejected_old": 0,
        "rejected_mentions": 0,
        "rejected_duplicate": 0,
        "rejected_duplicate_url": 0,
        "rejected_duplicate_no_url": 0,
        "fallback_applied": False,
        "rejection_samples": [],
    }

    for article in articles:
        title = (article.get("title") or "").strip()
        content = (article.get("content") or "").strip()
        date_str = (article.get("date") or "").strip()
        url = _canonical_url(article.get("url", ""))
        article["url"] = url

        if url:
            if url in seen_url_keys:
                _record_rejection(stats, "rejected_duplicate_url", article, details="duplicate normalized URL")
                continue
            seen_url_keys.add(url)
        else:
            no_url_fingerprint = _content_fingerprint(title, content)
            if no_url_fingerprint in seen_no_url_hashes:
                _record_rejection(stats, "rejected_duplicate_no_url", article, details="duplicate URL-less fingerprint")
                continue
            seen_no_url_hashes.add(no_url_fingerprint)

        effective_text = content or title
        effective_min_chars = min_chars
        if article.get("content_from_title") and title:
            effective_min_chars = max(40, min(min_chars, 90))

        if len(effective_text) < effective_min_chars:
            _record_rejection(
                stats,
                "rejected_short",
                article,
                details=f"len={len(effective_text)} < min={effective_min_chars}",
            )
            continue

        published_dt = _parse_date_safe(date_str)
        if published_dt < cutoff:
            _record_rejection(
                stats,
                "rejected_old",
                article,
                details=f"published={published_dt.strftime('%Y-%m-%d')} cutoff={cutoff.strftime('%Y-%m-%d')}",
            )
            continue

        combined_text = f"{title}\n{effective_text}"
        mentions = _mention_count(company_name, combined_text)
        if mentions < min_company_mentions:
            _record_rejection(
                stats,
                "rejected_mentions",
                article,
                details=f"mentions={mentions} < min={min_company_mentions}",
            )
            continue

        article["date"] = published_dt.strftime("%Y-%m-%d")
        filtered.append(article)

    if not filtered and articles and ensure_min_kept > 0:
        ranked = sorted(articles, key=lambda article: _fallback_rank(company_name, article), reverse=True)
        fallback_urls: set[str] = set()
        forced: list[dict] = []

        for article in ranked:
            canonical_url = _canonical_url(article.get("url", ""))
            if canonical_url and canonical_url in fallback_urls:
                continue
            article["url"] = canonical_url
            article["date"] = _parse_date_safe((article.get("date") or "").strip()).strftime("%Y-%m-%d")
            article["_prefilter_forced_keep"] = True
            forced.append(article)
            if canonical_url:
                fallback_urls.add(canonical_url)
            if len(forced) >= ensure_min_kept:
                break

        if forced:
            filtered.extend(forced)
            stats["forced_kept"] = len(forced)
            stats["fallback_applied"] = True
            logger.warning(
                "Pre-filter would drop all %d articles for %s; forcing %d article(s) through for safety.",
                len(articles),
                company_name,
                len(forced),
            )

    stats["rejected_duplicate"] = stats["rejected_duplicate_url"] + stats["rejected_duplicate_no_url"]
    stats["kept"] = len(filtered)
    logger.info("Article pre-filter stats for %s: %s", company_name, stats)
    return filtered, stats
