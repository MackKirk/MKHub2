#!/usr/bin/env python3
"""Add shifts.crew_group_id + crew_role (idempotent)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import inspect, text

from app.config import settings
from app.db import engine


def run_migration() -> None:
    print(
        "Connecting to database:",
        settings.database_url.split("@")[-1] if "@" in settings.database_url else settings.database_url,
    )
    inspector = inspect(engine)
    if "shifts" not in inspector.get_table_names():
        print("Table shifts not found; nothing to do.")
        return

    columns = {col["name"] for col in inspector.get_columns("shifts")}
    is_sqlite = settings.database_url.startswith("sqlite")

    with engine.connect() as conn:
        if "crew_group_id" not in columns:
            print("Adding shifts.crew_group_id…")
            if is_sqlite:
                conn.execute(text("ALTER TABLE shifts ADD COLUMN crew_group_id CHAR(36)"))
            else:
                conn.execute(text("ALTER TABLE shifts ADD COLUMN crew_group_id UUID"))
            conn.commit()
        else:
            print("Column crew_group_id already exists.")

        columns = {col["name"] for col in inspect(engine).get_columns("shifts")}
        if "crew_role" not in columns:
            print("Adding shifts.crew_role…")
            conn.execute(text("ALTER TABLE shifts ADD COLUMN crew_role VARCHAR(20)"))
            conn.commit()
        else:
            print("Column crew_role already exists.")

        indexes = {idx["name"] for idx in inspect(engine).get_indexes("shifts")}
        if "idx_shifts_crew_group_id" not in indexes:
            print("Creating idx_shifts_crew_group_id…")
            conn.execute(text("CREATE INDEX idx_shifts_crew_group_id ON shifts(crew_group_id)"))
            conn.commit()
        else:
            print("Index idx_shifts_crew_group_id already exists.")

    print("Migration completed.")


if __name__ == "__main__":
    run_migration()
