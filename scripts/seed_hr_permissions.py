"""
Script para adicionar permissões de Human Resources com estrutura hierárquica.
A primeira permissão sempre é a liberação da área (hr:access).
Se bloquear hr:access, automaticamente bloqueia todas as sub-permissões.
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


def seed_hr_permissions():
    """Seed Human Resources permissions with hierarchical structure"""
    db = SessionLocal()
    
    try:
        # Create or get Human Resources category
        category = db.query(PermissionCategory).filter(PermissionCategory.name == "human_resources").first()
        if category:
            print(f"Category 'human_resources' already exists, updating...")
            category.label = "Human Resources"
            category.description = "Permissions for Human Resources area. Blocking access blocks all sub-permissions."
            category.is_active = True
        else:
            category = PermissionCategory(
                name="human_resources",
                label="Human Resources",
                description="Permissions for Human Resources area. Blocking access blocks all sub-permissions.",
                sort_index=1,  # First category
            )
            db.add(category)
        
        db.flush()  # To get the category ID
        
        # Define HR permissions with hierarchical structure
        # First permission is always the area access
        hr_permissions = [
            {
                "key": "hr:access",
                "label": "Access Human Resources",
                "description": "Grants access to the Human Resources area. Required for all HR functions. If disabled, all HR permissions are blocked.",
                "sort_index": 1,
            },
            {
                "key": "hr:users:read",
                "label": "View Users List",
                "description": "Allows viewing the Users page and the list of all users",
                "sort_index": 2,
            },
            {
                "key": "hr:users:write",
                "label": "Invite User",
                "description": "Allows inviting new users to the system",
                "sort_index": 3,
            },
            {
                "key": "hr:users:view:general",
                "label": "View General Tab",
                "description": "Allows viewing the General tab of user details (includes Personal, Job, Emergency, and Documents sections)",
                "sort_index": 4,
            },
            {
                "key": "hr:users:view:job:compensation",
                "label": "View Job Compensation",
                "description": "Allows viewing Employment Type, Pay Type, and Pay Rate fields in the Job tab.",
                "sort_index": 5,
            },
            {
                "key": "hr:users:edit:general",
                "label": "Edit General Tab",
                "description": "Allows editing the General tab of user details (includes Personal, Job, Emergency, and Documents sections)",
                "sort_index": 6,
            },
            {
                "key": "hr:users:view:timesheet",
                "label": "View Timesheet Tab",
                "description": "Allows viewing the Timesheet tab of user details (includes all attendance records)",
                "sort_index": 7,
            },
            {
                "key": "hr:users:edit:timesheet",
                "label": "Edit Timesheet Tab",
                "description": "Allows editing the Timesheet tab of user details (includes creating, editing, and deleting attendance records)",
                "sort_index": 8,
            },
            {
                "key": "hr:users:view:permissions",
                "label": "View Permissions Tab",
                "description": "Allows viewing the Permissions tab of user details (includes all user permissions)",
                "sort_index": 9,
            },
            {
                "key": "hr:users:edit:permissions",
                "label": "Edit Permissions Tab",
                "description": "Allows editing the Permissions tab of user details",
                "sort_index": 10,
            },
            {
                "key": "hr:attendance:read",
                "label": "View Attendance",
                "description": "Allows viewing attendance records",
                "sort_index": 11,
            },
            {
                "key": "hr:attendance:write",
                "label": "Edit Attendance",
                "description": "Allows creating and editing attendance records",
                "sort_index": 12,
            },
            {
                "key": "hr:community:read",
                "label": "View Community",
                "description": "Allows viewing community posts and content",
                "sort_index": 13,
            },
            {
                "key": "hr:community:write",
                "label": "Manage Community",
                "description": "Allows creating and managing community content",
                "sort_index": 14,
            },
            {
                "key": "hr:reviews:admin",
                "label": "Reviews Administration",
                "description": "Allows managing employee reviews and comparisons",
                "sort_index": 15,
            },
            {
                "key": "hr:timesheet:read",
                "label": "View Timesheet",
                "description": "Allows viewing timesheet records",
                "sort_index": 16,
            },
            {
                "key": "hr:timesheet:write",
                "label": "Edit Timesheet",
                "description": "Allows creating and editing timesheet records",
                "sort_index": 17,
            },
            {
                "key": "hr:timesheet:approve",
                "label": "Approve Timesheet",
                "description": "Allows approving timesheet records",
                "sort_index": 18,
            },
            {
                "key": "hr:timesheet:unrestricted_clock",
                "label": "Unrestricted Clock In/Out",
                "description": "Allows user to manage the hour they are clocking in and out",
                "sort_index": 19,
            },
        ]
        
        for perm_data in hr_permissions:
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
        print(f"\nSuccessfully seeded Human Resources permissions!")
        print(f"Total permissions: {len(hr_permissions)}")
        
    except Exception as e:
        db.rollback()
        print(f"Error seeding HR permissions: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_hr_permissions()

