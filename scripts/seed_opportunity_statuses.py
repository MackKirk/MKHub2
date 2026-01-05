"""
Seed opportunity statuses (Prospecting, Sent to Customer, Refused) into the Settings system.

Usage:
  python scripts/seed_opportunity_statuses.py

This script is idempotent: running it multiple times will upsert the same statuses.
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables first
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception as e:
    print(f"WARNING: Could not load .env file: {e}")

from app.db import SessionLocal
from app.models.models import SettingList, SettingItem


def seed_opportunity_statuses():
    """Seed opportunity statuses into project_statuses"""
    db = SessionLocal()
    try:
        # Get or create project_statuses SettingList
        setting_list = db.query(SettingList).filter(SettingList.name == "project_statuses").first()
        if not setting_list:
            setting_list = SettingList(name="project_statuses")
            db.add(setting_list)
            db.flush()
            print("Created project_statuses SettingList")
        
        # Define opportunity statuses (with subtle, light colors)
        opportunity_statuses = [
            {"label": "Prospecting", "value": "#fef3c7", "sort_index": 0},  # Light yellow/amber
            {"label": "Sent to Customer", "value": "#dbeafe", "sort_index": 1},  # Light blue
            {"label": "Refused", "value": "#fee2e2", "sort_index": 2},  # Light red
        ]
        
        # Upsert opportunity statuses
        for status_data in opportunity_statuses:
            existing = db.query(SettingItem).filter(
                SettingItem.list_id == setting_list.id,
                SettingItem.label == status_data["label"]
            ).first()
            
            if existing:
                # Update value and sort_index if changed
                if existing.value != status_data["value"]:
                    existing.value = status_data["value"]
                if existing.sort_index != status_data["sort_index"]:
                    existing.sort_index = status_data["sort_index"]
                db.add(existing)
                print(f"Updated status: {status_data['label']}")
            else:
                item = SettingItem(
                    list_id=setting_list.id,
                    label=status_data["label"],
                    value=status_data["value"],
                    sort_index=status_data["sort_index"],
                )
                db.add(item)
                print(f"Created status: {status_data['label']}")
        
        db.commit()
        print("Opportunity statuses seeded successfully!")
        
    except Exception as e:
        db.rollback()
        print(f"Error seeding opportunity statuses: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_opportunity_statuses()

