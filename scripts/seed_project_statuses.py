"""
Seed shared project/opportunity statuses into the Settings system (project_statuses list).

Usage:
  python scripts/seed_project_statuses.py

Idempotent: preserves existing SettingItem ids when the label already exists.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception as e:
    print(f"WARNING: Could not load .env file: {e}")

from app.db import SessionLocal
from app.models.models import SettingList, SettingItem

# Shared statuses (visibility controlled via meta flags)
PROJECT_STATUSES = [
    {
        "label": "Cancelled",
        "value": "#fee2e2",
        "sort_index": 10,
        "meta": {
            "show_in_project": True,
            "show_in_opportunity": True,
            "allow_edit_proposal": False,
        },
    },
]


def seed_project_statuses():
    db = SessionLocal()
    try:
        setting_list = db.query(SettingList).filter(SettingList.name == "project_statuses").first()
        if not setting_list:
            setting_list = SettingList(name="project_statuses")
            db.add(setting_list)
            db.flush()
            print("Created project_statuses SettingList")

        for status_data in PROJECT_STATUSES:
            label = status_data["label"]
            existing = (
                db.query(SettingItem)
                .filter(
                    SettingItem.list_id == setting_list.id,
                    SettingItem.label == label,
                )
                .first()
            )

            if existing:
                existing.value = status_data["value"]
                existing.sort_index = status_data["sort_index"]
                existing.meta = status_data.get("meta")
                db.add(existing)
                print(f"Updated status (id preserved): {label} [{existing.id}]")
            else:
                item = SettingItem(
                    list_id=setting_list.id,
                    label=label,
                    value=status_data["value"],
                    sort_index=status_data["sort_index"],
                    meta=status_data.get("meta"),
                )
                db.add(item)
                db.flush()
                print(f"Created status: {label} [{item.id}]")

        db.commit()
        print(f"\nSuccessfully upserted {len(PROJECT_STATUSES)} project status(es).")

    except Exception as e:
        db.rollback()
        print(f"Error seeding project statuses: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_project_statuses()
