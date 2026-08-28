"""One-off: add community_posts.banner_focal_x/y if missing. Safe to re-run."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    load_dotenv(ROOT / ".env")
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL not set")
    if not url.startswith("postgresql"):
        raise SystemExit("This migration is for PostgreSQL only")
    engine = create_engine(url)
    stmts = [
        "ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS banner_focal_x DOUBLE PRECISION NOT NULL DEFAULT 50",
        "ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS banner_focal_y DOUBLE PRECISION NOT NULL DEFAULT 50",
        (
            "COMMENT ON COLUMN community_posts.banner_focal_x IS "
            "'Banner object-position X percent (0-100) for photo_file_id cover crop.'"
        ),
        (
            "COMMENT ON COLUMN community_posts.banner_focal_y IS "
            "'Banner object-position Y percent (0-100) for photo_file_id cover crop.'"
        ),
    ]
    with engine.begin() as conn:
        for s in stmts:
            conn.execute(text(s))
    print("OK: community_posts.banner_focal_x / banner_focal_y")


if __name__ == "__main__":
    main()
