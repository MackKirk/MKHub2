#!/usr/bin/env python3
"""
Script to add document_file_id column to community_posts table.
"""
import os
import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db import engine
from sqlalchemy import text

def run_migration():
    """Run the community posts document_file_id migration."""
    script_path = Path(__file__).parent / "add_community_posts_document_file_id.sql"
    
    print(f"Running migration: {script_path.name}")
    
    with open(script_path, 'r', encoding='utf-8') as f:
        sql_content = f.read()
    
    with engine.connect() as conn:
        conn.execute(text(sql_content))
        conn.commit()
    
    print("Migration completed successfully!")

if __name__ == "__main__":
    run_migration()

