#!/usr/bin/env python3
"""
Add Change Order columns to proposals table.
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
    """Add Change Order fields to proposals table."""
    print(f"Connecting to database: {settings.database_url.split('@')[-1] if '@' in settings.database_url else settings.database_url}")
    
    is_sqlite = settings.database_url.startswith('sqlite')
    
    with engine.connect() as conn:
        inspector = inspect(engine)
        
        # Check proposals table columns
        proposals_columns = [col['name'] for col in inspector.get_columns('proposals')]
        
        # Add is_change_order column
        if 'is_change_order' not in proposals_columns:
            print("Adding column 'is_change_order' to proposals table...")
            if is_sqlite:
                conn.execute(text("ALTER TABLE proposals ADD COLUMN is_change_order BOOLEAN DEFAULT 0"))
            else:
                conn.execute(text("ALTER TABLE proposals ADD COLUMN is_change_order BOOLEAN DEFAULT FALSE"))
            conn.commit()
        else:
            print("Column 'is_change_order' already exists. Skipping.")
        
        # Add change_order_number column
        if 'change_order_number' not in proposals_columns:
            print("Adding column 'change_order_number' to proposals table...")
            if is_sqlite:
                conn.execute(text("ALTER TABLE proposals ADD COLUMN change_order_number INTEGER"))
            else:
                conn.execute(text("ALTER TABLE proposals ADD COLUMN change_order_number INTEGER"))
            conn.commit()
        else:
            print("Column 'change_order_number' already exists. Skipping.")
        
        # Add parent_proposal_id column
        if 'parent_proposal_id' not in proposals_columns:
            print("Adding column 'parent_proposal_id' to proposals table...")
            if is_sqlite:
                conn.execute(text("ALTER TABLE proposals ADD COLUMN parent_proposal_id VARCHAR(36)"))
            else:
                conn.execute(text("ALTER TABLE proposals ADD COLUMN parent_proposal_id UUID"))
            conn.commit()
        else:
            print("Column 'parent_proposal_id' already exists. Skipping.")
        
        # Add approved_report_id column
        if 'approved_report_id' not in proposals_columns:
            print("Adding column 'approved_report_id' to proposals table...")
            if is_sqlite:
                conn.execute(text("ALTER TABLE proposals ADD COLUMN approved_report_id VARCHAR(36)"))
            else:
                conn.execute(text("ALTER TABLE proposals ADD COLUMN approved_report_id UUID"))
            conn.commit()
        else:
            print("Column 'approved_report_id' already exists. Skipping.")
        
        # Add foreign key constraints (PostgreSQL only, SQLite doesn't support ADD CONSTRAINT in ALTER TABLE)
        if not is_sqlite:
            # Check if foreign key constraints exist
            constraints = inspector.get_foreign_keys('proposals')
            constraint_names = [c['name'] for c in constraints]
            
            # Add foreign key for parent_proposal_id
            if 'fk_proposals_parent_proposal_id' not in constraint_names:
                print("Adding foreign key constraint 'fk_proposals_parent_proposal_id'...")
                try:
                    conn.execute(text("""
                        ALTER TABLE proposals 
                        ADD CONSTRAINT fk_proposals_parent_proposal_id 
                        FOREIGN KEY (parent_proposal_id) 
                        REFERENCES proposals(id) 
                        ON DELETE SET NULL
                    """))
                    conn.commit()
                except Exception as e:
                    print(f"Warning: Could not add foreign key constraint for parent_proposal_id: {e}")
            else:
                print("Foreign key constraint 'fk_proposals_parent_proposal_id' already exists. Skipping.")
            
            # Add foreign key for approved_report_id
            if 'fk_proposals_approved_report_id' not in constraint_names:
                print("Adding foreign key constraint 'fk_proposals_approved_report_id'...")
                try:
                    conn.execute(text("""
                        ALTER TABLE proposals 
                        ADD CONSTRAINT fk_proposals_approved_report_id 
                        FOREIGN KEY (approved_report_id) 
                        REFERENCES project_reports(id) 
                        ON DELETE SET NULL
                    """))
                    conn.commit()
                except Exception as e:
                    print(f"Warning: Could not add foreign key constraint for approved_report_id: {e}")
            else:
                print("Foreign key constraint 'fk_proposals_approved_report_id' already exists. Skipping.")
            
            # Create indexes for better query performance
            indexes = [idx['name'] for idx in inspector.get_indexes('proposals')]
            
            if 'idx_proposals_is_change_order' not in indexes:
                print("Creating index 'idx_proposals_is_change_order'...")
                conn.execute(text("CREATE INDEX idx_proposals_is_change_order ON proposals(is_change_order)"))
                conn.commit()
            else:
                print("Index 'idx_proposals_is_change_order' already exists. Skipping.")
            
            if 'idx_proposals_change_order_number' not in indexes:
                print("Creating index 'idx_proposals_change_order_number'...")
                conn.execute(text("CREATE INDEX idx_proposals_change_order_number ON proposals(change_order_number)"))
                conn.commit()
            else:
                print("Index 'idx_proposals_change_order_number' already exists. Skipping.")
            
            if 'idx_proposals_parent_proposal_id' not in indexes:
                print("Creating index 'idx_proposals_parent_proposal_id'...")
                conn.execute(text("CREATE INDEX idx_proposals_parent_proposal_id ON proposals(parent_proposal_id)"))
                conn.commit()
            else:
                print("Index 'idx_proposals_parent_proposal_id' already exists. Skipping.")
            
            if 'idx_proposals_approved_report_id' not in indexes:
                print("Creating index 'idx_proposals_approved_report_id'...")
                conn.execute(text("CREATE INDEX idx_proposals_approved_report_id ON proposals(approved_report_id)"))
                conn.commit()
            else:
                print("Index 'idx_proposals_approved_report_id' already exists. Skipping.")
        
        print("Migration completed successfully!")
        print("Change Order fields added to proposals table.")

if __name__ == "__main__":
    try:
        run_migration()
    except Exception as e:
        print(f"Error running migration: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
