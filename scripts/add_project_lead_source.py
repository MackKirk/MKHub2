#!/usr/bin/env python3
"""
Migration script to add lead_source column to projects table.
This script works with both SQLite and PostgreSQL databases.
"""
import sys
import os

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal, engine
from app.config import settings
from sqlalchemy import text, inspect

def run_migration():
    """Add lead_source column to projects table."""
    print(f"Connecting to database: {settings.database_url.split('@')[-1] if '@' in settings.database_url else settings.database_url}")
    
    db = SessionLocal()
    try:
        # Check if column already exists
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('projects')]
        
        if 'lead_source' in columns:
            print("Column 'lead_source' already exists. Skipping migration.")
            return
        
        print("Adding column 'lead_source' to projects table...")
        
        # Determine SQL syntax based on database type
        if settings.database_url.startswith('sqlite'):
            # SQLite syntax
            db.execute(text("ALTER TABLE projects ADD COLUMN lead_source VARCHAR(100)"))
            db.commit()
        else:
            # PostgreSQL syntax
            db.execute(text("ALTER TABLE projects ADD COLUMN lead_source VARCHAR(100)"))
            db.commit()
        
        print("Migration completed successfully!")
        print("Column 'lead_source' added to projects table.")
        
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
