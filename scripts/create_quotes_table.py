#!/usr/bin/env python3
"""
Script to create the quotes table in the database.
This can be run manually if needed, or the table will be created automatically on server startup.
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import Base, engine, SessionLocal
from app.models.models import Quote
from sqlalchemy import text

def main():
    print("Creating quotes table...")
    db = SessionLocal()
    try:
        # Check if table exists
        dialect = db.bind.dialect.name if getattr(db, "bind", None) is not None else ""
        
        if dialect == "sqlite":
            try:
                db.execute(text("SELECT 1 FROM quotes LIMIT 1")).fetchone()
                print("✅ Quotes table already exists")
            except Exception:
                Base.metadata.create_all(bind=engine, tables=[Quote.__table__])
                db.commit()
                print("✅ Created quotes table")
        else:
            # PostgreSQL / other dialects
            rows = db.execute(
                text(
                    """
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_name = 'quotes'
                    LIMIT 1
                    """
                )
            ).fetchall()
            if rows:
                print("✅ Quotes table already exists")
            else:
                Base.metadata.create_all(bind=engine, tables=[Quote.__table__])
                db.commit()
                print("✅ Created quotes table")
    except Exception as e:
        print(f"❌ Error creating quotes table: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    main()
