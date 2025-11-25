"""
Script para criar as tabelas de time off no banco de dados se elas não existirem

Uso:
    python scripts/create_time_off_tables.py
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import inspect
from app.db import engine, Base, SessionLocal
from app.models.models import TimeOffBalance, TimeOffRequest


def table_exists(engine, table_name: str) -> bool:
    """Check if a table exists in the database"""
    inspector = inspect(engine)
    return table_name in inspector.get_table_names()


def create_time_off_tables():
    """Create time off tables if they don't exist"""
    print("[CREATE] Checking time off tables...")
    
    tables_created = []
    
    # Check and create time_off_balances
    if not table_exists(engine, "time_off_balances"):
        print("[CREATE] Creating table 'time_off_balances'...")
        try:
            TimeOffBalance.__table__.create(engine, checkfirst=True)
            print("[OK] Table 'time_off_balances' created successfully")
            tables_created.append("time_off_balances")
        except Exception as e:
            print(f"[ERROR] Error creating table 'time_off_balances': {e}")
            return False
    else:
        print("[SKIP] Table 'time_off_balances' already exists")
    
    # Check and create time_off_requests
    if not table_exists(engine, "time_off_requests"):
        print("[CREATE] Creating table 'time_off_requests'...")
        try:
            TimeOffRequest.__table__.create(engine, checkfirst=True)
            print("[OK] Table 'time_off_requests' created successfully")
            tables_created.append("time_off_requests")
        except Exception as e:
            print(f"[ERROR] Error creating table 'time_off_requests': {e}")
            return False
    else:
        print("[SKIP] Table 'time_off_requests' already exists")
    
    return True


def main():
    """Main function"""
    print("="*50)
    print("Creating time off tables")
    print("="*50)
    
    success = create_time_off_tables()
    
    if success:
        print("\n[SUCCESS] Database setup completed")
    else:
        print("\n[ERROR] Database setup failed")
        sys.exit(1)


if __name__ == "__main__":
    main()

