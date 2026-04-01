"""
Idempotent migration: add projects.business_line, index, backfill, default, NOT NULL (best-effort).

Safe to run multiple times. Matches logic in app/main.py startup for PostgreSQL; also supports SQLite dev DB.

Usage (repo root, with DATABASE_URL set):
  python scripts/apply_projects_business_line.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

from sqlalchemy import inspect, text


def _column_exists(engine, table: str, column: str) -> bool:
    insp = inspect(engine)
    try:
        cols = insp.get_columns(table)
    except Exception:
        return False
    return any(c.get("name") == column for c in cols)


def run() -> None:
    from app.db import SessionLocal, engine

    dialect = engine.dialect.name
    db = SessionLocal()
    try:
        if not _column_exists(engine, "projects", "business_line"):
            if dialect == "sqlite":
                db.execute(text("ALTER TABLE projects ADD COLUMN business_line VARCHAR(50)"))
            else:
                db.execute(text("ALTER TABLE projects ADD COLUMN business_line VARCHAR(50) NULL"))
            db.commit()
            print("[apply_projects_business_line] Added column business_line")
        else:
            print("[apply_projects_business_line] Column business_line already exists")

        try:
            db.execute(text("CREATE INDEX IF NOT EXISTS idx_projects_business_line ON projects(business_line)"))
            db.commit()
        except Exception as e:
            print(f"[apply_projects_business_line] Index (non-critical): {e}")
            db.rollback()

        from app.services.business_line import backfill_business_line_column

        n_null = db.execute(text("SELECT COUNT(*) FROM projects WHERE business_line IS NULL")).scalar() or 0
        if int(n_null) > 0:
            backfill_business_line_column(db, do_commit=False)
            db.execute(text("UPDATE projects SET business_line = 'construction' WHERE business_line IS NULL"))
            db.commit()
            print(f"[apply_projects_business_line] Backfilled {n_null} row(s)")
        else:
            print("[apply_projects_business_line] No NULL business_line values")

        if dialect == "postgresql":
            try:
                db.execute(text("ALTER TABLE projects ALTER COLUMN business_line SET DEFAULT 'construction'"))
                db.commit()
            except Exception as e:
                print(f"[apply_projects_business_line] SET DEFAULT (non-critical): {e}")
                db.rollback()
            try:
                db.execute(text("ALTER TABLE projects ALTER COLUMN business_line SET NOT NULL"))
                db.commit()
            except Exception as e:
                print(f"[apply_projects_business_line] SET NOT NULL (non-critical): {e}")
                db.rollback()
        else:
            print("[apply_projects_business_line] SQLite: skipping ALTER SET DEFAULT / NOT NULL (optional)")

        try:
            db.execute(text("CREATE INDEX IF NOT EXISTS idx_projects_business_line ON projects(business_line)"))
            db.commit()
        except Exception:
            db.rollback()

        print("[apply_projects_business_line] Done.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
