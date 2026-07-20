"""
Script para adicionar permissões de Company Files (Documents) com estrutura hierárquica.
documents:access é o gate implícito da área (sincronizado automaticamente).
UI expõe apenas View / Edit; delete e move ficam embutidos no Edit.
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


def seed_documents_permissions():
    """Seed Company Files permissions with hierarchical structure"""
    db = SessionLocal()

    try:
        category = db.query(PermissionCategory).filter(PermissionCategory.name == "documents").first()
        if category:
            print("Category 'documents' already exists, updating...")
            category.label = "Company Files"
            category.description = "Permissions for Company Files. Blocking access blocks all sub-permissions."
            category.is_active = True
        else:
            category = PermissionCategory(
                name="documents",
                label="Company Files",
                description="Permissions for Company Files. Blocking access blocks all sub-permissions.",
                sort_index=4,
            )
            db.add(category)

        db.flush()

        documents_permissions = [
            {
                "key": "documents:access",
                "label": "Access Company Files",
                "description": "Implicit area gate. Auto-granted when any Company Files permission is enabled.",
                "sort_index": 1,
            },
            {
                "key": "documents:read",
                "label": "Company Files",
                "description": "View and download company files",
                "sort_index": 2,
            },
            {
                "key": "documents:write",
                "label": "Company Files",
                "description": "Upload, create, move, rename, and delete company files",
                "sort_index": 3,
            },
            {
                "key": "documents:delete",
                "label": "Delete Company Files",
                "description": "Granted with Edit Company Files (hidden in UI)",
                "sort_index": 4,
            },
            {
                "key": "documents:move",
                "label": "Move/Edit Company Files",
                "description": "Granted with Edit Company Files (hidden in UI)",
                "sort_index": 5,
            },
        ]

        for perm_data in documents_permissions:
            permission = db.query(PermissionDefinition).filter(PermissionDefinition.key == perm_data["key"]).first()
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
        print(f"\nSuccessfully seeded Company Files permissions!")
        print(f"Total permissions: {len(documents_permissions)}")

    except Exception as e:
        db.rollback()
        print(f"Error seeding Documents permissions: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_documents_permissions()
