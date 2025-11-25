"""
Script to create the Timesheet permission category and the timesheet:unrestricted_clock permission.
Run this script to add the permission definition to the database.
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal
from app.models.models import PermissionCategory, PermissionDefinition

def create_timesheet_permission():
    db = SessionLocal()
    try:
        # Check if Timesheet category already exists
        timesheet_category = db.query(PermissionCategory).filter(
            PermissionCategory.name == "timesheet"
        ).first()
        
        if not timesheet_category:
            # Create Timesheet category
            timesheet_category = PermissionCategory(
                name="timesheet",
                label="Timesheet",
                description="Permissions related to the attendances",
                sort_index=100,  # High number to appear at the end
                is_active=True
            )
            db.add(timesheet_category)
            db.flush()  # Flush to get the ID
            print("Created Timesheet permission category")
        else:
            print("Timesheet permission category already exists")
        
        # Check if permission already exists
        existing_perm = db.query(PermissionDefinition).filter(
            PermissionDefinition.key == "timesheet:unrestricted_clock"
        ).first()
        
        if not existing_perm:
            # Create the permission
            permission = PermissionDefinition(
                category_id=timesheet_category.id,
                key="timesheet:unrestricted_clock",
                label="Unrestricted Clock In/Out",
                description="Allows user to manage the hour they are clocking in and out.",
                sort_index=0,
                is_active=True
            )
            db.add(permission)
            db.commit()
            print("Created timesheet:unrestricted_clock permission")
        else:
            print("timesheet:unrestricted_clock permission already exists")
            db.commit()
            
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    create_timesheet_permission()
    print("Done!")

