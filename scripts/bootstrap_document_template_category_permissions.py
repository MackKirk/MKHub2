"""
Bootstrap document template category allow-lists for roles that already have Document Builder access.

Usage:
  python scripts/bootstrap_document_template_category_permissions.py

Idempotent: merges all current category SettingItem ids into each matching role's permissions.
Does not remove existing entries or modify users directly.
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
from app.models.models import Role
from app.services.document_template_categories import (
    PERMISSION_CONFIG_KEY,
    get_document_template_category_items,
)

BUILDER_KEYS = (
    "document_hub:builder:read",
    "document_hub:builder:write",
)


def _role_has_builder_access(permissions: dict) -> bool:
    if not isinstance(permissions, dict):
        return False
    return any(permissions.get(k) for k in BUILDER_KEYS)


def bootstrap_document_template_category_permissions():
    db = SessionLocal()
    try:
        items = get_document_template_category_items(db)
        category_ids = [str(item.id) for item in items]
        if not category_ids:
            print("No document template categories found. Run seed_document_template_categories.py first.")
            return

        roles = db.query(Role).all()
        updated = 0
        for role in roles:
            perms = dict(role.permissions or {})
            if not _role_has_builder_access(perms):
                continue
            existing = perms.get(PERMISSION_CONFIG_KEY)
            merged = sorted(set([*(existing or []), *category_ids])) if isinstance(existing, list) else category_ids
            if perms.get(PERMISSION_CONFIG_KEY) == merged:
                print(f"Skipped (already bootstrapped): {role.name}")
                continue
            perms[PERMISSION_CONFIG_KEY] = merged
            role.permissions = perms
            db.add(role)
            updated += 1
            print(f"Updated role {role.name}: {len(merged)} categories")

        db.commit()
        print(f"\nDone. Updated {updated} role(s) with {PERMISSION_CONFIG_KEY}.")
    except Exception as e:
        db.rollback()
        print(f"Error bootstrapping document template category permissions: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    bootstrap_document_template_category_permissions()
