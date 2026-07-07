"""
Script para adicionar permissões de Inventory com estrutura hierárquica (Suppliers / Products + tabs).
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
    from app.models.models import PermissionCategory, PermissionDefinition
except ImportError as e:
    print(f"ERROR: Failed to import database components: {e}")
    sys.exit(1)


def seed_inventory_permissions():
    """Seed Inventory permissions with hierarchical structure."""
    db = SessionLocal()

    try:
        category = db.query(PermissionCategory).filter(PermissionCategory.name == "inventory").first()
        if category:
            print("Category 'inventory' already exists, updating...")
            category.label = "Inventory"
            category.description = "Permissions for Inventory area (Suppliers and Products)."
            category.is_active = True
        else:
            category = PermissionCategory(
                name="inventory",
                label="Inventory",
                description="Permissions for Inventory area (Suppliers and Products).",
                sort_index=2,
            )
            db.add(category)

        db.flush()

        inventory_permissions = [
            {
                "key": "inventory:suppliers:read",
                "label": "Suppliers",
                "description": "Allows viewing the suppliers list and opening supplier records",
                "sort_index": 1,
            },
            {
                "key": "inventory:suppliers:write",
                "label": "Suppliers (create/delete)",
                "description": "Allows creating and deleting supplier records",
                "sort_index": 2,
            },
            {
                "key": "inventory:suppliers:overview:read",
                "label": "Overview",
                "description": "Allows viewing the supplier Overview tab (profile and address)",
                "sort_index": 11,
            },
            {
                "key": "inventory:suppliers:overview:write",
                "label": "Overview",
                "description": "Allows editing supplier profile on the Overview tab",
                "sort_index": 12,
            },
            {
                "key": "inventory:suppliers:contacts:read",
                "label": "Contacts",
                "description": "Allows viewing supplier contacts",
                "sort_index": 13,
            },
            {
                "key": "inventory:suppliers:contacts:write",
                "label": "Contacts",
                "description": "Allows creating, updating, and deleting supplier contacts",
                "sort_index": 14,
            },
            {
                "key": "inventory:suppliers:products:read",
                "label": "Products",
                "description": "Allows viewing products linked to the supplier",
                "sort_index": 15,
            },
            {
                "key": "inventory:suppliers:products:write",
                "label": "Products",
                "description": "Allows adding products from the supplier page",
                "sort_index": 16,
            },
            {
                "key": "inventory:products:read",
                "label": "Products",
                "description": "Allows viewing the products list and opening product records",
                "sort_index": 3,
            },
            {
                "key": "inventory:products:write",
                "label": "Products (create/delete)",
                "description": "Allows creating and deleting product records",
                "sort_index": 4,
            },
            {
                "key": "inventory:products:details:read",
                "label": "Details",
                "description": "Allows viewing the product Details tab",
                "sort_index": 21,
            },
            {
                "key": "inventory:products:details:write",
                "label": "Details",
                "description": "Allows editing product details",
                "sort_index": 22,
            },
            {
                "key": "inventory:products:usage:read",
                "label": "Usage",
                "description": "Allows viewing where the product is used in estimates and projects",
                "sort_index": 23,
            },
            {
                "key": "inventory:products:related:read",
                "label": "Related",
                "description": "Allows viewing related products",
                "sort_index": 24,
            },
            {
                "key": "inventory:products:related:write",
                "label": "Related",
                "description": "Allows managing related product links",
                "sort_index": 25,
            },
        ]

        for perm_data in inventory_permissions:
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

        access_perm = (
            db.query(PermissionDefinition)
            .filter(PermissionDefinition.key == "inventory:access")
            .first()
        )
        if access_perm and access_perm.is_active:
            access_perm.is_active = False
            print("Deactivated permission: inventory:access")

        db.commit()
        print("\nSuccessfully seeded Inventory permissions!")
        print(f"Total permissions: {len(inventory_permissions)}")

    except Exception as e:
        db.rollback()
        print(f"Error seeding Inventory permissions: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_inventory_permissions()
