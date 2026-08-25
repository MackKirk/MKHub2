"""
Seed Documents hub permissions (Document Builder, Signature Requests/Editor, backgrounds, templates).

Creates category document_hub (label Documents). Migrates role/user/template grants from legacy
keys without deleting data. Deactivates settings:document_* defs so they leave Settings UI.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception as e:
    print(f"WARNING: Could not load .env file: {e}")

database_url = os.getenv("DATABASE_URL", "sqlite:///./var/dev.db")

if database_url.startswith("postgresql"):
    try:
        import psycopg2
    except ImportError:
        print("ERROR: PostgreSQL database detected but psycopg2 is not installed.")
        sys.exit(1)

try:
    from app.db import SessionLocal
    from app.models.models import PermissionCategory, PermissionDefinition, PermissionTemplate, Role, User
except ImportError as e:
    print(f"ERROR: Failed to import database components: {e}")
    sys.exit(1)


HUB_PERMISSIONS = [
    {
        "key": "document_hub:builder:read",
        "label": "Document Builder",
        "description": "View and open the Document Builder hub.",
        "sort_index": 1,
    },
    {
        "key": "document_hub:builder:write",
        "label": "Document Builder",
        "description": "Create and edit documents in the Document Builder.",
        "sort_index": 2,
    },
    {
        "key": "document_hub:signature_requests:read",
        "label": "Signature Requests",
        "description": "View the organization Signature Requests admin list.",
        "sort_index": 3,
    },
    {
        "key": "document_hub:signature_requests:write",
        "label": "Signature Requests",
        "description": "Cancel requests, extend deadlines, and disable access blocking.",
        "sort_index": 4,
    },
    {
        "key": "document_hub:signature_editor:read",
        "label": "Signature Editor",
        "description": "View the Signature Editor and signature templates.",
        "sort_index": 5,
    },
    {
        "key": "document_hub:signature_editor:write",
        "label": "Signature Editor",
        "description": "Create and edit signature field templates.",
        "sort_index": 6,
    },
    {
        "key": "document_hub:backgrounds:read",
        "label": "Document Builder - Backgrounds",
        "description": "View page background images for the Document Builder.",
        "sort_index": 7,
    },
    {
        "key": "document_hub:backgrounds:write",
        "label": "Document Builder - Backgrounds",
        "description": "Upload, edit, and delete document background templates.",
        "sort_index": 8,
    },
    {
        "key": "document_hub:templates:read",
        "label": "Document Builder - Templates",
        "description": "View preset document layouts offered when creating documents.",
        "sort_index": 9,
    },
    {
        "key": "document_hub:templates:write",
        "label": "Document Builder - Templates",
        "description": "Create, edit, duplicate, and delete document template presets.",
        "sort_index": 10,
    },
    {
        "key": "documents:signatures:block_access",
        "label": "Signature — Block Hub Access",
        "description": "Allow enabling Hub access blocking on overdue Document Builder signatures.",
        "sort_index": 11,
    },
]

# legacy key -> new hub keys to grant
LEGACY_GRANT_MAP = {
    "documents:read": ["document_hub:builder:read", "document_hub:signature_editor:read"],
    "documents:write": [
        "document_hub:builder:read",
        "document_hub:builder:write",
        "document_hub:signature_editor:read",
        "document_hub:signature_editor:write",
    ],
    "documents:signatures:manage": [
        "document_hub:signature_requests:read",
        "document_hub:signature_requests:write",
    ],
    "settings:document_backgrounds:read": ["document_hub:backgrounds:read"],
    "settings:document_backgrounds:write": [
        "document_hub:backgrounds:read",
        "document_hub:backgrounds:write",
    ],
    "settings:document_templates:read": ["document_hub:templates:read"],
    "settings:document_templates:write": [
        "document_hub:templates:read",
        "document_hub:templates:write",
    ],
}

LEGACY_SETTINGS_DOCUMENT_KEYS = [
    "settings:document_backgrounds:read",
    "settings:document_backgrounds:write",
    "settings:document_templates:read",
    "settings:document_templates:write",
]


def _is_granted(value) -> bool:
    if value is True or value == 1:
        return True
    if isinstance(value, str) and value.strip().lower() in ("1", "true", "yes", "on"):
        return True
    return False


def _migrate_perm_map(perms: dict | None) -> tuple[dict, bool]:
    if not isinstance(perms, dict):
        return {}, False
    next_map = dict(perms)
    changed = False
    for legacy, targets in LEGACY_GRANT_MAP.items():
        if not _is_granted(next_map.get(legacy)):
            continue
        for key in targets:
            if not _is_granted(next_map.get(key)):
                next_map[key] = True
                changed = True
    return next_map, changed


def _migrate_key_list(keys: list | None) -> tuple[list, bool]:
    if not isinstance(keys, list):
        return [], False
    out = list(keys)
    key_set = set(str(k) for k in out)
    changed = False
    for legacy, targets in LEGACY_GRANT_MAP.items():
        if legacy not in key_set:
            continue
        for key in targets:
            if key not in key_set:
                out.append(key)
                key_set.add(key)
                changed = True
    return out, changed


def seed_document_hub_permissions():
    db = SessionLocal()
    try:
        category = db.query(PermissionCategory).filter(PermissionCategory.name == "document_hub").first()
        if category:
            print("Category 'document_hub' already exists, updating...")
            category.label = "Documents"
            category.description = (
                "Document Builder, Signature Requests, Signature Editor, backgrounds, and templates."
            )
            category.is_active = True
        else:
            # Place near Company Files (documents sort_index ~4)
            category = PermissionCategory(
                name="document_hub",
                label="Documents",
                description=(
                    "Document Builder, Signature Requests, Signature Editor, backgrounds, and templates."
                ),
                sort_index=4,
            )
            db.add(category)
            print("Created category 'document_hub' (Documents)")

        db.flush()

        for perm_data in HUB_PERMISSIONS:
            permission = (
                db.query(PermissionDefinition)
                .filter(PermissionDefinition.key == perm_data["key"])
                .first()
            )
            if permission:
                permission.category_id = category.id
                permission.label = perm_data["label"]
                permission.description = perm_data.get("description")
                permission.sort_index = perm_data["sort_index"]
                permission.is_active = True
                print(f"Updated permission: {perm_data['key']}")
            else:
                permission = PermissionDefinition(
                    category_id=category.id,
                    key=perm_data["key"],
                    label=perm_data["label"],
                    description=perm_data.get("description"),
                    sort_index=perm_data["sort_index"],
                )
                db.add(permission)
                print(f"Created permission: {perm_data['key']}")

        # Keep manage key for aliases but hide from Company Files UI by deactivating there;
        # leave active under documents category until aliases cover all callers — mark inactive
        # so it does not appear as a free-floating Documents Company Files row.
        manage = (
            db.query(PermissionDefinition)
            .filter(PermissionDefinition.key == "documents:signatures:manage")
            .first()
        )
        if manage:
            manage.is_active = False
            manage.description = (
                "Legacy alias for document_hub:signature_requests:write (hidden from permission UI)."
            )
            print("Deactivated legacy documents:signatures:manage (kept for aliases)")

        for key in LEGACY_SETTINGS_DOCUMENT_KEYS:
            perm = db.query(PermissionDefinition).filter(PermissionDefinition.key == key).first()
            if perm:
                perm.is_active = False
                perm.description = (
                    (perm.description or "")
                    + " Legacy key — use document_hub:backgrounds/templates instead."
                ).strip()
                print(f"Deactivated legacy Settings key: {key}")

        db.flush()

        # Migrate role permission maps
        roles_updated = 0
        for role in db.query(Role).all():
            next_map, changed = _migrate_perm_map(getattr(role, "permissions", None) or {})
            if changed:
                role.permissions = next_map
                roles_updated += 1
        print(f"Migrated role permission maps: {roles_updated}")

        users_updated = 0
        for user in db.query(User).all():
            override = getattr(user, "permissions_override", None)
            if not isinstance(override, dict) or not override:
                continue
            next_map, changed = _migrate_perm_map(override)
            if changed:
                user.permissions_override = next_map
                users_updated += 1
        print(f"Migrated user permission overrides: {users_updated}")

        templates_updated = 0
        for tmpl in db.query(PermissionTemplate).all():
            keys = getattr(tmpl, "permission_keys", None)
            next_keys, changed = _migrate_key_list(keys)
            if changed:
                tmpl.permission_keys = next_keys
                templates_updated += 1
        print(f"Migrated permission templates: {templates_updated}")

        db.commit()
        print("\nSuccessfully seeded Documents hub permissions!")
        print(f"Total hub permissions: {len(HUB_PERMISSIONS)}")

    except Exception as e:
        db.rollback()
        print(f"Error seeding Document hub permissions: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_document_hub_permissions()
