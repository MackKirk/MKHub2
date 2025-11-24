"""
Script para sincronizar funcionários do BambooHR para o MKHub

Uso:
    python scripts/sync_bamboohr_employees.py [--dry-run] [--update-existing]
"""
import sys
import os
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any
import argparse

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models.models import User, EmployeeProfile
from app.services.bamboohr_client import BambooHRClient
from app.auth.security import get_password_hash
from app.config import settings


def parse_date(date_str: Optional[str]) -> Optional[datetime]:
    """Parse date string from BambooHR format (YYYY-MM-DD)"""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def find_user_by_email(db: Session, email: str) -> Optional[User]:
    """Find user by email (personal or corporate)"""
    return db.query(User).filter(
        (User.email_personal == email) | (User.email_corporate == email)
    ).first()


def find_user_by_bamboohr_id(db: Session, bamboohr_id: str) -> Optional[User]:
    """Find user by BambooHR ID stored in tags"""
    # We'll store BambooHR ID in user's tags or as a custom field
    # For now, we'll check if we can match by other means
    # This might need adjustment based on how we store the mapping
    return None  # TODO: Implement if we add a bamboohr_id field


def create_or_update_user(
    db: Session,
    employee_data: Dict[str, Any],
    dry_run: bool = False,
    update_existing: bool = True
) -> tuple[Optional[User], bool]:
    """
    Create or update user from BambooHR employee data
    
    Returns:
        (user, created) tuple where created is True if new user was created
    """
    # Extract key fields from BambooHR data
    bamboohr_id = str(employee_data.get("id", ""))
    # Priority: homeEmail (personal email used for signups) > workEmail > other emails
    # This matches the logic used in BambooHR for employee signups and signatures
    email = (
        employee_data.get("homeEmail") or  # Personal email - used for signups/signatures
        employee_data.get("personalEmail") or
        employee_data.get("workEmail") or 
        employee_data.get("email")
    )
    # Strip whitespace and check if empty
    if email:
        email = email.strip()
    if not email or email == "":
        email = None
    
    # Only generate @mackkirk.local email if absolutely no email exists
    # This is a fallback for employees without email in BambooHR
    if not email:
        first_name = employee_data.get("firstName", "").lower().replace(" ", "")
        last_name = employee_data.get("lastName", "").lower().replace(" ", "")
        if first_name and last_name:
            email = f"{first_name}.{last_name}@mackkirk.local"
        elif first_name:
            email = f"{first_name}{bamboohr_id}@mackkirk.local"
        else:
            email = f"employee{bamboohr_id}@mackkirk.local"
        print(f"  [WARN] No email found for employee {bamboohr_id}, using generated: {email}")
    else:
        email_source = "homeEmail" if employee_data.get("homeEmail") else ("personalEmail" if employee_data.get("personalEmail") else "workEmail")
        print(f"  [OK] Using {email_source}: {email}")
    
    # Check if user already exists
    existing_user = find_user_by_email(db, email)
    
    if existing_user and not update_existing:
        print(f"  [SKIP] Skipping existing user: {email}")
        return existing_user, False
    
    # Prepare user data
    first_name = employee_data.get("firstName", "")
    last_name = employee_data.get("lastName", "")
    username = employee_data.get("username") or email.split("@")[0]
    
    # Ensure username is unique
    base_username = username
    counter = 1
    while db.query(User).filter(User.username == username).first():
        username = f"{base_username}{counter}"
        counter += 1
    
    # Determine corporate email - use workEmail if different from personal email
    # Personal email (homeEmail) is used as email_personal
    # Work email (workEmail) is used as email_corporate if different
    work_email_raw = employee_data.get("workEmail") or ""
    work_email = work_email_raw.strip() if work_email_raw else None
    
    # Set corporate email only if work email exists and is different from personal email
    corporate_email = None
    if work_email and work_email != email and work_email:
        corporate_email = work_email
    
    # Use None instead of empty string for optional fields
    user_data = {
        "username": username,
        "email_personal": email,
        "email_corporate": corporate_email,
        "is_active": employee_data.get("status", "Active") == "Active",
        "status": "active" if employee_data.get("status", "Active") == "Active" else "inactive",
    }
    
    if existing_user:
        # Update existing user
        if dry_run:
            print(f"  [UPDATE] Would update user: {email}")
            return existing_user, False
        
        for key, value in user_data.items():
            setattr(existing_user, key, value)
        user = existing_user
        created = False
    else:
        # Create new user
        if dry_run:
            print(f"  [CREATE] Would create user: {email} ({username})")
            return None, True
        
        # Generate a temporary password (user will need to reset)
        temp_password = f"Temp_{uuid.uuid4().hex[:8]}"
        user_data["password_hash"] = get_password_hash(temp_password)
        user_data["created_at"] = datetime.now(timezone.utc)
        
        user = User(**user_data)
        db.add(user)
        db.flush()  # Get the user ID
        created = True
    
    # Create or update EmployeeProfile
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user.id).first()
    
    # Determine pay rate - use annualAmount for salary, payRate for hourly
    pay_type = (employee_data.get("payType", "") or "").lower()
    pay_rate_value = None
    if pay_type == "hourly" or pay_type == "hour":
        pay_rate_value = employee_data.get("payRate")
    else:
        # For salary, use annualAmount
        annual_amount = employee_data.get("annualAmount")
        if annual_amount:
            pay_rate_value = annual_amount
        else:
            # Fallback to payRate if annualAmount not available
            pay_rate_value = employee_data.get("payRate")
    
    profile_data = {
        "user_id": user.id,
        "first_name": first_name,
        "last_name": last_name,
        "preferred_name": employee_data.get("nickname") or employee_data.get("preferredName") or employee_data.get("preferredName"),
        "gender": employee_data.get("gender"),
        "date_of_birth": parse_date(employee_data.get("dateOfBirth")),
        "marital_status": employee_data.get("maritalStatus"),
        "nationality": employee_data.get("nationality"),
        "phone": employee_data.get("homePhone"),
        "mobile_phone": employee_data.get("mobilePhone"),
        "address_line1": employee_data.get("address1") or employee_data.get("addressLine1"),
        "address_line2": employee_data.get("address2") or employee_data.get("addressLine2"),
        "city": employee_data.get("city"),
        "province": employee_data.get("state") or employee_data.get("province"),
        "postal_code": employee_data.get("zipCode") or employee_data.get("postalCode"),
        "country": employee_data.get("country"),
        "hire_date": parse_date(employee_data.get("hireDate")),
        "termination_date": parse_date(employee_data.get("terminationDate")),
        "job_title": employee_data.get("jobTitle"),
        "division": employee_data.get("department") or employee_data.get("division"),
        "work_email": employee_data.get("workEmail") or employee_data.get("email"),
        "work_phone": employee_data.get("workPhone"),
        "pay_rate": str(pay_rate_value) if pay_rate_value else None,
        "pay_type": pay_type if pay_type else None,
        "employment_type": employee_data.get("employmentHistoryStatus", "").lower() if employee_data.get("employmentHistoryStatus") else None,
        "sin_number": employee_data.get("sin") or employee_data.get("ssn"),
        "work_permit_status": employee_data.get("workPermitStatus"),
        "visa_status": employee_data.get("visaStatus"),
        "emergency_contact_name": employee_data.get("emergencyContactName"),
        "emergency_contact_relationship": employee_data.get("emergencyContactRelationship"),
        "emergency_contact_phone": employee_data.get("emergencyContactPhone"),
        "updated_at": datetime.now(timezone.utc),
    }
    
    if profile:
        for key, value in profile_data.items():
            if key != "user_id":  # Don't update user_id
                setattr(profile, key, value)
    else:
        profile_data["created_date"] = datetime.now(timezone.utc)
        profile = EmployeeProfile(**profile_data)
        db.add(profile)
    
    # Store BambooHR ID mapping in profile or use email as key
    # We'll use email as the primary mapping key since it's unique
    
    if not dry_run:
        db.commit()
    
    action = "Created" if created else "Updated"
    print(f"  [OK] {action} user: {email} ({username})")
    
    return user, created


def sync_employees(
    dry_run: bool = False,
    update_existing: bool = True,
    limit: Optional[int] = None
):
    """Sync employees from BambooHR"""
    print("[SYNC] Starting BambooHR employee synchronization...")
    print(f"   Mode: {'DRY RUN' if dry_run else 'LIVE'}")
    print(f"   Update existing: {update_existing}")
    
    # Initialize client
    try:
        client = BambooHRClient()
        print(f"   Connected to: {client.company_domain}.bamboohr.com")
    except Exception as e:
        print(f"[ERROR] Error initializing BambooHR client: {e}")
        return
    
    # Get employee directory
    try:
        print("\n[FETCH] Fetching employee directory...")
        directory = client.get_employees_directory()
        # Handle both dict and list responses
        if isinstance(directory, dict):
            employees = directory.get("employees", [])
        else:
            employees = directory if isinstance(directory, list) else []
        print(f"   Found {len(employees)} employees")
    except Exception as e:
        print(f"[ERROR] Error fetching employee directory: {e}")
        return
    
    if limit:
        employees = employees[:limit]
        print(f"   Limiting to first {limit} employees")
    
    # Process each employee
    db = SessionLocal()
    created_count = 0
    updated_count = 0
    skipped_count = 0
    
    try:
        for idx, emp in enumerate(employees, 1):
            emp_id = emp.get("id")
            name = f"{emp.get('displayName', '')} {emp.get('firstName', '')} {emp.get('lastName', '')}".strip()
            if not name:
                name = f"Employee {emp_id}"
            print(f"\n[{idx}/{len(employees)}] Processing: {name} (ID: {emp_id})")
            
            # Get full employee details
            try:
                # Get all available fields
                employee_data = client.get_employee(str(emp_id))
                # Ensure ID is in the data and merge with directory data
                employee_data["id"] = str(emp_id)
                # Merge directory data (some fields might only be in directory)
                for key, value in emp.items():
                    if key != "id" and (key not in employee_data or not employee_data.get(key)):
                        employee_data[key] = value
            except Exception as e:
                print(f"  [ERROR] Error fetching employee details: {e}")
                skipped_count += 1
                continue
            
            user, created = create_or_update_user(
                db, employee_data, dry_run=dry_run, update_existing=update_existing
            )
            
            if user:
                if created:
                    created_count += 1
                else:
                    updated_count += 1
            else:
                skipped_count += 1
        
        if not dry_run:
            db.commit()
        
        print("\n" + "="*50)
        print("[STATS] Synchronization Summary:")
        print(f"   Created: {created_count}")
        print(f"   Updated: {updated_count}")
        print(f"   Skipped: {skipped_count}")
        print(f"   Total: {len(employees)}")
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
    parser = argparse.ArgumentParser(description="Sync employees from BambooHR")
    parser.add_argument("--dry-run", action="store_true", help="Don't make any changes")
    parser.add_argument("--update-existing", action="store_true", default=True, help="Update existing users")
    parser.add_argument("--no-update-existing", dest="update_existing", action="store_false", help="Skip existing users")
    parser.add_argument("--limit", type=int, help="Limit number of employees to process")
    
    args = parser.parse_args()
    
    sync_employees(
        dry_run=args.dry_run,
        update_existing=args.update_existing,
        limit=args.limit
    )


if __name__ == "__main__":
    main()

