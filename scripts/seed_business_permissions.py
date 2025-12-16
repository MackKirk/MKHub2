"""
Script para adicionar permissões de Business com estrutura hierárquica.
A primeira permissão sempre é a liberação da área (business:access).
Se bloquear business:access, automaticamente bloqueia todas as sub-permissões.
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


def seed_business_permissions():
    """Seed Business permissions with hierarchical structure"""
    db = SessionLocal()
    
    try:
        # Create or get Business category
        category = db.query(PermissionCategory).filter(PermissionCategory.name == "business").first()
        if category:
            print(f"Category 'business' already exists, updating...")
            category.label = "Business"
            category.description = "Permissions for Business area. Blocking access blocks all sub-permissions."
            category.is_active = True
        else:
            category = PermissionCategory(
                name="business",
                label="Business",
                description="Permissions for Business area. Blocking access blocks all sub-permissions.",
                sort_index=1,  # First category
            )
            db.add(category)
        
        db.flush()  # To get the category ID
        
        # Define Business permissions with hierarchical structure
        # First permission is always the area access
        business_permissions = [
            {
                "key": "business:access",
                "label": "Access Business",
                "description": "Grants access to the Business area. Required for all Business functions. If disabled, all Business permissions are blocked.",
                "sort_index": 1,
            },
            # Customers
            {
                "key": "business:customers:read",
                "label": "View Customers",
                "description": "Allows viewing customers list and customer details",
                "sort_index": 2,
            },
            {
                "key": "business:customers:write",
                "label": "Edit Customers",
                "description": "Allows creating, updating, and deleting customers",
                "sort_index": 3,
            },
            # Projects & Opportunities
            {
                "key": "business:projects:read",
                "label": "View Projects & Opportunities",
                "description": "Allows viewing projects and opportunities list and details",
                "sort_index": 4,
            },
            {
                "key": "business:projects:write",
                "label": "Edit Projects & Opportunities",
                "description": "Allows creating, updating, and deleting projects and opportunities",
                "sort_index": 5,
            },
            # Projects - Sub-permissions
            {
                "key": "business:projects:reports:read",
                "label": "View Reports",
                "description": "Allows viewing the Reports tab in project details",
                "sort_index": 6,
            },
            {
                "key": "business:projects:reports:write",
                "label": "Edit Reports",
                "description": "Allows editing the Reports tab in project details",
                "sort_index": 7,
            },
            {
                "key": "business:projects:workload:read",
                "label": "View Workload",
                "description": "Allows viewing the Workload tab in project details",
                "sort_index": 8,
            },
            {
                "key": "business:projects:workload:write",
                "label": "Edit Workload",
                "description": "Allows editing the Workload tab in project details",
                "sort_index": 9,
            },
            {
                "key": "business:projects:timesheet:read",
                "label": "View Timesheet",
                "description": "Allows viewing the Timesheet tab in project details",
                "sort_index": 10,
            },
            {
                "key": "business:projects:timesheet:write",
                "label": "Edit Timesheet",
                "description": "Allows editing the Timesheet tab in project details",
                "sort_index": 11,
            },
            {
                "key": "business:projects:files:read",
                "label": "View Files",
                "description": "Allows viewing the Files tab in project details",
                "sort_index": 12,
            },
            {
                "key": "business:projects:files:write",
                "label": "Edit Files",
                "description": "Allows editing the Files tab in project details",
                "sort_index": 13,
            },
            {
                "key": "business:projects:proposal:read",
                "label": "View Proposal",
                "description": "Allows viewing the Proposal tab in project details",
                "sort_index": 14,
            },
            {
                "key": "business:projects:proposal:write",
                "label": "Edit Proposal",
                "description": "Allows editing the Proposal tab in project details",
                "sort_index": 15,
            },
            {
                "key": "business:projects:estimate:read",
                "label": "View Estimate",
                "description": "Allows viewing the Estimate tab in project details",
                "sort_index": 16,
            },
            {
                "key": "business:projects:estimate:write",
                "label": "Edit Estimate",
                "description": "Allows editing the Estimate tab in project details",
                "sort_index": 17,
            },
            {
                "key": "business:projects:orders:read",
                "label": "View Orders",
                "description": "Allows viewing the Orders tab in project details",
                "sort_index": 18,
            },
            {
                "key": "business:projects:orders:write",
                "label": "Edit Orders",
                "description": "Allows editing the Orders tab in project details",
                "sort_index": 19,
            },
        ]
        
        for perm_data in business_permissions:
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
        print(f"\nSuccessfully seeded Business permissions!")
        print(f"Total permissions: {len(business_permissions)}")
        
    except Exception as e:
        db.rollback()
        print(f"Error seeding Business permissions: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_business_permissions()

