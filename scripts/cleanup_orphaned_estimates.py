#!/usr/bin/env python3
"""
Script to find and delete orphaned estimates (estimates whose projects no longer exist)

Usage:
    python scripts/cleanup_orphaned_estimates.py          # Dry run (shows what would be deleted)
    python scripts/cleanup_orphaned_estimates.py --yes    # Actually delete orphaned estimates
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal
from app.models.models import Estimate, EstimateItem, Project
from sqlalchemy import text

def main():
    # Check for --yes flag
    auto_confirm = '--yes' in sys.argv or '-y' in sys.argv
    print("=" * 80)
    print("CLEANUP ORPHANED ESTIMATES")
    print("=" * 80)
    
    db = SessionLocal()
    try:
        # Find all estimates
        all_estimates = db.query(Estimate).all()
        print(f"Total estimates in database: {len(all_estimates)}")
        
        orphaned_estimates = []
        
        for estimate in all_estimates:
            if estimate.project_id:
                # Check if project exists
                project = db.query(Project).filter(Project.id == estimate.project_id).first()
                if not project:
                    orphaned_estimates.append(estimate)
                    print(f"  [ORPHANED] Estimate ID: {estimate.id}, Project ID: {estimate.project_id} (project not found)")
        
        print(f"\nFound {len(orphaned_estimates)} orphaned estimates")
        
        if len(orphaned_estimates) == 0:
            print("\n[OK] No orphaned estimates found. Nothing to clean up.")
            return 0
        
        # Ask for confirmation
        print("\n" + "=" * 80)
        print("WARNING: This will delete the following orphaned estimates:")
        print("=" * 80)
        for est in orphaned_estimates:
            print(f"  - Estimate ID: {est.id}, Project ID: {est.project_id}")
            # Count items
            items_count = db.query(EstimateItem).filter(EstimateItem.estimate_id == est.id).count()
            print(f"    Items: {items_count}")
        
        if not auto_confirm:
            print("\n" + "=" * 80)
            print("This is a DRY RUN. No estimates will be deleted.")
            print("To actually delete, run: python scripts/cleanup_orphaned_estimates.py --yes")
            print("=" * 80)
            return 0
        
        print("\n" + "=" * 80)
        print("AUTO-CONFIRMED: Proceeding with deletion...")
        print("=" * 80)
        
        # Delete orphaned estimates
        deleted_count = 0
        deleted_items_count = 0
        
        for estimate in orphaned_estimates:
            # First, delete all estimate items using bulk delete
            items_count = db.query(EstimateItem).filter(EstimateItem.estimate_id == estimate.id).count()
            if items_count > 0:
                db.query(EstimateItem).filter(EstimateItem.estimate_id == estimate.id).delete(synchronize_session=False)
                deleted_items_count += items_count
                print(f"  [DELETED] {items_count} items from Estimate ID: {estimate.id}")
            
            # Then delete the estimate
            db.delete(estimate)
            deleted_count += 1
            print(f"  [DELETED] Estimate ID: {estimate.id}")
        
        # Commit all deletions
        db.commit()
        
        print("\n" + "=" * 80)
        print(f"[SUCCESS] Deleted {deleted_count} orphaned estimates and {deleted_items_count} estimate items")
        print("=" * 80)
        
        return 0
        
    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] Error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        db.close()

if __name__ == '__main__':
    exit(main())

