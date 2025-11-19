#!/usr/bin/env python3
"""
Script to migrate fleet_assets table - adds new columns from maintenance sheet
"""
import sys
import os

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.config import settings
from app.db import engine
from sqlalchemy import text

def migrate_fleet_assets():
    """Add new columns to fleet_assets table"""
    
    if not settings.database_url.startswith("postgres"):
        print("This script only works with PostgreSQL databases.")
        print(f"Current database URL: {settings.database_url}")
        return False
    
    print("Connecting to database...")
    print(f"Database URL: {settings.database_url.split('@')[1] if '@' in settings.database_url else 'hidden'}")
    
    with engine.connect() as conn:
        # Start a transaction
        trans = conn.begin()
        try:
            print("\nAdding new columns to fleet_assets table...")
            
            # Add unit_number
            print("  - Adding unit_number...")
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='fleet_assets' AND column_name='unit_number'
            """))
            if result.fetchone() is None:
                conn.execute(text("ALTER TABLE fleet_assets ADD COLUMN unit_number VARCHAR(50)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_asset_unit_number ON fleet_assets(unit_number)"))
                print("    [OK] Added unit_number column and index")
            else:
                print("    [SKIP] unit_number already exists")
            
            # Add make
            print("  - Adding make...")
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='fleet_assets' AND column_name='make'
            """))
            if result.fetchone() is None:
                conn.execute(text("ALTER TABLE fleet_assets ADD COLUMN make VARCHAR(100)"))
                print("    [OK] Added make column")
            else:
                print("    [SKIP] make already exists")
            
            # Add condition
            print("  - Adding condition...")
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='fleet_assets' AND column_name='condition'
            """))
            if result.fetchone() is None:
                conn.execute(text("ALTER TABLE fleet_assets ADD COLUMN condition VARCHAR(50)"))
                print("    [OK] Added condition column")
            else:
                print("    [SKIP] condition already exists")
            
            # Add body_style
            print("  - Adding body_style...")
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='fleet_assets' AND column_name='body_style'
            """))
            if result.fetchone() is None:
                conn.execute(text("ALTER TABLE fleet_assets ADD COLUMN body_style VARCHAR(100)"))
                print("    [OK] Added body_style column")
            else:
                print("    [SKIP] body_style already exists")
            
            # Add driver_id (with foreign key)
            print("  - Adding driver_id...")
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='fleet_assets' AND column_name='driver_id'
            """))
            if result.fetchone() is None:
                conn.execute(text("ALTER TABLE fleet_assets ADD COLUMN driver_id UUID"))
                # Check if constraint already exists
                result_fk = conn.execute(text("""
                    SELECT constraint_name 
                    FROM information_schema.table_constraints 
                    WHERE table_name='fleet_assets' AND constraint_name='fk_fleet_asset_driver'
                """))
                if result_fk.fetchone() is None:
                    conn.execute(text("""
                        ALTER TABLE fleet_assets 
                        ADD CONSTRAINT fk_fleet_asset_driver 
                        FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE SET NULL
                    """))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_fleet_asset_driver ON fleet_assets(driver_id)"))
                print("    [OK] Added driver_id column, foreign key, and index")
            else:
                print("    [SKIP] driver_id already exists")
            
            # Add icbc_registration_no
            print("  - Adding icbc_registration_no...")
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='fleet_assets' AND column_name='icbc_registration_no'
            """))
            if result.fetchone() is None:
                conn.execute(text("ALTER TABLE fleet_assets ADD COLUMN icbc_registration_no VARCHAR(50)"))
                print("    [OK] Added icbc_registration_no column")
            else:
                print("    [SKIP] icbc_registration_no already exists")
            
            # Add vancouver_decals
            print("  - Adding vancouver_decals...")
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='fleet_assets' AND column_name='vancouver_decals'
            """))
            if result.fetchone() is None:
                conn.execute(text("ALTER TABLE fleet_assets ADD COLUMN vancouver_decals JSONB"))
                print("    [OK] Added vancouver_decals column")
            else:
                print("    [SKIP] vancouver_decals already exists")
            
            # Add ferry_length
            print("  - Adding ferry_length...")
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='fleet_assets' AND column_name='ferry_length'
            """))
            if result.fetchone() is None:
                conn.execute(text("ALTER TABLE fleet_assets ADD COLUMN ferry_length VARCHAR(50)"))
                print("    [OK] Added ferry_length column")
            else:
                print("    [SKIP] ferry_length already exists")
            
            # Add gvw_kg
            print("  - Adding gvw_kg...")
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='fleet_assets' AND column_name='gvw_kg'
            """))
            if result.fetchone() is None:
                conn.execute(text("ALTER TABLE fleet_assets ADD COLUMN gvw_kg INTEGER"))
                print("    [OK] Added gvw_kg column")
            else:
                print("    [SKIP] gvw_kg already exists")
            
            # Commit transaction
            trans.commit()
            print("\n[SUCCESS] Migration completed successfully!")
            
            # Verify columns
            print("\nVerifying columns...")
            result = conn.execute(text("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'fleet_assets' 
                ORDER BY ordinal_position
            """))
            columns = result.fetchall()
            print(f"Total columns in fleet_assets: {len(columns)}")
            new_columns = ['unit_number', 'make', 'condition', 'body_style', 'driver_id', 
                          'icbc_registration_no', 'vancouver_decals', 'ferry_length', 'gvw_kg']
            for col_name, col_type in columns:
                marker = "[NEW]" if col_name in new_columns else "     "
                print(f"  {marker} {col_name:30} {col_type}")
            
            return True
            
        except Exception as e:
            trans.rollback()
            print(f"\n[ERROR] Error during migration: {e}")
            import traceback
            traceback.print_exc()
            return False

if __name__ == "__main__":
    print("=" * 60)
    print("Fleet Assets Migration Script")
    print("=" * 60)
    success = migrate_fleet_assets()
    sys.exit(0 if success else 1)

