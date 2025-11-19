"""
Seed training categories into the Settings system.

Usage:
  python scripts/seed_training_categories.py

This script is idempotent: running it multiple times will upsert the same categories.
"""

from app.db import SessionLocal
from app.models.models import SettingList, SettingItem


def seed_training_categories():
    """Seed training categories"""
    db = SessionLocal()
    try:
        # Get or create training_categories SettingList
        setting_list = db.query(SettingList).filter(SettingList.name == "training_categories").first()
        if not setting_list:
            setting_list = SettingList(name="training_categories")
            db.add(setting_list)
            db.flush()
        
        # Define categories
        categories = [
            {"label": "Safety", "value": "safety", "sort_index": 0},
            {"label": "Onboarding", "value": "onboarding", "sort_index": 1},
            {"label": "Technical", "value": "technical", "sort_index": 2},
            {"label": "Admin", "value": "admin", "sort_index": 3},
            {"label": "Compliance", "value": "compliance", "sort_index": 4},
            {"label": "Operations", "value": "operations", "sort_index": 5},
        ]
        
        # Upsert categories
        for cat_data in categories:
            existing = db.query(SettingItem).filter(
                SettingItem.list_id == setting_list.id,
                SettingItem.label == cat_data["label"]
            ).first()
            
            if existing:
                # Update sort_index if changed
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
        print("Training categories seeded successfully!")
        
    except Exception as e:
        db.rollback()
        print(f"Error seeding training categories: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_training_categories()

