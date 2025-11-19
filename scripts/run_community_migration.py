#!/usr/bin/env python3
"""
Migration script to add new columns to community_posts table.
Run this from the project root: python scripts/run_community_migration.py
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import engine, SessionLocal
from sqlalchemy import text

def run_migration():
    """Run the migration to add new columns to community_posts table."""
    db = SessionLocal()
    try:
        # Read the SQL migration file
        migration_file = os.path.join(os.path.dirname(__file__), 'add_community_posts_columns.sql')
        with open(migration_file, 'r', encoding='utf-8') as f:
            migration_sql = f.read()
        
        # Execute the migration
        print("Running migration: add_community_posts_columns.sql")
        db.execute(text(migration_sql))
        db.commit()
        print("Migration completed successfully!")
        
    except Exception as e:
        db.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        db.close()

if __name__ == '__main__':
    run_migration()

