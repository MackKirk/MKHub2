"""
Seed document template categories from existing document_types.category values.

Usage:
  python scripts/seed_document_template_categories.py

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

from sqlalchemy import func

from app.db import SessionLocal
from app.models.models import DocumentType, SettingList, SettingItem
from app.services.document_template_categories import LIST_NAME, ensure_document_template_categories_list


def seed_document_template_categories():
    db = SessionLocal()
    try:
        ensure_document_template_categories_list(db)
        setting_list = db.query(SettingList).filter(SettingList.name == LIST_NAME).first()
        if not setting_list:
            raise RuntimeError(f"Failed to create {LIST_NAME} SettingList")

        rows = (
            db.query(DocumentType.category)
            .filter(DocumentType.category.isnot(None))
            .filter(func.trim(DocumentType.category) != "")
            .distinct()
            .all()
        )
        categories = sorted({str(r[0]).strip() for r in rows if r[0] and str(r[0]).strip()})

        existing_items = (
            db.query(SettingItem)
            .filter(SettingItem.list_id == setting_list.id)
            .all()
        )
        existing_labels = {str(i.label or "").strip() for i in existing_items}

        created = 0
        for idx, label in enumerate(categories):
            if label in existing_labels:
                print(f"Skipped (already exists): {label}")
                continue
            item = SettingItem(
                list_id=setting_list.id,
                label=label,
                value=label,
                sort_index=idx,
            )
            db.add(item)
            db.flush()
            created += 1
            print(f"Created category: {label} [{item.id}]")

        db.commit()
        print(
            f"\nDone. {created} new categor{'y' if created == 1 else 'ies'} added "
            f"({len(categories)} distinct from document_types)."
        )

    except Exception as e:
        db.rollback()
        print(f"Error seeding document template categories: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_document_template_categories()
