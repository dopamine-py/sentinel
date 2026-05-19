"""
Pipeline Orchestrator.
Ties all layers together: Ingestion → Cleaning → LLM Extraction → Scoring → DB → Email.
"""

import logging
from datetime import datetime
import concurrent.futures
from .config import (
    RAW_CONTENT_RETENTION_DAYS,
    SIGNAL_RETENTION_DAYS,
    JOB_RETENTION_DAYS,
    ARTICLE_MIN_CHARS,
    ARTICLE_MAX_AGE_MONTHS,
    ARTICLE_MIN_COMPANY_MENTIONS,
    URL_REPROCESS_DAYS,
    DEBUG_DISABLE_URL_FILTER,
    PIPELINE_MIN_ARTICLES_TO_LLM,
)
from .database import Database
from .ingestion import TavilySource, RSSSource, WebSource, GoogleJobsSource, LinkedInExecSource
from .cleaning import clean_and_normalize
from .article_filter import filter_articles
from .llm_extractor import extract_signals_from_content
from .verification_engine import filter_valid_entities, apply_multi_source_verification
from .deduplication_engine import deduplicate_signals
from .scoring_engine import rank_signals, calculate_company_score_from_signals
from .job_signal_detector import detect_job_posting_signals
from .tech_stack_detector import detect_tech_stack_changes
from .website_change_detector import detect_website_changes
from .email_generator import generate_email_html, send_email

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

# Pipeline progress tracking (global, thread-safe reads)
_pipeline_progress = {
    "current_step": 0,
    "total_steps": 0,
    "step_name": "",
    "company": "",
    "message": "Idle",
    "companies_done": 0,
    "companies_total": 0,
}


def get_pipeline_progress() -> dict:
    """Return a snapshot of current pipeline progress."""
    return dict(_pipeline_progress)


def _update_progress(step: int, total: int, step_name: str, company: str = "", message: str = ""):
    _pipeline_progress["current_step"] = step
    _pipeline_progress["total_steps"] = total
    _pipeline_progress["step_name"] = step_name
    _pipeline_progress["company"] = company
    _pipeline_progress["message"] = message


import re as _re

def _clean_company_name(raw_name: str) -> str:
    """Strip tab-appended domains and stray domain fragments from a company name.

    Examples:
        "Concept Machine\\tconceptmachine.com" -> "Concept Machine"
        "Acme Corp  acmecorp.io"               -> "Acme Corp"
        "  FedEx  "                            -> "FedEx"
    """
    # 1. Split on tab characters — domain is always after the tab
    name = raw_name.split("\t")[0]
    # 2. Remove domain-like tokens (word.tld)
    name = _re.sub(r"\s+\S+\.\S{2,6}$", "", name.strip())
    # 3. Collapse whitespace
    return " ".join(name.split())


def run_pipeline():
    """Execute the full signal intelligence pipeline."""
    logger.info("=" * 60)
    logger.info("SIGNAL INTELLIGENCE PIPELINE — Starting")
    logger.info("=" * 60)

    db = Database()
    today = datetime.now().strftime("%Y-%m-%d")

    # Determine owner user_id from companies (for single-tenant use)
    all_company_rows = db.fetch_companies()
    owner_user_id = None
    for row in all_company_rows:
        if row.get("user_id"):
            owner_user_id = row["user_id"]
            break

    # Start audit log entry
    run_id = db.start_pipeline_run(user_id=owner_user_id)
    pipeline_errors = []
    total_signals_found = 0

    # Initialize data sources
    sources = {
        "tavily": TavilySource(),
        "rss": RSSSource(),
        "web": WebSource(),
    }
    google_jobs = GoogleJobsSource()
    linkedin_exec = LinkedInExecSource()

    company_scores = {}

    # Load companies from the database (single source of truth)
    import json
    all_companies = []
    for row in db.fetch_companies():
        kw = []
        try:
            kw = json.loads(row.get("tracking_keywords") or "[]")
        except (json.JSONDecodeError, TypeError):
            pass
        all_companies.append({
            "id": row["id"],
            "name": row["name"],
            "domain": row.get("domain", ""),
            "industry": row.get("industry", ""),
            "keywords": kw,
            "rss_feeds": [],
            "user_id": row.get("user_id"),
        })

    total_companies = len(all_companies)
    _pipeline_progress["companies_total"] = total_companies

    for ci, company_cfg in enumerate(all_companies):
        company_name = _clean_company_name(company_cfg["name"])  # clean name for search queries
        company_id = company_cfg["id"]  # use existing DB id directly
        domain = company_cfg.get("domain", "")
        industry = company_cfg.get("industry", "")
        keywords = company_cfg.get("keywords", [])
        rss_feeds = company_cfg.get("rss_feeds", [])
        owner_uid = company_cfg.get("user_id")  # propagate to child records

        _pipeline_progress["companies_done"] = ci
        _update_progress(1, 10, "Ingesting data", company_name, f"Processing {company_name} ({ci+1}/{total_companies})")
        logger.info(f"\n--- Processing: {company_name} (id={company_id}) ---")

        # Step 2: Multi-source data ingestion (Parallel)
        all_articles = []
        structured_jobs_list = []
        exec_changes_list = []
        recent_jobs_before_insert = []
        
        def fetch_tavily():
            try:
                return sources["tavily"].fetch(company_name, keywords)
            except Exception as e:
                logger.error(f"Tavily failed for {company_name}: {e}")
                pipeline_errors.append(f"Tavily/{company_name}: {e}")
                return []
                
        def fetch_rss():
            if not rss_feeds: return []
            try:
                return sources["rss"].fetch(company_name, keywords, feed_urls=rss_feeds)
            except Exception as e:
                logger.error(f"RSS failed for {company_name}: {e}")
                pipeline_errors.append(f"RSS/{company_name}: {e}")
                return []
                
        def fetch_web():
            if not domain: return []
            try:
                return sources["web"].fetch(company_name, keywords, domain=domain)
            except Exception as e:
                logger.error(f"Web scrape failed for {company_name}: {e}")
                pipeline_errors.append(f"Web/{company_name}: {e}")
                return []
                
        def fetch_jobs():
            try:
                art = google_jobs.fetch(company_name)
                jobs = google_jobs.fetch_structured(company_name)
                structured_jobs_list.extend(jobs)
                return art
            except Exception as e:
                logger.error(f"Google Jobs failed for {company_name}: {e}")
                pipeline_errors.append(f"GoogleJobs/{company_name}: {e}")
                return []
                
        def fetch_linkedin():
            try:
                art = linkedin_exec.fetch(company_name)
                exc = linkedin_exec.fetch_structured(company_name)
                for e in exc: e["change_date"] = e.get("change_date") or today
                exec_changes_list.extend(exc)
                return art
            except Exception as e:
                logger.error(f"LinkedIn exec search failed for {company_name}: {e}")
                pipeline_errors.append(f"LinkedIn/{company_name}: {e}")
                return []

        # Run fetchers concurrently
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [
                executor.submit(fetch_tavily),
                executor.submit(fetch_rss),
                executor.submit(fetch_web),
                executor.submit(fetch_jobs),
                executor.submit(fetch_linkedin),
            ]
            for future in concurrent.futures.as_completed(futures):
                all_articles.extend(future.result())

        if structured_jobs_list:
            try:
                recent_jobs_before_insert = db.fetch_job_listings(company_id=company_id, limit=120)
            except Exception:
                recent_jobs_before_insert = []

        # Bulk insert structured data
        if structured_jobs_list:
            ins, skip = db.insert_job_listings_bulk(company_id, structured_jobs_list, user_id=owner_uid)
            logger.info(f"  Stored {ins} job listings ({skip} skipped)")
            
        if exec_changes_list:
            ins, skip = db.insert_executive_changes_bulk(company_id, exec_changes_list, user_id=owner_uid)
            logger.info(f"  Stored {ins} executive changes ({skip} skipped)")

        logger.info(f"  Ingested {len(all_articles)} raw articles total")

        # Step 3: Clean and pre-filter articles before any LLM calls
        prefiltered: list[dict] = []
        if all_articles:
            _update_progress(3, 10, "Cleaning data", company_name, f"Cleaning {len(all_articles)} articles")
            cleaned = clean_and_normalize(all_articles)

            # URL-level recency filter: allow reprocessing if URL is old enough.
            candidate_urls = [a.get("url") for a in cleaned if a.get("url")]
            url_processing_times = db.get_url_processing_times_for_company(company_id, candidate_urls)
            recently_processed_urls = db.get_existing_urls_for_company(
                company_id,
                candidate_urls,
                reprocess_after_days=URL_REPROCESS_DAYS,
                disable_filter=DEBUG_DISABLE_URL_FILTER,
            )
            cleaned_after_url = [a for a in cleaned if not a.get("url") or a.get("url") not in recently_processed_urls]

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
                logger.warning(
                    "  URL recency filtering removed all cleaned articles for %s; forced %d article(s) through.",
                    company_name,
                    forced_url_passthrough,
                )

            logger.info(
                "  URL filter stats: candidates=%d blocked_recent=%d kept=%d reprocess_days=%d debug_bypass=%s forced_passthrough=%d",
                len(candidate_urls),
                len(recently_processed_urls),
                len(cleaned_after_url),
                URL_REPROCESS_DAYS,
                DEBUG_DISABLE_URL_FILTER,
                forced_url_passthrough,
            )

            prefiltered, filter_stats = filter_articles(
                company_name,
                cleaned_after_url,
                min_chars=ARTICLE_MIN_CHARS,
                max_age_months=ARTICLE_MAX_AGE_MONTHS,
                min_company_mentions=ARTICLE_MIN_COMPANY_MENTIONS,
                ensure_min_kept=PIPELINE_MIN_ARTICLES_TO_LLM,
            )
            logger.info(
                "  After pre-filtering: %d articles (stats=%s)",
                len(prefiltered),
                filter_stats,
            )
        else:
            logger.warning("  No article content found from ingestion sources; proceeding with advanced detectors.")

        # Step 4: Store raw content
        _update_progress(4, 10, "Storing content", company_name, f"Persisting {len(prefiltered)} filtered articles")
        content_ids = []
        for article in prefiltered:
            content_id = db.insert_raw_content(
                company_id=company_id,
                source=article.get("source", ""),
                source_url=article.get("url", ""),
                date=article.get("date", today),
                raw_text=article.get("content", ""),
                user_id=owner_uid,
                reprocess_after_days=URL_REPROCESS_DAYS,
            )
            if content_id:
                content_ids.append(content_id)
        logger.info(f"  Stored {len(content_ids)} new content items")

        # Step 5: Two-stage LLM pipeline (relevance -> extraction)
        _update_progress(5, 10, "LLM pipeline", company_name, f"Running relevance + extraction for {company_name}")
        signals = extract_signals_from_content(company_name, prefiltered)
        logger.info(f"  Extracted {len(signals)} article signals via two-stage LLM")

        # Step 6: Advanced signal detectors
        _update_progress(6, 10, "Advanced detectors", company_name, "Detecting job, tech stack, and website changes")
        advanced_signals = []
        try:
            advanced_signals.extend(
                detect_job_posting_signals(
                    company_name,
                    structured_jobs_list,
                    recent_jobs=recent_jobs_before_insert,
                )
            )
        except Exception as e:
            logger.error(f"Job signal detector failed for {company_name}: {e}")
            pipeline_errors.append(f"JobDetector/{company_name}: {e}")

        try:
            advanced_signals.extend(detect_tech_stack_changes(company_name, domain))
        except Exception as e:
            logger.error(f"Tech stack detector failed for {company_name}: {e}")
            pipeline_errors.append(f"TechDetector/{company_name}: {e}")

        try:
            advanced_signals.extend(detect_website_changes(company_name, domain))
        except Exception as e:
            logger.error(f"Website change detector failed for {company_name}: {e}")
            pipeline_errors.append(f"WebsiteDetector/{company_name}: {e}")

        if advanced_signals:
            logger.info(f"  Advanced detectors produced {len(advanced_signals)} additional signals")
        signals.extend(advanced_signals)

        # Step 7: Entity validation, multi-source verification, ranking, dedup
        _update_progress(7, 10, "Verification & ranking", company_name, "Validating entities and scoring signals")
        signals = filter_valid_entities(signals, tracked_company=company_name, tracked_domain=domain)
        signals = apply_multi_source_verification(signals)
        signals = rank_signals(signals)
        signals = deduplicate_signals(signals)
        logger.info(f"  After validation/ranking/dedup: {len(signals)} final signals")

        # Step 8: Store final ranked signals
        _update_progress(8, 10, "Persisting signals", company_name, f"Writing {len(signals)} signals to DB")
        for signal in signals:
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
                reprocess_after_days=URL_REPROCESS_DAYS,
            )
            if inserted:
                total_signals_found += 1

        # Step 9: Calculate and store daily company score
        company_total, signal_count = calculate_company_score_from_signals(signals)
        db.upsert_daily_score(company_id, today, company_total, signal_count, user_id=owner_uid)
        company_scores[company_name] = (company_total, signal_count)

        logger.info(f"  Company Score: {company_total}/100 ({signal_count} signals)")

    _pipeline_progress["companies_done"] = total_companies

    # Step 10: Generate and send daily email
    _update_progress(9, 10, "Generating report", "", "Compiling intelligence report...")
    logger.info("\n--- Generating Intelligence Report ---")

    top_movers = db.get_top_movers(today, limit=10)
    high_impact = db.get_high_impact_signals(today)
    watchlist = db.get_activity_spikes(today)
    quiet = db.get_quiet_companies(today)
    exec_changes = db.fetch_executive_changes(limit=15)

    email_html = generate_email_html(
        top_movers=top_movers,
        high_impact_signals=high_impact,
        watchlist=watchlist,
        quiet_companies=quiet,
        executive_changes=exec_changes,
        date=today,
    )

    send_email(email_html)

    # Step 9: Finalize audit log
    db.finish_pipeline_run(
        run_id=run_id,
        companies_processed=total_companies,
        signals_found=total_signals_found,
        errors=pipeline_errors,
        status="success" if not pipeline_errors else "success",
    )

    # Step 10: Data retention cleanup
    from .config import RAW_CONTENT_RETENTION_DAYS, SIGNAL_RETENTION_DAYS, JOB_RETENTION_DAYS
    try:
        cleanup = db.run_retention_cleanup(
            raw_days=RAW_CONTENT_RETENTION_DAYS,
            signal_days=SIGNAL_RETENTION_DAYS,
            job_days=JOB_RETENTION_DAYS,
        )
        logger.info(f"Retention cleanup: {cleanup}")
    except Exception as e:
        logger.error(f"Retention cleanup failed: {e}")

    logger.info("=" * 60)
    logger.info("PIPELINE COMPLETE")
    logger.info("=" * 60)

    _update_progress(10, 10, "Complete", "", "Pipeline finished successfully")
    _pipeline_progress["current_step"] = 0
    _pipeline_progress["total_steps"] = 0
    _pipeline_progress["step_name"] = ""
    _pipeline_progress["company"] = ""
    _pipeline_progress["message"] = "Idle"

    return company_scores


if __name__ == "__main__":
    run_pipeline()
