"""
Grant line-scoped project permissions from legacy business:projects:* keys, then
disable the legacy main keys so UI toggles (R&M / Production Projects & Opportunities)
are authoritative.

Run after seed_business_permissions.py (so definitions exist).

IMPORTANT (production-safe):
- Only updates JSON blobs on Role.permissions and User.permissions_override.
- Does not insert/delete PermissionDefinition rows or change permission ids.
- Preserves effective access: users who previously lacked write/read keep lacking it
  even after roles gain line-scoped keys from former legacy grants.
- Users who had effective legacy write/read keep access via the new line-scoped keys.

Usage:
  python scripts/migrate_business_line_permissions.py
  python scripts/migrate_business_line_permissions.py --dry-run
"""
from __future__ import annotations

import argparse
import os
import sys
from copy import deepcopy
from typing import Any, Dict, Optional, Tuple

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

from app.db import SessionLocal
from app.models.models import Role, User

LEGACY_READ = "business:projects:read"
LEGACY_WRITE = "business:projects:write"
CONSTRUCTION_READ = "business:construction:projects:read"
CONSTRUCTION_WRITE = "business:construction:projects:write"
RM_READ = "business:rm:projects:read"
RM_WRITE = "business:rm:projects:write"
CONSTRUCTION_READ_ALL = "business:construction:projects:read:all"
RM_READ_ALL = "business:rm:projects:read:all"


def _is_granted(value: Any) -> bool:
    if isinstance(value, list):
        return False
    if value is True:
        return True
    if value is False or value is None:
        return False
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "yes")
    return False


def _merge_maps(*maps: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for m in maps:
        if isinstance(m, dict):
            out.update(m)
    return out


def _effective_project_access(perm_map: Dict[str, Any]) -> Tuple[bool, bool]:
    """Return (has_read, has_write) using legacy + line-scoped main keys."""
    has_write = (
        _is_granted(perm_map.get(LEGACY_WRITE))
        or _is_granted(perm_map.get(CONSTRUCTION_WRITE))
        or _is_granted(perm_map.get(RM_WRITE))
    )
    has_read = (
        has_write
        or _is_granted(perm_map.get(LEGACY_READ))
        or _is_granted(perm_map.get(CONSTRUCTION_READ))
        or _is_granted(perm_map.get(RM_READ))
    )
    return has_read, has_write


def _expand_line_perms_from_legacy(perm_map: dict) -> bool:
    """Copy legacy main grants onto both business lines. Returns True if changed."""
    if not isinstance(perm_map, dict):
        return False
    before = deepcopy(perm_map)

    if _is_granted(perm_map.get(LEGACY_READ)):
        perm_map[CONSTRUCTION_READ] = True
        perm_map[RM_READ] = True
        perm_map[CONSTRUCTION_READ_ALL] = True
        perm_map[RM_READ_ALL] = True
    if _is_granted(perm_map.get(CONSTRUCTION_READ)):
        perm_map[CONSTRUCTION_READ_ALL] = True
    if _is_granted(perm_map.get(RM_READ)):
        perm_map[RM_READ_ALL] = True
    if _is_granted(perm_map.get(LEGACY_WRITE)):
        perm_map[CONSTRUCTION_WRITE] = True
        perm_map[RM_WRITE] = True

    for prefix in (
        "business:projects",
        "business:construction:projects",
        "business:rm:projects",
    ):
        for action in ("read", "write"):
            est_key = f"{prefix}:estimate:{action}"
            cost_key = f"{prefix}:costs:{action}"
            if _is_granted(perm_map.get(est_key)):
                perm_map[cost_key] = True

    return perm_map != before


def _clear_legacy_main_keys(perm_map: dict) -> bool:
    """Force legacy main read/write off when the key exists in this map."""
    if not isinstance(perm_map, dict):
        return False
    changed = False
    for key in (LEGACY_READ, LEGACY_WRITE):
        if key in perm_map and perm_map.get(key) is not False:
            perm_map[key] = False
            changed = True
    return changed


def _preserve_user_effective_access(
    override: dict,
    *,
    had_effective_read: bool,
    had_effective_write: bool,
) -> bool:
    """
    After roles gain line-scoped keys from former legacy grants, keep users who
    previously lacked effective access locked out via explicit override denies.
    """
    if not isinstance(override, dict):
        return False
    changed = False
    if not had_effective_write:
        for key in (CONSTRUCTION_WRITE, RM_WRITE):
            if override.get(key) is not False:
                override[key] = False
                changed = True
    if not had_effective_read:
        for key in (CONSTRUCTION_READ, RM_READ, CONSTRUCTION_READ_ALL, RM_READ_ALL):
            if override.get(key) is not False:
                override[key] = False
                changed = True
    return changed


def run(*, dry_run: bool = False) -> None:
    db = SessionLocal()
    roles_changed = 0
    users_changed = 0
    try:
        roles = db.query(Role).all()
        users = db.query(User).all()

        # Snapshot each user's effective access BEFORE mutating roles.
        user_effective: Dict[str, Tuple[bool, bool]] = {}
        for user in users:
            role_maps = [
                getattr(r, "permissions", None)
                for r in (getattr(user, "roles", None) or [])
            ]
            effective = _merge_maps(*role_maps, getattr(user, "permissions_override", None))
            user_effective[str(user.id)] = _effective_project_access(effective)

        # Roles whose maps gained line keys from legacy this run (need user preserve).
        role_ids_expanded_from_legacy: set[str] = set()

        for role in roles:
            p = getattr(role, "permissions", None)
            if not isinstance(p, dict):
                continue
            next_map = deepcopy(p)
            expanded = _expand_line_perms_from_legacy(next_map)
            cleared = _clear_legacy_main_keys(next_map)
            if expanded:
                role_ids_expanded_from_legacy.add(str(role.id))
            if expanded or cleared:
                roles_changed += 1
                if not dry_run:
                    role.permissions = next_map

        for user in users:
            o = getattr(user, "permissions_override", None)
            next_override: dict = deepcopy(o) if isinstance(o, dict) else {}
            changed = False
            if isinstance(o, dict):
                changed = _expand_line_perms_from_legacy(next_override) or changed
                changed = _clear_legacy_main_keys(next_override) or changed

            user_role_ids = {str(r.id) for r in (getattr(user, "roles", None) or [])}
            roles_expanded_for_user = bool(user_role_ids & role_ids_expanded_from_legacy)
            if roles_expanded_for_user:
                had_read, had_write = user_effective.get(str(user.id), (False, False))
                changed = (
                    _preserve_user_effective_access(
                        next_override,
                        had_effective_read=had_read,
                        had_effective_write=had_write,
                    )
                    or changed
                )

            if changed:
                users_changed += 1
                if not dry_run:
                    user.permissions_override = next_override

        if dry_run:
            db.rollback()
            print(
                f"[dry-run] Would update {roles_changed} role(s) and {users_changed} user override(s)."
            )
        else:
            db.commit()
            print(
                f"Migrated business line permissions: {roles_changed} role(s), {users_changed} user override(s)."
            )
            print(
                "Legacy business:projects:read/write forced false; line-scoped keys are authoritative."
            )
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute changes without committing.",
    )
    args = parser.parse_args()
    run(dry_run=args.dry_run)
