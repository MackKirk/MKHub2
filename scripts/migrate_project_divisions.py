"""
Migration script to map old divisions to project_divisions.
This script attempts to map existing division_ids/division_ids to the new project_divisions structure.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal
from app.models.models import Project, SettingList, SettingItem
from sqlalchemy import or_
import uuid

def migrate_project_divisions():
    db = SessionLocal()
    try:
        # Get project_divisions list
        divisions_list = db.query(SettingList).filter(SettingList.name == "project_divisions").first()
        if not divisions_list:
            print("ERROR: 'project_divisions' SettingList not found. Please run seed_project_divisions.py first.")
            return
        
        # Get all project divisions (main divisions and subdivisions)
        all_project_divisions = db.query(SettingItem).filter(
            SettingItem.list_id == divisions_list.id
        ).all()
        
        # Create a map of old division names/labels to new project division IDs
        # This is a best-effort mapping - you may need to adjust based on your data
        division_map = {}
        for div in all_project_divisions:
            # Map by label (case-insensitive)
            label_lower = div.label.lower()
            division_map[label_lower] = str(div.id)
            # Also map by value if different
            if div.value and div.value.lower() != label_lower:
                division_map[div.value.lower()] = str(div.id)
        
        # Get all projects that have division_id or division_ids but no project_division_ids
        projects = db.query(Project).filter(
            or_(
                Project.division_id != None,
                Project.division_ids != None
            )
        ).all()
        
        migrated_count = 0
        skipped_count = 0
        
        for proj in projects:
            # Skip if already has project_division_ids
            if getattr(proj, 'project_division_ids', None):
                skipped_count += 1
                continue
            
            project_division_ids = []
            
            # Try to map division_id
            if getattr(proj, 'division_id', None):
                # Try to find matching project division by ID
                old_div_id = str(proj.division_id)
                matching_div = db.query(SettingItem).filter(
                    SettingItem.list_id == divisions_list.id,
                    SettingItem.id == proj.division_id
                ).first()
                
                if matching_div:
                    project_division_ids.append(str(matching_div.id))
                else:
                    # Try to find by name from old divisions list
                    # This would require querying the old divisions SettingList
                    # For now, we'll skip if not found in project_divisions
                    print(f"  Project {proj.code}: Could not map division_id {old_div_id}")
            
            # Try to map division_ids (array)
            if getattr(proj, 'division_ids', None) and isinstance(proj.division_ids, list):
                for old_div_id in proj.division_ids:
                    try:
                        old_uuid = uuid.UUID(str(old_div_id))
                        matching_div = db.query(SettingItem).filter(
                            SettingItem.list_id == divisions_list.id,
                            SettingItem.id == old_uuid
                        ).first()
                        
                        if matching_div:
                            div_id_str = str(matching_div.id)
                            if div_id_str not in project_division_ids:
                                project_division_ids.append(div_id_str)
                    except (ValueError, TypeError):
                        # Not a valid UUID, skip
                        pass
            
            # Update project if we found any mappings
            if project_division_ids:
                proj.project_division_ids = project_division_ids
                migrated_count += 1
                print(f"  Migrated project {proj.code}: {len(project_division_ids)} division(s)")
            else:
                skipped_count += 1
                print(f"  Skipped project {proj.code}: No matching project divisions found")
        
        db.commit()
        print(f"\nMigration complete:")
        print(f"  Migrated: {migrated_count} projects")
        print(f"  Skipped: {skipped_count} projects")
        print(f"\nNote: This is a best-effort migration. Please review and manually update projects as needed.")
        
    except Exception as e:
        db.rollback()
        print(f"Error migrating project divisions: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    migrate_project_divisions()

