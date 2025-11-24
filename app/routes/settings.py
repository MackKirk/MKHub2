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

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
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
def list_settings(list_name: str, db: Session = Depends(get_db)):
    lst = db.query(SettingList).filter(SettingList.name == list_name).first()
    if not lst:
        return []
    items = db.query(SettingItem).filter(SettingItem.list_id == lst.id).order_by(SettingItem.sort_index.asc()).all()
    return [{"id": str(i.id), "label": i.label, "value": i.value, "sort_index": i.sort_index, "meta": i.meta or None} for i in items]


@router.post("/{list_name}")
def create_setting_item(list_name: str, label: str, value: str = "", sort_index: Optional[int] = None, abbr: Optional[str] = None, color: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
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
    
    # Delete the record
    db.delete(attendance)
    db.commit()
    
    return {"status": "ok", "deleted_id": attendance_id}


@router.delete("/{list_name}/{item_id}")
def delete_setting_item(list_name: str, item_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
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
    
    # Update fields - NEW MODEL: Support both clock_in_time and clock_out_time
    if "clock_in_time" in payload:
        try:
            clock_in_time = datetime.fromisoformat(payload["clock_in_time"].replace('Z', '+00:00'))
            if clock_in_time.tzinfo is None:
                clock_in_time = clock_in_time.replace(tzinfo=timezone.utc)
            attendance.clock_in_time = clock_in_time
        except:
            raise HTTPException(status_code=400, detail="Invalid clock_in_time format")
    
    if "clock_out_time" in payload:
        try:
            clock_out_time = datetime.fromisoformat(payload["clock_out_time"].replace('Z', '+00:00'))
            if clock_out_time.tzinfo is None:
                clock_out_time = clock_out_time.replace(tzinfo=timezone.utc)
            attendance.clock_out_time = clock_out_time
        except:
            raise HTTPException(status_code=400, detail="Invalid clock_out_time format")
    
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


@router.put("/{list_name}/{item_id}")
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
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing attendances: {str(e)}", exc_info=True)
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error listing attendances: {str(e)}")


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
    
    attendance_type = payload.get("type")
    if attendance_type not in ["in", "out"]:
        raise HTTPException(status_code=400, detail="type must be 'in' or 'out'")
    
    time_selected_str = payload.get("time_selected_utc")
    if not time_selected_str:
        raise HTTPException(status_code=400, detail="time_selected_utc is required")
    
    try:
        time_selected_utc = datetime.fromisoformat(time_selected_str.replace('Z', '+00:00'))
    except:
        raise HTTPException(status_code=400, detail="Invalid time_selected_utc format")
    
    # Ensure timezone-aware
    if time_selected_utc.tzinfo is None:
        time_selected_utc = time_selected_utc.replace(tzinfo=timezone.utc)
    
    shift_id = payload.get("shift_id")  # Optional
    reason_text = payload.get("reason_text", "")
    status = payload.get("status", "approved")  # Default to approved for manual entries
    
    # NEW MODEL: Create attendance with clock_in_time or clock_out_time
    time_entered_utc = datetime.now(timezone.utc)
    
    if attendance_type == "in":
        attendance = Attendance(
            shift_id=uuid.UUID(shift_id) if shift_id else None,
            worker_id=uuid.UUID(worker_id),
            clock_in_time=time_selected_utc,
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
    else:  # attendance_type == "out"
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
            existing_attendance.clock_out_time = time_selected_utc
            existing_attendance.clock_out_entered_utc = time_entered_utc
            existing_attendance.clock_out_gps_lat = payload.get("gps_lat")
            existing_attendance.clock_out_gps_lng = payload.get("gps_lng")
            existing_attendance.clock_out_gps_accuracy_m = payload.get("gps_accuracy_m")
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
                clock_out_time=time_selected_utc,
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
