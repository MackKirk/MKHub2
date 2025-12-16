#!/usr/bin/env python3
"""
Add photo_file_id column to community_groups and create community_group_topics table.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import engine, Base
from app.models import models

def main():
    print("Adding photo_file_id column and creating topics table...")
    try:
        from app.models.models import CommunityGroup, CommunityGroupTopic
        
        # Create photo_file_id column (will be ignored if it already exists)
        # SQLAlchemy doesn't have a direct way to alter tables, so we'll use raw SQL
        from sqlalchemy import text
        
        with engine.connect() as conn:
            # Check if photo_file_id column exists
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='community_groups' AND column_name='photo_file_id'
            """))
            
            if not result.fetchone():
                print("Adding photo_file_id column...")
                conn.execute(text("""
                    ALTER TABLE community_groups 
                    ADD COLUMN photo_file_id UUID REFERENCES file_objects(id) ON DELETE SET NULL
                """))
                conn.commit()
                print("✓ Added photo_file_id column")
            else:
                print("✓ photo_file_id column already exists")
        
        # Create topics table
        CommunityGroupTopic.__table__.create(bind=engine, checkfirst=True)
        print("✓ Created community_group_topics table")
        
        print("\n✓ All done!")
        return 0
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    exit(main())

