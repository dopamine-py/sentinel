"""
Database layer for the Signal Intelligence Engine.
Uses Supabase (PostgreSQL) as the backend via the supabase-py client.
Tables: companies, raw_content, signals, daily_scores, job_listings,
executive_changes, pipeline_runs, company_tags, notes.
"""

import json
import hashlib
import logging
import time
from datetime import datetime, timedelta
from supabase import create_client, Client
from .config import SUPABASE_URL, SUPABASE_SERVICE_KEY, URL_REPROCESS_DAYS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class Database:
    """Supabase-backed database layer. Drop-in replacement for the old SQLite class."""

    def __init__(self):
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
        self.client: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        logger.info("Supabase client initialized.")

    def _reset_client(self):
        """Recreate the Supabase client after transient transport failures."""
        self.client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    @staticmethod
    def _is_transient_transport_error(exc: Exception) -> bool:
        msg = str(exc).lower()
        transient_markers = [
            "readerror",
            "resource temporarily unavailable",
            "connection reset",
            "connection aborted",
            "server disconnected",
            "timed out",
            "timeout",
            "eof",
        ]
        return any(marker in msg for marker in transient_markers)

    def _execute_with_retry(self, query_builder, operation: str, retries: int = 2):
        """
        Execute a Supabase query with small retries for transient network issues.

        query_builder must be a zero-arg callable that returns a fresh query object.
        """
        last_exc: Exception | None = None
        for attempt in range(retries + 1):
            try:
                return query_builder().execute()
            except Exception as exc:
                last_exc = exc
                is_retryable = self._is_transient_transport_error(exc)
                if not is_retryable or attempt >= retries:
                    raise

                logger.warning(
                    "Transient Supabase error during %s (attempt %s/%s): %s",
                    operation,
                    attempt + 1,
                    retries + 1,
                    exc,
                )
                try:
                    self._reset_client()
                except Exception as reset_exc:
                    logger.warning("Failed to reset Supabase client: %s", reset_exc)

                time.sleep(min(0.25 * (2 ** attempt), 1.0))

        if last_exc:
            raise last_exc

        raise RuntimeError(f"{operation} failed without exception")

    @staticmethod
    def _hash_content(text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    @staticmethod
    def _now_iso() -> str:
        return datetime.utcnow().isoformat()

    @staticmethod
    def _parse_iso_datetime(value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return dt.replace(tzinfo=None)
        except Exception:
            return None

    @staticmethod
    def _clean_display_name(raw: str) -> str:
        """Strip tab+domain suffixes from company names for display."""
        import re
        name = raw.split("\t")[0]
        name = re.sub(r"\s+\S+\.\S{2,6}$", "", name.strip())
        return " ".join(name.split())

    def _clean_rows(self, rows: list[dict], name_key: str = "company_name") -> list[dict]:
        """Clean company name fields in query result rows."""
        for r in rows:
            if r.get(name_key):
                r[name_key] = self._clean_display_name(r[name_key])
            if r.get("name"):
                r["name"] = self._clean_display_name(r["name"])
        return rows

    # ── Companies ──

    def get_or_create_company(self, name: str, domain: str = None,
                               industry: str = None, keywords: list = None) -> int:
        kw_json = json.dumps(keywords) if keywords else "[]"
        resp = self.client.table("companies").select("id").eq("name", name).limit(1).execute()
        if resp.data:
            return resp.data[0]["id"]
        resp = self.client.table("companies").insert({
            "name": name, "domain": domain or "", "industry": industry or "",
            "tracking_keywords": kw_json,
        }).execute()
        return resp.data[0]["id"]

    def fetch_companies(self) -> list[dict]:
        rows = self.client.table("companies").select("*").order("name").execute().data or []
        return self._clean_rows(rows)

    def fetch_company_by_id(self, company_id: int) -> dict | None:
        resp = self.client.table("companies").select("*").eq("id", company_id).limit(1).execute()
        if resp.data:
            row = resp.data[0]
            if row.get("name"):
                row["name"] = self._clean_display_name(row["name"])
            return row
        return None

    def update_company(self, company_id: int, name: str = None, domain: str = None,
                       industry: str = None, keywords: list = None) -> bool:
        updates = {}
        if name is not None:
            updates["name"] = name
        if domain is not None:
            updates["domain"] = domain
        if industry is not None:
            updates["industry"] = industry
        if keywords is not None:
            updates["tracking_keywords"] = json.dumps(keywords)
        if not updates:
            return False
        resp = self.client.table("companies").update(updates).eq("id", company_id).execute()
        return bool(resp.data)

    def delete_company(self, company_id: int) -> bool:
        for table in ["signals", "raw_content", "daily_scores",
                      "job_listings", "executive_changes", "company_tags", "notes"]:
            self.client.table(table).delete().eq("company_id", company_id).execute()
        resp = self.client.table("companies").delete().eq("id", company_id).execute()
        return bool(resp.data)

    def fetch_company_stats(self, company_id: int) -> dict:
        signal_resp = self.client.table("signals").select("id", count="exact").eq("company_id", company_id).execute()
        high_resp = self.client.table("signals").select("id", count="exact").eq("company_id", company_id).eq("impact", "high").execute()
        job_resp = self.client.table("job_listings").select("id", count="exact").eq("company_id", company_id).execute()
        exec_resp = self.client.table("executive_changes").select("id", count="exact").eq("company_id", company_id).execute()
        score_resp = self.client.table("daily_scores").select("total_score, date").eq("company_id", company_id).order("date", desc=True).limit(1).execute()
        latest = score_resp.data[0] if score_resp.data else {"total_score": 0, "date": None}
        return {
            "signal_count": signal_resp.count or 0,
            "high_impact_count": high_resp.count or 0,
            "job_count": job_resp.count or 0,
            "exec_change_count": exec_resp.count or 0,
            "latest_score": latest.get("total_score", 0),
            "latest_score_date": latest.get("date"),
        }

    # ── Raw Content ──

    def insert_raw_content(self, company_id: int, source: str, source_url: str,
                           date: str, raw_text: str, user_id: str = None,
                           reprocess_after_days: int = URL_REPROCESS_DAYS) -> int | None:
        normalized_source_url = (source_url or "").strip()
        hash_basis = (
            f"{company_id}|{normalized_source_url}"
            if normalized_source_url
            else f"{company_id}|{(raw_text or '')[:3000]}"
        )
        content_hash = self._hash_content(hash_basis)

        recent_cutoff = datetime.utcnow() - timedelta(days=max(0, reprocess_after_days))
        dup_query = self.client.table("raw_content").select("id, created_at")
        if normalized_source_url:
            dup_query = dup_query.eq("company_id", company_id).eq("source_url", normalized_source_url)
        else:
            dup_query = dup_query.eq("company_id", company_id).eq("content_hash", content_hash)

        dup = dup_query.order("created_at", desc=True).limit(1).execute()
        if dup.data:
            existing_id = dup.data[0]["id"]
            created_at = self._parse_iso_datetime(dup.data[0].get("created_at"))
            if reprocess_after_days is None:
                logger.debug(f"Duplicate content skipped (no reprocessing window): {normalized_source_url}")
                return None
            if reprocess_after_days > 0 and created_at and created_at >= recent_cutoff:
                logger.debug(
                    "Recently processed raw content skipped: %s (window=%sd)",
                    normalized_source_url,
                    reprocess_after_days,
                )
                return None

            refresh_payload = {
                "source": source,
                "source_url": normalized_source_url,
                "date": date,
                "raw_text": raw_text,
            }

            try:
                refresh_payload["created_at"] = self._now_iso()
                self.client.table("raw_content").update(refresh_payload).eq("id", existing_id).execute()
                logger.debug("Refreshed existing raw content row for URL reprocessing: %s", normalized_source_url)
                return existing_id
            except Exception:
                try:
                    refresh_payload.pop("created_at", None)
                    self.client.table("raw_content").update(refresh_payload).eq("id", existing_id).execute()
                except Exception:
                    pass
                return existing_id

        row = {
            "company_id": company_id, "source": source, "source_url": normalized_source_url,
            "date": date, "raw_text": raw_text, "content_hash": content_hash,
        }
        resp = self.client.table("raw_content").insert(row).execute()
        return resp.data[0]["id"] if resp.data else None

    def fetch_raw_content(self, company_id: int = None, limit: int = 100) -> list[dict]:
        q = self.client.table("raw_content").select("*").order("date", desc=True).limit(limit)
        if company_id:
            q = q.eq("company_id", company_id)
        return q.execute().data or []

    def get_url_processing_times_for_company(self, company_id: int, urls: list[str]) -> dict[str, datetime]:
        """Return latest processing timestamp for each URL for this company."""
        if not urls:
            return {}
        valid_urls = [u for u in urls if u]
        if not valid_urls:
            return {}

        resp = (
            self.client
            .table("raw_content")
            .select("source_url, created_at")
            .eq("company_id", company_id)
            .in_("source_url", valid_urls)
            .execute()
        )

        latest_by_url: dict[str, datetime] = {}
        for row in (resp.data or []):
            url = row.get("source_url")
            if not url:
                continue
            created_at = self._parse_iso_datetime(row.get("created_at"))
            if not created_at:
                continue
            existing = latest_by_url.get(url)
            if existing is None or created_at > existing:
                latest_by_url[url] = created_at

        return latest_by_url

    def get_existing_urls_for_company(
        self,
        company_id: int,
        urls: list[str],
        reprocess_after_days: int | None = None,
        disable_filter: bool = False,
    ) -> set[str]:
        if disable_filter:
            return set()

        latest_by_url = self.get_url_processing_times_for_company(company_id, urls)
        if not latest_by_url:
            return set()

        if reprocess_after_days is None:
            return set(latest_by_url.keys())
        if reprocess_after_days <= 0:
            return set()

        recent_cutoff = datetime.utcnow() - timedelta(days=reprocess_after_days)
        return {url for url, processed_at in latest_by_url.items() if processed_at >= recent_cutoff}

    # ── Signals ──

    def insert_signal(self, company_id: int, signal_type: str, description: str,
                      impact: str, confidence: float, score: float,
                      source_url: str = None, extracted_from: int = None,
                      date: str = None, sentiment: str = "neutral",
                      user_id: str = None,
                      reprocess_after_days: int = URL_REPROCESS_DAYS) -> int | None:
        content_hash = self._hash_content(f"{company_id}|{signal_type}|{description[:200]}")

        dup = (
            self.client
            .table("signals")
            .select("id, created_at")
            .eq("company_id", company_id)
            .eq("content_hash", content_hash)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if dup.data:
            created_at = self._parse_iso_datetime(dup.data[0].get("created_at"))
            if reprocess_after_days is None:
                logger.debug(f"Duplicate signal skipped (no reprocessing window): {description[:60]}")
                return None
            if reprocess_after_days > 0 and created_at:
                recent_cutoff = datetime.utcnow() - timedelta(days=reprocess_after_days)
                if created_at >= recent_cutoff:
                    logger.debug(
                        "Recently persisted signal skipped: %s (window=%sd)",
                        description[:60],
                        reprocess_after_days,
                    )
                    return None

        row = {
            "company_id": company_id, "signal_type": signal_type, "description": description,
            "impact": impact, "confidence": confidence, "score": score,
            "source_url": source_url or "", "date": date, "sentiment": sentiment,
            "content_hash": content_hash,
        }
        if extracted_from is not None:
            row["extracted_from"] = extracted_from
        if user_id:
            row["user_id"] = user_id
        resp = self.client.table("signals").insert(row).execute()
        return resp.data[0]["id"] if resp.data else None

    def fetch_signals(self, company_id: int = None, signal_type: str = None,
                      impact: str = None, limit: int = 200) -> list[dict]:
        q = self.client.table("signals").select("*, companies(name)").order("score", desc=True).order("date", desc=True).limit(limit)
        if company_id:
            q = q.eq("company_id", company_id)
        if signal_type:
            q = q.eq("signal_type", signal_type)
        if impact:
            q = q.eq("impact", impact)
        rows = q.execute().data or []
        for r in rows:
            comp = r.pop("companies", None)
            r["company_name"] = comp["name"] if comp else ""
        return rows

    # ── Daily Scores ──

    def upsert_daily_score(self, company_id: int, date: str,
                           total_score: float, signal_count: int,
                           user_id: str = None):
        row = {
            "company_id": company_id, "date": date,
            "total_score": total_score, "signal_count": signal_count,
        }
        if user_id:
            row["user_id"] = user_id
        self.client.table("daily_scores").upsert(row, on_conflict="company_id,date").execute()

    def fetch_daily_scores(self, date: str = None, limit: int = 50) -> list[dict]:
        q = self.client.table("daily_scores").select("*, companies(name)").order("total_score", desc=True).limit(limit)
        if date:
            q = q.eq("date", date)
        rows = q.execute().data or []
        for r in rows:
            comp = r.pop("companies", None)
            r["company_name"] = comp["name"] if comp else ""
        return rows

    def fetch_daily_scores_range(self, company_id: int, days: int = 7) -> list[dict]:
        return self.client.table("daily_scores").select("*").eq("company_id", company_id).order("date", desc=True).limit(days).execute().data or []

    # ── Analytics ──

    def get_top_movers(self, date: str, limit: int = 10) -> list[dict]:
        today_resp = self.client.table("daily_scores").select("*, companies(name)").eq("date", date).order("total_score", desc=True).execute()
        movers = []
        for r in (today_resp.data or []):
            comp = r.pop("companies", None)
            r["company_name"] = comp["name"] if comp else ""
            prev_resp = self.client.table("daily_scores").select("total_score, date").eq("company_id", r["company_id"]).lt("date", date).order("date", desc=True).limit(1).execute()
            current = r["total_score"] or 0
            if prev_resp.data:
                prev = prev_resp.data[0]["total_score"] or 0
                r["prev_score"] = prev
                r["prev_date"] = prev_resp.data[0]["date"]
                r["score_change"] = round(current - prev, 1)
                r["change_pct"] = round(((current - prev) / prev * 100) if prev > 0 else 0, 1)
            else:
                r["prev_score"] = 0.0
                r["prev_date"] = None
                r["score_change"] = round(current, 1)
                r["change_pct"] = 100.0 if current > 0 else 0.0
            movers.append(r)
        movers.sort(key=lambda x: abs(x.get("score_change", 0)), reverse=True)
        return movers[:limit]

    def get_high_impact_signals(self, date: str = None, limit: int = 20) -> list[dict]:
        return self.fetch_signals(impact="high", limit=limit)

    def get_activity_spikes(self, date: str, threshold: float = 1.5) -> list[dict]:
        today_resp = self.client.table("daily_scores").select("*, companies(name)").eq("date", date).execute()
        spikes = []
        for r in (today_resp.data or []):
            comp = r.pop("companies", None)
            r["company_name"] = self._clean_display_name(comp["name"]) if comp else ""
            hist = self.client.table("daily_scores").select("total_score").eq("company_id", r["company_id"]).lt("date", date).order("date", desc=True).limit(7).execute()
            scores = [h["total_score"] for h in (hist.data or []) if h.get("total_score")]
            avg = sum(scores) / len(scores) if scores else 0
            today_score = r.get("total_score", 0)
            if avg > 0 and today_score > avg * threshold:
                r["today_score"] = today_score
                r["avg_score"] = round(avg, 2)
                r["spike_ratio"] = round(today_score / avg, 2)
                spikes.append(r)
        return sorted(spikes, key=lambda x: x.get("spike_ratio", 0), reverse=True)

    def get_quiet_companies(self, date: str, threshold: float = 5.0) -> list[dict]:
        resp = self.client.table("daily_scores").select("*, companies(name)").eq("date", date).lt("total_score", threshold).order("total_score").execute()
        rows = resp.data or []
        for r in rows:
            comp = r.pop("companies", None)
            r["company_name"] = comp["name"] if comp else ""
        return rows

    # ── Job Listings ──

    def insert_job_listing(self, company_id: int, title: str, company_name: str,
                           location: str, description: str, url: str,
                           date_posted: str, user_id: str = None) -> int | None:
        content_hash = self._hash_content(f"{title}|{company_name}|{location}")
        dup = self.client.table("job_listings").select("id").eq("content_hash", content_hash).limit(1).execute()
        if dup.data:
            return None
        row = {
            "company_id": company_id, "title": title, "company_name": company_name,
            "location": location, "description": description, "url": url,
            "date_posted": date_posted, "content_hash": content_hash,
        }
        if user_id:
            row["user_id"] = user_id
        resp = self.client.table("job_listings").insert(row).execute()
        return resp.data[0]["id"] if resp.data else None

    def insert_job_listings_bulk(self, company_id: int, jobs: list[dict],
                                  user_id: str = None) -> tuple[int, int]:
        if not jobs:
            return 0, 0
        unique_jobs = {}
        for jd in jobs:
            h = self._hash_content(f"{jd['title']}|{jd['company_name']}|{jd['location']}")
            jd["_hash"] = h
            unique_jobs[h] = jd
        hashes = list(unique_jobs.keys())
        existing_resp = self.client.table("job_listings").select("content_hash").in_("content_hash", hashes).execute()
        existing_hashes = {r["content_hash"] for r in (existing_resp.data or [])}
        to_insert = []
        skipped = 0
        for h, jd in unique_jobs.items():
            if h in existing_hashes:
                skipped += 1
            else:
                row = {
                    "company_id": company_id, "title": jd["title"], "company_name": jd["company_name"],
                    "location": jd["location"], "description": jd["description"], "url": jd["url"],
                    "date_posted": jd["date_posted"], "content_hash": h,
                }
                if user_id:
                    row["user_id"] = user_id
                to_insert.append(row)
        inserted = 0
        if to_insert:
            resp = self.client.table("job_listings").insert(to_insert).execute()
            inserted = len(resp.data) if resp.data else 0
        return inserted, skipped

    def fetch_job_listings(self, company_id: int = None, limit: int = 25) -> list[dict]:
        def _query():
            q = self.client.table("job_listings").select("*, companies(name)").order("detected_on", desc=True).limit(limit)
            if company_id:
                q = q.eq("company_id", company_id)
            return q

        rows = self._execute_with_retry(_query, operation="fetch_job_listings").data or []
        for r in rows:
            comp = r.pop("companies", None)
            r["tracked_company"] = self._clean_display_name(comp["name"]) if comp else ""
        return rows

    # ── Executive Changes ──

    def insert_executive_change(self, company_id: int, person_name: str,
                                 title: str, change_type: str,
                                 previous_info: str = None,
                                 source_url: str = None,
                                 change_date: str = None,
                                 user_id: str = None) -> int | None:
        content_hash = self._hash_content(f"{person_name}|{title}|{change_type}")
        dup = self.client.table("executive_changes").select("id").eq("content_hash", content_hash).limit(1).execute()
        if dup.data:
            return None
        row = {
            "company_id": company_id, "person_name": person_name, "title": title,
            "change_type": change_type, "previous_info": previous_info or "",
            "source_url": source_url or "", "change_date": change_date or "",
            "content_hash": content_hash,
        }
        if user_id:
            row["user_id"] = user_id
        resp = self.client.table("executive_changes").insert(row).execute()
        return resp.data[0]["id"] if resp.data else None

    def insert_executive_changes_bulk(self, company_id: int, changes: list[dict],
                                       user_id: str = None) -> tuple[int, int]:
        if not changes:
            return 0, 0
        unique_changes = {}
        for ec in changes:
            h = self._hash_content(f"{ec['person_name']}|{ec['title']}|{ec['change_type']}")
            ec["_hash"] = h
            unique_changes[h] = ec
        hashes = list(unique_changes.keys())
        existing_resp = self.client.table("executive_changes").select("content_hash").in_("content_hash", hashes).execute()
        existing_hashes = {r["content_hash"] for r in (existing_resp.data or [])}
        to_insert = []
        skipped = 0
        for h, ec in unique_changes.items():
            if h in existing_hashes:
                skipped += 1
            else:
                row = {
                    "company_id": company_id, "person_name": ec["person_name"], "title": ec["title"],
                    "change_type": ec["change_type"], "previous_info": ec.get("previous_info", ""),
                    "source_url": ec.get("source_url", ""), "change_date": ec.get("change_date", ""),
                    "content_hash": h,
                }
                if user_id:
                    row["user_id"] = user_id
                to_insert.append(row)
        inserted = 0
        if to_insert:
            resp = self.client.table("executive_changes").insert(to_insert).execute()
            inserted = len(resp.data) if resp.data else 0
        return inserted, skipped

    def fetch_executive_changes(self, company_id: int = None, limit: int = 50) -> list[dict]:
        q = self.client.table("executive_changes").select("*, companies(name)").order("detected_on", desc=True).limit(limit)
        if company_id:
            q = q.eq("company_id", company_id)
        rows = q.execute().data or []
        for r in rows:
            comp = r.pop("companies", None)
            r["company_name"] = comp["name"] if comp else ""
        return rows

    # ── Pipeline Runs ──

    def start_pipeline_run(self, user_id: str = None) -> int:
        row = {"status": "running"}
        if user_id:
            row["user_id"] = user_id
        resp = self.client.table("pipeline_runs").insert(row).execute()
        return resp.data[0]["id"]

    def finish_pipeline_run(self, run_id: int, companies_processed: int,
                             signals_found: int, errors: list[str],
                             status: str = "completed"):
        now = self._now_iso()
        run_resp = self.client.table("pipeline_runs").select("started_at").eq("id", run_id).limit(1).execute()
        duration = None
        if run_resp.data:
            try:
                started = datetime.fromisoformat(run_resp.data[0]["started_at"].replace("Z", "+00:00"))
                duration = (datetime.utcnow().replace(tzinfo=started.tzinfo) - started).total_seconds()
            except Exception:
                duration = 0
        self.client.table("pipeline_runs").update({
            "finished_at": now, "duration_secs": duration,
            "companies_processed": companies_processed, "signals_found": signals_found,
            "errors": json.dumps(errors), "status": status,
        }).eq("id", run_id).execute()

    def fetch_pipeline_runs(self, limit: int = 20) -> list[dict]:
        return self.client.table("pipeline_runs").select("*").order("started_at", desc=True).limit(limit).execute().data or []

    # ── Company Tags ──

    def add_company_tag(self, company_id: int, tag: str) -> bool:
        tag = tag.strip().lower()
        dup = self.client.table("company_tags").select("id").eq("company_id", company_id).eq("tag", tag).limit(1).execute()
        if dup.data:
            return False
        self.client.table("company_tags").insert({"company_id": company_id, "tag": tag}).execute()
        return True

    def remove_company_tag(self, company_id: int, tag: str) -> bool:
        tag = tag.strip().lower()
        resp = self.client.table("company_tags").delete().eq("company_id", company_id).eq("tag", tag).execute()
        return bool(resp.data)

    def fetch_company_tags(self, company_id: int) -> list[str]:
        resp = self.client.table("company_tags").select("tag").eq("company_id", company_id).order("tag").execute()
        return [r["tag"] for r in (resp.data or [])]

    def fetch_companies_by_tag(self, tag: str) -> list[dict]:
        tag = tag.strip().lower()
        resp = self.client.table("company_tags").select("company_id").eq("tag", tag).execute()
        if not resp.data:
            return []
        ids = [r["company_id"] for r in resp.data]
        return self.client.table("companies").select("*").in_("id", ids).order("name").execute().data or []

    def fetch_all_tags(self) -> list[dict]:
        resp = self.client.table("company_tags").select("tag").execute()
        counts: dict[str, int] = {}
        for r in (resp.data or []):
            t = r["tag"]
            counts[t] = counts.get(t, 0) + 1
        return sorted([{"tag": t, "company_count": c} for t, c in counts.items()], key=lambda x: x["company_count"], reverse=True)

    # ── Notes ──

    def create_note(self, content: str, company_id: int = None, signal_id: int = None) -> int:
        row: dict = {"content": content}
        if company_id is not None:
            row["company_id"] = company_id
        if signal_id is not None:
            row["signal_id"] = signal_id
        resp = self.client.table("notes").insert(row).execute()
        return resp.data[0]["id"]

    def update_note(self, note_id: int, content: str) -> bool:
        resp = self.client.table("notes").update({"content": content, "updated_at": self._now_iso()}).eq("id", note_id).execute()
        return bool(resp.data)

    def delete_note(self, note_id: int) -> bool:
        resp = self.client.table("notes").delete().eq("id", note_id).execute()
        return bool(resp.data)

    def fetch_notes(self, company_id: int = None, signal_id: int = None, limit: int = 50) -> list[dict]:
        q = self.client.table("notes").select("*, companies(name)").order("updated_at", desc=True).limit(limit)
        if company_id:
            q = q.eq("company_id", company_id)
        if signal_id:
            q = q.eq("signal_id", signal_id)
        rows = q.execute().data or []
        for r in rows:
            comp = r.pop("companies", None)
            r["company_name"] = comp["name"] if comp else ""
        return rows

    # ── Dashboard Summary ──

    def fetch_dashboard_summary(self) -> dict:
        seven_days_ago = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")
        total_companies = (self.client.table("companies").select("id", count="exact").execute()).count or 0
        total_signals = (self.client.table("signals").select("id", count="exact").execute()).count or 0
        signals_week = (self.client.table("signals").select("id", count="exact").gte("date", seven_days_ago).execute()).count or 0
        high_week = (self.client.table("signals").select("id", count="exact").gte("date", seven_days_ago).eq("impact", "high").execute()).count or 0
        total_jobs = (self.client.table("job_listings").select("id", count="exact").execute()).count or 0
        total_exec = (self.client.table("executive_changes").select("id", count="exact").execute()).count or 0
        last_run_resp = self.client.table("pipeline_runs").select("*").order("started_at", desc=True).limit(1).execute()
        top_resp = self.client.table("daily_scores").select("total_score, companies(name)").order("date", desc=True).order("total_score", desc=True).limit(1).execute()
        top_company = None
        if top_resp.data:
            row = top_resp.data[0]
            comp = row.pop("companies", None)
            top_company = {"name": self._clean_display_name(comp["name"]) if comp else "", "total_score": row["total_score"]}
        sent_resp = self.client.table("signals").select("sentiment").gte("date", seven_days_ago).execute()
        sentiment_dist: dict[str, int] = {}
        for r in (sent_resp.data or []):
            s = r.get("sentiment", "neutral")
            sentiment_dist[s] = sentiment_dist.get(s, 0) + 1
        type_resp = self.client.table("signals").select("signal_type").gte("date", seven_days_ago).execute()
        type_dist: dict[str, int] = {}
        for r in (type_resp.data or []):
            t = r.get("signal_type", "unknown")
            type_dist[t] = type_dist.get(t, 0) + 1
        type_list = sorted([{"signal_type": t, "cnt": c} for t, c in type_dist.items()], key=lambda x: x["cnt"], reverse=True)
        return {
            "total_companies": total_companies,
            "total_signals": total_signals,
            "signals_this_week": signals_week,
            "high_impact_this_week": high_week,
            "total_jobs": total_jobs,
            "total_exec_changes": total_exec,
            "last_pipeline_run": last_run_resp.data[0] if last_run_resp.data else None,
            "top_company": top_company,
            "sentiment_distribution": sentiment_dist,
            "signal_type_distribution": type_list,
        }

    # ── Retention Cleanup ──

    def run_retention_cleanup(self, raw_days: int = 90, signal_days: int = 180, job_days: int = 60) -> dict:
        now = datetime.utcnow()
        raw_cutoff = (now - timedelta(days=raw_days)).isoformat()
        sig_cutoff = (now - timedelta(days=signal_days)).isoformat()
        job_cutoff = (now - timedelta(days=job_days)).isoformat()
        raw_resp = self.client.table("raw_content").delete().lt("created_at", raw_cutoff).execute()
        sig_resp = self.client.table("signals").delete().lt("created_at", sig_cutoff).execute()
        job_resp = self.client.table("job_listings").delete().lt("detected_on", job_cutoff).execute()
        all_runs = self.client.table("pipeline_runs").select("id").order("started_at", desc=True).execute()
        run_del = 0
        if all_runs.data and len(all_runs.data) > 100:
            old_ids = [r["id"] for r in all_runs.data[100:]]
            if old_ids:
                self.client.table("pipeline_runs").delete().in_("id", old_ids).execute()
                run_del = len(old_ids)
        totals = {
            "raw_content_deleted": len(raw_resp.data) if raw_resp.data else 0,
            "signals_deleted": len(sig_resp.data) if sig_resp.data else 0,
            "jobs_deleted": len(job_resp.data) if job_resp.data else 0,
            "pipeline_runs_deleted": run_del,
        }
        logger.info(f"Retention cleanup: {totals}")
        return totals

    # ── Company Comparison ──

    def compare_companies(self, company_ids: list[int], days: int = 30) -> list[dict]:
        results = []
        for cid in company_ids:
            company = self.fetch_company_by_id(cid)
            if not company:
                continue
            stats = self.fetch_company_stats(cid)
            tags = self.fetch_company_tags(cid)
            scores = self.fetch_daily_scores_range(cid, days=days)
            type_resp = self.client.table("signals").select("signal_type").eq("company_id", cid).execute()
            type_counts: dict[str, int] = {}
            for r in (type_resp.data or []):
                t = r["signal_type"]
                type_counts[t] = type_counts.get(t, 0) + 1
            type_breakdown = sorted([{"signal_type": t, "cnt": c} for t, c in type_counts.items()], key=lambda x: x["cnt"], reverse=True)
            sent_resp = self.client.table("signals").select("sentiment").eq("company_id", cid).execute()
            sent_counts: dict[str, int] = {}
            for r in (sent_resp.data or []):
                s = r.get("sentiment", "neutral")
                sent_counts[s] = sent_counts.get(s, 0) + 1
            results.append({
                **company, "stats": stats, "tags": tags, "score_history": scores,
                "signal_type_breakdown": type_breakdown, "sentiment_breakdown": sent_counts,
            })
        return results

    # ── Health ──

    def get_database_stats(self) -> dict:
        tables = ["companies", "raw_content", "signals", "daily_scores",
                   "job_listings", "executive_changes", "pipeline_runs",
                   "company_tags", "notes"]
        stats = {}
        for table in tables:
            try:
                resp = self.client.table(table).select("id", count="exact").execute()
                stats[table] = resp.count or 0
            except Exception:
                stats[table] = -1
        return stats
