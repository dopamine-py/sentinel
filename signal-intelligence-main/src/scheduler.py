"""
Scheduler for the Signal Intelligence Engine.
Runs the pipeline daily at the configured time using APScheduler.
"""

import logging
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from .config import PIPELINE_SCHEDULE_HOUR, PIPELINE_SCHEDULE_MINUTE, PIPELINE_TIMEZONE
from .pipeline import run_pipeline

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def start_scheduler():
    """Start the daily pipeline scheduler."""
    scheduler = BlockingScheduler()

    scheduler.add_job(
        run_pipeline,
        trigger=CronTrigger(
            hour=PIPELINE_SCHEDULE_HOUR,
            minute=PIPELINE_SCHEDULE_MINUTE,
            timezone=PIPELINE_TIMEZONE,
        ),
        id="daily_pipeline",
        name="Daily Signal Intelligence Pipeline",
        replace_existing=True,
    )

    logger.info(
        f"Scheduler started — pipeline will run daily at "
        f"{PIPELINE_SCHEDULE_HOUR:02d}:{PIPELINE_SCHEDULE_MINUTE:02d} "
        f"({PIPELINE_TIMEZONE})"
    )

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stopped.")


if __name__ == "__main__":
    start_scheduler()
