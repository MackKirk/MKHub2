"""
Grant business:construction:projects:* and business:rm:projects:* when legacy business:projects:* is set.
Run after seed_business_permissions.py (so definitions exist).

IMPORTANT (production-safe):
- Only updates JSON blobs on Role.permissions and User.permissions_override.
- Does not insert/delete PermissionDefinition rows or change permission ids.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

from app.db import SessionLocal
from app.models.models import Role, User


def _merge_line_perms(perm_map: dict) -> None:
    if not isinstance(perm_map, dict):
        return
    if perm_map.get("business:projects:read"):
        perm_map["business:construction:projects:read"] = True
        perm_map["business:rm:projects:read"] = True
    if perm_map.get("business:projects:write"):
        perm_map["business:construction:projects:write"] = True
        perm_map["business:rm:projects:write"] = True


def run():
    db = SessionLocal()
    try:
        for role in db.query(Role).all():
            p = getattr(role, "permissions", None)
            if not isinstance(p, dict):
                continue
            _merge_line_perms(p)
            role.permissions = p
        for user in db.query(User).all():
            o = getattr(user, "permissions_override", None)
            if not isinstance(o, dict):
                continue
            _merge_line_perms(o)
            user.permissions_override = o
        db.commit()
        print("Migrated business line permissions on roles and user overrides.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
