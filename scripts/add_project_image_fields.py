#!/usr/bin/env python3
"""
Migration script to add image_file_object_id and image_manually_set columns to projects table.
"""
import sys
import os

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal
from sqlalchemy import text

def run_migration():
    db = SessionLocal()
    try:
        # Check if columns already exist
        result = db.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'projects' 
            AND column_name IN ('image_file_object_id', 'image_manually_set')
        """))
        existing_columns = {row[0] for row in result.fetchall()}
        
        # Add image_file_object_id if it doesn't exist
        if 'image_file_object_id' not in existing_columns:
            print("Adding image_file_object_id column...")
            db.execute(text("""
                ALTER TABLE projects 
                ADD COLUMN image_file_object_id UUID NULL
            """))
            print("[OK] Added image_file_object_id column")
        else:
            print("[OK] image_file_object_id column already exists")
        
        # Add image_manually_set if it doesn't exist
        if 'image_manually_set' not in existing_columns:
            print("Adding image_manually_set column...")
            db.execute(text("""
                ALTER TABLE projects 
                ADD COLUMN image_manually_set BOOLEAN NOT NULL DEFAULT FALSE
            """))
            print("[OK] Added image_manually_set column")
        else:
            print("[OK] image_manually_set column already exists")
        
        db.commit()
        print("\nMigration completed successfully!")
        
    except Exception as e:
        db.rollback()
        print(f"Error running migration: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()

