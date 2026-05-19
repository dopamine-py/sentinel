import json
import re
import argparse
from typing import Optional
from datetime import datetime

from src.database import Database
from src.ingestion import TavilySource, RSSSource, WebSource, GoogleJobsSource, LinkedInExecSource
from src.cleaning import clean_and_normalize
from src.article_filter import filter_articles
from src.llm_extractor import extract_signals_from_content
from src.verification_engine import filter_valid_entities, apply_multi_source_verification
from src.deduplication_engine import deduplicate_signals
from src.scoring_engine import rank_signals, calculate_company_score_from_signals
from src.job_signal_detector import detect_job_posting_signals
from src.tech_stack_detector import detect_tech_stack_changes
from src.website_change_detector import detect_website_changes
from src.config import (
    ARTICLE_MIN_CHARS,
    ARTICLE_MAX_AGE_MONTHS,
    ARTICLE_MIN_COMPANY_MENTIONS,
    URL_REPROCESS_DAYS,
    DEBUG_DISABLE_URL_FILTER,
    PIPELINE_MIN_ARTICLES_TO_LLM,
)


def clean_company_name(raw_name: str) -> str:
    name = raw_name.split("\t")[0]
    name = re.sub(r"\s+\S+\.\S{2,6}$", "", name.strip())
    return " ".join(name.split())


def parse_keywords(value):
    if value is None:
        return []
    if isinstance(value, list):
        return [str(k).strip() for k in value if str(k).strip()]
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return []
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(k).strip() for k in parsed if str(k).strip()]
        except Exception:
            pass
        return [v.strip() for v in value.split(",") if v.strip()]
    return []


def _pick_company(companies: list[dict], target: Optional[str]) -> dict:
    if not companies:
        return {}

    if target:
        target_l = target.lower().strip()
        for company in companies:
            name = clean_company_name(company.get("name", ""))
            if name.lower() == target_l:
                return company
        for company in companies:
            name = clean_company_name(company.get("name", ""))
            if target_l in name.lower():
                return company

        return {}

    return companies[0]


def run_probe(
    target_company: Optional[str] = None,
    debug_disable_url_filter: Optional[bool] = None,
    reprocess_days: Optional[int] = None,
) -> dict:
    report = {
        "status": "error",
        "message": "unknown",
    }

    try:
        if debug_disable_url_filter is None:
            debug_disable_url_filter = DEBUG_DISABLE_URL_FILTER
        if reprocess_days is None:
            reprocess_days = URL_REPROCESS_DAYS

        db = Database()
        companies = db.fetch_companies()
        if not companies:
            return {
                "status": "error",
                "message": "No companies found in DB. Add one company first.",
            }

        company = _pick_company(companies, target_company)
        if not company:
            return {
                "status": "error",
                "message": f"Tracked company not found: {target_company}" if target_company else "No company available for probing.",
            }

        company_id = company["id"]
        company_name = clean_company_name(company.get("name", ""))
        domain = (company.get("domain") or "").strip()
        keywords = parse_keywords(company.get("tracking_keywords"))
        owner_uid = company.get("user_id")

        ingestion_counts = {}
        ingestion_errors = []
        all_articles = []
        structured_jobs_list = []
        exec_changes_list = []

        tavily = TavilySource()
        rss = RSSSource()
        web = WebSource()
        google_jobs = GoogleJobsSource()
        linkedin_exec = LinkedInExecSource()

        def safe_fetch(label, fn):
            try:
                data = fn()
                ingestion_counts[label] = len(data)
                return data
            except Exception as exc:
                ingestion_counts[label] = 0
                ingestion_errors.append(f"{label}: {exc}")
                return []

        all_articles.extend(safe_fetch("tavily_articles", lambda: tavily.fetch(company_name, keywords)))
        all_articles.extend(safe_fetch("rss_articles", lambda: rss.fetch(company_name, keywords, feed_urls=[])))
        if domain:
            all_articles.extend(safe_fetch("web_articles", lambda: web.fetch(company_name, keywords, domain=domain)))
        else:
            ingestion_counts["web_articles"] = 0

        all_articles.extend(safe_fetch("google_jobs_articles", lambda: google_jobs.fetch(company_name)))
        structured_jobs_list.extend(safe_fetch("google_jobs_structured", lambda: google_jobs.fetch_structured(company_name)))

        all_articles.extend(safe_fetch("linkedin_exec_articles", lambda: linkedin_exec.fetch(company_name)))
        linkedin_structured = safe_fetch("linkedin_exec_structured", lambda: linkedin_exec.fetch_structured(company_name))
        today = datetime.utcnow().strftime("%Y-%m-%d")
        for item in linkedin_structured:
            item["change_date"] = item.get("change_date") or today
        exec_changes_list.extend(linkedin_structured)

        recent_jobs_before_insert = []
        if structured_jobs_list:
            try:
                recent_jobs_before_insert = db.fetch_job_listings(company_id=company_id, limit=120)
            except Exception:
                recent_jobs_before_insert = []

        jobs_inserted, jobs_skipped = 0, 0
        if structured_jobs_list:
            jobs_inserted, jobs_skipped = db.insert_job_listings_bulk(company_id, structured_jobs_list, user_id=owner_uid)

        exec_inserted, exec_skipped = 0, 0
        if exec_changes_list:
            exec_inserted, exec_skipped = db.insert_executive_changes_bulk(company_id, exec_changes_list, user_id=owner_uid)

        cleaned = clean_and_normalize(all_articles)

        candidate_urls = [a.get("url") for a in cleaned if a.get("url")]
        url_processing_times = db.get_url_processing_times_for_company(company_id, candidate_urls)
        existing_urls = db.get_existing_urls_for_company(
            company_id,
            candidate_urls,
            reprocess_after_days=reprocess_days,
            disable_filter=debug_disable_url_filter,
        )
        cleaned_after_url = [a for a in cleaned if not a.get("url") or a.get("url") not in existing_urls]

        forced_url_passthrough = 0
        if cleaned and not cleaned_after_url and PIPELINE_MIN_ARTICLES_TO_LLM > 0:
            ranked_oldest_first = sorted(
                cleaned,
                key=lambda article: url_processing_times.get(article.get("url", ""), datetime.min),
            )
            forced_pool = ranked_oldest_first[:PIPELINE_MIN_ARTICLES_TO_LLM]
            for article in forced_pool:
                article["_forced_url_reprocess"] = True
            cleaned_after_url = forced_pool
            forced_url_passthrough = len(forced_pool)

        prefiltered, filter_stats = filter_articles(
            company_name,
            cleaned_after_url,
            min_chars=ARTICLE_MIN_CHARS,
            max_age_months=ARTICLE_MAX_AGE_MONTHS,
            min_company_mentions=ARTICLE_MIN_COMPANY_MENTIONS,
            ensure_min_kept=PIPELINE_MIN_ARTICLES_TO_LLM,
        )

        content_ids = []
        for article in prefiltered:
            content_id = db.insert_raw_content(
                company_id=company_id,
                source=article.get("source", ""),
                source_url=article.get("url", ""),
                date=article.get("date", today),
                raw_text=article.get("content", ""),
                user_id=owner_uid,
                reprocess_after_days=reprocess_days,
            )
            if content_id:
                content_ids.append(content_id)

        llm_signals = extract_signals_from_content(company_name, prefiltered)

        advanced = {}
        job_signals = detect_job_posting_signals(company_name, structured_jobs_list, recent_jobs=recent_jobs_before_insert)
        advanced["job_posting"] = len(job_signals)

        tech_signals = []
        website_signals = []
        if domain:
            tech_signals = detect_tech_stack_changes(company_name, domain)
            website_signals = detect_website_changes(company_name, domain)
        advanced["tech_stack_change"] = len(tech_signals)
        advanced["website_change"] = len(website_signals)

        signals = list(llm_signals) + job_signals + tech_signals + website_signals

        validated = filter_valid_entities(signals, tracked_company=company_name, tracked_domain=domain)
        verified = apply_multi_source_verification(validated)
        ranked = rank_signals(verified)
        final_signals = deduplicate_signals(ranked)

        persisted_inserted = 0
        for signal in final_signals:
            inserted = db.insert_signal(
                company_id=company_id,
                signal_type=signal.get("signal_type", "unknown"),
                description=signal.get("description", ""),
                impact=signal.get("impact_level", "medium"),
                confidence=signal.get("extraction_confidence", signal.get("confidence", 0.5)),
                score=signal.get("score", 0.0),
                source_url=signal.get("article_source", signal.get("source_url", "")),
                extracted_from=content_ids[0] if content_ids else None,
                date=signal.get("published_date", signal.get("date", today)),
                sentiment=signal.get("sentiment", "neutral"),
                user_id=owner_uid,
                reprocess_after_days=reprocess_days,
            )
            if inserted:
                persisted_inserted += 1

        company_total, signal_count = calculate_company_score_from_signals(final_signals)
        db.upsert_daily_score(company_id, today, company_total, signal_count, user_id=owner_uid)

        top_preview = [
            {
                "signal_type": s.get("signal_type"),
                "score": s.get("score"),
                "impact": s.get("impact_level"),
                "description": (s.get("description") or "")[:160],
            }
            for s in final_signals[:5]
        ]

        report = {
            "status": "success",
            "company": {
                "id": company_id,
                "name": company_name,
                "domain": domain,
            },
            "filters": {
                "article_min_chars": ARTICLE_MIN_CHARS,
                "article_max_age_months": ARTICLE_MAX_AGE_MONTHS,
                "article_min_company_mentions": ARTICLE_MIN_COMPANY_MENTIONS,
                "url_reprocess_days": reprocess_days,
                "debug_disable_url_filter": debug_disable_url_filter,
                "pipeline_min_articles_to_llm": PIPELINE_MIN_ARTICLES_TO_LLM,
            },
            "ingestion": {
                "counts": ingestion_counts,
                "total_articles_ingested": len(all_articles),
                "jobs_structured": len(structured_jobs_list),
                "exec_structured": len(exec_changes_list),
                "jobs_inserted": jobs_inserted,
                "jobs_skipped": jobs_skipped,
                "exec_inserted": exec_inserted,
                "exec_skipped": exec_skipped,
                "errors": ingestion_errors,
            },
            "quality_funnel": {
                "articles_cleaned_after_dedup": len(cleaned),
                "articles_skipped_existing_url": len(existing_urls),
                "articles_forced_url_passthrough": forced_url_passthrough,
                "articles_after_url_filter": len(cleaned_after_url),
                "articles_after_prefilter": len(prefiltered),
                "prefilter_stats": filter_stats,
                "raw_content_inserted": len(content_ids),
                "raw_content_skipped": max(0, len(prefiltered) - len(content_ids)),
                "llm_signals_extracted": len(llm_signals),
                "advanced_detector_signals": advanced,
                "signals_before_validation": len(signals),
                "signals_after_entity_validation": len(validated),
                "signals_after_verification": len(verified),
                "signals_after_ranking": len(ranked),
                "signals_after_dedup": len(final_signals),
                "signals_persisted_inserted": persisted_inserted,
                "signals_persisted_skipped": max(0, len(final_signals) - persisted_inserted),
            },
            "scoring": {
                "company_score": company_total,
                "signal_count_for_score": signal_count,
                "score_date": today,
            },
            "top_signal_preview": top_preview,
        }
    except Exception as exc:
        report = {
            "status": "error",
            "message": str(exc),
        }

    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run one-company relaxed-filter probe")
    parser.add_argument("--company", default="OpenAI", help="Company name to target (exact or partial match)")
    parser.add_argument(
        "--debug-disable-url-filter",
        action="store_true",
        help="Bypass URL recency filtering for diagnostics",
    )
    parser.add_argument(
        "--reprocess-days",
        type=int,
        default=URL_REPROCESS_DAYS,
        help="Allow URL/content/signal reprocessing when last processed is older than this many days",
    )
    args = parser.parse_args()

    output = run_probe(
        target_company=args.company,
        debug_disable_url_filter=args.debug_disable_url_filter,
        reprocess_days=args.reprocess_days,
    )
    print(json.dumps(output, indent=2, ensure_ascii=False))
