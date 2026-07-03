"""One-off runner for scripts/add_shift_notes.sql"""
from __future__ import annotations

import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
if str(root) not in sys.path:
    sys.path.insert(0, str(root))

from sqlalchemy import text

from app.config import settings
from app.db import engine

SQL = Path(__file__).resolve().parent / "add_shift_notes.sql"


def main() -> None:
    url = (settings.database_url or "").lower()
    with engine.begin() as conn:
        if "sqlite" in url:
            r = conn.execute(text("PRAGMA table_info(shifts)"))
            cols = [row[1] for row in r.fetchall()]
            if "notes" in cols:
                print("OK: shifts.notes already exists (SQLite).")
                return
            conn.execute(text("ALTER TABLE shifts ADD COLUMN notes TEXT"))
        else:
            conn.execute(text(SQL.read_text(encoding="utf-8").strip()))
            row = conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'shifts' AND column_name = 'notes'"
                )
            ).fetchone()
            if not row:
                raise SystemExit("FAILED: shifts.notes column not found after migration")
    print("OK: shifts.notes column is present")


if __name__ == "__main__":
    main()
