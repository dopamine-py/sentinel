"""
FastAPI REST API for the Signal Intelligence Engine.
Exposes endpoints to query signals, scores, companies, and trigger the pipeline.
"""

import os
import threading
import logging
from typing import List
from pathlib import Path
from fastapi import FastAPI, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .database import Database
from .pipeline import run_pipeline, get_pipeline_progress
from .config import (
    TAVILY_API_KEY, OLLAMA_URL, OLLAMA_MODEL, LLM_PROVIDER,
    OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL,
    RAW_CONTENT_RETENTION_DAYS, SIGNAL_RETENTION_DAYS, JOB_RETENTION_DAYS,
)
from .crisis_pipeline import (
    run_crisis_pipeline,
    run_live_scan,
    get_run,
    list_runs,
    is_pipeline_running,
)
from .mock_sources import get_available_scenarios

app = FastAPI(
    title="CIRO — Crisis Intelligence & Response Orchestrator",
    description="AI-powered urban crisis detection and response system built on Signal Intelligence infrastructure",
    version="2.0.0",
)

logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    db = Database()
except Exception as _db_err:
    logger.warning("Database unavailable (Supabase not configured): %s", _db_err)
    db = None

_pipeline_running = False
_pipeline_lock = threading.Lock()


def _db_unavailable():
    """Return a standard error response when Supabase DB is not configured."""
    return {"status": "error", "message": "Database not configured (Supabase env vars missing). CIRO endpoints at /api/ciro/* work without a DB."}


def _run_pipeline_background():
    global _pipeline_running
    with _pipeline_lock:
        _pipeline_running = True
    try:
        run_pipeline()
    finally:
        with _pipeline_lock:
            _pipeline_running = False


# ── Endpoints ──

@app.get("/api/companies")
def list_companies():
    """List all tracked companies."""
    if db is None: return _db_unavailable()
    companies = db.fetch_companies()
    return {"status": "success", "data": companies}


@app.post("/api/companies")
def add_company(payload: dict):
    """Add a new company to track."""
    name = payload.get("name", "").strip()
    if not name:
        return {"status": "error", "message": "Company name is required."}
    domain = payload.get("domain", "").strip()
    industry = payload.get("industry", "").strip()
    keywords = payload.get("keywords", [])
    if isinstance(keywords, str):
        keywords = [k.strip() for k in keywords.split(",") if k.strip()]
    company_id = db.get_or_create_company(
        name=name, domain=domain, industry=industry, keywords=keywords,
    )
    return {"status": "success", "data": {"id": company_id, "name": name}}


@app.put("/api/companies/{company_id}")
def update_company(company_id: int, payload: dict):
    """Update an existing company."""
    name = payload.get("name")
    domain = payload.get("domain")
    industry = payload.get("industry")
    keywords = payload.get("keywords")
    if isinstance(keywords, str):
        keywords = [k.strip() for k in keywords.split(",") if k.strip()]
    success = db.update_company(
        company_id=company_id, name=name, domain=domain,
        industry=industry, keywords=keywords,
    )
    if success:
        return {"status": "success", "message": "Company updated."}
    return {"status": "error", "message": "No changes applied."}


@app.delete("/api/companies/{company_id}")
def delete_company(company_id: int):
    """Delete a company and all its data."""
    success = db.delete_company(company_id)
    if success:
        return {"status": "success", "message": "Company deleted."}
    return {"status": "error", "message": "Company not found."}


@app.get("/api/companies/{company_id}")
def get_company(company_id: int):
    """Get a single company with stats."""
    company = db.fetch_company_by_id(company_id)
    if not company:
        return {"status": "error", "message": "Company not found."}
    stats = db.fetch_company_stats(company_id)
    company["stats"] = stats
    return {"status": "success", "data": company}


@app.get("/api/companies/{company_id}/scores")
def company_score_history(company_id: int, days: int = Query(30)):
    """Get score history for a company."""
    scores = db.fetch_daily_scores_range(company_id, days=days)
    return {"status": "success", "data": scores}


@app.get("/api/signals")
def list_signals(
    company_id: int = Query(None),
    signal_type: str = Query(None),
    impact: str = Query(None),
    limit: int = Query(100, le=500),
):
    """Query signals with optional filters."""
    signals = db.fetch_signals(
        company_id=company_id, signal_type=signal_type, impact=impact, limit=limit,
    )
    return {"status": "success", "data": signals, "count": len(signals)}


@app.get("/api/scores/daily")
def daily_scores(date: str = Query(None), limit: int = Query(50)):
    """Get daily score rankings."""
    scores = db.fetch_daily_scores(date=date, limit=limit)
    return {"status": "success", "data": scores}


@app.get("/api/scores/top-movers")
def top_movers(date: str = Query(None), limit: int = Query(10)):
    """Top N companies by biggest score change (daily delta)."""
    from datetime import datetime
    date = date or datetime.now().strftime("%Y-%m-%d")
    movers = db.get_top_movers(date, limit=limit)
    return {"status": "success", "data": movers}


@app.get("/api/scores/watchlist")
def watchlist(date: str = Query(None)):
    """Companies with unusual activity spikes."""
    from datetime import datetime
    date = date or datetime.now().strftime("%Y-%m-%d")
    spikes = db.get_activity_spikes(date)
    return {"status": "success", "data": spikes}


@app.post("/api/pipeline/trigger")
def trigger_pipeline(background_tasks: BackgroundTasks):
    """Manually trigger the signal intelligence pipeline."""
    with _pipeline_lock:
        if _pipeline_running:
            return {"status": "busy", "message": "Pipeline is already running."}
    background_tasks.add_task(_run_pipeline_background)
    return {"status": "success", "message": "Pipeline started in the background."}


@app.get("/api/pipeline/status")
def pipeline_status():
    """Check if the pipeline is currently running, with progress info."""
    with _pipeline_lock:
        running = _pipeline_running
    progress = get_pipeline_progress()
    return {
        "status": "success",
        "running": running,
        "progress": progress if running else None,
    }


@app.get("/api/jobs")
def list_jobs(
    company_id: int = Query(None),
    limit: int = Query(25, le=100),
):
    """Get job listings for tracked companies."""
    try:
        jobs = db.fetch_job_listings(company_id=company_id, limit=limit)
        return {"status": "success", "data": jobs, "count": len(jobs)}
    except Exception as exc:
        logger.exception("Failed to fetch job listings", exc_info=exc)
        # Graceful degradation so transient provider issues do not break the dashboard.
        return {
            "status": "degraded",
            "data": [],
            "count": 0,
            "message": "Job listings are temporarily unavailable.",
        }


@app.get("/api/executive-changes")
def list_executive_changes(
    company_id: int = Query(None),
    limit: int = Query(50, le=200),
):
    """Get executive role changes (C-suite, directors, decision-makers)."""
    changes = db.fetch_executive_changes(company_id=company_id, limit=limit)
    return {"status": "success", "data": changes, "count": len(changes)}


# ── Dashboard Summary ──

@app.get("/api/dashboard/summary")
def dashboard_summary():
    """Single aggregated summary for the dashboard — avoids N+1 API calls."""
    summary = db.fetch_dashboard_summary()
    return {"status": "success", "data": summary}


# ── Health Check / Diagnostics ──

@app.get("/api/health")
def health_check():
    """System health check: DB, active LLM provider, API keys, last pipeline run."""
    import requests as _req

    checks = {}

    # Database
    try:
        if db is None:
            checks["database"] = {"status": "unavailable", "message": "Supabase not configured"}
        else:
            stats = db.get_database_stats()
            checks["database"] = {"status": "ok", "tables": stats}
    except Exception as e:
        checks["database"] = {"status": "error", "error": str(e)}

    checks["llm"] = {"provider": LLM_PROVIDER}

    if LLM_PROVIDER == "openai":
        if not OPENAI_API_KEY:
            checks["openai"] = {"status": "error", "message": "OPENAI_API_KEY missing", "model": OPENAI_MODEL}
        else:
            try:
                r = _req.get(
                    f"{OPENAI_BASE_URL.rstrip('/')}/models/{OPENAI_MODEL}",
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                    timeout=5,
                )
                if r.status_code == 200:
                    checks["openai"] = {
                        "status": "ok",
                        "base_url": OPENAI_BASE_URL,
                        "model": OPENAI_MODEL,
                    }
                else:
                    checks["openai"] = {
                        "status": "error",
                        "base_url": OPENAI_BASE_URL,
                        "model": OPENAI_MODEL,
                        "message": f"HTTP {r.status_code}",
                    }
            except Exception as e:
                checks["openai"] = {
                    "status": "error",
                    "error": str(e),
                    "base_url": OPENAI_BASE_URL,
                    "model": OPENAI_MODEL,
                }
    else:
        try:
            r = _req.get(f"{OLLAMA_URL}/api/tags", timeout=5)
            if r.status_code == 200:
                models = [m["name"] for m in r.json().get("models", [])]
                model_available = any(OLLAMA_MODEL in m for m in models)
                checks["ollama"] = {
                    "status": "ok" if model_available else "warning",
                    "url": OLLAMA_URL,
                    "model": OLLAMA_MODEL,
                    "model_available": model_available,
                    "models_installed": models[:10],
                }
            else:
                checks["ollama"] = {"status": "error", "message": f"HTTP {r.status_code}"}
        except Exception as e:
            checks["ollama"] = {"status": "error", "error": str(e), "url": OLLAMA_URL}

    # API keys
    checks["api_keys"] = {
        "tavily": "configured" if TAVILY_API_KEY else "missing",
        "openai": "configured" if OPENAI_API_KEY else "missing",
    }

    # Last pipeline run
    runs = db.fetch_pipeline_runs(limit=1) if db else []
    checks["last_pipeline_run"] = runs[0] if runs else None

    # Retention config
    checks["retention_policy"] = {
        "raw_content_days": RAW_CONTENT_RETENTION_DAYS,
        "signal_days": SIGNAL_RETENTION_DAYS,
        "job_days": JOB_RETENTION_DAYS,
    }

    overall = "healthy"
    if checks.get("database", {}).get("status") == "error":
        overall = "unhealthy"
    elif LLM_PROVIDER == "openai" and checks.get("openai", {}).get("status") == "error":
        overall = "degraded"
    elif LLM_PROVIDER != "openai" and checks.get("ollama", {}).get("status") == "error":
        overall = "degraded"

    return {"status": overall, "checks": checks}


# ── Pipeline Run History ──

@app.get("/api/pipeline/history")
def pipeline_history(limit: int = Query(20, le=100)):
    """Get pipeline run audit log."""
    if db is None: return _db_unavailable()
    runs = db.fetch_pipeline_runs(limit=limit)
    return {"status": "success", "data": runs}


# ── Bulk Company Import ──

@app.post("/api/companies/bulk")
def bulk_import_companies(payload: dict):
    """Bulk import companies. Expects {"companies": [{name, domain?, industry?, keywords?}, ...]}."""
    companies_data = payload.get("companies", [])
    if not isinstance(companies_data, list) or not companies_data:
        return {"status": "error", "message": "Expected a non-empty 'companies' array."}

    imported = []
    skipped = []
    for entry in companies_data:
        name = entry.get("name", "").strip() if isinstance(entry, dict) else ""
        if not name:
            skipped.append({"entry": entry, "reason": "Missing name"})
            continue
        domain = entry.get("domain", "").strip()
        industry = entry.get("industry", "").strip()
        keywords = entry.get("keywords", [])
        if isinstance(keywords, str):
            keywords = [k.strip() for k in keywords.split(",") if k.strip()]
        company_id = db.get_or_create_company(
            name=name, domain=domain, industry=industry, keywords=keywords,
        )
        imported.append({"id": company_id, "name": name})

    return {
        "status": "success",
        "imported": len(imported),
        "skipped": len(skipped),
        "data": imported,
        "errors": skipped,
    }


# ── Company Tags ──

@app.get("/api/tags")
def list_all_tags():
    """List all unique tags with company counts."""
    tags = db.fetch_all_tags()
    return {"status": "success", "data": tags}


@app.get("/api/companies/{company_id}/tags")
def get_company_tags(company_id: int):
    """Get tags for a specific company."""
    tags = db.fetch_company_tags(company_id)
    return {"status": "success", "data": tags}


@app.post("/api/companies/{company_id}/tags")
def add_tag(company_id: int, payload: dict):
    """Add a tag to a company. Expects {"tag": "competitor"}."""
    tag = payload.get("tag", "").strip()
    if not tag:
        return {"status": "error", "message": "Tag is required."}
    added = db.add_company_tag(company_id, tag)
    if added:
        return {"status": "success", "message": f"Tag '{tag}' added."}
    return {"status": "success", "message": f"Tag '{tag}' already exists."}


@app.delete("/api/companies/{company_id}/tags/{tag}")
def remove_tag(company_id: int, tag: str):
    """Remove a tag from a company."""
    removed = db.remove_company_tag(company_id, tag)
    if removed:
        return {"status": "success", "message": f"Tag '{tag}' removed."}
    return {"status": "error", "message": "Tag not found."}


@app.get("/api/tags/{tag}/companies")
def companies_by_tag(tag: str):
    """Get all companies with a specific tag."""
    companies = db.fetch_companies_by_tag(tag)
    return {"status": "success", "data": companies}


# ── Notes / Annotations ──

@app.get("/api/notes")
def list_notes(
    company_id: int = Query(None),
    signal_id: int = Query(None),
    limit: int = Query(50, le=200),
):
    """Get analyst notes, optionally filtered by company or signal."""
    notes = db.fetch_notes(company_id=company_id, signal_id=signal_id, limit=limit)
    return {"status": "success", "data": notes, "count": len(notes)}


@app.post("/api/notes")
def create_note(payload: dict):
    """Create an analyst note. Expects {"content": "...", "company_id"?: N, "signal_id"?: N}."""
    content = payload.get("content", "").strip()
    if not content:
        return {"status": "error", "message": "Note content is required."}
    company_id = payload.get("company_id")
    signal_id = payload.get("signal_id")
    if not company_id and not signal_id:
        return {"status": "error", "message": "Must attach note to a company_id or signal_id."}
    note_id = db.create_note(content=content, company_id=company_id, signal_id=signal_id)
    return {"status": "success", "data": {"id": note_id}}


@app.put("/api/notes/{note_id}")
def update_note(note_id: int, payload: dict):
    """Update a note's content."""
    content = payload.get("content", "").strip()
    if not content:
        return {"status": "error", "message": "Note content is required."}
    updated = db.update_note(note_id, content)
    if updated:
        return {"status": "success", "message": "Note updated."}
    return {"status": "error", "message": "Note not found."}


@app.delete("/api/notes/{note_id}")
def delete_note(note_id: int):
    """Delete a note."""
    deleted = db.delete_note(note_id)
    if deleted:
        return {"status": "success", "message": "Note deleted."}
    return {"status": "error", "message": "Note not found."}


# ── Company Comparison ──

@app.get("/api/compare")
def compare_companies(
    ids: str = Query(..., description="Comma-separated company IDs"),
    days: int = Query(30),
):
    """Side-by-side comparison of multiple companies."""
    try:
        company_ids = [int(x.strip()) for x in ids.split(",") if x.strip()]
    except ValueError:
        return {"status": "error", "message": "Invalid company IDs. Use comma-separated integers."}
    if len(company_ids) < 2:
        return {"status": "error", "message": "Provide at least 2 company IDs to compare."}
    if len(company_ids) > 10:
        return {"status": "error", "message": "Maximum 10 companies for comparison."}
    data = db.compare_companies(company_ids, days=days)
    return {"status": "success", "data": data}


# ── Data Retention (manual trigger) ──

@app.post("/api/admin/cleanup")
def manual_cleanup(payload: dict = None):
    """Manually trigger data retention cleanup."""
    payload = payload or {}
    raw_days = payload.get("raw_content_days", RAW_CONTENT_RETENTION_DAYS)
    signal_days = payload.get("signal_days", SIGNAL_RETENTION_DAYS)
    job_days = payload.get("job_days", JOB_RETENTION_DAYS)
    result = db.run_retention_cleanup(raw_days=raw_days, signal_days=signal_days, job_days=job_days)
    return {"status": "success", "data": result}


# ── Serve Frontend (for production / ngrok sharing) ──

# Resolve the frontend dist directory relative to project root
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_FRONTEND_DIST = _PROJECT_ROOT / "signal-scout" / "dist"

if _FRONTEND_DIST.is_dir():
    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=_FRONTEND_DIST / "assets"), name="static-assets")

    # Catch-all: serve index.html for any non-API route (SPA client-side routing)
    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        """Serve the frontend SPA for any non-API route."""
        file_path = _FRONTEND_DIST / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(_FRONTEND_DIST / "index.html")


# ═══════════════════════════════════════════════════════════════════
# CIRO — Crisis Intelligence & Response Orchestrator Endpoints
# ═══════════════════════════════════════════════════════════════════

_ciro_thread: threading.Thread | None = None
_ciro_lock = threading.Lock()


@app.get("/api/ciro/scenarios")
def list_scenarios():
    """List all available mock crisis scenarios."""
    return {
        "status": "success",
        "scenarios": get_available_scenarios(),
        "descriptions": {
            "urban_flooding": "Flash flood / waterlogging with stranded vehicles",
            "heatwave": "Extreme heat event with public health impact",
            "accident": "Multi-vehicle road accident blocking major routes",
            "road_blockage": "Road closure due to infrastructure works",
            "infrastructure_failure": "Critical utility failure (power/gas/water)",
        },
    }


@app.post("/api/ciro/run")
def trigger_crisis_run(payload: dict, background_tasks: BackgroundTasks):
    """
    Start a CIRO crisis analysis run.
    Body: {"scenario": "urban_flooding", "custom_signals": ["text..."], "social_count": 4}
    """
    global _ciro_thread

    with _ciro_lock:
        if is_pipeline_running():
            return {"status": "busy", "message": "A CIRO run is already in progress."}

    scenario = payload.get("scenario", "urban_flooding")
    custom_signals = payload.get("custom_signals", []) or []
    social_count = int(payload.get("social_count", 4))

    # Sanitize
    if scenario not in get_available_scenarios():
        scenario = "urban_flooding"

    import uuid as _uuid
    anticipated_run_id = f"CIRO-{_uuid.uuid4().hex[:8].upper()}"

    def _run():
        run_crisis_pipeline(
            scenario=scenario,
            custom_signals=custom_signals if custom_signals else None,
            social_count=social_count,
            run_id=anticipated_run_id,
        )

    background_tasks.add_task(_run)

    return {
        "status": "started",
        "message": "CIRO pipeline started in background.",
        "scenario": scenario,
        "run_id": anticipated_run_id,
    }


@app.get("/api/ciro/status")
def ciro_status():
    """Check whether a CIRO run is currently active."""
    running = is_pipeline_running()
    runs = list_runs()
    return {
        "status": "success",
        "running": running,
        "total_runs": len(runs),
        "latest_run": runs[0] if runs else None,
    }


@app.get("/api/ciro/runs")
def get_all_runs():
    """List all past CIRO runs (newest first)."""
    return {"status": "success", "data": list_runs()}


@app.get("/api/ciro/runs/{run_id}")
def get_run_detail(run_id: str):
    """Get full detail for a specific CIRO run."""
    run = get_run(run_id)
    if not run:
        return {"status": "error", "message": f"Run '{run_id}' not found."}
    return {"status": "success", "data": run.to_dict()}


@app.get("/api/ciro/runs/{run_id}/trace")
def get_run_trace(run_id: str):
    """Get agent reasoning trace for a specific run."""
    run = get_run(run_id)
    if not run:
        return {"status": "error", "message": f"Run '{run_id}' not found."}
    import dataclasses
    traces = [
        {k: v for k, v in dataclasses.asdict(t).items()}
        for t in run.agent_traces
    ]
    return {
        "status": "success",
        "run_id": run_id,
        "agent_count": len(traces),
        "traces": traces,
    }


@app.get("/api/ciro/runs/{run_id}/stream")
async def stream_run_traces(run_id: str):
    """
    Server-Sent Events endpoint that emits agent traces as they are generated live.
    """
    from .crisis_pipeline import _active_traces, get_run, _runs_lock
    import asyncio
    import json
    import dataclasses
    from fastapi.responses import StreamingResponse

    async def event_generator():
        last_index = 0
        waited = 0.0
        # The run is launched as a FastAPI BackgroundTask, which only starts
        # AFTER /api/ciro/run has returned its response. The client opens this
        # stream immediately, so for a short window the run is not yet
        # registered in _active_traces. Wait (with SSE heartbeats so the
        # connection stays open through proxies) instead of erroring out.
        GRACE_SECONDS = 30.0
        started = False

        while True:
            with _runs_lock:
                is_active = run_id in _active_traces
                traces = list(_active_traces.get(run_id, []))

            finished_run = None
            if not is_active:
                finished_run = get_run(run_id)

            if is_active or finished_run is not None:
                started = True

            # Still waiting for the background pipeline to register the run.
            if not started:
                if waited >= GRACE_SECONDS:
                    yield f"data: {json.dumps({'error': 'Run not found'})}\n\n"
                    break
                # SSE comment line — ignored by EventSource.onmessage but keeps
                # the connection alive through the dev proxy.
                yield ": waiting\n\n"
                await asyncio.sleep(0.5)
                waited += 0.5
                continue

            # Run already completed before/while we connected → use its final traces.
            if finished_run is not None and not is_active:
                traces = finished_run.agent_traces

            # Emit any newly produced traces.
            while last_index < len(traces):
                t = traces[last_index]
                data = json.dumps(dataclasses.asdict(t))
                yield f"data: {data}\n\n"
                last_index += 1

            if not is_active:
                yield "data: [DONE]\n\n"
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Disable proxy/Nginx-style response buffering so events flush live.
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/ciro/run/sync")
def trigger_crisis_run_sync(payload: dict):
    """
    Synchronous CIRO run — waits for completion and returns full result.
    Useful for demos. Body: {"scenario": "urban_flooding", "custom_signals": [...]}.
    """
    scenario = payload.get("scenario", "urban_flooding")
    custom_signals = payload.get("custom_signals") or []
    social_count = int(payload.get("social_count", 4))

    if scenario not in get_available_scenarios():
        scenario = "urban_flooding"

    result = run_crisis_pipeline(
        scenario=scenario,
        custom_signals=custom_signals if custom_signals else None,
        social_count=social_count,
    )
    return {"status": "success", "data": result.to_dict()}


@app.post("/api/ciro/scan/live")
def trigger_live_scan(background_tasks: BackgroundTasks):
    """
    Trigger an autonomous live scan — ingests real signals from Pakistani news RSS,
    live weather, and Tavily search. No manual input needed.
    Returns the run_id immediately; poll /api/ciro/runs/{run_id} for results.
    """
    import uuid as _uuid
    run_id_placeholder = f"LIVE-{_uuid.uuid4().hex[:8].upper()}"

    def _do_scan():
        result = run_live_scan(run_id=run_id_placeholder)
        logger.info("Background live scan complete: %s", result.run_id if result else "None")

    background_tasks.add_task(_do_scan)
    return {
        "status": "accepted",
        "message": "Live scan started in background",
        "note": "Poll /api/ciro/runs for latest result",
        "run_id": run_id_placeholder
    }


@app.post("/api/ciro/scan/live/sync")
def trigger_live_scan_sync():
    """
    Synchronous live scan — waits for full pipeline to complete, then returns results.
    Use for demos. Warning: may take 30-60s.
    """
    result = run_live_scan()
    if result is None:
        return {"status": "error", "message": "Pipeline already running"}
    return {
        "status": "success",
        "data": result.to_dict(),
        "source": "live",
        "signals_ingested": len(result.input_signals),
        "crisis_detected": result.detected_crisis is not None,
    }


# ── Background auto-scanner (every 10 min) ───────────────────────────────────
import threading as _threading

def _auto_scan_worker():
    """Background thread that auto-scans live sources every 10 minutes."""
    import time as _time
    _time.sleep(30)  # wait 30s for server to fully start
    while True:
        try:
            logger.info("[AutoScan] Running scheduled live scan...")
            run_live_scan()
        except Exception as exc:
            logger.warning("[AutoScan] Failed: %s", exc)
        _time.sleep(600)  # 10 minutes

_auto_scan_thread = _threading.Thread(target=_auto_scan_worker, daemon=True)
_auto_scan_thread.start()
logger.info("[AutoScan] Background scanner started (interval: 10 min)")


# ── CIRO Dashboard (serve static HTML) ──
_CIRO_DASHBOARD = Path(__file__).resolve().parent.parent / "ciro_dashboard"
if _CIRO_DASHBOARD.is_dir():
    app.mount("/ciro", StaticFiles(directory=_CIRO_DASHBOARD, html=True), name="ciro-dashboard")
