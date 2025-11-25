"""
Script para sincronizar funcionários do BambooHR para o MKHub

Uso:
    python scripts/sync_bamboohr_employees.py [--dry-run] [--update-existing]
"""
import sys
import os
import uuid
import re
from datetime import datetime, timezone
from typing import Optional, Dict, Any
import argparse

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models.models import User, EmployeeProfile, FileObject, EmployeeVisa, EmployeeEmergencyContact
from app.services.bamboohr_client import BambooHRClient
from app.auth.security import get_password_hash
from app.config import settings
from app.storage.local_provider import LocalStorageProvider
from app.storage.blob_provider import BlobStorageProvider
from app.storage.provider import StorageProvider
import hashlib
from io import BytesIO


def parse_date(date_str: Optional[str]) -> Optional[datetime]:
    """Parse date string from BambooHR format (YYYY-MM-DD)"""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def normalize_country(country: Optional[str]) -> Optional[str]:
    """Normalize country name to match GeoSelect API values"""
    if not country:
        return None
    
    country = country.strip()
    
    # Common mappings from BambooHR to GeoSelect API
    # Based on countriesnow.space API country names
    country_mappings = {
        "United States": "United States of America",
        "USA": "United States of America",
        "US": "United States of America",
        "United Kingdom": "United Kingdom",
        "UK": "United Kingdom",
        "Canada": "Canada",
        "CA": "Canada",
        "Mexico": "Mexico",
        "MX": "Mexico",
        "Australia": "Australia",
        "AU": "Australia",
        "New Zealand": "New Zealand",
        "NZ": "New Zealand",
    }
    
    # Check exact match first
    if country in country_mappings:
        return country_mappings[country]
    
    # Check case-insensitive match
    country_lower = country.lower()
    for key, value in country_mappings.items():
        if key.lower() == country_lower:
            return value
    
    # Return as-is if no mapping found (might work if API accepts it)
    return country


def normalize_province(province: Optional[str], country: Optional[str] = None) -> Optional[str]:
    """Normalize province/state name to match GeoSelect API values"""
    if not province:
        return None
    
    province = province.strip()
    
    # Common mappings for Canadian provinces
    canadian_provinces = {
        "BC": "British Columbia",
        "AB": "Alberta",
        "SK": "Saskatchewan",
        "MB": "Manitoba",
        "ON": "Ontario",
        "QC": "Quebec",
        "NB": "New Brunswick",
        "NS": "Nova Scotia",
        "PE": "Prince Edward Island",
        "NL": "Newfoundland and Labrador",
        "YT": "Yukon",
        "NT": "Northwest Territories",
        "NU": "Nunavut",
    }
    
    # Common mappings for US states (add more as needed)
    us_states = {
        "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
        "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
        "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
        "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
        "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
        "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
        "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
        "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
        "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
        "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
        "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
        "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
        "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia",
    }
    
    # Check if it's a Canadian province abbreviation
    if country and "canada" in country.lower():
        if province.upper() in canadian_provinces:
            return canadian_provinces[province.upper()]
    
    # Check if it's a US state abbreviation
    if country and ("united states" in country.lower() or "usa" in country.lower()):
        if province.upper() in us_states:
            return us_states[province.upper()]
    
    # Check Canadian provinces regardless of country
    if province.upper() in canadian_provinces:
        return canadian_provinces[province.upper()]
    
    # Check US states regardless of country
    if province.upper() in us_states:
        return us_states[province.upper()]
    
    # Return as-is if no mapping found
    return province


def normalize_city(city: Optional[str]) -> Optional[str]:
    """Normalize city name (mostly just trim, but can add mappings if needed)"""
    if not city:
        return None
    return city.strip()


def get_storage() -> StorageProvider:
    """Get storage provider based on configuration"""
    if settings.azure_blob_connection and settings.azure_blob_container:
        return BlobStorageProvider()
    else:
        return LocalStorageProvider()


def create_file_object(
    db: Session,
    storage: StorageProvider,
    file_data: bytes,
    original_name: str,
    content_type: str,
    employee_id: uuid.UUID
) -> FileObject:
    """Create FileObject and save file to storage"""
    from pathlib import Path
    from slugify import slugify
    
    # Generate storage key
    today = datetime.now(timezone.utc)
    year = today.strftime("%Y")
    path = Path(original_name)
    safe_name = slugify(path.stem)
    ext = path.suffix.lower()
    key = f"/org/{year}/employees/{employee_id}/profile/{today.strftime('%Y%m%d')}_{safe_name}{ext}"
    
    # Calculate checksum
    checksum = hashlib.sha256(file_data).hexdigest()
    
    # Save to storage using copy_in (works for both LocalStorageProvider and BlobStorageProvider)
    storage.copy_in(BytesIO(file_data), key)
    
    # Determine provider and container
    from app.storage.local_provider import LocalStorageProvider
    if isinstance(storage, LocalStorageProvider):
        provider = "local"
        container = "local"
    else:
        provider = "blob"
        container = settings.azure_blob_container or ""
    
    # Create FileObject (using the correct field names from the model)
    fo = FileObject(
        id=uuid.uuid4(),
        provider=provider,
        container=container,
        key=key,
        content_type=content_type,
        size_bytes=len(file_data),
        checksum_sha256=checksum,
        created_by=employee_id,
        created_at=datetime.now(timezone.utc),
        employee_id=employee_id
    )
    db.add(fo)
    db.flush()
    
    return fo


def sync_employee_photo(
    db: Session,
    client: BambooHRClient,
    storage: StorageProvider,
    user: User,
    bamboohr_id: str,
    dry_run: bool = False,
    force_update: bool = False
) -> bool:
    """Sync employee profile photo"""
    
    # Check if profile already has a photo
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user.id).first()
    if profile and profile.profile_photo_file_id and not force_update:
        print(f"  [SKIP]  Profile photo already exists (use --force-update-photos to replace)")
        return False
    
    try:
        photo_data = client.get_employee_photo(bamboohr_id)
        if not photo_data:
            print(f"  [WARN]  No photo available in BambooHR for employee {bamboohr_id}")
            return False
        print(f"  [INFO]  Fetched photo from BambooHR: {len(photo_data)} bytes")
    except Exception as e:
        print(f"  [WARN]  Error fetching photo: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    if dry_run:
        print(f"  [CREATE] Would download and set profile photo")
        return False
    
    # Create FileObject for photo
    try:
        print(f"  [INFO]  Creating file object and saving to storage...")
        fo = create_file_object(
            db, storage, photo_data, f"profile_{bamboohr_id}.jpg", "image/jpeg", user.id
        )
        print(f"  [INFO]  File object created: {fo.id}, key: {fo.key}")
    except Exception as e:
        print(f"  [ERROR] Error creating photo file object: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Update profile
    if not profile:
        profile = EmployeeProfile(user_id=user.id, created_date=datetime.now(timezone.utc))
        db.add(profile)
    
    profile.profile_photo_file_id = fo.id
    print(f"  [OK] Set profile photo")
    
    return True


def sync_employee_visas(
    db: Session,
    client: BambooHRClient,
    user: User,
    bamboohr_id: str,
    employee_data: Optional[Dict[str, Any]] = None,
    dry_run: bool = False
) -> int:
    """Sync employee visa information from BambooHR custom table"""
    
    # First, try to get list of available tables to find the correct name
    # Note: Based on user's network request, fieldId: "4168" and tableType: "visa"
    # We'll try fieldId first, then tableType and variations
    visa_table_name_from_list = None
    visa_table_index = None
    visa_field_id = "4168"  # Known fieldId from user's network request - try this first!
    
    try:
        available_tables = client.get_tables()
        if available_tables:
            print(f"  [DEBUG] Available tables count: {len(available_tables)}")
            # Look for visa/work permit related tables
            # The response might be a list of strings (field names) or dicts
            for idx, table in enumerate(available_tables):
                table_str = str(table).lower()
                # Check if the table description contains visa-related fields
                if 'visa' in table_str and ('date' in table_str or 'issuing' in table_str or 'expiration' in table_str):
                    print(f"  [DEBUG] Found visa-related table at index {idx}: {str(table)[:200]}")
                    visa_table_index = idx
                    # Try to extract table name - it might be in the string or as a dict key
                    if isinstance(table, dict):
                        visa_table_name_from_list = table.get('name') or table.get('id') or table.get('alias')
                        print(f"  [INFO] Found visa table name from dict: {visa_table_name_from_list}")
                    elif isinstance(table, str):
                        # If it's a string with field names like "['Visa:Date', 'Visa', ...]"
                        # The table name might be "Visa" or we need to try common names
                        # Extract potential table name from the string
                        if "visa" in table_str:
                            # Try to find the table name - it might be before the colon or in the field names
                            # Common pattern: "Visa" or "Visa Information"
                            # Based on BambooHR API, table names in URLs are often camelCase or PascalCase
                            visa_table_name_from_list = "Visa"  # Most likely based on field names
                            print(f"  [INFO] Detected visa table from field names, trying: {visa_table_name_from_list}")
                    break
    except Exception as e:
        print(f"  [DEBUG] Could not list tables: {e}")
        import traceback
        print(f"  [DEBUG] Traceback: {traceback.format_exc()}")
    
    # Try common table names for visa information
    # Based on BambooHR API documentation: table name is "employeeVisas"
    # Fields: date, visaType, country, issued, expires, note
    visa_table_names = []
    visa_field_id = None  # Initialize fieldId variable
    
    # Official table name from BambooHR API documentation - try this first!
    visa_table_names.append("employeeVisas")
    print(f"  [INFO] Will try official table name first: employeeVisas")
    
    # If we found a table name from the list, try it next
    if visa_table_name_from_list:
        visa_table_names.append(visa_table_name_from_list)
        # Also try variations
        visa_table_names.append(visa_table_name_from_list.lower())
        visa_table_names.append(visa_table_name_from_list.replace(' ', ''))
        visa_table_names.append(visa_table_name_from_list.replace(' ', '_'))
    
    # Add common variations as fallback
    visa_table_names.extend([
        "employee_visas",  # snake_case
        "EmployeeVisas",  # PascalCase
        "visa",  # Based on tableType from API response
        "Visa", 
        "VisaInformation",  # camelCase
        "visaInformation",  # camelCase lowercase first
        "Visa Information",  # With space (URL encoded)
        "visa_information",  # snake_case
        "workPermit", 
        "work_permit",
        "WorkPermit",
        "Work Permit",
    ])
    
    # Try fieldId as last resort (known from user's network request: "4168")
    if not visa_field_id:
        visa_field_id = "4168"  # Known fieldId from user's network request
    visa_table_names.append(visa_field_id)
    
    # If we found the table index, try using it as a table identifier
    if visa_table_index is not None:
        visa_table_names.append(str(visa_table_index))
    
    # Remove duplicates while preserving order
    seen = set()
    visa_table_names = [x for x in visa_table_names if not (x in seen or seen.add(x))]
    
    visas_synced = 0
    visa_data = None  # Initialize before the loop
    
    print(f"  [DEBUG] Will try {len(visa_table_names)} table name variations: {visa_table_names[:5]}...")
    
    for table_name in visa_table_names:
        try:
            # Get visa data from custom table
            # Note: Based on user's network request, the actual endpoint might be different
            # The API returns fieldId: "4168" and tableType: "visa"
            # We'll try the standard endpoint first
            visa_data = client.get_table_data(table_name, bamboohr_id)
            print(f"  [SUCCESS] Found visa data for table '{table_name}': {type(visa_data)} - {str(visa_data)[:200] if visa_data else 'None'}")
            
            # If we got data, break out of the loop
            if visa_data:
                break
        except Exception as e:
            # Continue to next table name if this one fails
            print(f"  [DEBUG] Error trying table '{table_name}': {e}")
            continue
    
    # If we still don't have data and we have a fieldId, try using it directly
    if not visa_data and visa_field_id:
        print(f"  [INFO] Trying to get visa data using fieldId directly: {visa_field_id}")
        try:
            visa_data = client.get_employee_table_by_field_id(bamboohr_id, visa_field_id)
            if visa_data:
                print(f"  [SUCCESS] Found visa data using fieldId '{visa_field_id}': {type(visa_data)} - {str(visa_data)[:200] if visa_data else 'None'}")
        except Exception as e:
            print(f"  [DEBUG] Error trying fieldId '{visa_field_id}': {e}")
    
    if visa_data:
        # Handle different response formats
        rows = []
        if isinstance(visa_data, list):
            rows = visa_data
        elif isinstance(visa_data, dict):
            # Try table structure first (most common in BambooHR)
            if "table" in visa_data and "employees" in visa_data:
                emp_data = visa_data.get("employees", {}).get(bamboohr_id, {})
                if isinstance(emp_data, dict):
                    if "rows" in emp_data:
                        rows = emp_data["rows"] if isinstance(emp_data["rows"], list) else [emp_data["rows"]]
                    elif "data" in emp_data:
                        rows = emp_data["data"] if isinstance(emp_data["data"], list) else [emp_data["data"]]
            elif "row" in visa_data:
                row_value = visa_data["row"]
                rows = [row_value] if isinstance(row_value, list) else [[row_value]]
                print(f"  [DEBUG] Found visa data in 'row' key: {rows}")
            elif "rows" in visa_data:
                # New format: {rows: [{fields: [{name: "...", content: {value: "..."}}]}]}
                rows = visa_data["rows"] if isinstance(visa_data["rows"], list) else [visa_data["rows"]]
                print(f"  [DEBUG] Found {len(rows)} row(s) in visa data with 'rows' key")
            elif "data" in visa_data:
                rows = visa_data["data"] if isinstance(visa_data["data"], list) else [visa_data["data"]]
            elif "employees" in visa_data:
                emp_data = visa_data.get("employees", {}).get(bamboohr_id, {})
                if isinstance(emp_data, dict):
                    if "rows" in emp_data:
                        rows = emp_data["rows"] if isinstance(emp_data["rows"], list) else [emp_data["rows"]]
                    elif "row" in emp_data:
                        row_value = emp_data["row"]
                        rows = [row_value] if isinstance(row_value, list) else [[row_value]]
            # If the dict itself looks like a row, use it
            elif any(key in visa_data for key in ["visaType", "type", "visaNumber", "visa"]):
                rows = [visa_data]
        
        if not rows:
            print(f"  [WARN] No rows found in visa data")
            return visas_synced
            
        print(f"  [INFO] Found {len(rows)} visa record(s)")
        
        if dry_run:
            for row in rows:
                if isinstance(row, list) and len(row) > 1:
                    print(f"  [CREATE] Would create visa record: {row[1] if row[1] else 'Unknown'}")
                elif isinstance(row, dict):
                    print(f"  [CREATE] Would create visa record: {row.get('visaType') or row.get('type') or row.get('visa') or 'Unknown'}")
                else:
                    print(f"  [CREATE] Would create visa record: Unknown")
            visas_synced += len(rows)
            return visas_synced
        
        # Delete existing visas for this user (to avoid duplicates)
        existing_visas = db.query(EmployeeVisa).filter(EmployeeVisa.user_id == user.id).all()
        for existing in existing_visas:
            db.delete(existing)
        
        # Create new visa records
        # Based on the API response format: {rows: [{fields: [{name: "...", content: {value: "..."}}]}]}
        # Fields: Date, Visa, Issuing Country, Issued, Expiration, Status, Note
        for row in rows:
            visa_type = None
            visa_number = None
            issuing_country = None
            issued_date = None
            expiry_date = None
            status = None
            notes = None
            
            # Handle new format: {fields: [{name: "...", content: {value: "..."}}]}
            if isinstance(row, dict) and "fields" in row:
                print(f"  [DEBUG] Parsing visa row with fields format")
                fields = row.get("fields", [])
                # Create a map of field names to values for easier access
                field_map = {}
                for field in fields:
                    if isinstance(field, dict):
                        field_name = field.get("name", "").strip()
                        content = field.get("content", {})
                        if isinstance(content, dict):
                            value = content.get("value")
                            # Handle nested value objects (like for list types)
                            if isinstance(value, dict):
                                value = value.get("label") or value.get("id") or str(value)
                            field_map[field_name] = value
                
                # Map fields by name
                if "Date" in field_map:
                    date_str = str(field_map["Date"]).strip() if field_map["Date"] else None
                    if date_str:
                        parsed_date = parse_date(date_str)
                        if parsed_date:
                            issued_date = parsed_date
                
                if "Visa" in field_map:
                    visa_value = field_map["Visa"]
                    if isinstance(visa_value, dict):
                        visa_type = visa_value.get("label") or visa_value.get("id") or str(visa_value)
                    else:
                        visa_type = str(visa_value).strip() if visa_value else None
                
                if "Issuing Country" in field_map:
                    issuing_country = str(field_map["Issuing Country"]).strip() if field_map["Issuing Country"] else None
                
                if "Issued" in field_map:
                    issued_date_str = str(field_map["Issued"]).strip() if field_map["Issued"] else None
                    if issued_date_str:
                        issued_date = parse_date(issued_date_str)
                
                if "Expiration" in field_map:
                    expiry_date_str = str(field_map["Expiration"]).strip() if field_map["Expiration"] else None
                    if expiry_date_str:
                        expiry_date = parse_date(expiry_date_str)
                
                if "Status" in field_map:
                    status = str(field_map["Status"]).strip() if field_map["Status"] else None
                
                if "Note" in field_map:
                    notes = str(field_map["Note"]).strip() if field_map["Note"] else None
                
                # Determine status based on expiry date if not set
                if not status and expiry_date:
                    now = datetime.now(timezone.utc)
                    if expiry_date < now:
                        status = "EXPIRED"
                    else:
                        status = "CURRENT"
                elif not status and issued_date:
                    status = "CURRENT"
            
            # Handle list format (legacy format)
            elif isinstance(row, list):
                print(f"  [DEBUG] Parsing visa row as list: {row}")
                # Map by position: [Date, Visa, Issuing country, Issued, Expiration, Note]
                if len(row) > 0:
                    date_str = str(row[0]).strip() if row[0] else None
                    if date_str:
                        parsed_date = parse_date(date_str)
                        if parsed_date and not issued_date:
                            issued_date = parsed_date
                if len(row) > 1:
                    visa_type = str(row[1]).strip() if row[1] else None
                if len(row) > 2:
                    issuing_country = str(row[2]).strip() if row[2] else None
                if len(row) > 3:
                    issued_date_str = str(row[3]).strip() if row[3] else None
                    if issued_date_str:
                        issued_date = parse_date(issued_date_str)
                if len(row) > 4:
                    expiry_date_str = str(row[4]).strip() if row[4] else None
                    if expiry_date_str:
                        expiry_date = parse_date(expiry_date_str)
                if len(row) > 5:
                    notes = str(row[5]).strip() if row[5] else None
                
                # Determine status based on expiry date
                if expiry_date:
                    now = datetime.now(timezone.utc)
                    if expiry_date < now:
                        status = "EXPIRED"
                    else:
                        status = "CURRENT"
                elif issued_date:
                    status = "CURRENT"
                
            elif isinstance(row, dict):
                # Map field names from BambooHR API documentation: date, visaType, country, issued, expires, note
                # Also support variations for compatibility
                visa_type = (
                    row.get("visaType") or  # Official field name from documentation
                    row.get("type") or 
                    row.get("visa_type") or
                    row.get("visa") or
                    row.get("workPermitType") or
                    row.get("permitType") or
                    "Visa"
                )
                
                visa_number = (
                    row.get("visaNumber") or 
                    row.get("number") or 
                    row.get("visa_number") or
                    row.get("permitNumber") or
                    row.get("permit_number")
                )
                
                issuing_country = (
                    row.get("country") or  # Official field name from documentation
                    row.get("issuingCountry") or 
                    row.get("issuing_country") or
                    row.get("issuing country")
                )
                
                # Parse dates - official field names: date, issued, expires
                # Try "date" first (official), then "issued" (official), then variations
                date_str = row.get("date")  # Official field name from documentation
                if date_str:
                    parsed_date = parse_date(date_str)
                    if parsed_date and not issued_date:
                        issued_date = parsed_date
                
                issued_date_str = (
                    row.get("issued") or  # Official field name from documentation
                    row.get("issuedDate") or 
                    row.get("issued_date") or 
                    row.get("startDate") or 
                    row.get("start_date")
                )
                if issued_date_str:
                    issued_date = parse_date(issued_date_str)
                
                expiry_date_str = (
                    row.get("expires") or  # Official field name from documentation
                    row.get("expiryDate") or 
                    row.get("expiry_date") or 
                    row.get("expiration") or 
                    row.get("endDate") or 
                    row.get("end_date")
                )
                if expiry_date_str:
                    expiry_date = parse_date(expiry_date_str)
                
                status = (
                    row.get("status") or
                    row.get("visaStatus") or
                    row.get("visa_status")
                )
                
                # Determine status based on expiry date if not set
                if not status and expiry_date:
                    now = datetime.now(timezone.utc)
                    if expiry_date < now:
                        status = "EXPIRED"
                    else:
                        status = "CURRENT"
                
                notes = (
                    row.get("note") or  # Official field name from documentation (singular)
                    row.get("notes") or
                    row.get("comment") or
                    row.get("comments")
                )
            else:
                print(f"  [WARN] Skipping visa row with unknown format: {type(row)}")
                continue
            
            # Skip if no visa type
            if not visa_type:
                print(f"  [WARN] Skipping visa row: no visa type found")
                continue
            
            visa = EmployeeVisa(
                id=uuid.uuid4(),
                user_id=user.id,
                visa_type=visa_type,
                visa_number=visa_number,
                issuing_country=issuing_country,
                issued_date=issued_date,
                expiry_date=expiry_date,
                status=status,
                notes=notes,
                created_at=datetime.now(timezone.utc),
                created_by=user.id
            )
            db.add(visa)
            visas_synced += 1
            print(f"  [OK] Created visa record: {visa_type} ({visa_number or 'No number'})")
        
        # All rows processed, return count
        return visas_synced
    
    # If no visa data found, check basic employee fields
    if employee_data:
        # Try to get visa info from basic fields
        visa_status = employee_data.get("visaStatus") or employee_data.get("workPermitStatus")
        if visa_status:
            print(f"  [INFO] Found visa status in basic fields: {visa_status}")
            # Could create a basic visa record here if needed
            # For now, just log it
    
    print(f"  [INFO] No visa information found")
    return visas_synced


def sync_employee_emergency_contacts(
    db: Session,
    client: BambooHRClient,
    user: User,
    bamboohr_id: str,
    employee_data: Dict[str, Any],
    dry_run: bool = False
) -> int:
    """Sync employee emergency contacts from BambooHR"""
    
    contacts_synced = 0
    
    # First, try to get list of available tables to find the correct name
    try:
        available_tables = client.get_tables()
        if available_tables:
            print(f"  [DEBUG] Available tables: {[t.get('name') if isinstance(t, dict) else str(t) for t in available_tables[:10]]}")
            # Look for emergency contact related tables
            for table in available_tables:
                if isinstance(table, dict):
                    table_name = table.get('name', '').lower()
                    if 'emergency' in table_name and 'contact' in table_name:
                        print(f"  [INFO] Found potential emergency contact table: {table.get('name')}")
    except Exception as e:
        print(f"  [DEBUG] Could not list tables: {e}")
    
    # First, try to get from custom table (most reliable for multiple contacts)
    emergency_contact_table_names = ["emergencyContact", "emergency_contact", "emergencyContacts", "emergency_contacts"]
    
    found_in_table = False
    for table_name in emergency_contact_table_names:
        try:
            contact_data = client.get_table_data(table_name, bamboohr_id)
            print(f"  [DEBUG] Raw response for '{table_name}': {type(contact_data)} - {str(contact_data)[:200] if contact_data else 'None'}")
            
            # Handle different response formats
            rows = []
            if isinstance(contact_data, list):
                rows = contact_data
            elif isinstance(contact_data, dict):
                # Check for 'row' key (single row as list)
                if "row" in contact_data:
                    row_value = contact_data["row"]
                    if isinstance(row_value, list):
                        rows = [row_value]
                    else:
                        rows = [row_value]
                # Try table structure first
                elif "table" in contact_data and "employees" in contact_data:
                    emp_data = contact_data.get("employees", {}).get(bamboohr_id, {})
                    if isinstance(emp_data, dict):
                        if "rows" in emp_data:
                            rows = emp_data["rows"] if isinstance(emp_data["rows"], list) else [emp_data["rows"]]
                        elif "row" in emp_data:
                            row_value = emp_data["row"]
                            rows = [row_value] if isinstance(row_value, list) else [[row_value]]
                        elif "data" in emp_data:
                            rows = emp_data["data"] if isinstance(emp_data["data"], list) else [emp_data["data"]]
                elif "rows" in contact_data:
                    rows = contact_data["rows"] if isinstance(contact_data["rows"], list) else [contact_data["rows"]]
                elif "row" in contact_data:
                    row_value = contact_data["row"]
                    rows = [row_value] if isinstance(row_value, list) else [[row_value]]
                elif "data" in contact_data:
                    rows = contact_data["data"] if isinstance(contact_data["data"], list) else [contact_data["data"]]
                elif "employees" in contact_data:
                    emp_data = contact_data.get("employees", {}).get(bamboohr_id, {})
                    if isinstance(emp_data, dict):
                        if "rows" in emp_data:
                            rows = emp_data["rows"] if isinstance(emp_data["rows"], list) else [emp_data["rows"]]
                        elif "row" in emp_data:
                            row_value = emp_data["row"]
                            rows = [row_value] if isinstance(row_value, list) else [[row_value]]
                # If the dict itself looks like a row, use it
                elif any(key in contact_data for key in ["name", "contactName", "emergencyContactName"]):
                    rows = [contact_data]
            
            if rows:
                print(f"  [INFO] Found {len(rows)} emergency contact(s) in table '{table_name}'")
                print(f"  [DEBUG] First row sample: {rows[0] if rows else 'N/A'}")
                found_in_table = True
                
                if dry_run:
                    for row in rows:
                        if isinstance(row, dict):
                            print(f"  [CREATE] Would create emergency contact: {row.get('name') or row.get('contactName') or 'Unknown'}")
                        elif isinstance(row, list):
                            print(f"  [CREATE] Would create emergency contact: {row[0] if row else 'Unknown'}")
                    contacts_synced += len(rows)
                    continue
                
                # Delete existing contacts for this user (to avoid duplicates)
                existing_contacts = db.query(EmployeeEmergencyContact).filter(EmployeeEmergencyContact.user_id == user.id).all()
                for existing in existing_contacts:
                    db.delete(existing)
                
                # Create new contact records
                # Based on the table structure: ['Emergency Contact Name', 'Emergency Contact Relationship', 'Emergency Contact Home Phone', 'Emergency Contact Street 1', 'Emergency Contact Street 2', 'Emergency Contact Mobile Phone', 'Emergency Contact Email', 'Emergency Contact ZIP Code', 'Emergency Contact City', 'Emergency Contact State', 'Emergency Contact Country', 'Emergency Contact Work Phone', 'Emergency Contact Work Ext', 'Emergency Contact Primary']
                
                for idx, row in enumerate(rows):
                    name = ""
                    relationship = None
                    mobile_phone = None
                    home_phone = None
                    work_phone = None
                    email = None
                    address = None
                    is_primary = False
                    
                    if isinstance(row, list):
                        # Parse as ordered list
                        if len(row) > 0:
                            name = str(row[0]).strip() if row[0] else ""
                        if len(row) > 1:
                            relationship = str(row[1]).strip() if row[1] else None
                        if len(row) > 2:
                            home_phone = str(row[2]).strip() if row[2] else None
                        if len(row) > 3:
                            address_line1 = str(row[3]).strip() if row[3] else ""
                        if len(row) > 4:
                            address_line2 = str(row[4]).strip() if row[4] else ""
                        if len(row) > 5:
                            mobile_phone = str(row[5]).strip() if row[5] else None
                        if len(row) > 6:
                            email = str(row[6]).strip() if row[6] else None
                        if len(row) > 7:
                            zip_code = str(row[7]).strip() if row[7] else ""
                        if len(row) > 8:
                            city = str(row[8]).strip() if row[8] else ""
                        if len(row) > 9:
                            state = str(row[9]).strip() if row[9] else ""
                        if len(row) > 10:
                            country = str(row[10]).strip() if row[10] else ""
                        if len(row) > 11:
                            work_phone = str(row[11]).strip() if row[11] else None
                        if len(row) > 13:
                            is_primary = str(row[13]).strip() == '1' or str(row[13]).strip().lower() == 'true'
                        
                        # Build address from components
                        address_parts = []
                        if len(row) > 3 and row[3]:
                            address_parts.append(str(row[3]).strip())
                        if len(row) > 4 and row[4]:
                            address_parts.append(str(row[4]).strip())
                        if len(row) > 8 and row[8]:
                            address_parts.append(str(row[8]).strip())
                        if len(row) > 9 and row[9]:
                            address_parts.append(str(row[9]).strip())
                        if len(row) > 10 and row[10]:
                            address_parts.append(str(row[10]).strip())
                        if len(row) > 7 and row[7]:
                            address_parts.append(str(row[7]).strip())
                        address = ", ".join(address_parts) if address_parts else None
                        
                    elif isinstance(row, dict):
                        # Map common field names from BambooHR to our model
                        name = (
                            row.get("name") or
                            row.get("contactName") or
                            row.get("emergencyContactName") or
                            row.get("fullName") or
                            ""
                        )
                        
                        relationship = (
                            row.get("relationship") or
                            row.get("relation") or
                            row.get("emergencyContactRelationship") or
                            row.get("contactRelationship")
                        )
                        
                        mobile_phone = (
                            row.get("mobilePhone") or
                            row.get("mobile") or
                            row.get("phone") or
                            row.get("emergencyContactPhone") or
                            row.get("contactPhone")
                        )
                        
                        home_phone = (
                            row.get("homePhone") or
                            row.get("home")
                        )
                        
                        work_phone = (
                            row.get("workPhone") or
                            row.get("work")
                        )
                        
                        email = (
                            row.get("email") or
                            row.get("contactEmail")
                        )
                        
                        address = (
                            row.get("address") or
                            row.get("contactAddress")
                        )
                        
                        # First contact is primary by default
                        is_primary = idx == 0 or bool(row.get("isPrimary") or row.get("primary") or row.get("is_primary"))
                    
                    if not name:
                        print(f"  [WARN] Skipping contact row {idx}: no name found")
                        continue
                    
                    print(f"  [DEBUG] Creating contact: name={name}, relationship={relationship}, mobile={mobile_phone}, is_primary={is_primary}")
                    
                    contact = EmployeeEmergencyContact(
                        id=uuid.uuid4(),
                        user_id=user.id,
                        name=name,
                        relationship=relationship,
                        is_primary=is_primary,
                        mobile_phone=mobile_phone,
                        home_phone=home_phone,
                        work_phone=work_phone,
                        email=email,
                        address=address
                    )
                    db.add(contact)
                    contacts_synced += 1
                    print(f"  [OK] Created emergency contact: {name} ({relationship or 'No relationship'})")
                
                # If we found data in this table, we're done
                break
                
        except Exception as e:
            # Table might not exist, continue to next
            print(f"  [DEBUG] Error trying emergency contact table '{table_name}': {e}")
            import traceback
            print(f"  [DEBUG] Traceback: {traceback.format_exc()}")
            continue
    
    # If no custom table found, try to get from basic employee fields
    if not found_in_table:
        emergency_contact_name = (
            employee_data.get("emergencyContactName") or
            employee_data.get("emergencyContact")
        )
        
        if emergency_contact_name:
            print(f"  [INFO] Found emergency contact in basic fields: {emergency_contact_name}")
            
            if dry_run:
                print(f"  [CREATE] Would create emergency contact: {emergency_contact_name}")
                contacts_synced += 1
            else:
                # Check if contact already exists (by name)
                existing = db.query(EmployeeEmergencyContact).filter(
                    EmployeeEmergencyContact.user_id == user.id,
                    EmployeeEmergencyContact.name == emergency_contact_name
                ).first()
                
                relationship = employee_data.get("emergencyContactRelationship")
                phone = (
                    employee_data.get("emergencyContactPhone") or
                    employee_data.get("emergencyContactMobile") or
                    employee_data.get("emergencyContactHomePhone")
                )
                
                if not existing:
                    contact = EmployeeEmergencyContact(
                        id=uuid.uuid4(),
                        user_id=user.id,
                        name=emergency_contact_name,
                        relationship=relationship,
                        is_primary=True,  # First contact from basic fields is primary
                        mobile_phone=phone,
                        home_phone=None,
                        work_phone=None,
                        email=None,
                        address=None
                    )
                    db.add(contact)
                    contacts_synced += 1
                    print(f"  [OK] Created emergency contact: {emergency_contact_name} ({relationship or 'No relationship'})")
                else:
                    # Update existing contact with latest data
                    existing.name = emergency_contact_name
                    if relationship:
                        existing.relationship = relationship
                    if phone:
                        existing.mobile_phone = phone
                    print(f"  [OK] Updated emergency contact: {emergency_contact_name}")
    
    if contacts_synced == 0:
        print(f"  [INFO] No emergency contact information found")
    
    return contacts_synced


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
    client: Optional[Any] = None,
    dry_run: bool = False,
    update_existing: bool = True,
    preserve_manual_fields: bool = True
) -> tuple[Optional[User], bool]:
    """
    Create or update user from BambooHR employee data
    
    Returns:
        (user, created) tuple where created is True if new user was created
    """
    # Extract key fields from BambooHR data
    bamboohr_id = str(employee_data.get("id", ""))
    # Priority: homeEmail (personal email used for signups) > personalEmail > workEmail
    # This matches the logic used in BambooHR for employee signups and signatures
    email = (
        employee_data.get("homeEmail") or  # Personal email - used for signups/signatures
        employee_data.get("personalEmail") or
        employee_data.get("workEmail")
    )
    # Strip whitespace and check if empty
    if email:
        email = email.strip()
    if not email or email == "":
        email = None
    
    # Skip employees without personal email - we don't want @mackkirk.local emails
    if not email:
        print(f"  [SKIP] No personal email found for employee {bamboohr_id} ({employee_data.get('firstName', '')} {employee_data.get('lastName', '')}) - skipping")
        return None, False
    
    email_source = "homeEmail" if employee_data.get("homeEmail") else ("personalEmail" if employee_data.get("personalEmail") else "workEmail")
    print(f"  [OK] Using {email_source}: {email}")
    
    # Check if user already exists
    existing_user = find_user_by_email(db, email)
    
    if existing_user and not update_existing:
        print(f"  [SKIP] Skipping existing user: {email}")
        return existing_user, False
    
    # Prepare user data
    first_name = employee_data.get("firstName", "").strip()
    last_name = employee_data.get("lastName", "").strip()
    
    # Generate username: primeira letra do primeiro nome + último nome (lowercase, sem espaços)
    # Exemplo: Raphael Coelho -> rcoelho, Fernando Rabelo -> frabelo
    if first_name and last_name:
        # Get first letter of first name and full last name
        first_letter = first_name[0].lower() if first_name else ""
        last_name_clean = last_name.lower().replace(" ", "").replace("-", "").replace("'", "")
        username = f"{first_letter}{last_name_clean}"
    elif last_name:
        # Fallback: just last name if no first name
        username = last_name.lower().replace(" ", "").replace("-", "").replace("'", "")
    else:
        # Last resort: use email prefix
        username = email.split("@")[0].lower()
    
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
    
    # Try to get compensation from compensation table (most reliable source)
    compensation = None
    if client:
        try:
            compensation = client.get_compensation(bamboohr_id)
        except Exception as e:
            print(f"  [DEBUG] Could not fetch compensation table: {e}")
    
    # Determine pay rate - prioritize compensation table, then fallback to employee fields
    pay_type_raw = employee_data.get("payType", "") or ""
    pay_type = pay_type_raw.lower().strip() if pay_type_raw else None
    
    # Also check employment type for salary (this is more reliable)
    employment_type_raw = employee_data.get("employmentHistoryStatus", "") or ""
    employment_type = employment_type_raw.lower().strip() if employment_type_raw else None
    
    pay_rate_value = None
    final_pay_type = None
    
    # Debug output
    print(f"  [DEBUG] payType: '{pay_type_raw}', employmentHistoryStatus: '{employment_type_raw}'")
    print(f"  [DEBUG] payRate: {employee_data.get('payRate')}, annualAmount: {employee_data.get('annualAmount')}")
    
    # If we have compensation data, use it (most reliable)
    if compensation:
        # Handle case where compensation might be a list
        if isinstance(compensation, list):
            if len(compensation) > 0:
                compensation = compensation[0]  # Use first item
            else:
                compensation = None
        
        if compensation and isinstance(compensation, dict):
            comp_type = compensation.get("type", "")
            if comp_type:
                comp_type = str(comp_type).strip()
            comp_rate = compensation.get("rate", "")
            if comp_rate:
                comp_rate = str(comp_rate).strip()
            comp_paid_per = compensation.get("paidPer", "")
            if comp_paid_per:
                comp_paid_per = str(comp_paid_per).strip()
            
            print(f"  [DEBUG] Compensation table - type: '{comp_type}', rate: '{comp_rate}', paidPer: '{comp_paid_per}'")
            
            # Extract numeric value from rate (e.g., "75000 USD" -> 75000, "56.00 USD" -> 56.00)
            if comp_rate:
                # Remove currency and extract number
                rate_match = re.search(r'([\d,]+\.?\d*)', comp_rate.replace(',', ''))
                if rate_match:
                    try:
                        pay_rate_value = float(rate_match.group(1))
                        final_pay_type = comp_type.lower() if comp_type else None
                        print(f"  [OK] Using compensation table - type: {comp_type}, rate: {pay_rate_value}")
                    except ValueError:
                        print(f"  [WARN] Could not parse compensation rate: {comp_rate}")
    
    # Fallback to employee fields if compensation table didn't provide data
    if pay_rate_value is None:
        # Check if it's salary based on employment type (most reliable)
        # Handle case-insensitive matching
        is_salary = (
            (employment_type and "salary" in employment_type) or 
            (pay_type and "salary" in pay_type)
        )
        
        # Check if it's hourly
        is_hourly = (
            pay_type == "hourly" or 
            pay_type == "hour" or
            employment_type == "hourly" or
            employment_type == "hour"
        )
        
        if is_hourly:
            pay_rate_value = employee_data.get("payRate")
            final_pay_type = "hourly"
            print(f"  [OK] Detected hourly - using payRate: {pay_rate_value}")
        elif is_salary:
            # For salary, prioritize annualAmount
            annual_amount = employee_data.get("annualAmount")
            if annual_amount:
                pay_rate_value = annual_amount
                final_pay_type = "salary"
                print(f"  [OK] Detected salary - using annualAmount: {pay_rate_value}")
            else:
                # Fallback to payRate if annualAmount not available
                pay_rate_value = employee_data.get("payRate")
                if pay_rate_value:
                    final_pay_type = "salary"
                    print(f"  [WARN] Detected salary but annualAmount not available - using payRate: {pay_rate_value}")
                else:
                    print(f"  [WARN] Detected salary but no salary amount found")
        else:
            # Unknown type - try annualAmount first (likely salary), then payRate (likely hourly)
            annual_amount = employee_data.get("annualAmount")
            if annual_amount:
                pay_rate_value = annual_amount
                final_pay_type = "salary"
                print(f"  [INFO] Unknown type but annualAmount found - using it: {pay_rate_value}")
            else:
                pay_rate_value = employee_data.get("payRate")
                if pay_rate_value:
                    final_pay_type = "hourly"
                    print(f"  [INFO] Unknown type - using payRate: {pay_rate_value}")
    
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
        "city": normalize_city(employee_data.get("city")),
        "province": normalize_province(employee_data.get("state") or employee_data.get("province"), employee_data.get("country")),
        "postal_code": employee_data.get("zipCode") or employee_data.get("postalCode"),
        "country": normalize_country(employee_data.get("country")),
        "hire_date": parse_date(employee_data.get("hireDate")),
        "termination_date": parse_date(employee_data.get("terminationDate")),
        "job_title": employee_data.get("jobTitle"),
        "division": employee_data.get("department") or employee_data.get("division"),
        "work_email": employee_data.get("workEmail") or employee_data.get("email"),
        "work_phone": employee_data.get("workPhone"),
        "pay_rate": str(pay_rate_value) if pay_rate_value else None,
        "pay_type": final_pay_type if final_pay_type else (pay_type if pay_type else None),
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
        # Fields that should be preserved if they were manually edited
        # (i.e., not overwritten by BambooHR sync)
        preserve_fields = []
        if preserve_manual_fields:
            # Always preserve pay_rate and pay_type if they already exist
            # This prevents BambooHR sync from overwriting manually edited salary information
            if getattr(profile, "pay_rate", None) is not None:
                preserve_fields.append("pay_rate")
            if getattr(profile, "pay_type", None) is not None:
                preserve_fields.append("pay_type")
            
            if preserve_fields:
                print(f"  [INFO] Preserving manually edited fields: {preserve_fields}")
        
        for key, value in profile_data.items():
            if key != "user_id":  # Don't update user_id
                # Skip fields that should be preserved
                if key in preserve_fields:
                    current_value = getattr(profile, key, None)
                    print(f"  [SKIP] Preserving {key}: {current_value} (not overwriting with {value})")
                    continue
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
    limit: Optional[int] = None,
    include_photos: bool = True,
    force_update_photos: bool = False
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
    
    # Initialize storage (for photos)
    storage = None
    if include_photos:
        try:
            storage = get_storage()
            print(f"   Storage provider: {type(storage).__name__}")
        except Exception as e:
            print(f"[WARN] Error initializing storage (photos will be skipped): {e}")
            include_photos = False
    
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
                db, employee_data, client=client, dry_run=dry_run, update_existing=update_existing, preserve_manual_fields=True
            )
            
            if user:
                # Sync profile photo if requested
                if include_photos and storage:
                    try:
                        sync_employee_photo(
                            db, client, storage, user, str(emp_id), 
                            dry_run=dry_run, force_update=force_update_photos
                        )
                    except Exception as e:
                        print(f"  [WARN] Error syncing photo: {e}")
                
                # Sync visa information from custom tables
                try:
                    sync_employee_visas(
                        db, client, user, str(emp_id), employee_data=employee_data, dry_run=dry_run
                    )
                except Exception as e:
                    print(f"  [WARN] Error syncing visas: {e}")
                
                # Sync emergency contacts from custom tables or basic fields
                try:
                    sync_employee_emergency_contacts(
                        db, client, user, str(emp_id), employee_data, dry_run=dry_run
                    )
                except Exception as e:
                    print(f"  [WARN] Error syncing emergency contacts: {e}")
                
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
    parser.add_argument("--no-photos", dest="include_photos", action="store_false", help="Skip profile photos")
    parser.add_argument("--force-update-photos", action="store_true", help="Update profile photos even if they already exist")
    
    args = parser.parse_args()
    
    sync_employees(
        dry_run=args.dry_run,
        update_existing=args.update_existing,
        limit=args.limit,
        include_photos=args.include_photos,
        force_update_photos=args.force_update_photos
    )


if __name__ == "__main__":
    main()

