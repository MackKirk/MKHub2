#!/usr/bin/env python3
"""
Add product snapshot fields to estimate_items table.
This ensures that when a product is added to an estimate, its data is preserved
even if the product is later updated in the catalog.
This script works with both SQLite and PostgreSQL databases.
"""

import sys
import os

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text, inspect
from app.db import engine
from app.config import settings

def run_migration():
    """Add product snapshot fields to estimate_items table."""
    print(f"Connecting to database: {settings.database_url.split('@')[-1] if '@' in settings.database_url else settings.database_url}")
    
    with engine.connect() as conn:
        inspector = inspect(engine)
        
        # Check estimate_items table columns
        estimate_items_columns = [col['name'] for col in inspector.get_columns('estimate_items')]
        
        # Add product snapshot fields
        if 'product_name_snapshot' not in estimate_items_columns:
            print("Adding column 'product_name_snapshot' to estimate_items table...")
            if settings.database_url.startswith('sqlite'):
                conn.execute(text("ALTER TABLE estimate_items ADD COLUMN product_name_snapshot VARCHAR(255)"))
            else:
                conn.execute(text("ALTER TABLE estimate_items ADD COLUMN product_name_snapshot VARCHAR(255)"))
            conn.commit()
        else:
            print("Column 'product_name_snapshot' already exists. Skipping.")
        
        if 'product_unit_snapshot' not in estimate_items_columns:
            print("Adding column 'product_unit_snapshot' to estimate_items table...")
            if settings.database_url.startswith('sqlite'):
                conn.execute(text("ALTER TABLE estimate_items ADD COLUMN product_unit_snapshot VARCHAR(50)"))
            else:
                conn.execute(text("ALTER TABLE estimate_items ADD COLUMN product_unit_snapshot VARCHAR(50)"))
            conn.commit()
        else:
            print("Column 'product_unit_snapshot' already exists. Skipping.")
        
        if 'product_supplier_name_snapshot' not in estimate_items_columns:
            print("Adding column 'product_supplier_name_snapshot' to estimate_items table...")
            if settings.database_url.startswith('sqlite'):
                conn.execute(text("ALTER TABLE estimate_items ADD COLUMN product_supplier_name_snapshot VARCHAR(255)"))
            else:
                conn.execute(text("ALTER TABLE estimate_items ADD COLUMN product_supplier_name_snapshot VARCHAR(255)"))
            conn.commit()
        else:
            print("Column 'product_supplier_name_snapshot' already exists. Skipping.")
        
        if 'product_price_snapshot' not in estimate_items_columns:
            print("Adding column 'product_price_snapshot' to estimate_items table...")
            if settings.database_url.startswith('sqlite'):
                conn.execute(text("ALTER TABLE estimate_items ADD COLUMN product_price_snapshot FLOAT"))
            else:
                conn.execute(text("ALTER TABLE estimate_items ADD COLUMN product_price_snapshot FLOAT"))
            conn.commit()
        else:
            print("Column 'product_price_snapshot' already exists. Skipping.")
        
        print("Migration completed successfully!")
        print("Product snapshot fields added to estimate_items table.")

if __name__ == "__main__":
    try:
        run_migration()
    except Exception as e:
        print(f"Error running migration: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
