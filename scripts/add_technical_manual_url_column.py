#!/usr/bin/env python3
"""
Script to add technical_manual_url column to materials table
Works with both SQLite and PostgreSQL
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import engine, SessionLocal
from sqlalchemy import text

def main():
    print("Adding technical_manual_url column to materials table...")
    
    db = SessionLocal()
    try:
        dialect = db.bind.dialect.name
        print(f"Database dialect: {dialect}")
        
        # Check if column already exists
        column_exists = False
        
        if dialect == "sqlite":
            # SQLite: use PRAGMA
            result = db.execute(text("PRAGMA table_info(materials)"))
            columns = [row[1] for row in result.fetchall()]
            column_exists = 'technical_manual_url' in columns
        else:
            # PostgreSQL: use information_schema
            result = db.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='materials' AND column_name='technical_manual_url'
            """))
            column_exists = result.fetchone() is not None
        
        if column_exists:
            print("[OK] Column technical_manual_url already exists in materials table")
            print("If you're still getting errors, try restarting the server.")
            return 0
        
        # Add the column
        print("Adding column...")
        if dialect == "sqlite":
            db.execute(text("ALTER TABLE materials ADD COLUMN technical_manual_url TEXT"))
        else:
            # PostgreSQL - use TEXT instead of VARCHAR for consistency
            try:
                db.execute(text("ALTER TABLE materials ADD COLUMN technical_manual_url TEXT"))
            except Exception as alter_error:
                # If column already exists (race condition), that's OK
                if "already exists" in str(alter_error).lower() or "duplicate" in str(alter_error).lower():
                    print("[OK] Column already exists (detected during ALTER)")
                    db.rollback()
                    return 0
                raise
        
        db.commit()
        print("[OK] Successfully added technical_manual_url column to materials table")
        print("Please restart the server for changes to take effect.")
        return 0
        
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        db.close()

if __name__ == '__main__':
    exit(main())

