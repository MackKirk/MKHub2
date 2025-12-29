#!/usr/bin/env python3
"""
Add status_changed_at column to projects table.
This script works with both SQLite and PostgreSQL databases.
"""

import sys
import os

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text, inspect
from app.db import engine, Base
from app.config import settings
from app.models.models import Project

def run_migration():
    """Add status_changed_at column to projects table."""
    print(f"Connecting to database: {settings.database_url.split('@')[-1] if '@' in settings.database_url else settings.database_url}")
    
    with engine.connect() as conn:
        # Check if column already exists
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('projects')]
        
        if 'status_changed_at' in columns:
            print("Column 'status_changed_at' already exists. Skipping migration.")
            return
        
        print("Adding column 'status_changed_at' to projects table...")
        
        # Determine SQL syntax based on database type
        if settings.database_url.startswith('sqlite'):
            # SQLite syntax
            conn.execute(text("ALTER TABLE projects ADD COLUMN status_changed_at DATETIME"))
            conn.commit()
            
            # Update existing records
            conn.execute(text("""
                UPDATE projects 
                SET status_changed_at = created_at 
                WHERE status_label IS NOT NULL AND status_changed_at IS NULL
            """))
            conn.commit()
        else:
            # PostgreSQL syntax
            conn.execute(text("ALTER TABLE projects ADD COLUMN status_changed_at TIMESTAMP WITH TIME ZONE"))
            conn.commit()
            
            # Update existing records
            conn.execute(text("""
                UPDATE projects 
                SET status_changed_at = created_at 
                WHERE status_label IS NOT NULL AND status_changed_at IS NULL
            """))
            conn.commit()
        
        print("Migration completed successfully!")
        print("Column 'status_changed_at' added to projects table.")
        print("Existing projects with status have been updated with status_changed_at = created_at.")

if __name__ == "__main__":
    try:
        run_migration()
    except Exception as e:
        print(f"Error running migration: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

