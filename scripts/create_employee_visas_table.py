"""
Script para criar a tabela employee_visas no banco de dados se ela não existir

Uso:
    python scripts/create_employee_visas_table.py
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import inspect, text
from app.db import engine, Base, SessionLocal
from app.models.models import EmployeeVisa


def table_exists(engine, table_name: str) -> bool:
    """Check if a table exists in the database"""
    inspector = inspect(engine)
    return table_name in inspector.get_table_names()


def create_employee_visas_table():
    """Create employee_visas table if it doesn't exist"""
    print("[CREATE] Checking if employee_visas table exists...")
    
    # Check if table exists
    if table_exists(engine, "employee_visas"):
        print("[SKIP] Table 'employee_visas' already exists")
        return True
    
    print("[CREATE] Creating table 'employee_visas'...")
    
    try:
        # Create the table using SQLAlchemy metadata
        EmployeeVisa.__table__.create(engine, checkfirst=True)
        print("[OK] Table 'employee_visas' created successfully")
        return True
    except Exception as e:
        print(f"[ERROR] Error creating table: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Main function"""
    print("="*50)
    print("Creating employee_visas table")
    print("="*50)
    
    success = create_employee_visas_table()
    
    if success:
        print("\n[SUCCESS] Database setup completed")
    else:
        print("\n[ERROR] Database setup failed")
        sys.exit(1)


if __name__ == "__main__":
    main()

