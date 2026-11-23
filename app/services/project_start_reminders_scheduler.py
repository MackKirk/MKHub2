"""Background scheduler for project start-date reminders."""
from __future__ import annotations

import threading

import structlog

from ..db import SessionLocal
from .project_start_reminders import process_project_start_reminders

logger = structlog.get_logger()
_thread: threading.Thread | None = None
_INTERVAL_SECONDS = 3600
_stop = threading.Event()


def _reminders_loop() -> None:
    while not _stop.is_set():
        try:
            db = SessionLocal()
            try:
                count = process_project_start_reminders(db)
                if count:
                    logger.info("project_start_reminders_processed", count=count)
            finally:
                db.close()
        except Exception as e:
            logger.warning("project_start_reminders_error", error=str(e))
        _stop.wait(_INTERVAL_SECONDS)


def start_project_start_reminders_scheduler() -> None:
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(
        target=_reminders_loop,
        name="project-start-reminders",
        daemon=True,
    )
    _thread.start()
    logger.info("project_start_reminders_scheduler_started", interval_seconds=_INTERVAL_SECONDS)


def stop_project_start_reminders_scheduler() -> None:
    _stop.set()
