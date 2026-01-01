"""
Seed report categories into the Settings system.

Usage:
  python scripts/seed_report_categories.py

This script is idempotent: running it multiple times will upsert the same categories.
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
        # Commercial categories
        categories = [
            {"label": "General", "value": "general", "sort_index": 0, "meta": {"group": "commercial"}},
            {"label": "Legal Action", "value": "legal-action", "sort_index": 1, "meta": {"group": "commercial"}},
            {"label": "Client Request", "value": "client-request", "sort_index": 2, "meta": {"group": "commercial"}},
            {"label": "Change Order Request", "value": "change-order-request", "sort_index": 3, "meta": {"group": "commercial"}},
            {"label": "Client Communication Log", "value": "client-communication-log", "sort_index": 4, "meta": {"group": "commercial"}},
            {"label": "Client Contact Update", "value": "client-contact-update", "sort_index": 5, "meta": {"group": "commercial"}},
            # Production / Execution categories
            {"label": "Daily Update", "value": "daily-update", "sort_index": 10, "meta": {"group": "production"}},
            {"label": "Site Event", "value": "site-event", "sort_index": 11, "meta": {"group": "production"}},
            {"label": "Accident / Safety Incident", "value": "accident-safety-incident", "sort_index": 12, "meta": {"group": "production"}},
            {"label": "Positive Event", "value": "positive-event", "sort_index": 13, "meta": {"group": "production"}},
            {"label": "Deficiency Found", "value": "deficiency-found", "sort_index": 14, "meta": {"group": "production"}},
            {"label": "Work Completed", "value": "work-completed", "sort_index": 15, "meta": {"group": "production"}},
            {"label": "Weather Impact", "value": "weather-impact", "sort_index": 16, "meta": {"group": "production"}},
            # Financial categories
            {"label": "Additional Income", "value": "additional-income", "sort_index": 20, "meta": {"group": "financial"}},
            {"label": "Additional Expense", "value": "additional-expense", "sort_index": 21, "meta": {"group": "financial"}},
            {"label": "Estimate Changes", "value": "estimate-changes", "sort_index": 22, "meta": {"group": "financial"}},
        ]
        
        # Upsert categories
        for cat_data in categories:
            existing = db.query(SettingItem).filter(
                SettingItem.list_id == setting_list.id,
                SettingItem.label == cat_data["label"]
            ).first()
            
            if existing:
                # Update value, sort_index, and meta if changed
                if existing.value != cat_data["value"]:
                    existing.value = cat_data["value"]
                if existing.sort_index != cat_data["sort_index"]:
                    existing.sort_index = cat_data["sort_index"]
                if "meta" in cat_data:
                    existing.meta = cat_data["meta"]
                db.add(existing)
            else:
                item = SettingItem(
                    list_id=setting_list.id,
                    label=cat_data["label"],
                    value=cat_data["value"],
                    sort_index=cat_data["sort_index"],
                    meta=cat_data.get("meta"),
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

