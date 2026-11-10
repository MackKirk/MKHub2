#!/usr/bin/env python3
"""Add client_notes.contact_id + contact_name (idempotent)."""
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
    if "client_notes" not in inspector.get_table_names():
        print("Table client_notes not found; nothing to do.")
        return

    columns = {col["name"] for col in inspector.get_columns("client_notes")}
    is_sqlite = settings.database_url.startswith("sqlite")

    with engine.connect() as conn:
        if "contact_id" not in columns:
            print("Adding client_notes.contact_id…")
            if is_sqlite:
                conn.execute(text("ALTER TABLE client_notes ADD COLUMN contact_id CHAR(36)"))
            else:
                conn.execute(
                    text(
                        "ALTER TABLE client_notes "
                        "ADD COLUMN contact_id UUID REFERENCES client_contacts(id) ON DELETE SET NULL"
                    )
                )
            conn.commit()
        else:
            print("Column contact_id already exists.")

        columns = {col["name"] for col in inspect(engine).get_columns("client_notes")}
        if "contact_name" not in columns:
            print("Adding client_notes.contact_name…")
            if is_sqlite:
                conn.execute(text("ALTER TABLE client_notes ADD COLUMN contact_name VARCHAR(255)"))
            else:
                conn.execute(text("ALTER TABLE client_notes ADD COLUMN contact_name VARCHAR(255)"))
            conn.commit()
        else:
            print("Column contact_name already exists.")

        indexes = {idx["name"] for idx in inspector.get_indexes("client_notes")}
        # Re-inspect after alters
        indexes = {idx["name"] for idx in inspect(engine).get_indexes("client_notes")}
        if "ix_client_notes_contact_id" not in indexes:
            print("Creating ix_client_notes_contact_id…")
            conn.execute(text("CREATE INDEX ix_client_notes_contact_id ON client_notes(contact_id)"))
            conn.commit()
        else:
            print("Index ix_client_notes_contact_id already exists.")

    print("Migration completed.")


if __name__ == "__main__":
    run_migration()
