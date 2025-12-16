from __future__ import annotations

import os
import sys

from sqlalchemy import text

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
from app.db import SessionLocal


def main() -> None:
    print("database_url =", settings.database_url)
    db = SessionLocal()
    try:
        dialect = db.bind.dialect.name
        print("dialect =", dialect)

        if dialect == "sqlite":
            cols = db.execute(text("PRAGMA table_info(project_time_entries)")).fetchall()
            col_names = [c[1] for c in cols]
            print("has source_attendance_id:", "source_attendance_id" in col_names)
            print("columns:", col_names)

            idx = db.execute(text("PRAGMA index_list('project_time_entries')")).fetchall()
            idx_names = [i[1] for i in idx]
            print("indexes:", idx_names)
            if "idx_project_time_entries_source_attendance_id" in idx_names:
                info = db.execute(
                    text("PRAGMA index_info('idx_project_time_entries_source_attendance_id')")
                ).fetchall()
                print("idx_project_time_entries_source_attendance_id cols:", [r[2] for r in info])
        else:
            has = (
                db.execute(
                    text(
                        """
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_name = 'project_time_entries'
                          AND column_name = 'source_attendance_id'
                        LIMIT 1
                        """
                    )
                ).fetchone()
                is not None
            )
            print("has source_attendance_id:", has)
            try:
                idx = db.execute(
                    text(
                        """
                        SELECT indexname
                        FROM pg_indexes
                        WHERE tablename = 'project_time_entries'
                        ORDER BY indexname
                        """
                    )
                ).fetchall()
                idx_names = [r[0] for r in idx]
                print("indexes:", idx_names)
                print(
                    "has idx_project_time_entries_source_attendance_id:",
                    "idx_project_time_entries_source_attendance_id" in idx_names,
                )
            except Exception as e:
                print("Could not list postgres indexes:", e)

        try:
            cnt = db.execute(
                text("SELECT COUNT(*) FROM project_time_entries WHERE source_attendance_id IS NOT NULL")
            ).scalar()
            print("linked time entries (source_attendance_id not null):", int(cnt or 0))
        except Exception as e:
            print("Could not count linked entries:", e)
    finally:
        db.close()


if __name__ == "__main__":
    main()


