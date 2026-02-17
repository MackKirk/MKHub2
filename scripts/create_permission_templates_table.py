#!/usr/bin/env python3
"""
Create permission_templates table. Templates store name + list of permission keys (references to PermissionDefinition).
Run from project root: python scripts/create_permission_templates_table.py
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
from app.models.models import PermissionTemplate  # noqa: F401 - register model


def run_migration():
    print("Creating permission_templates table...")
    Base.metadata.create_all(bind=engine, tables=[PermissionTemplate.__table__])
    print("Migration completed successfully!")


if __name__ == "__main__":
    run_migration()
