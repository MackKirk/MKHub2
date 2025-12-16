"""
Script para popular as permissões iniciais do sistema.
Execute este script após criar as tabelas para inicializar as permissões básicas.
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
    print("Continuing with default values...")

# Check database type before importing
database_url = os.getenv("DATABASE_URL", "sqlite:///./var/dev.db")

if database_url.startswith("postgresql"):
    try:
        import psycopg2
    except ImportError:
        print("ERROR: PostgreSQL database detected but psycopg2 is not installed.")
        print("Please install it with: pip install psycopg2-binary")
        print("\nAlternatively, if you want to use SQLite locally, set DATABASE_URL in .env to:")
        print("DATABASE_URL=sqlite:///./var/dev.db")
        sys.exit(1)

# Now import database components
try:
    from app.db import SessionLocal
    from app.models.models import PermissionCategory, PermissionDefinition
except ImportError as e:
    print(f"ERROR: Failed to import database components: {e}")
    print("Make sure you're running this script from the project root directory.")
    sys.exit(1)
except Exception as e:
    error_msg = str(e)
    if "psycopg2" in error_msg or "ModuleNotFoundError" in error_msg:
        print("ERROR: PostgreSQL database detected but psycopg2 is not installed.")
        print("Please install it with: pip install psycopg2-binary")
        print("\nAlternatively, if you want to use SQLite locally, set DATABASE_URL in .env to:")
        print("DATABASE_URL=sqlite:///./var/dev.db")
    else:
        print(f"ERROR: Failed to initialize database connection: {e}")
        print(f"Database URL: {database_url}")
    sys.exit(1)


def seed_permissions():
    """Seed initial permissions"""
    db = SessionLocal()
    
    try:
        # Check if categories exist - if so, update them instead of skipping
        existing_categories = db.query(PermissionCategory).count()
        update_mode = existing_categories > 0
        
        # Define implemented permissions (permissions that are actually checked in the codebase)
        implemented_permissions = {
            "users:read", "users:write",
            "timesheet:read", "timesheet:write", "timesheet:approve",
            "clients:read", "clients:write",
            "inventory:read", "inventory:write",
            "reviews:read", "reviews:admin",
            "fleet:read", "fleet:write", "fleet:manage",
            "equipment:read", "equipment:write", "equipment:manage",
            "work_orders:read", "work_orders:write", "work_orders:assign",
            "inspections:read", "inspections:write",
        }
        
        # Define categories and permissions
        categories_data = [
            {
                "name": "profile",
                "label": "Employee Profile",
                "description": "Permissions related to personal and professional profile information",
                "sort_index": 1,
                "permissions": [
                    {
                        "key": "profile:edit_personal",
                        "label": "Edit Personal Information",
                        "description": "Allows editing personal information (name, phone, address, etc.)",
                        "sort_index": 1,
                        "is_implemented": False,
                    },
                    {
                        "key": "profile:edit_work",
                        "label": "Edit Work Information",
                        "description": "Allows editing work information (job title, division, manager, etc.)",
                        "sort_index": 2,
                        "is_implemented": False,
                    },
                    {
                        "key": "profile:edit_photo",
                        "label": "Edit Profile Photo",
                        "description": "Allows changing the profile photo",
                        "sort_index": 3,
                        "is_implemented": False,
                    },
                    {
                        "key": "profile:view_salary",
                        "label": "View Salary",
                        "description": "Allows viewing salary information",
                        "sort_index": 4,
                        "is_implemented": False,
                    },
                ],
            },
            {
                "name": "salary",
                "label": "Salary & Compensation",
                "description": "Permissions related to salary and compensation history",
                "sort_index": 3,
                "permissions": [
                    {
                        "key": "salary:view_history",
                        "label": "View Salary History",
                        "description": "Allows viewing salary change history",
                        "sort_index": 1,
                        "is_implemented": False,
                    },
                    {
                        "key": "salary:change",
                        "label": "Change Salary",
                        "description": "Allows creating new salary history entries",
                        "sort_index": 2,
                        "is_implemented": False,
                    },
                ],
            },
            {
                "name": "loans",
                "label": "Loans",
                "description": "Permissions related to company loans",
                "sort_index": 4,
                "permissions": [
                    {
                        "key": "loans:view",
                        "label": "View Loans",
                        "description": "Allows viewing loans and payments",
                        "sort_index": 1,
                        "is_implemented": False,
                    },
                    {
                        "key": "loans:manage",
                        "label": "Manage Loans",
                        "description": "Allows creating loans and recording payments",
                        "sort_index": 2,
                        "is_implemented": False,
                    },
                ],
            },
            {
                "name": "notices",
                "label": "Notices & Incidents",
                "description": "Permissions related to employee notices and incidents",
                "sort_index": 5,
                "permissions": [
                    {
                        "key": "notices:view",
                        "label": "View Notices",
                        "description": "Allows viewing employee notices",
                        "sort_index": 1,
                        "is_implemented": False,
                    },
                    {
                        "key": "notices:create",
                        "label": "Create Notices",
                        "description": "Allows creating new notices",
                        "sort_index": 2,
                        "is_implemented": False,
                    },
                ],
            },
            {
                "name": "fines_tickets",
                "label": "Fines & Tickets",
                "description": "Permissions related to fines and tickets",
                "sort_index": 6,
                "permissions": [
                    {
                        "key": "fines_tickets:view",
                        "label": "View Fines & Tickets",
                        "description": "Allows viewing fines and tickets",
                        "sort_index": 1,
                        "is_implemented": False,
                    },
                    {
                        "key": "fines_tickets:manage",
                        "label": "Manage Fines & Tickets",
                        "description": "Allows creating and updating fines and tickets",
                        "sort_index": 2,
                        "is_implemented": False,
                    },
                ],
            },
            {
                "name": "divisions",
                "label": "Divisions",
                "description": "Permissions related to employee divisions",
                "sort_index": 7,
                "permissions": [
                    {
                        "key": "divisions:view",
                        "label": "View Divisions",
                        "description": "Allows viewing employee divisions",
                        "sort_index": 1,
                        "is_implemented": False,
                    },
                    {
                        "key": "divisions:manage",
                        "label": "Manage Divisions",
                        "description": "Allows adding or removing employee divisions",
                        "sort_index": 2,
                        "is_implemented": False,
                    },
                ],
            },
            {
                "name": "fleet",
                "label": "Fleet Management",
                "description": "Permissions related to fleet assets (vehicles, heavy machinery, other)",
                "sort_index": 8,
                "permissions": [
                    {
                        "key": "fleet:read",
                        "label": "View Fleet Assets",
                        "description": "Allows viewing fleet assets",
                        "sort_index": 1,
                        "is_implemented": "fleet:read" in implemented_permissions,
                    },
                    {
                        "key": "fleet:write",
                        "label": "Create/Edit Fleet Assets",
                        "description": "Allows creating and editing fleet assets",
                        "sort_index": 2,
                        "is_implemented": "fleet:write" in implemented_permissions,
                    },
                    {
                        "key": "fleet:manage",
                        "label": "Full Fleet Management",
                        "description": "Full fleet management access (admin/fleet manager)",
                        "sort_index": 3,
                        "is_implemented": "fleet:manage" in implemented_permissions,
                    },
                ],
            },
            {
                "name": "work_orders",
                "label": "Work Orders",
                "description": "Permissions related to work orders for fleet and equipment",
                "sort_index": 10,
                "permissions": [
                    {
                        "key": "work_orders:read",
                        "label": "View Work Orders",
                        "description": "Allows viewing work orders",
                        "sort_index": 1,
                        "is_implemented": "work_orders:read" in implemented_permissions,
                    },
                    {
                        "key": "work_orders:write",
                        "label": "Create/Edit Work Orders",
                        "description": "Allows creating and editing work orders",
                        "sort_index": 2,
                        "is_implemented": "work_orders:write" in implemented_permissions,
                    },
                    {
                        "key": "work_orders:assign",
                        "label": "Assign Work Orders",
                        "description": "Allows assigning work orders to users",
                        "sort_index": 3,
                        "is_implemented": "work_orders:assign" in implemented_permissions,
                    },
                ],
            },
            {
                "name": "inspections",
                "label": "Fleet Inspections",
                "description": "Permissions related to fleet inspections",
                "sort_index": 11,
                "permissions": [
                    {
                        "key": "inspections:read",
                        "label": "View Inspections",
                        "description": "Allows viewing fleet inspections",
                        "sort_index": 1,
                        "is_implemented": "inspections:read" in implemented_permissions,
                    },
                    {
                        "key": "inspections:write",
                        "label": "Create/Edit Inspections",
                        "description": "Allows creating and editing inspections",
                        "sort_index": 2,
                        "is_implemented": "inspections:write" in implemented_permissions,
                    },
                ],
            },
        ]
        
        # Create or update categories and permissions
        for cat_data in categories_data:
            # Find or create category
            category = db.query(PermissionCategory).filter(PermissionCategory.name == cat_data["name"]).first()
            if category:
                # Update existing category
                category.label = cat_data["label"]
                category.description = cat_data.get("description")
                category.sort_index = cat_data["sort_index"]
                category.is_active = True
            else:
                # Create new category
                category = PermissionCategory(
                    name=cat_data["name"],
                    label=cat_data["label"],
                    description=cat_data.get("description"),
                    sort_index=cat_data["sort_index"],
                )
                db.add(category)
            
            db.flush()  # To get the category ID
            
            for perm_data in cat_data["permissions"]:
                # Find or create permission
                permission = db.query(PermissionDefinition).filter(PermissionDefinition.key == perm_data["key"]).first()
                if permission:
                    # Update existing permission
                    permission.category_id = category.id
                    permission.label = perm_data["label"]
                    permission.description = perm_data.get("description")
                    permission.sort_index = perm_data["sort_index"]
                    permission.is_active = True
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
        
        db.commit()
        if update_mode:
            print(f"Successfully updated {len(categories_data)} permission categories with their permissions.")
        else:
            print(f"Successfully seeded {len(categories_data)} permission categories with their permissions.")
        
    except Exception as e:
        db.rollback()
        print(f"Error seeding permissions: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_permissions()

