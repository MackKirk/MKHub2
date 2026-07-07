"""
Company Assets permissions — equipment and corporate cards (separate from Fleet in the UI).
Equipment API keys remain fleet:equipment:* for backward compatibility.
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


def seed_company_assets_permissions():
    db = SessionLocal()

    try:
        category = db.query(PermissionCategory).filter(PermissionCategory.name == "company_assets").first()
        if category:
            print("Category 'company_assets' already exists, updating...")
            category.label = "Company Assets"
            category.description = "Equipment and corporate cards under Company Assets."
            category.is_active = True
        else:
            category = PermissionCategory(
                name="company_assets",
                label="Company Assets",
                description="Equipment and corporate cards under Company Assets.",
                sort_index=4,
            )
            db.add(category)

        db.flush()

        permissions = [
            {
                "key": "company_assets:access",
                "label": "Access Company Assets",
                "description": "Grants access to the Company Assets area.",
                "sort_index": 1,
            },
            {
                "key": "fleet:equipment:read",
                "label": "Equipment",
                "description": "View the equipment list and open equipment records",
                "sort_index": 10,
            },
            {
                "key": "fleet:equipment:write",
                "label": "Equipment (create/delete)",
                "description": "Create and delete equipment records",
                "sort_index": 11,
            },
            {
                "key": "fleet:equipment:general:read",
                "label": "General",
                "description": "View the General tab on equipment",
                "sort_index": 12,
            },
            {
                "key": "fleet:equipment:general:write",
                "label": "General",
                "description": "Edit equipment, assign/return, checkout/checkin",
                "sort_index": 13,
            },
            {
                "key": "fleet:equipment:work_orders:read",
                "label": "Work Orders",
                "description": "View work orders linked to equipment",
                "sort_index": 14,
            },
            {
                "key": "fleet:equipment:work_orders:write",
                "label": "Work Orders",
                "description": "Create work orders for equipment",
                "sort_index": 15,
            },
            {
                "key": "fleet:equipment:history:read",
                "label": "History",
                "description": "View equipment assignment and audit history",
                "sort_index": 16,
            },
            {
                "key": "company_cards:read",
                "label": "Corporate Cards",
                "description": "View corporate credit cards",
                "sort_index": 20,
            },
            {
                "key": "company_cards:write",
                "label": "Corporate Cards (edit)",
                "description": "Create and edit corporate credit cards",
                "sort_index": 21,
            },
        ]

        for perm_data in permissions:
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
        print(f"\nSuccessfully seeded Company Assets permissions! Total: {len(permissions)}")

    except Exception as e:
        db.rollback()
        print(f"Error seeding Company Assets permissions: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_company_assets_permissions()
