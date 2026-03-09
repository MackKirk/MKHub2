#!/usr/bin/env python3
"""Run add_inspection_schedules_and_type.sql using the app's DATABASE_URL."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    from sqlalchemy import text
    from app.db import engine
    from app.config import settings

    if not settings.database_url or "sqlite" in settings.database_url.lower():
        print("DATABASE_URL is SQLite. This migration is for PostgreSQL.")
        sys.exit(1)

    sql_path = os.path.join(os.path.dirname(__file__), "add_inspection_schedules_and_type.sql")
    with open(sql_path, "r", encoding="utf-8") as f:
        sql = f.read()

    # Strip comments
    sql_clean = "\n".join(l for l in sql.split("\n") if not l.strip().startswith("--"))

    # Extract blocks: (1) up to and including first ";", (2) DO $$ ... END $$;, (3) rest
    # Block 1: CREATE TABLE + first four CREATE INDEX (up to "END $$;" excluded)
    do_start = sql_clean.find("DO $$")
    do_end = sql_clean.find("END $$;")
    if do_start == -1 or do_end == -1:
        # No DO block, run whole script
        with engine.begin() as conn:
            conn.execute(text(sql_clean))
    else:
        before_do = sql_clean[:do_start].strip().rstrip(";")
        do_block = sql_clean[do_start : do_end + len("END $$;")]
        after_do = sql_clean[do_end + len("END $$;"):].strip()

        with engine.begin() as conn:
            # Run CREATE TABLE and first 4 CREATE INDEXes (before DO)
            for stmt in before_do.split(";"):
                stmt = stmt.strip()
                if stmt:
                    conn.execute(text(stmt + ";"))
            conn.execute(text(do_block))
            # Run last 2 CREATE INDEXes
            for stmt in after_do.split(";"):
                stmt = stmt.strip()
                if stmt:
                    conn.execute(text(stmt + ";"))
    print("Migration completed: inspection_schedules table and fleet_inspections columns applied.")


if __name__ == "__main__":
    main()
