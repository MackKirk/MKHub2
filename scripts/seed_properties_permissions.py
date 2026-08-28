"""Seed Properties module permissions."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

from app.db import SessionLocal
from app.models.models import PermissionCategory, PermissionDefinition


def seed_properties_permissions():
    db = SessionLocal()
    try:
        category = db.query(PermissionCategory).filter(PermissionCategory.name == "properties").first()
        if category:
            category.label = "Properties"
            category.description = "Property register, leases, insurance, permits, and family portfolio."
            category.is_active = True
        else:
            category = PermissionCategory(
                name="properties",
                label="Properties",
                description="Property register, leases, insurance, permits, and family portfolio.",
                sort_index=5,
            )
            db.add(category)
        db.flush()

        permissions = [
            {"key": "properties:access", "label": "Access Properties", "description": "Grants access to the Properties area.", "sort_index": 1},
            {"key": "properties:dashboard:read", "label": "Dashboard", "description": "View the Properties dashboard.", "sort_index": 2},
            {"key": "properties:company:read", "label": "Company properties (read)", "description": "View company-visible properties.", "sort_index": 10},
            {"key": "properties:company:write", "label": "Company properties (write)", "description": "Create and edit company-visible properties.", "sort_index": 11},
            {"key": "properties:family:read", "label": "Family properties (read)", "description": "View family/private properties.", "sort_index": 12},
            {"key": "properties:family:write", "label": "Family properties (write)", "description": "Create and edit family/private properties.", "sort_index": 13},
            {"key": "properties:documents:read", "label": "Property documents (read)", "description": "View property file attachments.", "sort_index": 20},
            {"key": "properties:documents:write", "label": "Property documents (write)", "description": "Upload and remove property files.", "sort_index": 21},
            {"key": "properties:permits:read", "label": "Permits & approvals (read)", "description": "View permits board and property permits.", "sort_index": 30},
            {"key": "properties:permits:write", "label": "Permits & approvals (write)", "description": "Manage permits and move them through stages.", "sort_index": 31},
        ]

        for perm_data in permissions:
            existing = db.query(PermissionDefinition).filter(PermissionDefinition.key == perm_data["key"]).first()
            if existing:
                existing.label = perm_data["label"]
                existing.description = perm_data["description"]
                existing.sort_index = perm_data["sort_index"]
                existing.is_active = True
                existing.category_id = category.id
            else:
                db.add(PermissionDefinition(category_id=category.id, **perm_data))

        db.commit()
        print(f"Seeded {len(permissions)} properties permissions.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding properties permissions: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_properties_permissions()
