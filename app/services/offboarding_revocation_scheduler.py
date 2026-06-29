"""Background scheduler for due offboarding access revocations."""
from __future__ import annotations

import threading
import time

import structlog

from ..db import SessionLocal
from .offboarding_service import process_due_scheduled_revocations

logger = structlog.get_logger()
_thread: threading.Thread | None = None
_INTERVAL_SECONDS = 60
_stop = threading.Event()


def _revocation_loop() -> None:
    while not _stop.is_set():
        try:
            db = SessionLocal()
            try:
                count = process_due_scheduled_revocations(db)
                if count:
                    logger.info("offboarding_scheduled_revocations_processed", count=count)
            finally:
                db.close()
        except Exception as e:
            logger.warning("offboarding_scheduled_revocation_error", error=str(e))
        _stop.wait(_INTERVAL_SECONDS)


def start_offboarding_revocation_scheduler() -> None:
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(
        target=_revocation_loop,
        name="offboarding-revocation",
        daemon=True,
    )
    _thread.start()
    logger.info("offboarding_revocation_scheduler_started", interval_seconds=_INTERVAL_SECONDS)


def stop_offboarding_revocation_scheduler() -> None:
    _stop.set()
