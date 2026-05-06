#!/usr/bin/env python3
"""
Add photo_file_id column to community_groups if missing.

Note: Per-group topics (community_group_topics) were removed from the product.
Use scripts/drop_community_group_topics.py to drop that table on databases where it still exists.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from app.db import engine


def main():
    print("Ensuring photo_file_id on community_groups...")
    try:
        with engine.connect() as conn:
            result = conn.execute(
                text(
                    """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name='community_groups' AND column_name='photo_file_id'
                """
                )
            )

            if not result.fetchone():
                print("Adding photo_file_id column...")
                conn.execute(
                    text(
                        """
                    ALTER TABLE community_groups
                    ADD COLUMN photo_file_id UUID REFERENCES file_objects(id) ON DELETE SET NULL
                """
                    )
                )
                conn.commit()
                print("Added photo_file_id column")
            else:
                print("photo_file_id column already exists")

        print("Done.")
        return 0
    except Exception as e:
        print(f"Error: {e}")
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
