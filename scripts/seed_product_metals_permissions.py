"""
Seed Product / Mack Kirk Metals access and customers permissions.
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
            category.label = "Mack Kirk Metals access"
            category.description = "Switch between Hub and the Mack Kirk Metals product workspace."
            category.is_active = True
        else:
            category = PermissionCategory(
                name="product",
                label="Mack Kirk Metals access",
                description="Switch between Hub and the Mack Kirk Metals product workspace.",
                sort_index=25,
            )
            db.add(category)
        db.flush()

        # Switch permission is the only one shown in the UI for now.
        # Customers keys stay seeded for API/route gates but are hidden in permission UIs.
        perms = [
            {
                "key": "product:metals:access",
                "label": "Access Mack Kirk Metals",
                "description": "Allows switching to the Mack Kirk Metals product workspace.",
                "sort_index": 1,
            },
            {
                "key": "metals:customers:read",
                "label": "View Metals customers",
                "description": "Allows viewing the Metals customers list and details.",
                "sort_index": 2,
            },
            {
                "key": "metals:customers:write",
                "label": "Edit Metals customers",
                "description": "Allows creating and updating Metals customers.",
                "sort_index": 3,
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
