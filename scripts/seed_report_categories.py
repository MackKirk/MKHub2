"""
Seed report categories into the Settings system.

Usage:
  python scripts/seed_report_categories.py

This script is idempotent: running it multiple times will upsert the same categories.
"""

from app.db import SessionLocal
from app.models.models import SettingList, SettingItem


def seed_report_categories():
    """Seed report categories"""
    db = SessionLocal()
    try:
        # Get or create report_categories SettingList
        setting_list = db.query(SettingList).filter(SettingList.name == "report_categories").first()
        if not setting_list:
            setting_list = SettingList(name="report_categories")
            db.add(setting_list)
            db.flush()
        
        # Define categories
        categories = [
            {"label": "Daily Update", "value": "daily-update", "sort_index": 0},
            {"label": "Site Event", "value": "site-event", "sort_index": 1},
            {"label": "Accident", "value": "accident", "sort_index": 2},
            {"label": "Positive Event", "value": "positive-event", "sort_index": 3},
            {"label": "Legal Action", "value": "legal-action", "sort_index": 4},
            {"label": "General", "value": "general", "sort_index": 5},
        ]
        
        # Upsert categories
        for cat_data in categories:
            existing = db.query(SettingItem).filter(
                SettingItem.list_id == setting_list.id,
                SettingItem.label == cat_data["label"]
            ).first()
            
            if existing:
                # Update value and sort_index if changed
                if existing.value != cat_data["value"]:
                    existing.value = cat_data["value"]
                if existing.sort_index != cat_data["sort_index"]:
                    existing.sort_index = cat_data["sort_index"]
                db.add(existing)
            else:
                item = SettingItem(
                    list_id=setting_list.id,
                    label=cat_data["label"],
                    value=cat_data["value"],
                    sort_index=cat_data["sort_index"],
                )
                db.add(item)
        
        db.commit()
        print("Report categories seeded successfully!")
        
    except Exception as e:
        db.rollback()
        print(f"Error seeding report categories: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_report_categories()

