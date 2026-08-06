"""Backfill geocoding for existing projects with addresses but no valid coordinates."""
from __future__ import annotations

import argparse
import logging
import time

from app.db import SessionLocal
from app.models.models import Project
from app.services.project_geocoding_service import (
    GEOCODING_STATUS_MANUAL,
    geocode_project_sync,
    is_valid_coordinate,
    normalize_project_address,
)
from app.models.models import ClientSite

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)


def main() -> None:
    parser = argparse.ArgumentParser(description="Geocode existing projects")
    parser.add_argument("--limit", type=int, default=100, help="Max projects to process")
    parser.add_argument("--batch-size", type=int, default=25, help="Batch size for logging")
    parser.add_argument("--delay-ms", type=int, default=150, help="Delay between geocode requests")
    args = parser.parse_args()

    db = SessionLocal()
    success = failed = skipped = 0

    try:
        candidates = (
            db.query(Project)
            .filter(Project.deleted_at.is_(None), Project.is_bidding == False)
            .order_by(Project.created_at.desc())
            .all()
        )

        processed = 0
        for project in candidates:
            if processed >= args.limit:
                break

            status = getattr(project, "geocoding_status", None)
            if status == GEOCODING_STATUS_MANUAL and is_valid_coordinate(project.lat, project.lng):
                skipped += 1
                continue

            if is_valid_coordinate(project.lat, project.lng):
                if not status:
                    project.geocoding_status = GEOCODING_STATUS_MANUAL
                    db.commit()
                skipped += 1
                continue

            site = None
            if getattr(project, "site_id", None):
                site = db.query(ClientSite).filter(ClientSite.id == project.site_id).first()
            address = normalize_project_address(project, site)
            if not address:
                skipped += 1
                continue

            ok = geocode_project_sync(db, str(project.id))
            if ok:
                success += 1
            else:
                failed += 1
            processed += 1

            if processed % args.batch_size == 0:
                logger.info("Progress: processed=%s success=%s failed=%s skipped=%s", processed, success, failed, skipped)

            if args.delay_ms > 0:
                time.sleep(args.delay_ms / 1000.0)

        logger.info(
            "Done. processed=%s success=%s failed=%s skipped=%s",
            processed,
            success,
            failed,
            skipped,
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
