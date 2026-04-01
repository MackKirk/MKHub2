"""
Seed script for project divisions and subdivisions.

IMPORTANT (production-safe):
- Never bulk-delete SettingItem rows: project_division_ids on projects and other FKs depend on stable UUIDs.
- This script UPSERTs by (list_id, parent_id, label): existing rows keep their id; only sort_index/value/meta are refreshed.
- Rows present in the database but not in PROJECT_DIVISIONS below are left untouched (not deleted).

DEPRECATED (never reintroduce):
- Older versions deleted all items under project_divisions and re-inserted them, which changed UUIDs.
  That pattern is documented under scripts/deprecated/ — do not restore it.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal
from app.models.models import SettingList, SettingItem

# Structure: division_name -> [subdivision_names]
PROJECT_DIVISIONS = {
    "Roofing": ["SBS", "Shingles", "Single Ply", "Standing Seam Metal", "Hot Asphalt", "Cedar", "Cladding"],
    "Concrete Restoration & Waterproofing": ["SBS", "Liquid Membranes", "Concrete Surface Prep/Repair", "Expansion Joints", "Traffic Membranes"],
    "Cladding & Exterior Finishes": ["Steel Cladding", "ACM Panels", "Fibre Cement", "Phenolic", "Custom"],
    "Repairs & Maintenance": [],  # No subdivisions
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
        divisions_list = db.query(SettingList).filter(SettingList.name == "project_divisions").first()
        if not divisions_list:
            divisions_list = SettingList(name="project_divisions")
            db.add(divisions_list)
            db.flush()
            print("Created 'project_divisions' SettingList")
        else:
            print("'project_divisions' SettingList already exists")

        sort_index = 0
        for division_name, subdivisions in PROJECT_DIVISIONS.items():
            division = (
                db.query(SettingItem)
                .filter(
                    SettingItem.list_id == divisions_list.id,
                    SettingItem.parent_id.is_(None),
                    SettingItem.label == division_name,
                )
                .first()
            )
            if division:
                division.sort_index = sort_index
                division.value = division_name.lower().replace(" ", "_")
                print(f"Updated division (id preserved): {division_name} [{division.id}]")
            else:
                division = SettingItem(
                    list_id=divisions_list.id,
                    parent_id=None,
                    label=division_name,
                    value=division_name.lower().replace(" ", "_"),
                    sort_index=sort_index,
                    meta=None,
                )
                db.add(division)
                db.flush()
                print(f"Created division: {division_name} [{division.id}]")
            sort_index += 1

            sub_sort_index = 0
            for sub_name in subdivisions:
                subdivision = (
                    db.query(SettingItem)
                    .filter(
                        SettingItem.list_id == divisions_list.id,
                        SettingItem.parent_id == division.id,
                        SettingItem.label == sub_name,
                    )
                    .first()
                )
                if subdivision:
                    subdivision.sort_index = sub_sort_index
                    subdivision.value = sub_name.lower().replace(" ", "_")
                    print(f"  Updated subdivision (id preserved): {sub_name} [{subdivision.id}]")
                else:
                    subdivision = SettingItem(
                        list_id=divisions_list.id,
                        parent_id=division.id,
                        label=sub_name,
                        value=sub_name.lower().replace(" ", "_"),
                        sort_index=sub_sort_index,
                        meta=None,
                    )
                    db.add(subdivision)
                    db.flush()
                    print(f"  Created subdivision: {sub_name} [{subdivision.id}]")
                sub_sort_index += 1

        db.commit()
        print(f"\nSuccessfully upserted {len(PROJECT_DIVISIONS)} divisions (existing UUIDs preserved).")

    except Exception as e:
        db.rollback()
        print(f"Error seeding project divisions: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_project_divisions()
