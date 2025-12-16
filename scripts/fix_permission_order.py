"""
Script para corrigir a ordem das categorias de permissões e desativar Equipment and Tools.
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


def fix_permission_order():
    """Fix permission categories order and deactivate Equipment and Tools"""
    db = SessionLocal()
    
    try:
        # Define the correct order
        category_order = {
            "business": 1,
            "inventory": 2,
            "fleet": 3,
            "documents": 4,
            "human_resources": 5,
            "settings": 6,
        }
        
        # Update sort_index for each category
        for name, sort_index in category_order.items():
            category = db.query(PermissionCategory).filter(PermissionCategory.name == name).first()
            if category:
                old_index = category.sort_index
                category.sort_index = sort_index
                print(f"Updated '{category.label}' sort_index: {old_index} -> {sort_index}")
            else:
                print(f"WARNING: Category '{name}' not found")
        
        # Deactivate Equipment and Tools categories
        equipment_categories = db.query(PermissionCategory).filter(
            PermissionCategory.name.in_(["equipment", "equipment_and_tools"])
        ).all()
        
        for cat in equipment_categories:
            cat.is_active = False
            print(f"Deactivated category: {cat.label} (name: {cat.name})")
        
        # Also check for any category with "Equipment" in the label
        equipment_by_label = db.query(PermissionCategory).filter(
            PermissionCategory.label.ilike("%Equipment%")
        ).filter(
            PermissionCategory.name.notin_(["fleet"])  # Don't deactivate Fleet & Equipment
        ).all()
        
        for cat in equipment_by_label:
            if cat.name not in ["fleet", "business", "inventory", "documents", "human_resources", "settings"]:
                cat.is_active = False
                print(f"Deactivated category by label: {cat.label} (name: {cat.name})")
        
        db.commit()
        print("\n✅ Successfully updated permission categories order!")
        print("\nCurrent order:")
        categories = db.query(PermissionCategory).filter(
            PermissionCategory.is_active == True
        ).order_by(PermissionCategory.sort_index.asc()).all()
        
        for cat in categories:
            print(f"  {cat.sort_index}. {cat.label} (name: {cat.name})")
        
    except Exception as e:
        db.rollback()
        print(f"Error fixing permission order: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    fix_permission_order()

