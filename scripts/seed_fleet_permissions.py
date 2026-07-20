"""
Fleet permissions — dashboard, fleet assets, work orders, inspections (no equipment; see seed_company_assets_permissions.py).
fleet:access is the implicit area gate (auto-synced when any Fleet child is granted).
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


def seed_fleet_permissions():
    db = SessionLocal()

    try:
        category = db.query(PermissionCategory).filter(PermissionCategory.name == "fleet").first()
        if category:
            print("Category 'fleet' already exists, updating...")
            category.label = "Fleet"
            category.description = "Fleet dashboard, assets, work orders, and inspections."
            category.is_active = True
        else:
            category = PermissionCategory(
                name="fleet",
                label="Fleet",
                description="Fleet dashboard, assets, work orders, and inspections.",
                sort_index=3,
            )
            db.add(category)

        db.flush()

        fleet_permissions = [
            {
                "key": "fleet:access",
                "label": "Access Fleet",
                "description": "Grants access to the Fleet area. Required for fleet sub-permissions.",
                "sort_index": 1,
            },
            {
                "key": "fleet:dashboard:read",
                "label": "Dashboard",
                "description": "View the Fleet dashboard (KPIs and quick links)",
                "sort_index": 2,
            },
            {
                "key": "fleet:vehicles:read",
                "label": "Fleet Assets",
                "description": "View the fleet assets list and open asset records",
                "sort_index": 10,
            },
            {
                "key": "fleet:vehicles:write",
                "label": "Fleet Assets (create/delete)",
                "description": "Create and delete fleet assets",
                "sort_index": 11,
            },
            {
                "key": "fleet:vehicles:general:read",
                "label": "General",
                "description": "View the General tab on a fleet asset",
                "sort_index": 12,
            },
            {
                "key": "fleet:vehicles:general:write",
                "label": "General",
                "description": "Edit asset profile, photo, assign/return driver",
                "sort_index": 13,
            },
            {
                "key": "fleet:vehicles:inspections:read",
                "label": "Inspections",
                "description": "View inspections linked to a fleet asset",
                "sort_index": 14,
            },
            {
                "key": "fleet:vehicles:inspections:write",
                "label": "Inspections",
                "description": "Schedule inspections from a fleet asset",
                "sort_index": 15,
            },
            {
                "key": "fleet:vehicles:work_orders:read",
                "label": "Work Orders",
                "description": "View work orders linked to a fleet asset",
                "sort_index": 16,
            },
            {
                "key": "fleet:vehicles:work_orders:write",
                "label": "Work Orders",
                "description": "Create work orders from a fleet asset",
                "sort_index": 17,
            },
            {
                "key": "fleet:vehicles:compliance:read",
                "label": "Compliance",
                "description": "View compliance records on a fleet asset",
                "sort_index": 18,
            },
            {
                "key": "fleet:vehicles:compliance:write",
                "label": "Compliance",
                "description": "Manage compliance records on a fleet asset",
                "sort_index": 19,
            },
            {
                "key": "fleet:vehicles:history:read",
                "label": "History",
                "description": "View assignment and audit history on a fleet asset",
                "sort_index": 20,
            },
            {
                "key": "fleet:work_orders:read",
                "label": "Work Orders",
                "description": "View the work orders list, detail, and calendar",
                "sort_index": 30,
            },
            {
                "key": "fleet:work_orders:write",
                "label": "Work Orders (create/delete)",
                "description": "Create, update, delete, and reopen work orders",
                "sort_index": 31,
            },
            {
                "key": "fleet:work_orders:general:read",
                "label": "General",
                "description": "View work order general tab",
                "sort_index": 32,
            },
            {
                "key": "fleet:work_orders:general:write",
                "label": "General",
                "description": "Edit work order details, status, check-in/out",
                "sort_index": 33,
            },
            {
                "key": "fleet:work_orders:costs:read",
                "label": "Costs",
                "description": "View work order costs",
                "sort_index": 34,
            },
            {
                "key": "fleet:work_orders:costs:write",
                "label": "Costs",
                "description": "Edit labor, parts, and other costs",
                "sort_index": 35,
            },
            {
                "key": "fleet:work_orders:files:read",
                "label": "Files",
                "description": "View work order attachments",
                "sort_index": 36,
            },
            {
                "key": "fleet:work_orders:files:write",
                "label": "Files",
                "description": "Upload and manage work order files",
                "sort_index": 37,
            },
            {
                "key": "fleet:work_orders:activity:read",
                "label": "Activity",
                "description": "View work order activity log",
                "sort_index": 38,
            },
            {
                "key": "fleet:work_orders:assign",
                "label": "Assign work orders",
                "description": "Assign work orders to users",
                "sort_index": 39,
            },
            {
                "key": "fleet:inspections:read",
                "label": "Inspections",
                "description": "View inspection schedules and inspection records",
                "sort_index": 40,
            },
            {
                "key": "fleet:inspections:write",
                "label": "Inspections (create/delete)",
                "description": "Create and manage inspections",
                "sort_index": 41,
            },
            {
                "key": "fleet:inspections:schedules:read",
                "label": "Schedules",
                "description": "View inspection schedules and calendar events",
                "sort_index": 42,
            },
            {
                "key": "fleet:inspections:schedules:write",
                "label": "Schedules",
                "description": "Create and edit inspection schedules",
                "sort_index": 43,
            },
            {
                "key": "fleet:inspections:execution:read",
                "label": "Execution",
                "description": "View body/mechanical inspection forms",
                "sort_index": 44,
            },
            {
                "key": "fleet:inspections:execution:write",
                "label": "Execution",
                "description": "Fill, finish inspections and generate work orders",
                "sort_index": 45,
            },
        ]

        for perm_data in fleet_permissions:
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

        # Move equipment keys out of fleet category (handled by company_assets seed)
        for key in ("fleet:equipment:read", "fleet:equipment:write"):
            old = db.query(PermissionDefinition).filter(PermissionDefinition.key == key).first()
            if old and old.category_id == category.id:
                print(f"Note: {key} remains in DB; company_assets seed assigns category.")

        db.commit()
        print(f"\nSuccessfully seeded Fleet permissions! Total: {len(fleet_permissions)}")

    except Exception as e:
        db.rollback()
        print(f"Error seeding Fleet permissions: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_fleet_permissions()
