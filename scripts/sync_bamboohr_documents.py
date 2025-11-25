"""
Script para sincronizar documentos do BambooHR para o MKHub

Uso:
    python scripts/sync_bamboohr_documents.py [--dry-run] [--employee-id EMPLOYEE_ID]
"""
import sys
import os
import uuid
import hashlib
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from io import BytesIO
import argparse

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models.models import User, EmployeeDocument, FileObject, EmployeeProfile
from app.services.bamboohr_client import BambooHRClient
from app.storage.local_provider import LocalStorageProvider
from app.storage.blob_provider import BlobStorageProvider
from app.storage.provider import StorageProvider
from app.config import settings


def get_storage() -> StorageProvider:
    """Get storage provider based on configuration"""
    if settings.azure_blob_connection and settings.azure_blob_container:
        return BlobStorageProvider()
    else:
        return LocalStorageProvider()


def find_user_by_bamboohr_id(db: Session, client: BambooHRClient, bamboohr_id: str) -> Optional[User]:
    """Find user by BambooHR ID - get employee data first to match by email"""
    try:
        employee_data = client.get_employee(bamboohr_id)
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
            # If no email, try to generate the same way we did during sync
            first_name = (employee_data.get("firstName", "") or "").lower().replace(" ", "")
            last_name = (employee_data.get("lastName", "") or "").lower().replace(" ", "")
            if first_name and last_name:
                email = f"{first_name}.{last_name}@mackkirk.local"
            elif first_name:
                email = f"{first_name}{bamboohr_id}@mackkirk.local"
            else:
                email = f"employee{bamboohr_id}@mackkirk.local"
        
        return db.query(User).filter(
            (User.email_personal == email) | (User.email_corporate == email)
        ).first()
    except Exception as e:
        print(f"  [WARN]  Error fetching employee data: {e}")
        return None


def canonical_key(employee_id: str, original_name: str, category: str = "bamboohr") -> str:
    """Generate canonical storage key for employee document"""
    from slugify import slugify
    from pathlib import Path
    
    today = datetime.now(timezone.utc)
    year = today.strftime("%Y")
    
    # Sanitize filename
    path = Path(original_name)
    safe_name = slugify(path.stem)
    ext = path.suffix.lower()
    
    return f"/org/{year}/employees/{employee_id}/{category}/{today.strftime('%Y%m%d')}_{safe_name}{ext}"


def create_file_object(
    db: Session,
    storage: StorageProvider,
    file_data: bytes,
    original_name: str,
    content_type: str,
    employee_id: uuid.UUID,
    bamboohr_file_id: Optional[str] = None
) -> FileObject:
    """Create FileObject and save file to storage"""
    
    # Generate storage key
    key = canonical_key(str(employee_id), original_name)
    
    # Calculate checksum
    checksum = hashlib.sha256(file_data).hexdigest()
    
    # Save to storage
    file_stream = BytesIO(file_data)
    storage.copy_in(file_stream, key)
    
    # Determine provider and container
    if isinstance(storage, LocalStorageProvider):
        provider = "local"
        container = "local"
    else:
        provider = "blob"
        container = settings.azure_blob_container or ""
    
    # Create FileObject
    fo = FileObject(
        id=uuid.uuid4(),
        provider=provider,
        container=container,
        key=key,
        size_bytes=len(file_data),
        content_type=content_type,
        checksum_sha256=checksum,
        employee_id=employee_id,
        source_ref=f"bamboohr:{bamboohr_file_id}" if bamboohr_file_id else None,
        tags={"source": "bamboohr", "bamboohr_file_id": bamboohr_file_id} if bamboohr_file_id else {"source": "bamboohr"},
        created_at=datetime.now(timezone.utc),
    )
    
    db.add(fo)
    db.flush()
    
    return fo


def sync_documents_for_employee(
    db: Session,
    client: BambooHRClient,
    storage: StorageProvider,
    employee_id: str,
    dry_run: bool = False
) -> tuple[int, int]:
    """Sync documents for a specific employee"""
    
    user = find_user_by_bamboohr_id(db, client, employee_id)
    if not user:
        print(f"  [WARN]  User not found for BambooHR employee ID: {employee_id}")
        return 0, 0
    
    try:
        files_list = client.get_employee_files(employee_id)
    except Exception as e:
        print(f"  [ERROR] Error fetching files list: {e}")
        return 0, 0
    
    created_count = 0
    skipped_count = 0
    
    for file_info in files_list:
        file_id = str(file_info.get("id", ""))
        file_name = file_info.get("name", "unknown")
        file_category = file_info.get("category", "other")
        
        print(f"    [FILE] {file_name} ({file_category})")
        
        # Check if document already exists
        existing_doc = db.query(EmployeeDocument).join(FileObject).filter(
            EmployeeDocument.user_id == user.id,
            FileObject.source_ref == f"bamboohr:{file_id}"
        ).first()
        
        if existing_doc:
            print(f"      [SKIP]  Already exists, skipping")
            skipped_count += 1
            continue
        
        if dry_run:
            print(f"      [CREATE] Would download and create document")
            continue
        
        # Download file
        try:
            file_data = client.get_employee_file(employee_id, file_id)
            if not file_data:
                print(f"      [WARN]  File is empty or not found")
                skipped_count += 1
                continue
        except Exception as e:
            print(f"      [ERROR] Error downloading file: {e}")
            skipped_count += 1
            continue
        
        # Determine content type
        content_type = file_info.get("contentType") or "application/octet-stream"
        if not content_type or content_type == "application/octet-stream":
            # Try to guess from extension
            ext = os.path.splitext(file_name)[1].lower()
            content_types = {
                ".pdf": "application/pdf",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".doc": "application/msword",
                ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                ".xls": "application/vnd.ms-excel",
                ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }
            content_type = content_types.get(ext, "application/octet-stream")
        
        # Create FileObject
        try:
            fo = create_file_object(
                db, storage, file_data, file_name, content_type, user.id, file_id
            )
        except Exception as e:
            print(f"      [ERROR] Error creating file object: {e}")
            skipped_count += 1
            continue
        
        # Create EmployeeDocument
        doc_type = file_category.lower().replace(" ", "_")
        doc = EmployeeDocument(
            id=uuid.uuid4(),
            user_id=user.id,
            doc_type=doc_type,
            title=file_name,
            notes=f"Imported from BambooHR - Category: {file_category}",
            file_id=fo.id,
            created_at=datetime.now(timezone.utc),
        )
        
        db.add(doc)
        created_count += 1
        print(f"      [OK] Created document")
    
    return created_count, skipped_count


def sync_employee_photo(
    db: Session,
    client: BambooHRClient,
    storage: StorageProvider,
    employee_id: str,
    dry_run: bool = False,
    force_update: bool = False
) -> bool:
    """Sync employee profile photo"""
    
    user = find_user_by_bamboohr_id(db, client, employee_id)
    if not user:
        print(f"  [WARN]  User not found for employee ID: {employee_id}")
        return False
    
    # Check if profile already has a photo
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user.id).first()
    if profile and profile.profile_photo_file_id and not force_update:
        print(f"  [SKIP]  Profile photo already exists (use --force-update to replace)")
        return False
    
    try:
        photo_data = client.get_employee_photo(employee_id)
        if not photo_data:
            print(f"  [WARN]  No photo available")
            return False
    except Exception as e:
        print(f"  [ERROR] Error fetching photo: {e}")
        return False
    
    if dry_run:
        print(f"  [CREATE] Would download and set profile photo")
        return False
    
    # Create FileObject for photo
    try:
        fo = create_file_object(
            db, storage, photo_data, f"profile_{employee_id}.jpg", "image/jpeg", user.id
        )
    except Exception as e:
        print(f"  [ERROR] Error creating photo file object: {e}")
        return False
    
    # Update profile
    if not profile:
        profile = EmployeeProfile(user_id=user.id, created_date=datetime.now(timezone.utc))
        db.add(profile)
    
    profile.profile_photo_file_id = fo.id
    print(f"  [OK] Set profile photo")
    
    return True


def sync_all_documents(
    dry_run: bool = False,
    employee_id: Optional[str] = None,
    include_photos: bool = True,
    limit: Optional[int] = None,
    force_update_photos: bool = False
):
    """Sync documents from BambooHR"""
    print("[SYNC] Starting BambooHR document synchronization...")
    print(f"   Mode: {'DRY RUN' if dry_run else 'LIVE'}")
    print(f"   Include photos: {include_photos}")
    
    # Initialize client and storage
    try:
        client = BambooHRClient()
        print(f"   Connected to: {client.company_domain}.bamboohr.com")
    except Exception as e:
        print(f"[ERROR] Error initializing BambooHR client: {e}")
        return
    
    try:
        storage = get_storage()
        print(f"   Storage provider: {type(storage).__name__}")
    except Exception as e:
        print(f"[ERROR] Error initializing storage: {e}")
        return
    
    db = SessionLocal()
    total_created = 0
    total_skipped = 0
    photos_set = 0
    
    try:
        if employee_id:
            # Sync for specific employee
            print(f"\n[FETCH] Fetching documents for employee: {employee_id}")
            
            if include_photos:
                if sync_employee_photo(db, client, storage, employee_id, dry_run, force_update_photos):
                    photos_set += 1
            
            created, skipped = sync_documents_for_employee(db, client, storage, employee_id, dry_run)
            total_created += created
            total_skipped += skipped
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
                name = f"{emp.get('displayName', '')} {emp.get('firstName', '')} {emp.get('lastName', '')}".strip()
                if not name:
                    name = f"Employee {emp_id}"
                print(f"\n[{idx}/{len(employees)}] Processing: {name} (ID: {emp_id})")
                
                if include_photos:
                    if sync_employee_photo(db, client, storage, emp_id, dry_run, force_update_photos):
                        photos_set += 1
                
                created, skipped = sync_documents_for_employee(db, client, storage, emp_id, dry_run)
                total_created += created
                total_skipped += skipped
        
        if not dry_run:
            db.commit()
        
        print("\n" + "="*50)
        print("[STATS] Document Synchronization Summary:")
        print(f"   Documents created: {total_created}")
        print(f"   Documents skipped: {total_skipped}")
        print(f"   Photos set: {photos_set}")
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
    parser = argparse.ArgumentParser(description="Sync documents from BambooHR")
    parser.add_argument("--dry-run", action="store_true", help="Don't make any changes")
    parser.add_argument("--employee-id", type=str, help="Sync documents for specific employee ID only")
    parser.add_argument("--no-photos", dest="include_photos", action="store_false", help="Skip profile photos")
    parser.add_argument("--force-update-photos", action="store_true", help="Update profile photos even if they already exist")
    parser.add_argument("--limit", type=int, help="Limit number of employees to process")
    
    args = parser.parse_args()
    
    sync_all_documents(
        dry_run=args.dry_run,
        employee_id=args.employee_id,
        include_photos=args.include_photos,
        limit=args.limit,
        force_update_photos=args.force_update_photos
    )


if __name__ == "__main__":
    main()

