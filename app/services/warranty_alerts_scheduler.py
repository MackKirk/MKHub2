"""Background scheduler for warranty alerts."""
from __future__ import annotations

import threading
import time

import structlog

from ..db import SessionLocal
from .warranty_alerts import process_warranty_alerts

logger = structlog.get_logger()
_thread: threading.Thread | None = None
_INTERVAL_SECONDS = 3600
_stop = threading.Event()


def _alerts_loop() -> None:
    while not _stop.is_set():
        try:
            db = SessionLocal()
            try:
                count = process_warranty_alerts(db)
                if count:
                    logger.info("warranty_alerts_processed", count=count)
            finally:
                db.close()
        except Exception as e:
            logger.warning("warranty_alerts_error", error=str(e))
        _stop.wait(_INTERVAL_SECONDS)


def start_warranty_alerts_scheduler() -> None:
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(
        target=_alerts_loop,
        name="warranty-alerts",
        daemon=True,
    )
    _thread.start()
    logger.info("warranty_alerts_scheduler_started", interval_seconds=_INTERVAL_SECONDS)


def stop_warranty_alerts_scheduler() -> None:
    _stop.set()
