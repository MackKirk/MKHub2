#!/usr/bin/env python3
"""
Run migration to add community_post_likes and community_post_comments tables.
"""
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db import get_db
from app.models.models import Base
from sqlalchemy import text

def main():
    db = next(get_db())
    
    migration_file = Path(__file__).parent / "add_community_likes_comments.sql"
    sql = migration_file.read_text()
    
    print(f"Running migration from {migration_file}...")
    db.execute(text(sql))
    db.commit()
    print("Migration completed successfully!")

if __name__ == "__main__":
    main()

