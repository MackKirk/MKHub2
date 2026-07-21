"""
Seed Training & Learning permissions.

training:access is an implicit area gate. training:manage remains active as a
legacy fallback, but is hidden from the permission UI.

Usage:
  python scripts/seed_training_permissions.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal
from app.models.models import PermissionCategory, PermissionDefinition, Role, User


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

        definitions = [
            {
                "key": "training:access",
                "label": "Access Training & Learning",
                "description": "Implicit area gate, enabled by Training permissions.",
                "sort_index": 0,
            },
            {
                "key": "training:dashboard:read",
                "label": "Dashboard",
                "description": "View organization training overview, schedule, and matrix.",
                "sort_index": 1,
            },
            {
                "key": "training:admin:read",
                "label": "Training Admin",
                "description": "View courses, course content, status, and completion metrics.",
                "sort_index": 2,
            },
            {
                "key": "training:admin:write",
                "label": "Training Admin",
                "description": "Create, edit, publish, duplicate, and delete courses, lessons, and quizzes.",
                "sort_index": 3,
            },
            {
                "key": "training:manage",
                "label": "Manage training courses (legacy)",
                "description": "Legacy LMS course authoring permission.",
                "sort_index": 4,
            },
        ]

        for item in definitions:
            permission = (
                db.query(PermissionDefinition)
                .filter(PermissionDefinition.key == item["key"])
                .first()
            )
            if not permission:
                permission = PermissionDefinition(key=item["key"])
                db.add(permission)
                print(f"Created {item['key']}")
            else:
                print(f"Updated {item['key']}")
            permission.category_id = cat.id
            permission.label = item["label"]
            permission.description = item["description"]
            permission.sort_index = item["sort_index"]
            permission.is_active = True

        db.commit()

        # Preserve the previous behavior for existing LMS managers.
        for owner, attr in [
            *[(role, "permissions") for role in db.query(Role).all()],
            *[(user, "permissions_override") for user in db.query(User).all()],
        ]:
            permission_map = getattr(owner, attr, None)
            if not isinstance(permission_map, dict) or not permission_map.get("training:manage"):
                continue
            updated = dict(permission_map)
            updated["training:access"] = True
            updated["training:dashboard:read"] = True
            updated["training:admin:read"] = True
            updated["training:admin:write"] = True
            setattr(owner, attr, updated)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
    print("Done")
