"""
Script para reordenar as categorias de permissões na ordem especificada:
1. Services (business category - will be displayed as Services in frontend)
2. Business (inventory category - will be combined with customers in frontend)
3. Sales
4. Fleet & Equipment
5. Documents
6. Human Resources
7. Settings
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
    from app.models.models import PermissionCategory
except ImportError as e:
    print(f"ERROR: Failed to import database components: {e}")
    sys.exit(1)


def reorder_permission_categories():
    """Reorder permission categories according to the specified order"""
    db = SessionLocal()
    
    try:
        # Define the new order
        # Note: Services is created from business category in frontend,
        # Business is created from inventory + business customers in frontend
        category_order = {
            "business": 1,      # Will be displayed as Services (projects)
            "inventory": 2,     # Will be displayed as Business (combined with customers)
            "sales": 3,         # Sales category
            "fleet": 4,         # Fleet & Equipment
            "documents": 5,     # Documents
            "human_resources": 6,  # Human Resources
            "settings": 7,      # Settings
        }
        
        # Update sort_index for each category
        for name, sort_index in category_order.items():
            category = db.query(PermissionCategory).filter(PermissionCategory.name == name).first()
            if category:
                old_index = category.sort_index
                category.sort_index = sort_index
                print(f"Updated '{category.label}' (name: {name}) sort_index: {old_index} -> {sort_index}")
            else:
                # Create category if it doesn't exist (for sales)
                if name == "sales":
                    category = PermissionCategory(
                        name="sales",
                        label="Sales",
                        description="Permissions for Sales area. Blocking access blocks all sub-permissions.",
                        sort_index=sort_index,
                    )
                    db.add(category)
                    print(f"Created new category 'Sales' (name: {name}) with sort_index: {sort_index}")
                else:
                    print(f"WARNING: Category '{name}' not found")
        
        db.commit()
        print("\nSuccessfully updated permission categories order!")
        print("\nCurrent order:")
        categories = db.query(PermissionCategory).filter(
            PermissionCategory.is_active == True
        ).order_by(PermissionCategory.sort_index.asc()).all()
        
        for cat in categories:
            print(f"  {cat.sort_index}. {cat.label} (name: {cat.name})")
        
    except Exception as e:
        db.rollback()
        print(f"Error reordering permission categories: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    reorder_permission_categories()

