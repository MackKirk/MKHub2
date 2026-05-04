"""One-off: add community_posts.attachment_files if missing. Safe to re-run."""
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
        "ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS attachment_files JSONB NOT NULL DEFAULT '[]'::jsonb",
        (
            "COMMENT ON COLUMN community_posts.attachment_files IS "
            "'List of {file_id, name} for downloadable attachments; document_file_id mirrors first for legacy.'"
        ),
    ]
    with engine.begin() as conn:
        for s in stmts:
            conn.execute(text(s))
    print("OK: community_posts.attachment_files")


if __name__ == "__main__":
    main()
