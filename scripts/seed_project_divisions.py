"""
Seed script for project divisions and subdivisions.
Creates the 12 main divisions with their subdivisions as specified.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal
from app.models.models import SettingList, SettingItem
import uuid

# Structure: division_name -> [subdivision_names]
PROJECT_DIVISIONS = {
    "Roofing": ["SBS", "Shingles", "Single Ply", "Standing Seam Metal", "Hot Asphalt", "Cedar"],
    "Concrete Restoration & Waterproofing": ["SBS", "Liquid Membranes", "Concrete Surface Prep/Repair", "Expansion Joints", "Traffic Membranes"],
    "Cladding & Exterior Finishes": ["Steel Cladding", "ACM Panels", "Fibre Cement", "Phenolic", "Custom"],
    "Repairs & Maintenance": [],  # No subdivisions
    "Mack Kirk Metals": ["Flashing", "Custom Fabrication", "S-5 Mounting Hardware"],
    "Mechanical": [],  # No subdivisions
    "Electrical": [],  # No subdivisions
    "Carpentry": [],  # No subdivisions
    "Welding & Custom Fabrication": [],  # No subdivisions
    "Structural Upgrading": [],  # No subdivisions
    "Solar PV": [],  # No subdivisions
    "Green Roofing": [],  # No subdivisions
}

def seed_project_divisions():
    db = SessionLocal()
    try:
        # Get or create the project_divisions list
        divisions_list = db.query(SettingList).filter(SettingList.name == "project_divisions").first()
        if not divisions_list:
            divisions_list = SettingList(name="project_divisions")
            db.add(divisions_list)
            db.flush()
            print("Created 'project_divisions' SettingList")
        else:
            print("'project_divisions' SettingList already exists")
        
        # Clear existing items if any (for re-seeding)
        existing_items = db.query(SettingItem).filter(SettingItem.list_id == divisions_list.id).all()
        if existing_items:
            print(f"Clearing {len(existing_items)} existing items...")
            for item in existing_items:
                db.delete(item)
            db.flush()
        
        # Create divisions and subdivisions
        sort_index = 0
        division_map = {}  # Store division IDs for creating subdivisions
        
        for division_name, subdivisions in PROJECT_DIVISIONS.items():
            # Create main division
            division = SettingItem(
                list_id=divisions_list.id,
                parent_id=None,
                label=division_name,
                value=division_name.lower().replace(" ", "_"),
                sort_index=sort_index,
                meta=None
            )
            db.add(division)
            db.flush()
            division_map[division_name] = division.id
            print(f"Created division: {division_name}")
            sort_index += 1
            
            # Create subdivisions
            sub_sort_index = 0
            for sub_name in subdivisions:
                subdivision = SettingItem(
                    list_id=divisions_list.id,
                    parent_id=division.id,
                    label=sub_name,
                    value=sub_name.lower().replace(" ", "_"),
                    sort_index=sub_sort_index,
                    meta=None
                )
                db.add(subdivision)
                sub_sort_index += 1
                print(f"  Created subdivision: {sub_name}")
        
        db.commit()
        print(f"\nSuccessfully seeded {len(PROJECT_DIVISIONS)} divisions with their subdivisions")
        
    except Exception as e:
        db.rollback()
        print(f"Error seeding project divisions: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_project_divisions()

