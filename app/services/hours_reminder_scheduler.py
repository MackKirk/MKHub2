"""Background scheduler for 6 PM hours-logging reminders."""
from __future__ import annotations

import threading

import structlog

from ..db import SessionLocal
from .hours_reminder import process_hours_reminders

logger = structlog.get_logger()
_thread: threading.Thread | None = None
_INTERVAL_SECONDS = 60
_stop = threading.Event()


def _loop() -> None:
    while not _stop.is_set():
        try:
            db = SessionLocal()
            try:
                process_hours_reminders(db)
            finally:
                db.close()
        except Exception as e:
            logger.warning("hours_reminder_scheduler_error", error=str(e))
        _stop.wait(_INTERVAL_SECONDS)


def start_hours_reminder_scheduler() -> None:
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(
        target=_loop,
        name="hours-reminder",
        daemon=True,
    )
    _thread.start()
    logger.info("hours_reminder_scheduler_started", interval_seconds=_INTERVAL_SECONDS)


def stop_hours_reminder_scheduler() -> None:
    _stop.set()
