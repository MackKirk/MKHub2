"""
Script para adicionar permissões de Settings.
settings:access é gate implícito da área; filhos granulares por aba/card.
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

# Check database type before importing
database_url = os.getenv("DATABASE_URL", "sqlite:///./var/dev.db")

if database_url.startswith("postgresql"):
    try:
        import psycopg2
    except ImportError:
        print("ERROR: PostgreSQL database detected but psycopg2 is not installed.")
        sys.exit(1)

try:
    from app.db import SessionLocal
    from app.models.models import PermissionCategory, PermissionDefinition
except ImportError as e:
    print(f"ERROR: Failed to import database components: {e}")
    sys.exit(1)


def seed_settings_permissions():
    """Seed Settings permissions with hierarchical structure"""
    db = SessionLocal()

    try:
        category = db.query(PermissionCategory).filter(PermissionCategory.name == "settings").first()
        if category:
            print("Category 'settings' already exists, updating...")
            category.label = "Settings"
            category.description = (
                "Permissions for System Settings — lookup lists, files & assets, and templates."
            )
            category.is_active = True
        else:
            category = PermissionCategory(
                name="settings",
                label="Settings",
                description=(
                    "Permissions for System Settings — lookup lists, files & assets, and templates."
                ),
                sort_index=6,
            )
            db.add(category)

        db.flush()

        settings_permissions = [
            {
                "key": "settings:access",
                "label": "Access Settings",
                "description": (
                    "Implicit area gate for System Settings. Auto-enabled when any Settings "
                    "permission is granted. Legacy full-access key — still grants all settings areas."
                ),
                "sort_index": 0,
            },
            {
                "key": "settings:lookup_lists:read",
                "label": "Lookup lists",
                "description": "View lookup lists tab (statuses, divisions, payment terms, timesheet defaults, etc.).",
                "sort_index": 1,
            },
            {
                "key": "settings:lookup_lists:write",
                "label": "Lookup lists",
                "description": "Create, edit, and delete lookup list items.",
                "sort_index": 2,
            },
            {
                "key": "settings:files_assets:read",
                "label": "Files & assets",
                "description": "View file categories, brand assets, and certificate artwork settings.",
                "sort_index": 3,
            },
            {
                "key": "settings:files_assets:write",
                "label": "Files & assets",
                "description": "Manage file categories, brand logos, and certificate backgrounds.",
                "sort_index": 4,
            },
            {
                "key": "settings:permission_templates:read",
                "label": "Permission templates",
                "description": "View permission template bundles used on user Permissions tabs.",
                "sort_index": 5,
            },
            {
                "key": "settings:permission_templates:write",
                "label": "Permission templates",
                "description": "Create, edit, duplicate, and delete permission templates.",
                "sort_index": 6,
            },
            {
                "key": "settings:terms_templates:read",
                "label": "Terms templates",
                "description": "View preset terms for proposals and quotes.",
                "sort_index": 7,
            },
            {
                "key": "settings:terms_templates:write",
                "label": "Terms templates",
                "description": "Create, edit, and delete terms templates.",
                "sort_index": 8,
            },
            {
                "key": "settings:document_backgrounds:read",
                "label": "Document creator — background templates",
                "description": "View page background images for the Document creator.",
                "sort_index": 9,
            },
            {
                "key": "settings:document_backgrounds:write",
                "label": "Document creator — background templates",
                "description": "Upload, edit, and delete document background templates.",
                "sort_index": 10,
            },
            {
                "key": "settings:document_templates:read",
                "label": "Document creator — document templates",
                "description": "View preset document layouts offered when creating documents.",
                "sort_index": 11,
            },
            {
                "key": "settings:document_templates:write",
                "label": "Document creator — document templates",
                "description": "Create, edit, duplicate, and delete document template presets.",
                "sort_index": 12,
            },
        ]

        for perm_data in settings_permissions:
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

        db.commit()
        print("\nSuccessfully seeded Settings permissions!")
        print(f"Total permissions: {len(settings_permissions)}")

    except Exception as e:
        db.rollback()
        print(f"Error seeding Settings permissions: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_settings_permissions()
