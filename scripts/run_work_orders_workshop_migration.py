#!/usr/bin/env python3
"""Run add_work_orders_workshop_columns.sql using the app's DATABASE_URL."""
import os
import sys

# Run from project root so app is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def main():
    from sqlalchemy import text
    from app.db import engine
    from app.config import settings

    if not settings.database_url or "sqlite" in settings.database_url.lower():
        print("DATABASE_URL is SQLite. This migration is for PostgreSQL.")
        print("For SQLite, columns would need to be added via Alembic or separate SQLite-compatible script.")
        sys.exit(1)

    sql_path = os.path.join(os.path.dirname(__file__), "add_work_orders_workshop_columns.sql")
    with open(sql_path, "r", encoding="utf-8") as f:
        sql = f.read()

    # Split: first block is DO $$ ... $$; second is CREATE INDEX IF NOT EXISTS
    do_block = sql.split("CREATE INDEX IF NOT EXISTS")[0].strip()
    create_index = ("CREATE INDEX IF NOT EXISTS " + sql.split("CREATE INDEX IF NOT EXISTS")[1].strip()) if "CREATE INDEX IF NOT EXISTS" in sql else None

    with engine.begin() as conn:
        conn.execute(text(do_block))
        if create_index:
            try:
                conn.execute(text(create_index))
            except Exception as e:
                if "already exists" in str(e).lower():
                    print("Note: index already exists:", e)
                else:
                    raise
    print("Migration completed: work_orders workshop columns applied.")


if __name__ == "__main__":
    main()
