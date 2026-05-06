#!/usr/bin/env python3
"""
Drop legacy community_group_topics table.

Per-group topics were removed from the app; posts never referenced this table.
Run once against production/staging after deploying code that removes CommunityGroupTopic.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from app.db import engine


def main():
    print("Dropping community_group_topics if it exists...")
    try:
        with engine.connect() as conn:
            conn.execute(text("DROP TABLE IF EXISTS community_group_topics"))
            conn.commit()
        print("Done.")
        return 0
    except Exception as e:
        print(f"Error: {e}")
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
