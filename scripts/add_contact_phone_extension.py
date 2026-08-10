#!/usr/bin/env python3
"""
Migration script to add phone_extension column to contact tables.
Works with both SQLite and PostgreSQL databases.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal, engine
from app.config import settings
from sqlalchemy import text, inspect

TABLES = [
    "client_contacts",
    "supplier_contacts",
    "subcontractor_company_contacts",
]


def run_migration():
    """Add phone_extension column to contact tables."""
    print(
        f"Connecting to database: {settings.database_url.split('@')[-1] if '@' in settings.database_url else settings.database_url}"
    )

    db = SessionLocal()
    try:
        inspector = inspect(engine)

        for table in TABLES:
            columns = [col["name"] for col in inspector.get_columns(table)]
            if "phone_extension" in columns:
                print(f"Column 'phone_extension' already exists on {table}. Skipping.")
                continue

            print(f"Adding column 'phone_extension' to {table}...")
            if settings.database_url.startswith("sqlite"):
                db.execute(text(f"ALTER TABLE {table} ADD COLUMN phone_extension VARCHAR(20)"))
            else:
                db.execute(text(f"ALTER TABLE {table} ADD COLUMN phone_extension VARCHAR(20)"))
            print(f"Column 'phone_extension' added to {table}.")

        db.commit()
        print("Migration completed successfully!")

    except Exception as e:
        db.rollback()
        print(f"Error running migration: {e}")
        import traceback

        traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    try:
        run_migration()
    except Exception as e:
        print(f"Error running migration: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
