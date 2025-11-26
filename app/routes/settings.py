from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, defer
from sqlalchemy.exc import ProgrammingError
from sqlalchemy import or_, and_, text
from typing import List, Optional, Dict
from datetime import datetime, date, time, timedelta, timezone
import uuid

from ..db import get_db
from ..models.models import SettingList, SettingItem, Client, Attendance, User, Shift, Project, EmployeeProfile
from ..auth.security import require_permissions, get_current_user
from ..auth.security import User as UserType
from ..config import settings
import json

router = APIRouter(prefix="/settings", tags=["settings"])


def _format_datetime_user_friendly(dt: datetime, timezone_str: str = None) -> str:
    """
    Format datetime as 'Nov 25, 2025 at 1:00 AM' in local timezone.
    If dt is timezone-aware (UTC), converts to local timezone before formatting.
    """
    import pytz
    from ..config import settings
    
    # Ensure dt is timezone-aware (assume UTC if naive)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=pytz.UTC)
    
    # Convert to local timezone for display
    tz_to_use = timezone_str or settings.tz_default
    local_tz = pytz.timezone(tz_to_use)
    local_dt = dt.astimezone(local_tz)
    
    # Format: "Nov 25, 2025 at 1:00 AM"
    formatted = local_dt.strftime('%b %d, %Y at %I:%M %p')
    # Remove leading zero from day if present (e.g., "Nov 05" -> "Nov 5")
    parts = formatted.split(', ')
    if len(parts) >= 2:
        month_day = parts[0]
        rest = ', '.join(parts[1:])
        # Remove leading zero from day
        month_day_parts = month_day.split(' ')
        if len(month_day_parts) == 2:
            day = month_day_parts[1].lstrip('0') or '0'
            month_day = f"{month_day_parts[0]} {day}"
        formatted = f"{month_day}, {rest}"
    # Remove leading zero from hour (e.g., "01:00" -> "1:00")
    formatted = formatted.replace(' 0', ' ').replace(' at 0', ' at ')
    return formatted


def check_attendance_conflict(
    db: Session,
    worker_id: uuid.UUID,
    clock_in_time: Optional[datetime],
    clock_out_time: Optional[datetime],
    exclude_attendance_id: Optional[uuid.UUID] = None,
    timezone_str: str = None
) -> Optional[str]:
    """
    Check if an attendance conflicts with existing attendances for the same worker.
    Returns error message if conflict found, None otherwise.
    
    A conflict occurs when:
    - New clock_in_time is between existing clock_in_time and clock_out_time
    - New clock_out_time is between existing clock_in_time and clock_out_time
    - New attendance completely encompasses an existing attendance
    - An existing attendance completely encompasses the new attendance
    - New attendance overlaps with existing attendance (any overlap)
    
    All times are normalized to UTC for comparison, but displayed in local timezone in error messages.
    """
    import pytz
    from ..config import settings
    
    if not clock_in_time and not clock_out_time:
        return None  # No times to check
    
    # Normalize input times to UTC (timezone-aware)
    def normalize_to_utc(dt: Optional[datetime]) -> Optional[datetime]:
        if dt is None:
            return None
        if dt.tzinfo is None:
            # Assume naive datetime is already in UTC
            return dt.replace(tzinfo=pytz.UTC)
        # Convert to UTC if timezone-aware
        return dt.astimezone(pytz.UTC)
    
    clock_in_utc = normalize_to_utc(clock_in_time)
    clock_out_utc = normalize_to_utc(clock_out_time)
    
    # Build query for existing attendances for this worker
    query = db.query(Attendance).filter(Attendance.worker_id == worker_id)
    
    # Exclude the current attendance if updating
    if exclude_attendance_id:
        query = query.filter(Attendance.id != exclude_attendance_id)
    
    # Get all attendances for this worker that have at least one time
    existing_attendances = query.filter(
        or_(
            Attendance.clock_in_time.isnot(None),
            Attendance.clock_out_time.isnot(None)
        )
    ).all()
    
    for existing in existing_attendances:
        existing_in = existing.clock_in_time
        existing_out = existing.clock_out_time
        
        # Skip if existing attendance has no times
        if not existing_in and not existing_out:
            continue
        
        # Normalize existing times to UTC for comparison
        existing_in_utc = normalize_to_utc(existing_in)
        existing_out_utc = normalize_to_utc(existing_out)
        
        # Case 1: Both existing and new have complete times (clock_in and clock_out)
        if existing_in_utc and existing_out_utc and clock_in_utc and clock_out_utc:
            # Check for any overlap: new_start < existing_end AND new_end > existing_start
            # Allow new attendance to start exactly when existing ends (clock_in_utc == existing_out_utc is OK)
            # Allow new attendance to end exactly when existing starts (clock_out_utc == existing_in_utc is OK)
            if clock_in_utc < existing_out_utc and clock_out_utc > existing_in_utc:
                existing_start = _format_datetime_user_friendly(existing_in, timezone_str)
                existing_end = _format_datetime_user_friendly(existing_out, timezone_str)
                return f"Cannot create attendance: There is already an attendance record for this worker from {existing_start} to {existing_end}. Please choose a different time period."
            # Check if new clock_in is within 1 hour before existing start (minimum 1 hour gap required)
            one_hour_before = existing_in_utc - timedelta(hours=1)
            if one_hour_before < clock_in_utc < existing_in_utc:
                existing_start = _format_datetime_user_friendly(existing_in, timezone_str)
                return f"Cannot create attendance: The clock-in time must be at least 1 hour before the existing attendance that starts at {existing_start}. Please choose a different time."
        
        # Case 2: Existing has both times, new has only clock_in
        elif existing_in_utc and existing_out_utc and clock_in_utc and not clock_out_utc:
            # Check if new clock_in is within existing range (excluding the end time)
            # Allow clock_in to be exactly at existing_out (start when previous ends)
            if existing_in_utc <= clock_in_utc < existing_out_utc:
                existing_start = _format_datetime_user_friendly(existing_in, timezone_str)
                existing_end = _format_datetime_user_friendly(existing_out, timezone_str)
                return f"Cannot create attendance: The clock-in time conflicts with an existing attendance record from {existing_start} to {existing_end}. Please choose a different time."
            # Check if new clock_in is within 1 hour before existing start (minimum 1 hour gap required)
            one_hour_before = existing_in_utc - timedelta(hours=1)
            if one_hour_before < clock_in_utc < existing_in_utc:
                existing_start = _format_datetime_user_friendly(existing_in, timezone_str)
                return f"Cannot create attendance: The clock-in time must be at least 1 hour before the existing attendance that starts at {existing_start}. Please choose a different time."
        
        # Case 3: Existing has both times, new has only clock_out
        elif existing_in_utc and existing_out_utc and not clock_in_utc and clock_out_utc:
            # Check if new clock_out is within existing range (excluding the start time)
            # Allow clock_out to be exactly at existing_in (end when previous starts)
            if existing_in_utc < clock_out_utc <= existing_out_utc:
                existing_start = _format_datetime_user_friendly(existing_in, timezone_str)
                existing_end = _format_datetime_user_friendly(existing_out, timezone_str)
                return f"Cannot create attendance: The clock-out time conflicts with an existing attendance record from {existing_start} to {existing_end}. Please choose a different time."
        
        # Case 4: Existing has only clock_in, new has both times
        elif existing_in_utc and not existing_out_utc and clock_in_utc and clock_out_utc:
            # Check if existing clock_in is within new range (excluding boundaries)
            # Allow existing clock_in to be exactly at new start or end
            if clock_in_utc < existing_in_utc < clock_out_utc:
                existing_clock_in = _format_datetime_user_friendly(existing_in, timezone_str)
                return f"Cannot create attendance: This time period overlaps with an existing clock-in at {existing_clock_in}. Please choose a different time period."
            # Check if new clock_in is within 1 hour before existing start (minimum 1 hour gap required)
            one_hour_before = existing_in_utc - timedelta(hours=1)
            if one_hour_before < clock_in_utc < existing_in_utc:
                existing_clock_in = _format_datetime_user_friendly(existing_in, timezone_str)
                return f"Cannot create attendance: The clock-in time must be at least 1 hour before the existing clock-in at {existing_clock_in}. Please choose a different time."
        
        # Case 5: Existing has only clock_out, new has both times
        elif not existing_in_utc and existing_out_utc and clock_in_utc and clock_out_utc:
            # Check if existing clock_out is within new range (excluding boundaries)
            # Allow existing clock_out to be exactly at new start or end
            if clock_in_utc < existing_out_utc < clock_out_utc:
                existing_clock_out = _format_datetime_user_friendly(existing_out, timezone_str)
                return f"Cannot create attendance: This time period overlaps with an existing clock-out at {existing_clock_out}. Please choose a different time period."
        
        # Case 6: Both have only clock_in
        elif existing_in_utc and not existing_out_utc and clock_in_utc and not clock_out_utc:
            # Same time is a conflict (with small tolerance for floating point)
            time_diff = abs((clock_in_utc - existing_in_utc).total_seconds())
            if time_diff < 60:  # Within 1 minute
                existing_clock_in = _format_datetime_user_friendly(existing_in, timezone_str)
                return f"Cannot create attendance: There is already a clock-in at {existing_clock_in} for this worker. Please choose a different time."
            # Check if new clock_in is within 1 hour before existing start (minimum 1 hour gap required)
            one_hour_before = existing_in_utc - timedelta(hours=1)
            if one_hour_before < clock_in_utc < existing_in_utc:
                existing_clock_in = _format_datetime_user_friendly(existing_in, timezone_str)
                return f"Cannot create attendance: The clock-in time must be at least 1 hour before the existing clock-in at {existing_clock_in}. Please choose a different time."
        
        # Case 7: Both have only clock_out
        elif not existing_in_utc and existing_out_utc and not clock_in_utc and clock_out_utc:
            # Same time is a conflict (with small tolerance for floating point)
            time_diff = abs((clock_out_utc - existing_out_utc).total_seconds())
            if time_diff < 60:  # Within 1 minute
                existing_clock_out = _format_datetime_user_friendly(existing_out, timezone_str)
                return f"Cannot create attendance: There is already a clock-out at {existing_clock_out} for this worker. Please choose a different time."
    
    return None


def calculate_break_minutes(
    db: Session,
    worker_id: uuid.UUID,
    clock_in_time: Optional[datetime],
    clock_out_time: Optional[datetime],
    manual_break_minutes: Optional[int] = None
) -> Optional[int]:
    """
    Calculate break minutes for an attendance record.
    
    If manual_break_minutes is provided, it takes priority and is returned directly.
    Otherwise, returns break minutes if:
    - Both clock_in_time and clock_out_time exist
    - Total hours >= 5 hours
    - Worker is in the eligible employees list
    Otherwise returns None.
    """
    # If manual break is provided, use it directly (priority over system settings)
    if manual_break_minutes is not None:
        return manual_break_minutes
    
    if not clock_in_time or not clock_out_time:
        return None
    
    # Calculate total minutes
    diff = clock_out_time - clock_in_time
    total_minutes = int(diff.total_seconds() / 60)
    
    # Check if >= 5 hours (300 minutes)
    if total_minutes < 300:
        return None
    
    # Get timesheet settings
    timesheet_list = db.query(SettingList).filter(SettingList.name == "timesheet").first()
    if not timesheet_list:
        return None
    
    # Get break minutes setting
    break_min_item = db.query(SettingItem).filter(
        SettingItem.list_id == timesheet_list.id,
        SettingItem.label == "default_break_minutes"
    ).first()
    
    if not break_min_item or not break_min_item.value:
        return None
    
    try:
        break_minutes = int(break_min_item.value)
    except (ValueError, TypeError):
        return None
    
    # Get eligible employees list
    eligible_employees_item = db.query(SettingItem).filter(
        SettingItem.list_id == timesheet_list.id,
        SettingItem.label == "break_eligible_employees"
    ).first()
    
    if not eligible_employees_item or not eligible_employees_item.value:
        return None
    
    try:
        eligible_employee_ids = json.loads(eligible_employees_item.value)
        if not isinstance(eligible_employee_ids, list):
            return None
        # Convert to strings for comparison
        eligible_employee_ids_str = [str(eid) for eid in eligible_employee_ids]
    except (json.JSONDecodeError, TypeError):
        return None
    
    # Check if worker is eligible
    worker_id_str = str(worker_id)
    if worker_id_str not in eligible_employee_ids_str:
        return None
    
    return break_minutes


@router.get("", dependencies=[Depends(require_permissions("settings:access"))])
def get_settings_bundle(db: Session = Depends(get_db)):
    rows = db.query(SettingList).all()
    out = {}
    for lst in rows:
        items = db.query(SettingItem).filter(SettingItem.list_id == lst.id).order_by(SettingItem.sort_index.asc()).all()
        out[lst.name] = [{"id": str(i.id), "label": i.label, "value": i.value, "sort_index": i.sort_index, "meta": i.meta or None} for i in items]
    # convenience aliases
    out.setdefault("client_types", [])
    out.setdefault("client_statuses", [])
    out.setdefault("payment_terms", [])
    out.setdefault("divisions", [])
    out.setdefault("project_statuses", [])
    out.setdefault("lead_sources", [])
    out.setdefault("timesheet", [])
    out.setdefault("report_categories", [])
    # Add Google Places API key (if configured)
    if settings.google_places_api_key:
        out["google_places_api_key"] = settings.google_places_api_key
    return out


@router.get("/{list_name}")
def list_settings(list_name: str, db: Session = Depends(get_db), _=Depends(require_permissions("settings:access"))):
    lst = db.query(SettingList).filter(SettingList.name == list_name).first()
    if not lst:
        return []
    items = db.query(SettingItem).filter(SettingItem.list_id == lst.id).order_by(SettingItem.sort_index.asc()).all()
    return [{"id": str(i.id), "label": i.label, "value": i.value, "sort_index": i.sort_index, "meta": i.meta or None} for i in items]


@router.post("/{list_name}")
def create_setting_item(list_name: str, label: str, value: str = "", sort_index: Optional[int] = None, abbr: Optional[str] = None, color: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_permissions("settings:access", "users:write"))):
    lst = db.query(SettingList).filter(SettingList.name == list_name).first()
    if not lst:
        lst = SettingList(name=list_name)
        db.add(lst)
        db.flush()
    # Auto-assign sort_index if not provided to keep stable ordering and avoid renumbering
    if sort_index is None:
        last = db.query(SettingItem).filter(SettingItem.list_id == lst.id).order_by(SettingItem.sort_index.desc()).first()
        sort_index = ((last.sort_index or 0) + 1) if last and (last.sort_index is not None) else 0
    meta = {}
    if abbr:
        meta["abbr"] = abbr
    if color:
        meta["color"] = color
    it = SettingItem(list_id=lst.id, label=label, value=value, sort_index=sort_index, meta=meta or None)
    db.add(it)
    db.commit()
    return {"id": str(it.id)}


# Attendance endpoints - MUST be defined BEFORE generic catch-all routes
# to avoid route conflicts where /{list_name}/{item_id} would match /attendance/{id}

@router.delete("/attendance/{attendance_id}")
def delete_attendance(
    attendance_id: str,
    db: Session = Depends(get_db),
    user: UserType = Depends(get_current_user),
    _=Depends(require_permissions("users:write"))
):
    """Permanently delete an attendance record from the database."""
    try:
        attendance_uuid = uuid.UUID(attendance_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid attendance ID format")

    attendance = db.query(Attendance).filter(Attendance.id == attendance_uuid).first()
    if not attendance:
        raise HTTPException(status_code=404, detail="Attendance not found")
    
    # Get project_id from shift if attendance has a shift
    project_id = None
    shift = None
    if attendance.shift_id:
        from ..models.models import Shift
        shift = db.query(Shift).filter(Shift.id == attendance.shift_id).first()
        if shift:
            project_id = shift.project_id
    
    # Get work_date for log and for deleting ProjectTimeEntry
    work_date = None
    if attendance.clock_in_time:
        work_date = attendance.clock_in_time.date()
    elif attendance.clock_out_time:
        work_date = attendance.clock_out_time.date()
    
    # Calculate hours and break for log
    hours_worked = None
    break_minutes = None
    if attendance.clock_in_time and attendance.clock_out_time:
        diff = attendance.clock_out_time - attendance.clock_in_time
        hours_worked = diff.total_seconds() / 3600
        break_minutes = calculate_break_minutes(
            db, attendance.worker_id, attendance.clock_in_time, attendance.clock_out_time
        )
    
    # Format times for log
    start_time_str = None
    end_time_str = None
    if attendance.clock_in_time:
        start_time_str = attendance.clock_in_time.time().isoformat()
    if attendance.clock_out_time:
        end_time_str = attendance.clock_out_time.time().isoformat()
    
    # Delete corresponding ProjectTimeEntry if it exists
    # This happens when attendance was approved and synced to timesheet
    if project_id and work_date:
        from ..models.models import ProjectTimeEntry
        time_entry = db.query(ProjectTimeEntry).filter(
            ProjectTimeEntry.project_id == project_id,
            ProjectTimeEntry.user_id == attendance.worker_id,
            ProjectTimeEntry.work_date == work_date
        ).first()
        
        if time_entry:
            # Delete the ProjectTimeEntry
            db.delete(time_entry)
    
    # Delete the attendance record
    db.delete(attendance)
    db.commit()
    
    # Create log in ProjectTimeEntryLog if attendance has a project
    if project_id:
        from ..models.models import ProjectTimeEntryLog
        log = ProjectTimeEntryLog(
            entry_id=None,  # No ProjectTimeEntry for attendance records
            project_id=project_id,
            user_id=user.id,
            action="delete",
            changes={
                "message": "attendance deleted via Attendance tab",
                "attendance_id": str(attendance_uuid),  # Store attendance ID in changes
                "work_date": work_date.isoformat() if work_date else None,
                "start_time": start_time_str,
                "end_time": end_time_str,
                "hours_worked": hours_worked,
                "break_minutes": break_minutes,
            }
        )
        db.add(log)
        db.commit()
    
    return {"status": "ok", "deleted_id": attendance_id}


@router.delete("/{list_name}/{item_id}")
def delete_setting_item(list_name: str, item_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("settings:access", "users:write"))):
    lst = db.query(SettingList).filter(SettingList.name == list_name).first()
    if not lst:
        return {"status": "ok"}
    db.query(SettingItem).filter(SettingItem.list_id == lst.id, SettingItem.id == item_id).delete()
    db.commit()
    return {"status": "ok"}


# Attendance endpoints - MUST be defined BEFORE generic catch-all routes
# to avoid route conflicts where /{list_name}/{item_id} would match /attendance/{id}

@router.put("/attendance/{attendance_id}")
def update_attendance(
    attendance_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    user: UserType = Depends(get_current_user),
    _=Depends(require_permissions("users:write"))
):
    """Update an existing attendance record."""
    try:
        # Convert string ID to UUID for proper query
        attendance_uuid = uuid.UUID(attendance_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid attendance ID format")
    
    attendance = db.query(Attendance).filter(Attendance.id == attendance_uuid).first()
    if not attendance:
        raise HTTPException(status_code=404, detail="Attendance not found")
    
    # Get new times before updating to check for conflicts
    new_clock_in_time = attendance.clock_in_time
    new_clock_out_time = attendance.clock_out_time
    
    # Update fields - NEW MODEL: Support both clock_in_time and clock_out_time
    if "clock_in_time" in payload:
        try:
            clock_in_time = datetime.fromisoformat(payload["clock_in_time"].replace('Z', '+00:00'))
            if clock_in_time.tzinfo is None:
                clock_in_time = clock_in_time.replace(tzinfo=timezone.utc)
            new_clock_in_time = clock_in_time
        except:
            raise HTTPException(status_code=400, detail="Invalid clock_in_time format")
    
    if "clock_out_time" in payload:
        try:
            clock_out_time = datetime.fromisoformat(payload["clock_out_time"].replace('Z', '+00:00'))
            if clock_out_time.tzinfo is None:
                clock_out_time = clock_out_time.replace(tzinfo=timezone.utc)
            new_clock_out_time = clock_out_time
        except:
            raise HTTPException(status_code=400, detail="Invalid clock_out_time format")
    
    # Check for conflicts before updating
    conflict_error = check_attendance_conflict(
        db, attendance.worker_id, new_clock_in_time, new_clock_out_time, exclude_attendance_id=attendance.id, timezone_str=settings.tz_default
    )
    if conflict_error:
        # Replace "create" with "update" in the message for better context
        error_message = conflict_error.replace("Cannot create attendance:", "Cannot update attendance:")
        raise HTTPException(
            status_code=400,
            detail=error_message  # Message already includes proper prefix
        )
    
    # Now update the attendance with the new times
    if "clock_in_time" in payload:
        attendance.clock_in_time = new_clock_in_time
    if "clock_out_time" in payload:
        attendance.clock_out_time = new_clock_out_time
    
    # Calculate break minutes if both times are present
    if attendance.clock_in_time and attendance.clock_out_time:
        manual_break = payload.get("manual_break_minutes")
        attendance.break_minutes = calculate_break_minutes(
            db, attendance.worker_id, attendance.clock_in_time, attendance.clock_out_time,
            manual_break_minutes=manual_break if manual_break is not None else None
        )
    else:
        attendance.break_minutes = None
    
    # Backward compatibility: if time_selected_utc is provided, update clock_in_time or clock_out_time based on type
    if "time_selected_utc" in payload and "clock_in_time" not in payload and "clock_out_time" not in payload:
        try:
            time_selected_utc = datetime.fromisoformat(payload["time_selected_utc"].replace('Z', '+00:00'))
            if time_selected_utc.tzinfo is None:
                time_selected_utc = time_selected_utc.replace(tzinfo=timezone.utc)
            # Determine which field to update based on existing data or type
            if attendance.clock_in_time and not attendance.clock_out_time:
                # Has clock-in but no clock-out, update clock-in
                attendance.clock_in_time = time_selected_utc
            elif attendance.clock_out_time and not attendance.clock_in_time:
                # Has clock-out but no clock-in, update clock-out
                attendance.clock_out_time = time_selected_utc
            elif attendance.clock_in_time:
                # Has both, update clock-in by default
                attendance.clock_in_time = time_selected_utc
            else:
                # Has neither, set clock-in
                attendance.clock_in_time = time_selected_utc
        except:
            raise HTTPException(status_code=400, detail="Invalid time_selected_utc format")
    
    if "status" in payload:
        attendance.status = payload["status"]
        if payload["status"] == "approved":
            attendance.approved_at = datetime.now(timezone.utc)
            attendance.approved_by = user.id
    
    if "reason_text" in payload:
        attendance.reason_text = payload["reason_text"]
    
    if "worker_id" in payload:
        attendance.worker_id = uuid.UUID(payload["worker_id"])
    
    if "shift_id" in payload:
        attendance.shift_id = uuid.UUID(payload["shift_id"]) if payload["shift_id"] else None
    
    db.commit()
    db.refresh(attendance)
    
    return {"id": str(attendance.id), "status": "ok"}


@router.put("/{list_name}/{item_id}", dependencies=[Depends(require_permissions("settings:access"))])
def update_setting_item(list_name: str, item_id: str, label: str = None, value: str = None, sort_index: int | None = None, abbr: Optional[str] = None, color: Optional[str] = None, allow_edit_proposal: Optional[str] = None, sets_start_date: Optional[str] = None, sets_end_date: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    lst = db.query(SettingList).filter(SettingList.name == list_name).first()
    if not lst:
        return {"status": "ok"}
    it = db.query(SettingItem).filter(SettingItem.list_id == lst.id, SettingItem.id == item_id).first()
    if not it:
        return {"status": "ok"}
    old_label = it.label
    label_changed = label is not None and label != old_label
    if label is not None:
        it.label = label
    if value is not None:
        it.value = value
    if sort_index is not None:
        it.sort_index = sort_index
    # update meta
    meta = dict(it.meta or {})
    if abbr is not None:
        meta["abbr"] = abbr
    if color is not None:
        meta["color"] = color
    if allow_edit_proposal is not None:
        # Convert string to boolean
        meta["allow_edit_proposal"] = allow_edit_proposal.lower() in ('true', '1', 'yes')
    if sets_start_date is not None:
        # Convert string to boolean
        meta["sets_start_date"] = sets_start_date.lower() in ('true', '1', 'yes')
    if sets_end_date is not None:
        # Convert string to boolean
        meta["sets_end_date"] = sets_end_date.lower() in ('true', '1', 'yes')
    # Always set meta (even if empty dict) to ensure meta fields are preserved
    it.meta = meta
    db.commit()
    # Propagate label rename to referencing records (non-destructive; only on rename, not on delete)
    if label_changed and label:
        try:
            if list_name == "client_statuses":
                db.query(Client).filter(Client.client_status == old_label).update({Client.client_status: label}, synchronize_session=False)
                db.commit()
            elif list_name == "client_types":
                db.query(Client).filter(Client.client_type == old_label).update({Client.client_type: label}, synchronize_session=False)
                db.commit()
            elif list_name == "lead_sources":
                db.query(Client).filter(Client.lead_source == old_label).update({Client.lead_source: label}, synchronize_session=False)
                db.commit()
        except ProgrammingError as e:
            error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
            if 'is_system' in error_msg and 'does not exist' in error_msg:
                db.rollback()
                # Retry with defer to avoid loading is_system column
                if list_name == "client_statuses":
                    db.query(Client).options(defer(Client.is_system)).filter(Client.client_status == old_label).update({Client.client_status: label}, synchronize_session=False)
                    db.commit()
                elif list_name == "client_types":
                    db.query(Client).options(defer(Client.is_system)).filter(Client.client_type == old_label).update({Client.client_type: label}, synchronize_session=False)
                    db.commit()
                elif list_name == "lead_sources":
                    db.query(Client).options(defer(Client.is_system)).filter(Client.lead_source == old_label).update({Client.lead_source: label}, synchronize_session=False)
                    db.commit()
            else:
                raise
    return {"status": "ok"}


# Attendance Management Endpoints

PREDEFINED_JOBS_DICT = {
    "0": "No Project Assigned",
    "37": "Repairs",
    "47": "Shop",
    "53": "YPK Developments",
    "136": "Stat Holiday",
}


@router.get("/attendance/list")
def list_attendances(
    worker_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None,
    type_filter: Optional[str] = None,  # "in" or "out"
    project_id: Optional[str] = None,  # Filter by project (through shift)
    db: Session = Depends(get_db),
    user: UserType = Depends(get_current_user),
    _=Depends(require_permissions("users:read"))
):
    """List all attendances with filters."""
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        # Query attendances directly without joins first
        query = db.query(Attendance)
        
        # Apply filters
        if worker_id:
            try:
                query = query.filter(Attendance.worker_id == uuid.UUID(worker_id))
            except Exception as e:
                logger.warning(f"Invalid worker_id format: {worker_id}, error: {e}")
                pass
        if status:
            query = query.filter(Attendance.status == status)
        # NEW MODEL: type_filter is not directly applicable, but we can filter by clock_in_time/clock_out_time
        # For backward compatibility, if type_filter is "in", only show records with clock_in_time
        # If type_filter is "out", only show records with clock_out_time
        if type_filter == "in":
            query = query.filter(Attendance.clock_in_time.isnot(None))
        elif type_filter == "out":
            query = query.filter(Attendance.clock_out_time.isnot(None))
        
        if start_date:
            try:
                start_dt = datetime.fromisoformat(start_date).date()
                start_dt_utc = datetime.combine(start_dt, time.min).replace(tzinfo=timezone.utc)
                # Filter by clock_in_time or clock_out_time
                query = query.filter(
                    or_(
                        and_(Attendance.clock_in_time.isnot(None), Attendance.clock_in_time >= start_dt_utc),
                        and_(Attendance.clock_in_time.is_(None), Attendance.clock_out_time.isnot(None), Attendance.clock_out_time >= start_dt_utc)
                    )
                )
            except Exception as e:
                logger.warning(f"Invalid start_date format: {start_date}, error: {e}")
                pass
        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date).date()
                end_dt_utc = datetime.combine(end_dt + timedelta(days=1), time.min).replace(tzinfo=timezone.utc)
                # Filter by clock_in_time or clock_out_time
                query = query.filter(
                    or_(
                        and_(Attendance.clock_in_time.isnot(None), Attendance.clock_in_time < end_dt_utc),
                        and_(Attendance.clock_in_time.is_(None), Attendance.clock_out_time.isnot(None), Attendance.clock_out_time < end_dt_utc)
                    )
                )
            except Exception as e:
                logger.warning(f"Invalid end_date format: {end_date}, error: {e}")
                pass
        
        # Filter by project_id (through shift)
        if project_id:
            try:
                project_uuid = uuid.UUID(project_id)
                # Join with Shift to filter by project_id
                from ..models.models import Shift
                query = query.join(Shift, Attendance.shift_id == Shift.id).filter(Shift.project_id == project_uuid).distinct()
            except Exception as e:
                logger.warning(f"Invalid project_id format: {project_id}, error: {e}")
                pass
        
        # Order by clock_in_time or clock_out_time
        from sqlalchemy import func
        attendances = query.order_by(func.coalesce(Attendance.clock_in_time, Attendance.clock_out_time).desc()).limit(1000).all()
        total_in_db = db.query(Attendance).count()
        logger.info(f"Query returned {len(attendances)} attendance records (total in DB: {total_in_db})")
        
        # Debug: log first few attendance IDs if any
        if attendances:
            logger.info(f"First attendance IDs: {[str(a.id) for a in attendances[:3]]}")
        else:
            logger.warning(f"No attendances found from query, but DB has {total_in_db} records!")
        
        # Get all unique worker IDs and shift IDs for batch fetching
        worker_ids_str = list(set([str(a.worker_id) for a in attendances]))
        logger.info(f"Unique worker IDs (as strings): {worker_ids_str}")
        users_dict = {}
        profiles_dict = {}
        if worker_ids_str:
            try:
                # Convert string IDs to UUID for query
                worker_ids_uuid = [uuid.UUID(wid) for wid in worker_ids_str]
                users = db.query(User).filter(User.id.in_(worker_ids_uuid)).all()
                users_dict = {str(u.id): u for u in users}
                logger.info(f"Found {len(users_dict)} users for {len(worker_ids_uuid)} worker IDs")
            except Exception as e:
                logger.error(f"Error fetching users: {e}", exc_info=True)
            try:
                # Convert string IDs to UUID for query
                worker_ids_uuid = [uuid.UUID(wid) for wid in worker_ids_str]
                profiles = db.query(EmployeeProfile).filter(EmployeeProfile.user_id.in_(worker_ids_uuid)).all()
                profiles_dict = {str(p.user_id): p for p in profiles}
                logger.info(f"Found {len(profiles_dict)} profiles for {len(worker_ids_uuid)} worker IDs")
            except Exception as e:
                logger.error(f"Error fetching profiles: {e}", exc_info=True)
        
        shift_ids = [str(a.shift_id) for a in attendances if a.shift_id]
        shifts_dict = {}
        projects_dict = {}
        if shift_ids:
            shifts_dict = {str(s.id): s for s in db.query(Shift).filter(Shift.id.in_(shift_ids)).all()}
            project_ids = [str(s.project_id) for s in shifts_dict.values() if s.project_id]
            if project_ids:
                projects_dict = {str(p.id): p for p in db.query(Project).filter(Project.id.in_(project_ids)).all()}
        
        result = []
        logger.info(f"Processing {len(attendances)} attendances...")
        for i, att in enumerate(attendances):
            try:
                logger.debug(f"Processing attendance {i+1}/{len(attendances)}: {att.id}")
                worker = users_dict.get(str(att.worker_id))
                profile = profiles_dict.get(str(att.worker_id))
                
                # Get worker name
                worker_name = worker.username if worker else "Unknown"
                if profile:
                    name = (profile.preferred_name or '').strip()
                    if not name:
                        first = (profile.first_name or '').strip()
                        last = (profile.last_name or '').strip()
                        name = ' '.join([x for x in [first, last] if x])
                    if name:
                        worker_name = name
                
                # Get job/project info
                job_name = None
                project_name = None
                if att.shift_id and str(att.shift_id) in shifts_dict:
                    shift = shifts_dict[str(att.shift_id)]
                    job_name = shift.job_name
                    if shift.project_id and str(shift.project_id) in projects_dict:
                        project = projects_dict[str(shift.project_id)]
                        project_name = project.name
                elif att.reason_text and att.reason_text.startswith("JOB_TYPE:"):
                    # Direct attendance - extract job_type from reason_text
                    parts = att.reason_text.split("|")
                    job_marker = parts[0]
                    job_type = job_marker.replace("JOB_TYPE:", "")
                    job_name = PREDEFINED_JOBS_DICT.get(job_type, project_name or "Unknown")
                
                # Calculate hours - NEW MODEL: clock_in_time and clock_out_time are in the same record
                hours_worked = None
                if att.clock_in_time and att.clock_out_time:
                    diff = att.clock_out_time - att.clock_in_time
                    hours_worked = diff.total_seconds() / 3600  # Convert to hours
                elif "HOURS_WORKED:" in (att.reason_text or ""):
                    # Extract hours_worked from reason_text for "hours worked" entries
                    parts = (att.reason_text or "").split("|")
                    for part in parts:
                        if part.startswith("HOURS_WORKED:"):
                            try:
                                hours_worked = float(part.replace("HOURS_WORKED:", ""))
                            except:
                                pass
                            break
                
                # Determine type for backward compatibility
                att_type = None
                if att.clock_in_time and att.clock_out_time:
                    att_type = "in"  # Complete event
                elif att.clock_in_time:
                    att_type = "in"
                elif att.clock_out_time:
                    att_type = "out"
                
                # Use clock_in_time or clock_out_time for time_selected_utc (backward compatibility)
                time_selected = att.clock_in_time if att.clock_in_time else att.clock_out_time
                time_entered = att.clock_in_entered_utc if att.clock_in_time else att.clock_out_entered_utc
                
                # Use break_minutes from database (already calculated and saved, including manual breaks)
                # Only calculate if not already set in database
                break_minutes = att.break_minutes
                if break_minutes is None and att.clock_in_time and att.clock_out_time:
                    # Fallback: calculate if not set (for old records or edge cases)
                    break_minutes = calculate_break_minutes(
                        db, att.worker_id, att.clock_in_time, att.clock_out_time
                    )
                
                result.append({
                    "id": str(att.id),
                    "worker_id": str(att.worker_id),
                    "worker_name": worker_name,
                    "type": att_type,  # For backward compatibility
                    "clock_in_time": att.clock_in_time.isoformat() if att.clock_in_time else None,
                    "clock_out_time": att.clock_out_time.isoformat() if att.clock_out_time else None,
                    "time_selected_utc": time_selected.isoformat() if time_selected else None,  # Backward compatibility
                    "time_entered_utc": time_entered.isoformat() if time_entered else None,  # Backward compatibility
                    "status": att.status,
                    "source": att.source,
                    "shift_id": str(att.shift_id) if att.shift_id else None,
                    "job_name": job_name,
                    "project_name": project_name,
                    "hours_worked": round(hours_worked, 2) if hours_worked else None,
                    "break_minutes": break_minutes,
                    "reason_text": att.reason_text,
                    "gps_lat": float(att.clock_in_gps_lat) if att.clock_in_gps_lat else (float(att.clock_out_gps_lat) if att.clock_out_gps_lat else None),
                    "gps_lng": float(att.clock_in_gps_lng) if att.clock_in_gps_lng else (float(att.clock_out_gps_lng) if att.clock_out_gps_lng else None),
                    "created_at": att.created_at.isoformat() if att.created_at else None,
                    "approved_at": att.approved_at.isoformat() if att.approved_at else None,
                    "approved_by": str(att.approved_by) if att.approved_by else None,
                })
            except Exception as e:
                logger.error(f"Error processing attendance {att.id}: {str(e)}", exc_info=True)
                # Continue processing other attendances even if one fails
                continue
        
        logger.info(f"Returning {len(result)} attendance records (from {len(attendances)} raw records)")
        if len(result) == 0 and len(attendances) > 0:
            logger.warning(f"WARNING: Found {len(attendances)} attendance records but result list is empty!")
            # Debug: try to see what's wrong
            for i, att in enumerate(attendances[:3]):
                att_type = "in" if att.clock_in_time else ("out" if att.clock_out_time else "unknown")
                logger.warning(f"  Attendance {i+1}: id={att.id}, worker_id={att.worker_id}, type={att_type}, shift_id={att.shift_id}")
        # Ensure we always return a list
        return result if isinstance(result, list) else []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing attendances: {str(e)}", exc_info=True)
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        # Return empty list instead of raising error to prevent frontend crash
        return []


@router.get("/attendance/{attendance_id}")
def get_attendance(
    attendance_id: str,
    db: Session = Depends(get_db),
    user: UserType = Depends(get_current_user),
    _=Depends(require_permissions("users:read"))
):
    """Get a specific attendance record."""
    attendance = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not attendance:
        raise HTTPException(status_code=404, detail="Attendance not found")
    
    worker = db.query(User).filter(User.id == attendance.worker_id).first()
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == attendance.worker_id).first()
    
    worker_name = worker.username if worker else "Unknown"
    if profile:
        name = (profile.preferred_name or '').strip()
        if not name:
            first = (profile.first_name or '').strip()
            last = (profile.last_name or '').strip()
            name = ' '.join([x for x in [first, last] if x])
        if name:
            worker_name = name
    
    job_name = None
    project_name = None
    if attendance.shift_id:
        shift = db.query(Shift).filter(Shift.id == attendance.shift_id).first()
        if shift:
            job_name = shift.job_name
            if shift.project_id:
                project = db.query(Project).filter(Project.id == shift.project_id).first()
                if project:
                    project_name = project.name
    elif attendance.reason_text and attendance.reason_text.startswith("JOB_TYPE:"):
        parts = attendance.reason_text.split("|")
        job_marker = parts[0]
        job_type = job_marker.replace("JOB_TYPE:", "")
        job_name = PREDEFINED_JOBS_DICT.get(job_type, "Unknown")
    
    # Determine type for backward compatibility
    att_type = None
    if attendance.clock_in_time and attendance.clock_out_time:
        att_type = "in"  # Complete event
    elif attendance.clock_in_time:
        att_type = "in"
    elif attendance.clock_out_time:
        att_type = "out"
    
    # Use clock_in_time or clock_out_time for time_selected_utc (backward compatibility)
    time_selected = attendance.clock_in_time if attendance.clock_in_time else attendance.clock_out_time
    time_entered = attendance.clock_in_entered_utc if attendance.clock_in_time else attendance.clock_out_entered_utc
    
    return {
        "id": str(attendance.id),
        "worker_id": str(attendance.worker_id),
        "worker_name": worker_name,
        "type": att_type,  # For backward compatibility
        "clock_in_time": attendance.clock_in_time.isoformat() if attendance.clock_in_time else None,
        "clock_out_time": attendance.clock_out_time.isoformat() if attendance.clock_out_time else None,
        "time_selected_utc": time_selected.isoformat() if time_selected else None,  # Backward compatibility
        "time_entered_utc": time_entered.isoformat() if time_entered else None,  # Backward compatibility
        "status": attendance.status,
        "source": attendance.source,
        "shift_id": str(attendance.shift_id) if attendance.shift_id else None,
        "job_name": job_name,
        "project_name": project_name,
        "reason_text": attendance.reason_text,
        "gps_lat": float(attendance.clock_in_gps_lat) if attendance.clock_in_gps_lat else (float(attendance.clock_out_gps_lat) if attendance.clock_out_gps_lat else None),
        "gps_lng": float(attendance.clock_in_gps_lng) if attendance.clock_in_gps_lng else (float(attendance.clock_out_gps_lng) if attendance.clock_out_gps_lng else None),
        "created_at": attendance.created_at.isoformat() if attendance.created_at else None,
        "approved_at": attendance.approved_at.isoformat() if attendance.approved_at else None,
        "approved_by": str(attendance.approved_by) if attendance.approved_by else None,
    }


@router.post("/attendance/manual")
def create_attendance_manual(
    payload: dict,
    db: Session = Depends(get_db),
    user: UserType = Depends(get_current_user),
    _=Depends(require_permissions("users:write"))
):
    """Create a new attendance record manually."""
    worker_id = payload.get("worker_id")
    if not worker_id:
        raise HTTPException(status_code=400, detail="worker_id is required")
    
    # NEW MODEL: Support both clock_in_time and clock_out_time directly
    clock_in_time_str = payload.get("clock_in_time")
    clock_out_time_str = payload.get("clock_out_time")
    
    # Parse clock_in_time if provided
    clock_in_time_utc = None
    if clock_in_time_str:
        try:
            clock_in_time_utc = datetime.fromisoformat(clock_in_time_str.replace('Z', '+00:00'))
            if clock_in_time_utc.tzinfo is None:
                clock_in_time_utc = clock_in_time_utc.replace(tzinfo=timezone.utc)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid clock_in_time format: {str(e)}")
    
    # Parse clock_out_time if provided
    clock_out_time_utc = None
    if clock_out_time_str:
        try:
            clock_out_time_utc = datetime.fromisoformat(clock_out_time_str.replace('Z', '+00:00'))
            if clock_out_time_utc.tzinfo is None:
                clock_out_time_utc = clock_out_time_utc.replace(tzinfo=timezone.utc)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid clock_out_time format: {str(e)}")
    
    # If new model fields not provided, fall back to legacy time_selected_utc
    if not clock_in_time_utc and not clock_out_time_utc:
        time_selected_str = payload.get("time_selected_utc")
        if not time_selected_str:
            raise HTTPException(status_code=400, detail="Either clock_in_time/clock_out_time or time_selected_utc is required")
        
        try:
            time_selected_utc = datetime.fromisoformat(time_selected_str.replace('Z', '+00:00'))
            if time_selected_utc.tzinfo is None:
                time_selected_utc = time_selected_utc.replace(tzinfo=timezone.utc)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid time_selected_utc format: {str(e)}")
        
        # Use legacy type to determine which time to set
        attendance_type = payload.get("type", "in")
        if attendance_type == "in":
            clock_in_time_utc = time_selected_utc
        else:
            clock_out_time_utc = time_selected_utc
    
    # Validate that at least one time is provided
    if not clock_in_time_utc and not clock_out_time_utc:
        raise HTTPException(status_code=400, detail="Either clock_in_time or clock_out_time must be provided")
    
    # Check for conflicts before creating attendance
    conflict_error = check_attendance_conflict(
        db, uuid.UUID(worker_id), clock_in_time_utc, clock_out_time_utc, exclude_attendance_id=None, timezone_str=settings.tz_default
    )
    if conflict_error:
        raise HTTPException(
            status_code=400,
            detail=conflict_error  # Message already includes "Cannot create attendance:" prefix
        )
    
    shift_id = payload.get("shift_id")  # Optional
    reason_text = payload.get("reason_text", "")
    status = payload.get("status", "approved")  # Default to approved for manual entries
    
    # NEW MODEL: Create attendance with clock_in_time and/or clock_out_time
    time_entered_utc = datetime.now(timezone.utc)
    
    # If both times are provided, create a complete attendance record
    if clock_in_time_utc and clock_out_time_utc:
        # Calculate break minutes (manual break takes priority)
        manual_break = payload.get("manual_break_minutes")
        break_minutes = calculate_break_minutes(
            db, uuid.UUID(worker_id), clock_in_time_utc, clock_out_time_utc,
            manual_break_minutes=manual_break if manual_break is not None else None
        )
        
        attendance = Attendance(
            shift_id=uuid.UUID(shift_id) if shift_id else None,
            worker_id=uuid.UUID(worker_id),
            clock_in_time=clock_in_time_utc,
            clock_in_entered_utc=time_entered_utc,
            clock_in_gps_lat=payload.get("gps_lat"),
            clock_in_gps_lng=payload.get("gps_lng"),
            clock_in_gps_accuracy_m=payload.get("gps_accuracy_m"),
            clock_in_mocked_flag=payload.get("gps_mocked", False),
            clock_out_time=clock_out_time_utc,
            clock_out_entered_utc=time_entered_utc,
            clock_out_gps_lat=payload.get("gps_lat"),
            clock_out_gps_lng=payload.get("gps_lng"),
            clock_out_gps_accuracy_m=payload.get("gps_accuracy_m"),
            clock_out_mocked_flag=payload.get("gps_mocked", False),
            break_minutes=break_minutes,
            status=status,
            source="admin",
            created_by=user.id,
            reason_text=reason_text if reason_text else None,
            # Legacy fields (required for database NOT NULL constraint)
            mocked_flag=payload.get("gps_mocked", False),
        )
        db.add(attendance)
    elif clock_in_time_utc:
        # Only clock-in time provided
        attendance = Attendance(
            shift_id=uuid.UUID(shift_id) if shift_id else None,
            worker_id=uuid.UUID(worker_id),
            clock_in_time=clock_in_time_utc,
            clock_in_entered_utc=time_entered_utc,
            clock_in_gps_lat=payload.get("gps_lat"),
            clock_in_gps_lng=payload.get("gps_lng"),
            clock_in_gps_accuracy_m=payload.get("gps_accuracy_m"),
            clock_in_mocked_flag=payload.get("gps_mocked", False),
            clock_out_time=None,
            clock_out_entered_utc=None,
            status=status,
            source="admin",
            created_by=user.id,
            reason_text=reason_text if reason_text else None,
            # Legacy fields (required for database NOT NULL constraint)
            mocked_flag=payload.get("gps_mocked", False),
        )
        db.add(attendance)
    else:  # clock_out_time_utc only
        # For clock-out, check if there's an open clock-in to update
        if shift_id:
            existing_attendance = db.query(Attendance).filter(
                Attendance.shift_id == uuid.UUID(shift_id),
                Attendance.worker_id == uuid.UUID(worker_id),
                Attendance.clock_in_time.isnot(None),
                Attendance.clock_out_time.is_(None)
            ).order_by(Attendance.clock_in_time.desc()).first()
        else:
            # Direct attendance - match by job_type from reason_text
            existing_attendance = None
            if reason_text and reason_text.startswith("JOB_TYPE:"):
                job_type = reason_text.split("|")[0].replace("JOB_TYPE:", "")
                open_attendances = db.query(Attendance).filter(
                    Attendance.shift_id.is_(None),
                    Attendance.worker_id == uuid.UUID(worker_id),
                    Attendance.clock_in_time.isnot(None),
                    Attendance.clock_out_time.is_(None)
                ).order_by(Attendance.clock_in_time.desc()).all()
                for att in open_attendances:
                    if att.reason_text and att.reason_text.startswith("JOB_TYPE:"):
                        att_job_type = att.reason_text.split("|")[0].replace("JOB_TYPE:", "")
                        if att_job_type == job_type:
                            existing_attendance = att
                            break
        
        if existing_attendance:
            # Update existing attendance with clock-out
            existing_attendance.clock_out_time = clock_out_time_utc
            existing_attendance.clock_out_entered_utc = time_entered_utc
            existing_attendance.clock_out_gps_lat = payload.get("gps_lat")
            existing_attendance.clock_out_gps_lng = payload.get("gps_lng")
            existing_attendance.clock_out_gps_accuracy_m = payload.get("gps_accuracy_m")
            existing_attendance.clock_out_mocked_flag = payload.get("gps_mocked", False)
            # Calculate break minutes now that we have both times
            if existing_attendance.clock_in_time and clock_out_time_utc:
                manual_break = payload.get("manual_break_minutes")
                existing_attendance.break_minutes = calculate_break_minutes(
                    db, existing_attendance.worker_id, existing_attendance.clock_in_time, clock_out_time_utc,
                    manual_break_minutes=manual_break if manual_break is not None else None
                )
            if status == "pending" or existing_attendance.status == "pending":
                existing_attendance.status = "pending"
            else:
                existing_attendance.status = status
            attendance = existing_attendance
        else:
            # Create new attendance with only clock-out
            attendance = Attendance(
                shift_id=uuid.UUID(shift_id) if shift_id else None,
                worker_id=uuid.UUID(worker_id),
                clock_in_time=None,
                clock_in_entered_utc=None,
                clock_out_time=clock_out_time_utc,
                clock_out_entered_utc=time_entered_utc,
                clock_out_gps_lat=payload.get("gps_lat"),
                clock_out_gps_lng=payload.get("gps_lng"),
                clock_out_gps_accuracy_m=payload.get("gps_accuracy_m"),
                clock_out_mocked_flag=payload.get("gps_mocked", False),
                status=status,
                source="admin",
                created_by=user.id,
                reason_text=reason_text if reason_text else None,
                # Legacy fields (required for database NOT NULL constraint)
                mocked_flag=payload.get("gps_mocked", False),
            )
            db.add(attendance)
    
    db.commit()
    db.refresh(attendance)
    
    return {"id": str(attendance.id), "status": "ok"}


    
    try:
        attendance_uuid = uuid.UUID(attendance_id)
        print(f"UUID converted: {attendance_uuid}", file=sys.stderr)
        sys.stderr.flush()
    except ValueError:
        print(f"INVALID UUID: {attendance_id}", file=sys.stderr)
        sys.stderr.flush()
        raise HTTPException(status_code=400, detail="Invalid attendance ID format")

    # Find the record
    attendance = db.query(Attendance).filter(Attendance.id == attendance_uuid).first()
    if not attendance:
        print(f"NOT FOUND: {attendance_id}", file=sys.stderr)
        sys.stderr.flush()
        raise HTTPException(status_code=404, detail="Attendance not found")

    print(f"FOUND: id={attendance.id}, type={attendance.type}", file=sys.stderr)
    sys.stderr.flush()
    
    # Delete using ORM (same pattern as inventory delete that works)
    db.delete(attendance)
    print("MARKED FOR DELETION", file=sys.stderr)
    sys.stderr.flush()
    
    # Commit
    db.commit()
    print(f"COMMITTED DELETE FOR {attendance_id}", file=sys.stderr)
    sys.stderr.flush()
    
    # Verify
    db.expire_all()
    verify = db.query(Attendance).filter(Attendance.id == attendance_uuid).first()
    if verify:
        print(f"ERROR: STILL EXISTS AFTER DELETE: {attendance_id}", file=sys.stderr)
        sys.stderr.flush()
        raise HTTPException(status_code=500, detail="Delete failed - record still exists")
    
    print(f"SUCCESS: DELETED {attendance_id}", file=sys.stderr)
    print("=" * 80, file=sys.stderr)
    sys.stderr.flush()
    
    return {"status": "ok", "deleted_id": attendance_id}
