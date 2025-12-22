"""
Script para adicionar permissões de Sales com estrutura hierárquica.
A primeira permissão sempre é a liberação da área (sales:access).
Se bloquear sales:access, automaticamente bloqueia todas as sub-permissões.
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


def seed_sales_permissions():
    """Seed Sales permissions with hierarchical structure"""
    db = SessionLocal()
    
    try:
        # Create or get Sales category
        category = db.query(PermissionCategory).filter(PermissionCategory.name == "sales").first()
        if category:
            print(f"Category 'sales' already exists, updating...")
            category.label = "Sales"
            category.description = "Permissions for Sales area. Blocking access blocks all sub-permissions."
            category.is_active = True
        else:
            category = PermissionCategory(
                name="sales",
                label="Sales",
                description="Permissions for Sales area. Blocking access blocks all sub-permissions.",
                sort_index=3,  # After Business
            )
            db.add(category)
        
        db.flush()  # To get the category ID
        
        # Define Sales permissions with hierarchical structure
        # First permission is always the area access
        sales_permissions = [
            {
                "key": "sales:access",
                "label": "Access Sales",
                "description": "Grants access to the Sales area. Required for all Sales functions. If disabled, all Sales permissions are blocked.",
                "sort_index": 1,
            },
            {
                "key": "sales:quotations:read",
                "label": "View Quotations",
                "description": "Allows viewing quotations list and quotations details.",
                "sort_index": 2,
            },
            {
                "key": "sales:quotations:write",
                "label": "Edit Quotations",
                "description": "Allows creating, updating, and deleting quotations",
                "sort_index": 3,
            },
        ]
        
        for perm_data in sales_permissions:
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
        print(f"\nSuccessfully seeded Sales permissions!")
        print(f"Total permissions: {len(sales_permissions)}")
        
    except Exception as e:
        db.rollback()
        print(f"Error seeding Sales permissions: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_sales_permissions()

