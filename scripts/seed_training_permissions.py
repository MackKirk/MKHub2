"""
Seed training:manage permission (LMS course authoring). Run once per environment.

Usage:
  python scripts/seed_training_permissions.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal
from app.models.models import PermissionCategory, PermissionDefinition


def main():
    db = SessionLocal()
    try:
        cat = db.query(PermissionCategory).filter(PermissionCategory.name == "training").first()
        if not cat:
            cat = PermissionCategory(
                name="training",
                label="Training & Learning",
                description="Internal LMS and course management",
                sort_index=45,
                is_active=True,
            )
            db.add(cat)
            db.flush()

        existing = db.query(PermissionDefinition).filter(PermissionDefinition.key == "training:manage").first()
        if not existing:
            db.add(
                PermissionDefinition(
                    category_id=cat.id,
                    key="training:manage",
                    label="Manage training courses (LMS)",
                    description="Create, edit, publish internal courses, modules, lessons, and quizzes.",
                    sort_index=0,
                    is_active=True,
                )
            )
            db.commit()
            print("Created training:manage permission")
        else:
            print("training:manage already exists")
    finally:
        db.close()


if __name__ == "__main__":
    main()
    print("Done")
