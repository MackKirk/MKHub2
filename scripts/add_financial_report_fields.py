#!/usr/bin/env python3
"""
Add financial report fields to project_reports and estimate_items tables.
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
    """Add financial fields to project_reports and estimate_items tables."""
    print(f"Connecting to database: {settings.database_url.split('@')[-1] if '@' in settings.database_url else settings.database_url}")
    
    with engine.connect() as conn:
        inspector = inspect(engine)
        
        # Check project_reports table columns
        project_reports_columns = [col['name'] for col in inspector.get_columns('project_reports')]
        
        # Add fields to project_reports
        if 'financial_value' not in project_reports_columns:
            print("Adding column 'financial_value' to project_reports table...")
            conn.execute(text("ALTER TABLE project_reports ADD COLUMN financial_value FLOAT"))
            conn.commit()
        else:
            print("Column 'financial_value' already exists. Skipping.")
        
        if 'financial_type' not in project_reports_columns:
            print("Adding column 'financial_type' to project_reports table...")
            if settings.database_url.startswith('sqlite'):
                conn.execute(text("ALTER TABLE project_reports ADD COLUMN financial_type VARCHAR(50)"))
            else:
                conn.execute(text("ALTER TABLE project_reports ADD COLUMN financial_type VARCHAR(50)"))
            conn.commit()
        else:
            print("Column 'financial_type' already exists. Skipping.")
        
        if 'estimate_data' not in project_reports_columns:
            print("Adding column 'estimate_data' to project_reports table...")
            if settings.database_url.startswith('sqlite'):
                conn.execute(text("ALTER TABLE project_reports ADD COLUMN estimate_data JSON"))
            else:
                conn.execute(text("ALTER TABLE project_reports ADD COLUMN estimate_data JSONB"))
            conn.commit()
        else:
            print("Column 'estimate_data' already exists. Skipping.")
        
        if 'approval_status' not in project_reports_columns:
            print("Adding column 'approval_status' to project_reports table...")
            if settings.database_url.startswith('sqlite'):
                conn.execute(text("ALTER TABLE project_reports ADD COLUMN approval_status VARCHAR(50)"))
            else:
                conn.execute(text("ALTER TABLE project_reports ADD COLUMN approval_status VARCHAR(50)"))
            conn.commit()
        else:
            print("Column 'approval_status' already exists. Skipping.")
        
        if 'approved_by' not in project_reports_columns:
            print("Adding column 'approved_by' to project_reports table...")
            if settings.database_url.startswith('sqlite'):
                conn.execute(text("ALTER TABLE project_reports ADD COLUMN approved_by VARCHAR(36)"))
            else:
                conn.execute(text("ALTER TABLE project_reports ADD COLUMN approved_by UUID REFERENCES users(id)"))
            conn.commit()
        else:
            print("Column 'approved_by' already exists. Skipping.")
        
        if 'approved_at' not in project_reports_columns:
            print("Adding column 'approved_at' to project_reports table...")
            if settings.database_url.startswith('sqlite'):
                conn.execute(text("ALTER TABLE project_reports ADD COLUMN approved_at DATETIME"))
            else:
                conn.execute(text("ALTER TABLE project_reports ADD COLUMN approved_at TIMESTAMP WITH TIME ZONE"))
            conn.commit()
        else:
            print("Column 'approved_at' already exists. Skipping.")
        
        # Check estimate_items table columns
        estimate_items_columns = [col['name'] for col in inspector.get_columns('estimate_items')]
        
        # Add fields to estimate_items
        if 'added_via_report_id' not in estimate_items_columns:
            print("Adding column 'added_via_report_id' to estimate_items table...")
            if settings.database_url.startswith('sqlite'):
                conn.execute(text("ALTER TABLE estimate_items ADD COLUMN added_via_report_id VARCHAR(36)"))
            else:
                conn.execute(text("ALTER TABLE estimate_items ADD COLUMN added_via_report_id UUID REFERENCES project_reports(id)"))
            conn.commit()
        else:
            print("Column 'added_via_report_id' already exists. Skipping.")
        
        if 'added_via_report_date' not in estimate_items_columns:
            print("Adding column 'added_via_report_date' to estimate_items table...")
            if settings.database_url.startswith('sqlite'):
                conn.execute(text("ALTER TABLE estimate_items ADD COLUMN added_via_report_date DATETIME"))
            else:
                conn.execute(text("ALTER TABLE estimate_items ADD COLUMN added_via_report_date TIMESTAMP WITH TIME ZONE"))
            conn.commit()
        else:
            print("Column 'added_via_report_date' already exists. Skipping.")
        
        print("Migration completed successfully!")
        print("Financial report fields added to project_reports and estimate_items tables.")

if __name__ == "__main__":
    try:
        run_migration()
    except Exception as e:
        print(f"Error running migration: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

