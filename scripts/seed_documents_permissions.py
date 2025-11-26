"""
Script para adicionar permissões de Documents com estrutura hierárquica.
A primeira permissão sempre é a liberação da área (documents:access).
Se bloquear documents:access, automaticamente bloqueia todas as sub-permissões.
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
    """Seed Documents permissions with hierarchical structure"""
    db = SessionLocal()
    
    try:
        # Create or get Documents category
        category = db.query(PermissionCategory).filter(PermissionCategory.name == "documents").first()
        if category:
            print(f"Category 'documents' already exists, updating...")
            category.label = "Documents"
            category.description = "Permissions for Documents area. Blocking access blocks all sub-permissions."
            category.is_active = True
        else:
            category = PermissionCategory(
                name="documents",
                label="Documents",
                description="Permissions for Documents area. Blocking access blocks all sub-permissions.",
                sort_index=3,  # After Settings
            )
            db.add(category)
        
        db.flush()  # To get the category ID
        
        # Define Documents permissions with hierarchical structure
        # First permission is always the area access
        documents_permissions = [
            {
                "key": "documents:access",
                "label": "Access Documents",
                "description": "Grants access to the Documents area. Required for all Documents functions. If disabled, all Documents permissions are blocked.",
                "sort_index": 1,
            },
            {
                "key": "documents:read",
                "label": "View Documents",
                "description": "Allows viewing and downloading documents",
                "sort_index": 2,
            },
            {
                "key": "documents:write",
                "label": "Add Documents",
                "description": "Allows uploading and creating new documents",
                "sort_index": 3,
            },
            {
                "key": "documents:delete",
                "label": "Delete Documents",
                "description": "Allows deleting documents",
                "sort_index": 4,
            },
            {
                "key": "documents:move",
                "label": "Move/Edit Documents",
                "description": "Allows moving documents between folders and editing document metadata",
                "sort_index": 5,
            },
        ]
        
        for perm_data in documents_permissions:
            # Find or create permission
            permission = db.query(PermissionDefinition).filter(PermissionDefinition.key == perm_data["key"]).first()
            if permission:
                # Update existing permission
                permission.category_id = category.id
                permission.label = perm_data["label"]
                permission.description = perm_data.get("description")
                permission.sort_index = perm_data["sort_index"]
                permission.is_active = True
                print(f"Updated permission: {perm_data['key']}")
            else:
                # Create new permission
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
        print(f"\nSuccessfully seeded Documents permissions!")
        print(f"Total permissions: {len(documents_permissions)}")
        
    except Exception as e:
        db.rollback()
        print(f"Error seeding Documents permissions: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_documents_permissions()

