"""
Migration script to rename 'divisions' SettingList to 'departments'.
This separates employee departments from project divisions.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal
from app.models.models import SettingList

def migrate_divisions_to_departments():
    db = SessionLocal()
    try:
        # Check if 'divisions' exists
        divisions_list = db.query(SettingList).filter(SettingList.name == "divisions").first()
        
        if not divisions_list:
            print("No 'divisions' SettingList found. Nothing to migrate.")
            return
        
        # Check if 'departments' already exists
        departments_list = db.query(SettingList).filter(SettingList.name == "departments").first()
        
        if departments_list:
            print("'departments' SettingList already exists. Skipping migration.")
            return
        
        # Rename 'divisions' to 'departments'
        divisions_list.name = "departments"
        db.commit()
        print("Successfully renamed 'divisions' to 'departments'")
        
    except Exception as e:
        db.rollback()
        print(f"Error migrating divisions to departments: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    migrate_divisions_to_departments()

