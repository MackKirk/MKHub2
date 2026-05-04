"""Apply community_posts.target_user_ids column (PostgreSQL JSONB or SQLite TEXT)."""
from __future__ import annotations

import sys
from pathlib import Path

# Project root on sys.path
root = Path(__file__).resolve().parents[1]
if str(root) not in sys.path:
    sys.path.insert(0, str(root))

from sqlalchemy import text

from app.config import settings
from app.db import engine


def main() -> None:
    url = (settings.database_url or "").lower()
    with engine.begin() as conn:
        if "sqlite" in url:
            r = conn.execute(text("PRAGMA table_info(community_posts)"))
            cols = [row[1] for row in r.fetchall()]
            if "target_user_ids" in cols:
                print("OK: column target_user_ids already exists (SQLite).")
                return
            conn.execute(
                text(
                    "ALTER TABLE community_posts ADD COLUMN target_user_ids TEXT NOT NULL DEFAULT '[]'"
                )
            )
            print("OK: added target_user_ids to community_posts (SQLite).")
            return

        conn.execute(
            text(
                """
                ALTER TABLE community_posts
                ADD COLUMN IF NOT EXISTS target_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb
                """
            )
        )
        try:
            conn.execute(
                text(
                    """
                    COMMENT ON COLUMN community_posts.target_user_ids IS
                    'When target_type=users: list of user id strings who receive the post'
                    """
                )
            )
        except Exception as exc:
            print("NOTE: COMMENT ON COLUMN skipped:", exc)
        print("OK: applied target_user_ids migration (PostgreSQL).")


if __name__ == "__main__":
    main()
