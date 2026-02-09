#!/usr/bin/env python3
"""
Run Document Creator migration: create document_templates and user_documents tables.
Supports both SQLite and PostgreSQL.
Run from project root: python scripts/run_document_creator_migration.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

from app.db import engine, Base
from app.models.models import DocumentTemplate, UserDocument  # noqa: F401 - register models

def run_migration():
    print("Creating document_creator tables (document_templates, user_documents)...")
    Base.metadata.create_all(bind=engine, tables=[DocumentTemplate.__table__, UserDocument.__table__])
    print("Migration completed successfully!")

if __name__ == "__main__":
    run_migration()
