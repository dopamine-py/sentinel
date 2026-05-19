"""
Central configuration for the Signal Intelligence Engine.
All settings loaded from .env via python-dotenv.
"""

import os
from dotenv import load_dotenv

load_dotenv()


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

# ── Data Sources ──
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")

# ── Supabase ──
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

# ── LLM Configuration ──
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama").strip().lower()
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:8b")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_ORG_ID = os.getenv("OPENAI_ORG_ID", "")
OPENAI_PROJECT_ID = os.getenv("OPENAI_PROJECT_ID", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

# ── Email (SMTP) ──
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "")
TO_EMAIL = os.getenv("TO_EMAIL", "")

# ── Scheduler ──
PIPELINE_SCHEDULE_HOUR = int(os.getenv("PIPELINE_SCHEDULE_HOUR", 6))
PIPELINE_SCHEDULE_MINUTE = int(os.getenv("PIPELINE_SCHEDULE_MINUTE", 0))
PIPELINE_TIMEZONE = os.getenv("PIPELINE_TIMEZONE", "America/New_York")

# ── Tracked Companies ──
# Companies are managed via the database / UI.  No hardcoded list.
TRACKED_COMPANIES: list[dict] = []

# ── Signal Weight Table ──
SIGNAL_WEIGHTS = {
    "funding_round": 10,
    "acquisition": 10,
    "executive_hire": 8,
    "mass_hiring": 7,
    "product_launch": 6,
    "job_opening": 6,
    "data_centers": 6,
    "partnership": 5,
    "expansion": 5,
    "parcel_deliverability_issues": 7,
    "restructuring": 4,
    "regulatory": 3,
    "blog_post": 1,
}

# ── Recency Decay ──
RECENCY_HALF_LIFE_DAYS = 7  # Score halves every 7 days

# ── Data Retention ──
RAW_CONTENT_RETENTION_DAYS = int(os.getenv("RAW_CONTENT_RETENTION_DAYS", 90))
SIGNAL_RETENTION_DAYS = int(os.getenv("SIGNAL_RETENTION_DAYS", 180))
JOB_RETENTION_DAYS = int(os.getenv("JOB_RETENTION_DAYS", 60))

# ── Ingestion Search Queries (per company) ──
SEARCH_QUERY_TEMPLATES = [
    '"{company}" hiring OR "expanding team" OR "job openings"',
    '"{company}" raised OR "Series A" OR "Series B" OR funding',
    '"{company}" opening new office OR expansion OR "new facility"',
    '"{company}" partnership OR collaboration OR agreement',
    '"{company}" launched OR "announced new product"',
    '"{company}" acquired OR acquisition OR merger',
]

# ── Article Filtering (relaxed defaults to increase recall) ──
ARTICLE_MIN_CHARS = int(os.getenv("ARTICLE_MIN_CHARS", 120))
ARTICLE_MAX_AGE_MONTHS = int(os.getenv("ARTICLE_MAX_AGE_MONTHS", 24))
ARTICLE_MIN_COMPANY_MENTIONS = int(os.getenv("ARTICLE_MIN_COMPANY_MENTIONS", 1))

# ── URL Reprocessing / Debug Controls ──
URL_REPROCESS_DAYS = int(os.getenv("URL_REPROCESS_DAYS", 7))
DEBUG_DISABLE_URL_FILTER = _env_bool("DEBUG_DISABLE_URL_FILTER", False)

# ── Pipeline Safety / Cleaning ──
PIPELINE_MIN_ARTICLES_TO_LLM = int(os.getenv("PIPELINE_MIN_ARTICLES_TO_LLM", 1))
CLEAN_CONTENT_MAX_CHARS = int(os.getenv("CLEAN_CONTENT_MAX_CHARS", 8000))

# ── Signal Types ──
ALLOWED_SIGNAL_TYPES = [
    "hiring",
    "funding",
    "expansion",
    "partnership",
    "product_launch",
    "acquisition",
    "tech_stack_change",
    "website_change",
    "none",
]
