"""Background scheduler for fleet inspection schedule alerts."""
from __future__ import annotations

import threading
import time

import structlog

from ..db import SessionLocal
from .fleet_inspection_alerts import process_fleet_inspection_alerts

logger = structlog.get_logger()
_thread: threading.Thread | None = None
_INTERVAL_SECONDS = 3600
_stop = threading.Event()


def _alerts_loop() -> None:
    while not _stop.is_set():
        try:
            db = SessionLocal()
            try:
                count = process_fleet_inspection_alerts(db)
                if count:
                    logger.info("fleet_inspection_alerts_processed", count=count)
            finally:
                db.close()
        except Exception as e:
            logger.warning("fleet_inspection_alerts_error", error=str(e))
        _stop.wait(_INTERVAL_SECONDS)


def start_fleet_inspection_alerts_scheduler() -> None:
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(
        target=_alerts_loop,
        name="fleet-inspection-alerts",
        daemon=True,
    )
    _thread.start()
    logger.info("fleet_inspection_alerts_scheduler_started", interval_seconds=_INTERVAL_SECONDS)


def stop_fleet_inspection_alerts_scheduler() -> None:
    _stop.set()
