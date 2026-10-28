#!/usr/bin/env python3
"""Add clients.serves_hub / serves_metals (non-destructive)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass


def main():
    from sqlalchemy import inspect, text
    from app.db import engine

    dialect = engine.dialect.name
    insp = inspect(engine)
    if "clients" not in insp.get_table_names():
        print("Table clients does not exist — skip.")
        return

    existing = {c["name"] for c in insp.get_columns("clients")}

    with engine.begin() as conn:
        if "serves_hub" not in existing:
            if dialect == "sqlite":
                conn.execute(text("ALTER TABLE clients ADD COLUMN serves_hub BOOLEAN NOT NULL DEFAULT 1"))
            else:
                conn.execute(
                    text("ALTER TABLE clients ADD COLUMN serves_hub BOOLEAN NOT NULL DEFAULT TRUE")
                )
            print("Added clients.serves_hub")
        else:
            print("serves_hub already exists")

        if "serves_metals" not in existing:
            if dialect == "sqlite":
                conn.execute(text("ALTER TABLE clients ADD COLUMN serves_metals BOOLEAN NOT NULL DEFAULT 0"))
            else:
                conn.execute(
                    text("ALTER TABLE clients ADD COLUMN serves_metals BOOLEAN NOT NULL DEFAULT FALSE")
                )
            print("Added clients.serves_metals")
        else:
            print("serves_metals already exists")

        # Backfill: existing rows are Hub-only
        conn.execute(text("UPDATE clients SET serves_hub = TRUE WHERE serves_hub IS NULL OR serves_hub = FALSE"))
        # Only force metals false when column was just added or for safety on legacy nulls
        conn.execute(text("UPDATE clients SET serves_metals = FALSE WHERE serves_metals IS NULL"))

    print("Migration completed: client product serves columns.")


if __name__ == "__main__":
    main()
