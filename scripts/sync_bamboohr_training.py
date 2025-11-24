"""
Script para sincronizar treinamentos do BambooHR para o MKHub

Uso:
    python scripts/sync_bamboohr_training.py [--dry-run] [--employee-id EMPLOYEE_ID]
"""
import sys
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
import argparse

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models.models import (
    User, TrainingCourse, TrainingModule, TrainingLesson,
    TrainingProgress, TrainingCertificate, SettingItem
)
from app.services.bamboohr_client import BambooHRClient
from app.config import settings


def parse_datetime(dt_str: Optional[str]) -> Optional[datetime]:
    """Parse datetime string from BambooHR"""
    if not dt_str:
        return None
    try:
        # Try ISO format first
        return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
    except (ValueError, TypeError):
        try:
            # Try common formats
            for fmt in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"]:
                try:
                    return datetime.strptime(dt_str, fmt).replace(tzinfo=timezone.utc)
                except ValueError:
                    continue
        except Exception:
            pass
    return None


def find_user_by_bamboohr_id(db: Session, bamboohr_id: str) -> Optional[User]:
    """Find user by BambooHR ID - we need to get employee data first to match by email"""
    # We'll need to get the employee data from BambooHR to match by email
    # This function should be called with employee data, not just ID
    return None


def find_user_by_bamboohr_employee_data(db: Session, employee_data: Dict[str, Any]) -> Optional[User]:
    """Find user by BambooHR employee data (using email)"""
    # Use same priority as sync script: homeEmail > personalEmail > workEmail > email
    email = (
        employee_data.get("homeEmail") or
        employee_data.get("personalEmail") or
        employee_data.get("workEmail") or 
        employee_data.get("email")
    )
    if email:
        email = email.strip()
    if not email:
        return None
    return db.query(User).filter(
        (User.email_personal == email) | (User.email_corporate == email)
    ).first()


def find_or_create_training_category(db: Session, category_name: str) -> Optional[uuid.UUID]:
    """Find or create a training category"""
    if not category_name:
        return None
    
    # Look for existing category in SettingItem with type 'training_category'
    category = db.query(SettingItem).filter(
        SettingItem.type == "training_category",
        SettingItem.label == category_name
    ).first()
    
    if category:
        return category.id
    
    # Create new category if not dry run
    # For now, return None - categories should be created manually or via seed script
    return None


def create_training_course_from_bamboohr(
    db: Session,
    training_data: Dict[str, Any],
    dry_run: bool = False
) -> Optional[TrainingCourse]:
    """Create a training course from BambooHR training record"""
    
    training_type = training_data.get("type", {}).get("name", "Other")
    training_name = training_data.get("name") or training_type
    
    # Check if course already exists (by name or external ID)
    existing = db.query(TrainingCourse).filter(
        TrainingCourse.title == training_name
    ).first()
    
    if existing:
        return existing
    
    if dry_run:
        print(f"  [CREATE] Would create course: {training_name}")
        return None
    
    category_id = find_or_create_training_category(db, training_type)
    
    course = TrainingCourse(
        id=uuid.uuid4(),
        title=training_name,
        description=training_data.get("description") or f"Training imported from BambooHR: {training_type}",
        category_id=category_id,
        status="published",
        is_required=False,
        renewal_frequency="none",
        generates_certificate=False,
        created_at=datetime.now(timezone.utc),
    )
    
    # Store BambooHR training type ID in tags
    if training_data.get("type", {}).get("id"):
        course.tags = {"bamboohr_type_id": str(training_data["type"]["id"])}
    
    db.add(course)
    db.flush()
    
    return course


def sync_training_for_employee(
    db: Session,
    client: BambooHRClient,
    employee_id: str,
    dry_run: bool = False
) -> tuple[int, int]:
    """Sync training records for a specific employee"""
    
    # Get employee data to find user by email
    try:
        employee_data = client.get_employee(employee_id)
    except Exception as e:
        print(f"  [ERROR] Error fetching employee data: {e}")
        return 0, 0
    
    user = find_user_by_bamboohr_employee_data(db, employee_data)
    if not user:
        name = f"{employee_data.get('firstName', '')} {employee_data.get('lastName', '')}".strip()
        print(f"  [WARN]  User not found for BambooHR employee: {name} (ID: {employee_id})")
        return 0, 0
    
    try:
        training_records = client.get_training_records(employee_id)
    except Exception as e:
        print(f"  [ERROR] Error fetching training records: {e}")
        return 0, 0
    
    created_count = 0
    updated_count = 0
    
    for record in training_records:
        training_name = record.get("name") or record.get("type", {}).get("name", "Unknown")
        completion_date = parse_datetime(record.get("completedDate"))
        
        print(f"    📚 {training_name}")
        if completion_date:
            print(f"       Completed: {completion_date.strftime('%Y-%m-%d')}")
        
        # Create or find training course
        course = create_training_course_from_bamboohr(db, record, dry_run=dry_run)
        if not course:
            continue
        
        # Check if progress record exists
        progress = db.query(TrainingProgress).filter(
            TrainingProgress.user_id == user.id,
            TrainingProgress.course_id == course.id
        ).first()
        
        if progress:
            # Update existing progress
            if completion_date:
                progress.completed_at = completion_date
                progress.progress_percent = 100
                progress.last_accessed_at = completion_date
            updated_count += 1
        else:
            # Create new progress record
            if dry_run:
                print(f"      [CREATE] Would create progress record")
            else:
                progress = TrainingProgress(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    course_id=course.id,
                    started_at=parse_datetime(record.get("startedDate")) or datetime.now(timezone.utc),
                    completed_at=completion_date,
                    last_accessed_at=completion_date or datetime.now(timezone.utc),
                    progress_percent=100 if completion_date else 0,
                )
                db.add(progress)
                created_count += 1
        
        # If completed and course generates certificates, create certificate
        if completion_date and course.generates_certificate:
            existing_cert = db.query(TrainingCertificate).filter(
                TrainingCertificate.user_id == user.id,
                TrainingCertificate.course_id == course.id
            ).first()
            
            if not existing_cert and not dry_run:
                cert = TrainingCertificate(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    course_id=course.id,
                    issued_at=completion_date,
                    expires_at=(
                        completion_date + timedelta(days=course.certificate_validity_days)
                        if course.certificate_validity_days
                        else None
                    ),
                    certificate_number=f"BH-{employee_id}-{course.id.hex[:8]}",
                )
                db.add(cert)
    
    return created_count, updated_count


def sync_all_training(
    dry_run: bool = False,
    employee_id: Optional[str] = None,
    limit: Optional[int] = None
):
    """Sync training records from BambooHR"""
    print("[SYNC] Starting BambooHR training synchronization...")
    print(f"   Mode: {'DRY RUN' if dry_run else 'LIVE'}")
    
    # Initialize client
    try:
        client = BambooHRClient()
        print(f"   Connected to: {client.company_domain}.bamboohr.com")
    except Exception as e:
        print(f"[ERROR] Error initializing BambooHR client: {e}")
        return
    
    db = SessionLocal()
    total_created = 0
    total_updated = 0
    
    try:
        if employee_id:
            # Sync for specific employee
            print(f"\n[FETCH] Fetching training for employee: {employee_id}")
            created, updated = sync_training_for_employee(db, client, employee_id, dry_run)
            total_created += created
            total_updated += updated
        else:
            # Sync for all employees
            print("\n[FETCH] Fetching employee directory...")
            directory = client.get_employees_directory()
            # Handle both dict and list responses
            if isinstance(directory, dict):
                employees = directory.get("employees", [])
            else:
                employees = directory if isinstance(directory, list) else []
            print(f"   Found {len(employees)} employees")
            
            if limit:
                employees = employees[:limit]
                print(f"   Limiting to first {limit} employees")
            
            for idx, emp in enumerate(employees, 1):
                emp_id = str(emp.get("id"))
                name = f"{emp.get('firstName', '')} {emp.get('lastName', '')}".strip()
                print(f"\n[{idx}/{len(employees)}] Processing: {name} (ID: {emp_id})")
                
                created, updated = sync_training_for_employee(db, client, emp_id, dry_run)
                total_created += created
                total_updated += updated
        
        if not dry_run:
            db.commit()
        
        print("\n" + "="*50)
        print("[STATS] Training Synchronization Summary:")
        print(f"   Progress records created: {total_created}")
        print(f"   Progress records updated: {total_updated}")
        print("="*50)
        
    except Exception as e:
        print(f"\n[ERROR] Error during synchronization: {e}")
        import traceback
        traceback.print_exc()
        if not dry_run:
            db.rollback()
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Sync training records from BambooHR")
    parser.add_argument("--dry-run", action="store_true", help="Don't make any changes")
    parser.add_argument("--employee-id", type=str, help="Sync training for specific employee ID only")
    parser.add_argument("--limit", type=int, help="Limit number of employees to process")
    
    args = parser.parse_args()
    
    sync_all_training(
        dry_run=args.dry_run,
        employee_id=args.employee_id,
        limit=args.limit
    )


if __name__ == "__main__":
    main()

