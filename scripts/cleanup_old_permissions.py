"""
Script para desativar categorias de permissões antigas que não devem mais aparecer:
- Employee Profile (profile)
- Salary & Compensation (salary)
- Loans (loans)
- Notices & Incidents (notices)
- Fines & Tickets (fines_tickets)
- Divisions (divisions)
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


def cleanup_old_permissions():
    """Desativa categorias de permissões antigas que não devem mais aparecer"""
    db = SessionLocal()
    
    try:
        # Categorias para desativar
        categories_to_deactivate = [
            "profile",  # Employee Profile
            "salary",   # Salary & Compensation
            "loans",    # Loans
            "notices",  # Notices & Incidents
            "fines_tickets",  # Fines & Tickets
            "divisions",  # Divisions
            "timesheet",  # Timesheet (movido para Human Resources)
        ]
        
        for cat_name in categories_to_deactivate:
            category = db.query(PermissionCategory).filter(PermissionCategory.name == cat_name).first()
            if category:
                category.is_active = False
                # Também desativa todas as permissões dessa categoria
                for perm in category.permissions:
                    perm.is_active = False
                print(f"Deactivated category: {cat_name} ({category.label})")
            else:
                print(f"Category not found: {cat_name}")
        
        db.commit()
        print(f"\nSuccessfully deactivated {len(categories_to_deactivate)} old permission categories!")
        
    except Exception as e:
        db.rollback()
        print(f"Error cleaning up old permissions: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    cleanup_old_permissions()

