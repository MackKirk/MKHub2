#!/usr/bin/env python3
"""
Add approval_status column to proposals table.
This script works with both SQLite and PostgreSQL databases.
"""

import sys
import os

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text, inspect
from app.db import engine
from app.config import settings

def run_migration():
    """Add approval_status field to proposals table."""
    print(f"Connecting to database: {settings.database_url.split('@')[-1] if '@' in settings.database_url else settings.database_url}")
    
    is_sqlite = settings.database_url.startswith('sqlite')
    
    with engine.connect() as conn:
        inspector = inspect(engine)
        
        # Check proposals table columns
        proposals_columns = [col['name'] for col in inspector.get_columns('proposals')]
        
        # Add approval_status column
        if 'approval_status' not in proposals_columns:
            print("Adding column 'approval_status' to proposals table...")
            if is_sqlite:
                conn.execute(text("ALTER TABLE proposals ADD COLUMN approval_status VARCHAR(50)"))
            else:
                conn.execute(text("ALTER TABLE proposals ADD COLUMN approval_status VARCHAR(50)"))
            conn.commit()
            print("Column 'approval_status' added successfully.")
        else:
            print("Column 'approval_status' already exists. Skipping.")
        
        # Create index for better query performance (PostgreSQL only)
        if not is_sqlite:
            indexes = [idx['name'] for idx in inspector.get_indexes('proposals')]
            
            if 'idx_proposals_approval_status' not in indexes:
                print("Creating index 'idx_proposals_approval_status'...")
                conn.execute(text("CREATE INDEX idx_proposals_approval_status ON proposals(approval_status)"))
                conn.commit()
                print("Index 'idx_proposals_approval_status' created successfully.")
            else:
                print("Index 'idx_proposals_approval_status' already exists. Skipping.")
        
        print("Migration completed successfully!")
        print("approval_status field added to proposals table.")

if __name__ == "__main__":
    try:
        run_migration()
    except Exception as e:
        print(f"Error running migration: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
