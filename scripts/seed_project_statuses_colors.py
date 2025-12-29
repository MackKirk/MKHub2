"""
Seed project status colors (In progress, On hold, Finished) into the Settings system.

Usage:
  python scripts/seed_project_statuses_colors.py

This script is idempotent: running it multiple times will update the colors.
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables first
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception as e:
    print(f"WARNING: Could not load .env file: {e}")

from app.db import SessionLocal
from app.models.models import SettingList, SettingItem


def seed_project_status_colors():
    """Update project status colors with subtle colors"""
    db = SessionLocal()
    try:
        # Get project_statuses SettingList
        setting_list = db.query(SettingList).filter(SettingList.name == "project_statuses").first()
        if not setting_list:
            print("project_statuses SettingList not found. Please create it first.")
            return
        
        # Define project status colors (subtle, light colors)
        # These are the main project statuses (not opportunity statuses)
        # Try different possible label variations
        project_status_colors = {
            "In progress": "#dbeafe",  # Light blue - indicates active work
            "In Progress": "#dbeafe",  # Light blue - indicates active work
            "in progress": "#dbeafe",  # Light blue - indicates active work
            "On hold": "#fef3c7",     # Light yellow/amber - indicates paused/waiting
            "On Hold": "#fef3c7",     # Light yellow/amber - indicates paused/waiting
            "on hold": "#fef3c7",     # Light yellow/amber - indicates paused/waiting
            "Finished": "#d1fae5",   # Light green - indicates completion
            "finished": "#d1fae5",   # Light green - indicates completion
        }
        
        # First, let's see what statuses exist
        all_statuses = db.query(SettingItem).filter(
            SettingItem.list_id == setting_list.id
        ).all()
        
        print(f"\nFound {len(all_statuses)} statuses in database:")
        for status in all_statuses:
            print(f"  - '{status.label}' (current color: {status.value or 'none'})")
        
        # Update colors for project statuses
        # Exclude opportunity statuses
        opportunity_statuses = ["Prospecting", "Sent to Customer", "Refused"]
        updated_count = 0
        
        for status in all_statuses:
            status_label = status.label
            # Skip opportunity statuses
            if status_label in opportunity_statuses:
                continue
            
            # Find matching color (case-insensitive)
            color_value = None
            for label_key, color in project_status_colors.items():
                if status_label.lower() == label_key.lower():
                    color_value = color
                    break
            
            # If no specific color found, assign a default subtle color based on common patterns
            if not color_value:
                label_lower = status_label.lower()
                if "progress" in label_lower or "active" in label_lower or "ongoing" in label_lower:
                    color_value = "#dbeafe"  # Light blue
                elif "hold" in label_lower or "pause" in label_lower or "wait" in label_lower:
                    color_value = "#fef3c7"  # Light yellow/amber
                elif "finish" in label_lower or "complete" in label_lower or "done" in label_lower:
                    color_value = "#d1fae5"  # Light green
                else:
                    # Default subtle gray for unknown statuses
                    color_value = "#f3f4f6"
                    print(f"  Using default color for '{status_label}'")
            
            if status.value != color_value:
                status.value = color_value
                db.add(status)
                updated_count += 1
                print(f"Updated color for status: {status_label} -> {color_value}")
            else:
                print(f"Status '{status_label}' already has the correct color")
        
        if updated_count > 0:
            db.commit()
            print(f"\nProject status colors updated successfully! ({updated_count} statuses updated)")
        else:
            print("\nNo changes needed. All status colors are up to date.")
        
    except Exception as e:
        db.rollback()
        print(f"Error updating project status colors: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_project_status_colors()

