"""
Script para adicionar permissões de Inventory com estrutura hierárquica.
A primeira permissão sempre é a liberação da área (inventory:access).
Se bloquear inventory:access, automaticamente bloqueia todas as sub-permissões.
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


def seed_inventory_permissions():
    """Seed Inventory permissions with hierarchical structure"""
    db = SessionLocal()
    
    try:
        # Create or get Inventory category
        category = db.query(PermissionCategory).filter(PermissionCategory.name == "inventory").first()
        if category:
            print(f"Category 'inventory' already exists, updating...")
            category.label = "Inventory"
            category.description = "Permissions for Inventory area. Blocking access blocks all sub-permissions."
            category.is_active = True
        else:
            category = PermissionCategory(
                name="inventory",
                label="Inventory",
                description="Permissions for Inventory area. Blocking access blocks all sub-permissions.",
                sort_index=2,  # After Business
            )
            db.add(category)
        
        db.flush()  # To get the category ID
        
        # Define Inventory permissions with hierarchical structure
        # First permission is always the area access
        inventory_permissions = [
            {
                "key": "inventory:access",
                "label": "Access Inventory",
                "description": "Grants access to the Inventory area. Required for all Inventory functions. If disabled, all Inventory permissions are blocked.",
                "sort_index": 1,
            },
            {
                "key": "inventory:suppliers:read",
                "label": "View Suppliers Tab",
                "description": "Allows viewing the Suppliers tab in the Inventory area",
                "sort_index": 2,
            },
            {
                "key": "inventory:suppliers:write",
                "label": "Edit Suppliers Tab",
                "description": "Allows editing the Suppliers tab in the Inventory area (creating, updating, and deleting suppliers)",
                "sort_index": 3,
            },
            {
                "key": "inventory:products:read",
                "label": "View Products Tab",
                "description": "Allows viewing the Products tab in the Inventory area",
                "sort_index": 4,
            },
            {
                "key": "inventory:products:write",
                "label": "Edit Products Tab",
                "description": "Allows editing the Products tab in the Inventory area (creating, updating, and deleting products)",
                "sort_index": 5,
            },
        ]
        
        for perm_data in inventory_permissions:
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
        print(f"\nSuccessfully seeded Inventory permissions!")
        print(f"Total permissions: {len(inventory_permissions)}")
        
    except Exception as e:
        db.rollback()
        print(f"Error seeding Inventory permissions: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_inventory_permissions()

