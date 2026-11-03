"""
Seed Product / Mack Kirk Metals access, customers (incl. tabs), permissions.
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
        import psycopg2  # noqa: F401
    except ImportError:
        print("ERROR: PostgreSQL database detected but psycopg2 is not installed.")
        sys.exit(1)

try:
    from app.db import SessionLocal
    from app.models.models import PermissionCategory, PermissionDefinition
except ImportError as e:
    print(f"ERROR: Failed to import database components: {e}")
    sys.exit(1)


def seed_product_metals_permissions():
    db = SessionLocal()
    try:
        category = db.query(PermissionCategory).filter(PermissionCategory.name == "product").first()
        if category:
            category.label = "Mack Kirk Metals"
            category.description = (
                "Access Mack Kirk Metals, Metals customers (tabs), and related product permissions."
            )
            category.is_active = True
        else:
            category = PermissionCategory(
                name="product",
                label="Mack Kirk Metals",
                description=(
                    "Access Mack Kirk Metals, Metals customers (tabs), and related product permissions."
                ),
                sort_index=25,
            )
            db.add(category)
        db.flush()

        perms = [
            {
                "key": "product:metals:access",
                "label": "Access Mack Kirk Metals",
                "description": "Allows switching to the Mack Kirk Metals product workspace.",
                "sort_index": 1,
            },
            {
                "key": "metals:customers:read",
                "label": "Customers",
                "description": "Allows viewing the Metals customers list and opening customer records",
                "sort_index": 2,
            },
            {
                "key": "metals:customers:write",
                "label": "Customers (create/delete)",
                "description": "Allows creating and deleting Metals customer records",
                "sort_index": 3,
            },
            {
                "key": "metals:customers:overview:read",
                "label": "Overview",
                "description": "Allows viewing the Metals customer Overview tab",
                "sort_index": 31,
            },
            {
                "key": "metals:customers:general:read",
                "label": "General",
                "description": "Allows viewing the Metals customer General tab",
                "sort_index": 32,
            },
            {
                "key": "metals:customers:general:write",
                "label": "General",
                "description": "Allows editing Metals customer profile on the General tab",
                "sort_index": 33,
            },
            {
                "key": "metals:customers:contacts:read",
                "label": "Contacts",
                "description": "Allows viewing Metals customer contacts",
                "sort_index": 34,
            },
            {
                "key": "metals:customers:contacts:write",
                "label": "Contacts",
                "description": "Allows creating, updating, and deleting Metals customer contacts",
                "sort_index": 35,
            },
            {
                "key": "metals:customers:files:read",
                "label": "Files",
                "description": "Allows viewing Metals customer files, folders, and documents",
                "sort_index": 36,
            },
            {
                "key": "metals:customers:files:write",
                "label": "Files",
                "description": "Allows uploading and managing Metals customer files and folders",
                "sort_index": 37,
            },
            {
                "key": "metals:customers:sites:read",
                "label": "Sites",
                "description": "Allows viewing Metals customer sites",
                "sort_index": 38,
            },
            {
                "key": "metals:customers:sites:write",
                "label": "Sites",
                "description": "Allows creating, updating, and deleting Metals customer sites",
                "sort_index": 39,
            },
            {
                "key": "metals:customers:notes:read",
                "label": "Notes / History",
                "description": "Allows viewing the Metals customer Notes/History communication log",
                "sort_index": 40,
            },
            {
                "key": "metals:customers:notes:write",
                "label": "Notes / History",
                "description": "Allows creating, updating, and deleting Metals customer communication notes",
                "sort_index": 41,
            },
        ]

        for perm_data in perms:
            permission = (
                db.query(PermissionDefinition).filter(PermissionDefinition.key == perm_data["key"]).first()
            )
            if permission:
                permission.category_id = category.id
                permission.label = perm_data["label"]
                permission.description = perm_data.get("description")
                permission.sort_index = perm_data["sort_index"]
                permission.is_active = True
                print(f"Updated permission: {perm_data['key']}")
            else:
                db.add(
                    PermissionDefinition(
                        category_id=category.id,
                        key=perm_data["key"],
                        label=perm_data["label"],
                        description=perm_data.get("description"),
                        sort_index=perm_data["sort_index"],
                    )
                )
                print(f"Created permission: {perm_data['key']}")

        db.commit()
        print(f"\nSuccessfully seeded Product / Metals permissions ({len(perms)} keys).")
    except Exception as e:
        db.rollback()
        print(f"Error seeding product metals permissions: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_product_metals_permissions()
