"""
Dispatch & Time Tracking API routes.
Handles shifts, attendance, and approvals.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from typing import List, Optional, Dict
from datetime import date, time, datetime, timedelta, timezone
import uuid
import pytz

from ..db import get_db
from ..models.models import (
    Shift, Attendance, AuditLog, Project, User, 
    UserNotificationPreference, ProjectTimeEntry, ProjectTimeEntryLog,
    EmployeeProfile
)
from ..auth.security import get_current_user
from ..config import settings
from ..services.dispatch_conflict import has_overlap, get_conflicting_shifts
from ..services.geofence import inside_geofence
from ..services.time_rules import (
    round_to_5_minutes, is_within_tolerance, is_same_day,
    local_to_utc, utc_to_local, combine_date_time
)
from ..services.audit import create_audit_log, compute_diff
from ..services.notifications import send_shift_notification, send_attendance_notification
from ..services.permissions import (
    is_admin, is_supervisor, is_worker,
    can_modify_shift, can_modify_attendance, can_approve_attendance
)
from ..services.task_service import create_task_item, complete_tasks_for_origin

router = APIRouter(prefix="/dispatch", tags=["dispatch"])


def get_user_role(user: User, db: Session) -> str:
    """Get user's primary role."""
    if is_admin(user, db):
        return "admin"
    if is_supervisor(user, db):
        return "supervisor"
    if is_worker(user, db):
        return "worker"
    return "user"


def get_geofences_for_shift(shift: Shift, project: Project, db: Session) -> List[Dict]:
    """
    Get geofences for a shift. 
    Returns shift.geofences if available, otherwise uses project lat/lng as default.
    """
    if shift.geofences and len(shift.geofences) > 0:
        return shift.geofences
    
    # Try to get geofence from project location
    if project and getattr(project, 'lat', None) is not None and getattr(project, 'lng', None) is not None:
        return [{
            "lat": float(project.lat),
            "lng": float(project.lng),
            "radius_m": settings.geo_radius_m_default
        }]
    
    return []


# Shift Management

@router.post("/projects/{project_id}/shifts")
def create_shift(
    project_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Create a new shift for a worker.
    HARD STOP: Blocks if worker has overlapping shift.
    """
    # Validate project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Validate required fields
    worker_id = payload.get("worker_id")
    if not worker_id:
        raise HTTPException(status_code=400, detail="worker_id is required")
    
    # Check permissions:
    # - Admins and supervisors can create shifts for any worker
    # - Workers can create shifts only for themselves (for clock in/out when no shift exists)
    is_creating_for_self = str(worker_id) == str(user.id)
    if not (is_admin(user, db) or is_supervisor(user, db, project_id) or (is_worker(user, db) and is_creating_for_self)):
        raise HTTPException(
            status_code=403, 
            detail="Only admins, supervisors, or workers creating shifts for themselves can create shifts"
        )
    
    # Validate worker exists
    worker = db.query(User).filter(User.id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    
    # Parse date and times
    date_str = payload.get("date")
    if not date_str:
        raise HTTPException(status_code=400, detail="date is required")
    
    try:
        shift_date = datetime.fromisoformat(date_str.split('T')[0]).date()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format")
    
    start_time_str = payload.get("start_time")
    end_time_str = payload.get("end_time")
    if not start_time_str or not end_time_str:
        raise HTTPException(status_code=400, detail="start_time and end_time are required")
    
    try:
        start_time = time.fromisoformat(start_time_str)
        end_time = time.fromisoformat(end_time_str)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid time format")
    
    # Validate end_time > start_time (or handle cross-day)
    if end_time <= start_time and shift_date == shift_date:  # Same day
        # Allow cross-day shifts
        pass
    
    # HARD STOP: Check for conflicts
    if has_overlap(db, worker_id, shift_date, start_time, end_time):
        conflicts = get_conflicting_shifts(db, worker_id, shift_date, start_time, end_time)
        conflict_info = [
            {
                "id": str(c.id),
                "date": c.date.isoformat(),
                "start_time": c.start_time.isoformat(),
                "end_time": c.end_time.isoformat(),
                "project_id": str(c.project_id),
            }
            for c in conflicts
        ]
        raise HTTPException(
            status_code=400,
            detail=f"Worker already has overlapping shift(s)",
            headers={"X-Conflict-Shifts": str(conflict_info)}
        )
    
    # Get geofences (default from project or custom)
    geofences = payload.get("geofences")
    if not geofences:
        # Use project location as default geofence
        if project.lat and project.lng:
            geofences = [{
                "lat": float(project.lat),
                "lng": float(project.lng),
                "radius_m": settings.geo_radius_m_default
            }]
        else:
            geofences = []
    
    # Get job information (optional)
    job_type = payload.get("job_type") or payload.get("job_name")
    job_id = payload.get("job_id")  # Keep for backward compatibility
    job_name = job_type or payload.get("job_name")  # Use job_type if available, otherwise job_name
    
    # Create shift
    shift = Shift(
        project_id=project_id,
        worker_id=worker_id,
        date=shift_date,
        start_time=start_time,
        end_time=end_time,
        status="scheduled",
        default_break_min=payload.get("default_break_min", settings.default_break_min),
        geofences=geofences,
        job_id=job_id,  # Can be None if using job_type
        job_name=job_name,  # Store the job type name
        created_by=user.id,
    )
    
    db.add(shift)
    db.commit()
    db.refresh(shift)
    
    # Create audit log
    create_audit_log(
        db=db,
        entity_type="shift",
        entity_id=str(shift.id),
        action="CREATE",
        actor_id=str(user.id),
        actor_role=get_user_role(user, db),
        source="api",
        changes_json={"after": {
            "project_id": str(project_id),
            "worker_id": worker_id,
            "date": date_str,
            "start_time": start_time_str,
            "end_time": end_time_str,
        }},
        context={
            "project_id": project_id,
            "worker_id": worker_id,
        }
    )
    
    # Send notification to worker
    project_timezone = project.timezone or settings.tz_default
    send_shift_notification(
        db=db,
        user_id=worker_id,
        notification_type="created",
        shift_data={
            "id": str(shift.id),
            "project_id": project_id,
            "date": date_str,
            "start_time": start_time_str,
            "end_time": end_time_str,
        },
        timezone_str=project_timezone
    )
    
    return {
        "id": str(shift.id),
        "project_id": str(shift.project_id),
        "worker_id": str(shift.worker_id),
        "date": shift.date.isoformat(),
        "start_time": shift.start_time.isoformat(),
        "end_time": shift.end_time.isoformat(),
        "status": shift.status,
        "default_break_min": shift.default_break_min,
        "geofences": shift.geofences,
        "job_id": str(shift.job_id) if shift.job_id else None,
        "job_name": shift.job_name,
        "created_by": str(shift.created_by),
        "created_at": shift.created_at.isoformat() if shift.created_at else None,
    }


@router.post("/shifts/without-project")
def create_shift_without_project(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Create a shift without a project (for predefined jobs like "No Project Assigned", "Repairs", etc.).
    This allows workers to clock in/out when not assigned to a specific project.
    """
    # Validate required fields
    worker_id = payload.get("worker_id")
    if not worker_id:
        raise HTTPException(status_code=400, detail="worker_id is required")
    
    # Check permissions: only workers can create shifts for themselves without a project
    is_creating_for_self = str(worker_id) == str(user.id)
    if not (is_admin(user, db) or is_supervisor(user, db) or (is_worker(user, db) and is_creating_for_self)):
        raise HTTPException(
            status_code=403, 
            detail="Only admins, supervisors, or workers creating shifts for themselves can create shifts without a project"
        )
    
    # Validate worker exists
    worker = db.query(User).filter(User.id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    
    # Parse date and times
    date_str = payload.get("date")
    if not date_str:
        raise HTTPException(status_code=400, detail="date is required")
    
    try:
        shift_date = datetime.fromisoformat(date_str.split('T')[0]).date()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format")
    
    start_time_str = payload.get("start_time")
    end_time_str = payload.get("end_time")
    if not start_time_str or not end_time_str:
        raise HTTPException(status_code=400, detail="start_time and end_time are required")
    
    try:
        start_time = time.fromisoformat(start_time_str)
        end_time = time.fromisoformat(end_time_str)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid time format")
    
    # Get job information (required for shifts without project)
    job_type = payload.get("job_type") or payload.get("job_name")
    if not job_type:
        raise HTTPException(status_code=400, detail="job_type is required for shifts without a project")
    
    # Find existing "General" project (do NOT create new one)
    # This is a workaround since project_id is required in the model
    general_project = db.query(Project).filter(
        or_(
            Project.code == "GENERAL",
            Project.name.ilike("%general%"),
            Project.name.ilike("%no project%")
        )
    ).first()
    
    if not general_project:
        raise HTTPException(
            status_code=400,
            detail="No 'General / No Project' project found. Please contact administrator to create this project before using non-scheduled clock-in/out."
        )
    
    project_id = str(general_project.id)
    
    # Check for conflicts
    if has_overlap(db, worker_id, shift_date, start_time, end_time):
        conflicts = get_conflicting_shifts(db, worker_id, shift_date, start_time, end_time)
        raise HTTPException(
            status_code=400,
            detail=f"Worker already has overlapping shift(s)"
        )
    
    # Create shift with "General" project but store job_type to indicate it's not project-specific
    shift = Shift(
        project_id=project_id,  # Use General project as placeholder
        worker_id=worker_id,
        date=shift_date,
        start_time=start_time,
        end_time=end_time,
        status="scheduled",
        default_break_min=payload.get("default_break_min", settings.default_break_min),
        geofences=[],  # No geofences for shifts without specific projects
        job_id=None,
        job_name=job_type,  # Store the job type name (e.g., "0", "37", "47", etc.)
        created_by=user.id,
    )
    
    db.add(shift)
    db.commit()
    db.refresh(shift)
    
    # Create audit log
    create_audit_log(
        db=db,
        entity_type="shift",
        entity_id=str(shift.id),
        action="CREATE",
        actor_id=str(user.id),
        actor_role=get_user_role(user, db),
        source="api",
        changes_json={"after": {
            "worker_id": worker_id,
            "date": date_str,
            "start_time": start_time_str,
            "end_time": end_time_str,
            "job_name": job_type,
        }},
        context={
            "worker_id": worker_id,
            "job_type": job_type,
        }
    )
    
    return {
        "id": str(shift.id),
        "project_id": None,  # Return None to indicate no specific project
        "worker_id": str(shift.worker_id),
        "date": shift.date.isoformat(),
        "start_time": shift.start_time.isoformat(),
        "end_time": shift.end_time.isoformat(),
        "status": shift.status,
        "job_name": shift.job_name,
        "created_at": shift.created_at.isoformat() if shift.created_at else None,
    }


@router.get("/projects/{project_id}/shifts")
def list_shifts(
    project_id: str,
    date_range: Optional[str] = None,
    worker_id: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    List shifts for a project.
    Supports date range and worker filtering.
    """
    # Validate project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Build query - only show scheduled shifts (exclude cancelled)
    query = db.query(Shift).filter(
        Shift.project_id == project_id,
        Shift.status == "scheduled"
    )
    
    # Filter by worker if specified
    if worker_id:
        query = query.filter(Shift.worker_id == worker_id)
    
    # Filter by date range if specified (format: YYYY-MM-DD,YYYY-MM-DD)
    if date_range:
        try:
            start_str, end_str = date_range.split(",")
            start_date = datetime.fromisoformat(start_str).date()
            end_date = datetime.fromisoformat(end_str).date()
            query = query.filter(and_(Shift.date >= start_date, Shift.date <= end_date))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid date_range format. Use YYYY-MM-DD,YYYY-MM-DD")
    
    shifts = query.order_by(Shift.date.asc(), Shift.start_time.asc()).all()
    
    # Get project to check for default geofence location
    project = db.query(Project).filter(Project.id == project_id).first()
    
    result = []
    for s in shifts:
        # Get geofences (from shift or project)
        geofences = get_geofences_for_shift(s, project, db)
        
        result.append({
            "id": str(s.id),
            "project_id": str(s.project_id),
            "project_name": project.name if project else None,
            "worker_id": str(s.worker_id),
            "date": s.date.isoformat(),
            "start_time": s.start_time.isoformat(),
            "end_time": s.end_time.isoformat(),
            "status": s.status,
            "default_break_min": s.default_break_min,
            "geofences": geofences,
            "job_id": str(s.job_id) if s.job_id else None,
            "job_name": s.job_name,
            "created_by": str(s.created_by),
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })
    
    return result


@router.get("/shifts")
def list_all_shifts(
    date_range: Optional[str] = None,
    worker_id: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    List all shifts for the current user.
    - Workers see only their own shifts
    - Admins and supervisors see all shifts
    Supports date range and worker filtering.
    """
    # Build query - only show scheduled shifts (exclude cancelled)
    # EXCLUDE technical "System Internal" shifts - these are invisible to users
    query = db.query(Shift).filter(
        Shift.status == "scheduled"
    ).join(Project).filter(
        ~or_(
            Project.code == "SYSTEM_INTERNAL",
            Project.name.ilike("%system internal%"),
            Project.name.ilike("%internal system%")
        )
    )
    
    # If user is admin or supervisor, they can see all shifts (or filter by worker_id if provided)
    # If user is only a worker (not admin/supervisor), only show their own shifts
    if is_admin(user, db) or is_supervisor(user, db):
        # Admin/supervisor can see all shifts, or filter by worker_id if provided
        if worker_id:
            query = query.filter(Shift.worker_id == worker_id)
    else:
        # Regular worker - only show their own shifts
        query = query.filter(Shift.worker_id == user.id)
    
    # Filter by date range if specified (format: YYYY-MM-DD,YYYY-MM-DD)
    if date_range:
        try:
            start_str, end_str = date_range.split(",")
            start_date = datetime.fromisoformat(start_str).date()
            end_date = datetime.fromisoformat(end_str).date()
            query = query.filter(and_(Shift.date >= start_date, Shift.date <= end_date))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid date_range format. Use YYYY-MM-DD,YYYY-MM-DD")
    
    shifts = query.order_by(Shift.date.asc(), Shift.start_time.asc()).all()
    
    # Get all unique project IDs
    project_ids = list(set([s.project_id for s in shifts]))
    projects_dict = {}
    if project_ids:
        projects = db.query(Project).filter(Project.id.in_(project_ids)).all()
        projects_dict = {p.id: p for p in projects}
    
    result = []
    for s in shifts:
        # Get project for geofences
        project = projects_dict.get(s.project_id)
        
        # Get geofences (from shift or project)
        geofences = get_geofences_for_shift(s, project, db)
        
        result.append({
            "id": str(s.id),
            "project_id": str(s.project_id),
            "worker_id": str(s.worker_id),
            "date": s.date.isoformat(),
            "start_time": s.start_time.isoformat(),
            "end_time": s.end_time.isoformat(),
            "status": s.status,
            "default_break_min": s.default_break_min,
            "geofences": geofences,
            "job_id": str(s.job_id) if s.job_id else None,
            "job_name": s.job_name,
            "created_by": str(s.created_by),
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "project_name": project.name if project else None,
        })
    
    return result


@router.get("/shifts/{shift_id}")
def get_shift(
    shift_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get a single shift by ID."""
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    
    # Check permissions
    if not (is_admin(user, db) or is_supervisor(user, db, str(shift.project_id)) or 
            (is_worker(user, db) and str(shift.worker_id) == str(user.id))):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get project to check for default geofence location
    project = db.query(Project).filter(Project.id == shift.project_id).first()
    
    # Get geofences (from shift or project)
    geofences = get_geofences_for_shift(shift, project, db)
    
    # Get project name
    project_name = project.name if project else None
    
    return {
        "id": str(shift.id),
        "project_id": str(shift.project_id),
        "project_name": project_name,
        "worker_id": str(shift.worker_id),
        "date": shift.date.isoformat(),
        "start_time": shift.start_time.isoformat(),
        "end_time": shift.end_time.isoformat(),
        "status": shift.status,
        "default_break_min": shift.default_break_min,
        "geofences": geofences,
        "job_id": str(shift.job_id) if shift.job_id else None,
        "job_name": shift.job_name,
        "created_by": str(shift.created_by),
        "created_at": shift.created_at.isoformat() if shift.created_at else None,
        "updated_at": shift.updated_at.isoformat() if shift.updated_at else None,
    }


@router.patch("/shifts/{shift_id}")
def update_shift(
    shift_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Update a shift.
    Re-checks for conflicts if times are changed.
    """
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    
    # Check permissions
    if not can_modify_shift(user, shift, db):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Store before state for audit
    before_state = {
        "date": shift.date.isoformat(),
        "start_time": shift.start_time.isoformat(),
        "end_time": shift.end_time.isoformat(),
        "status": shift.status,
        "geofences": shift.geofences,
    }
    
    # Update fields
    updated = False
    new_date = shift.date  # Date is locked - cannot be changed
    new_start_time = shift.start_time
    new_end_time = shift.end_time
    
    # DATE IS LOCKED: Do not allow date changes. If date is in payload, reject it.
    # This ensures data integrity - to change a date, the user must delete and recreate the shift.
    if "date" in payload:
        try:
            requested_date = datetime.fromisoformat(payload["date"].split('T')[0]).date()
            if requested_date != shift.date:
                raise HTTPException(
                    status_code=400,
                    detail="Date cannot be changed. To change the date, delete this shift and create a new one."
                )
            # If date is the same, silently ignore (no error, but no update either)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid date format")
    
    if "start_time" in payload:
        try:
            new_start_time = time.fromisoformat(payload["start_time"])
            shift.start_time = new_start_time
            updated = True
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid start_time format")
    
    if "end_time" in payload:
        try:
            new_end_time = time.fromisoformat(payload["end_time"])
            shift.end_time = new_end_time
            updated = True
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid end_time format")
    
    # WORKER IS LOCKED: Do not allow worker changes. If worker_id is in payload, reject it.
    if "worker_id" in payload:
        requested_worker_id = payload["worker_id"]
        if str(requested_worker_id) != str(shift.worker_id):
            raise HTTPException(
                status_code=400,
                detail="Worker cannot be changed. To change the worker, delete this shift and create a new one."
            )
        # If worker_id is the same, silently ignore (no error, but no update either)
    
    # Update job_type/job_name if provided
    if "job_type" in payload or "job_name" in payload:
        job_value = payload.get("job_type") or payload.get("job_name")
        if job_value:
            shift.job_name = job_value
            # Store job_type as job_id for backward compatibility if it's a known job type
            # For now, we'll just store the name
            updated = True
        elif job_value is None or job_value == "":
            # Allow clearing the job type
            shift.job_name = None
            shift.job_id = None
            updated = True
    
    if "status" in payload:
        shift.status = payload["status"]
        updated = True
    
    if "default_break_min" in payload:
        shift.default_break_min = payload["default_break_min"]
        updated = True
    
    if "geofences" in payload:
        shift.geofences = payload["geofences"]
        updated = True
    
    # If times changed, re-check for conflicts
    if updated and (new_date != shift.date or new_start_time != shift.start_time or new_end_time != shift.end_time):
        if has_overlap(db, str(shift.worker_id), new_date, new_start_time, new_end_time, exclude_shift_id=shift_id):
            conflicts = get_conflicting_shifts(db, str(shift.worker_id), new_date, new_start_time, new_end_time, exclude_shift_id=shift_id)
            raise HTTPException(
                status_code=400,
                detail=f"Worker already has overlapping shift(s)"
            )
    
    from datetime import timezone
    shift.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(shift)
    
    # Get project for geofences and timezone
    project = db.query(Project).filter(Project.id == shift.project_id).first()
    
    # Create audit log
    after_state = {
        "date": shift.date.isoformat(),
        "start_time": shift.start_time.isoformat(),
        "end_time": shift.end_time.isoformat(),
        "status": shift.status,
        "geofences": shift.geofences,
    }
    changes = compute_diff(before_state, after_state)
    
    create_audit_log(
        db=db,
        entity_type="shift",
        entity_id=str(shift.id),
        action="UPDATE",
        actor_id=str(user.id),
        actor_role=get_user_role(user, db),
        source="api",
        changes_json=changes,
        context={
            "project_id": str(shift.project_id),
            "worker_id": str(shift.worker_id),
        }
    )
    
    # Send notification if times changed
    if updated:
        project_timezone = project.timezone if project else settings.tz_default
        send_shift_notification(
            db=db,
            user_id=str(shift.worker_id),
            notification_type="updated",
            shift_data={
                "id": str(shift.id),
                "project_id": str(shift.project_id),
                "date": shift.date.isoformat(),
                "start_time": shift.start_time.isoformat(),
                "end_time": shift.end_time.isoformat(),
            },
            timezone_str=project_timezone
        )
    
    # Get geofences (from shift or project)
    geofences = get_geofences_for_shift(shift, project, db)
    
    return {
        "id": str(shift.id),
        "project_id": str(shift.project_id),
        "worker_id": str(shift.worker_id),
        "date": shift.date.isoformat(),
        "start_time": shift.start_time.isoformat(),
        "end_time": shift.end_time.isoformat(),
        "status": shift.status,
        "default_break_min": shift.default_break_min,
        "geofences": geofences,
        "job_id": str(shift.job_id) if shift.job_id else None,
        "job_name": shift.job_name,
        "updated_at": shift.updated_at.isoformat() if shift.updated_at else None,
    }


@router.delete("/shifts/{shift_id}")
def delete_shift(
    shift_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Delete a shift (hard delete)."""
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    
    # Check permissions
    if not can_modify_shift(user, shift, db):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # NOTE: During testing phase, past date validation is disabled
    # TODO: Re-enable past date validation for production
    # from datetime import date as date_type
    # today = date_type.today()
    # if shift.date < today:
    #     raise HTTPException(
    #         status_code=400,
    #         detail=f"Cannot delete shifts from past dates. Shift date: {shift.date.isoformat()}"
    #     )
    
    # Store data for audit log and notification before deletion
    shift_data = {
        "project_id": str(shift.project_id),
        "worker_id": str(shift.worker_id),
        "date": shift.date.isoformat(),
        "start_time": shift.start_time.isoformat(),
        "end_time": shift.end_time.isoformat(),
    }
    worker_id = str(shift.worker_id)
    project_id = str(shift.project_id)
    
    # Delete the shift (hard delete)
    db.delete(shift)
    db.commit()
    
    # Create audit log
    create_audit_log(
        db=db,
        entity_type="shift",
        entity_id=shift_id,
        action="DELETE",
        actor_id=str(user.id),
        actor_role=get_user_role(user, db),
        source="api",
        changes_json={"before": shift_data},
        context={
            "project_id": project_id,
            "worker_id": worker_id,
        }
    )
    
    # Send notification
    project = db.query(Project).filter(Project.id == project_id).first()
    if project:
        project_timezone = project.timezone if project else settings.tz_default
        send_shift_notification(
            db=db,
            user_id=worker_id,
            notification_type="cancelled",
            shift_data={
                "project_id": project_id,
                "date": shift_data["date"],
            },
            timezone_str=project_timezone
        )
    
    return {"status": "ok"}


# Attendance Management

@router.post("/attendance")
def create_attendance(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Worker clocks in/out.
    Applies 15-min rounding, ±30min tolerance, geofence check.
    Auto-approves if inside geofence AND within tolerance.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"Received attendance request from user {user.id}: {payload}")
    
    try:
        shift_id = payload.get("shift_id")
        if not shift_id:
            logger.error(f"Missing shift_id in payload: {payload}")
            raise HTTPException(status_code=400, detail="shift_id is required")
        
        shift = db.query(Shift).filter(Shift.id == shift_id).first()
        if not shift:
            logger.error(f"Shift not found: {shift_id}")
            raise HTTPException(status_code=404, detail="Shift not found")
        
        # Check if worker owns this shift, or if user is admin/supervisor/on-site lead
        from ..services.permissions import is_admin, is_supervisor
        is_worker_owner = str(shift.worker_id) == str(user.id)
        
        # Check if user is authorized to clock-in/out for this worker
        is_authorized_supervisor = False
        is_admin_user = is_admin(user, db)
        if is_admin_user:
            is_authorized_supervisor = True  # Admin can always do it
            logger.info(f"User {user.id} is admin - authorized to clock-in/out for any worker")
        elif not is_worker_owner:
            # Check if user is direct supervisor of the worker
            worker_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == shift.worker_id).first()
            is_worker_supervisor = worker_profile and worker_profile.manager_user_id and str(worker_profile.manager_user_id) == str(user.id)
            
            # Check if user is on-site lead of the project
            project = db.query(Project).filter(Project.id == shift.project_id).first()
            is_onsite_lead = project and project.onsite_lead_id and str(project.onsite_lead_id) == str(user.id)
            
            is_authorized_supervisor = is_worker_supervisor or is_onsite_lead
            
            logger.info(
                f"Permission check for user {user.id} clock-in/out for worker {shift.worker_id} in project {shift.project_id}: "
                f"is_worker_supervisor={is_worker_supervisor} (worker_profile exists: {worker_profile is not None}, "
                f"manager_user_id: {worker_profile.manager_user_id if worker_profile else None}), "
                f"is_onsite_lead={is_onsite_lead} (project onsite_lead_id: {project.onsite_lead_id if project else None})"
            )
        
        logger.info(f"User {user.id} clock-in/out for shift {shift_id}. Worker owner: {is_worker_owner}, Authorized supervisor: {is_authorized_supervisor}, Is admin: {is_admin_user}")
        
        if not is_worker_owner and not is_authorized_supervisor:
            logger.warning(f"User {user.id} not authorized for shift {shift_id}. Worker: {shift.worker_id}")
            raise HTTPException(
                status_code=403, 
                detail="You can only clock in/out for your own shifts, or if you are the worker's direct supervisor or the on-site lead of this project"
            )
        
        # Allow clock-in/out even if shift is not "scheduled" if:
        # 1. Worker is doing it for their own shift, OR
        # 2. Supervisor/admin is doing it for another worker
        # This allows workers to clock-in/out on rejected or other status shifts
        if shift.status != "scheduled":
            if is_worker_owner or is_authorized_supervisor:
                # Allow clock-in/out for worker's own shift or supervisor actions
                logger.info(f"Allowing clock-in/out on shift {shift_id} with status '{shift.status}' (worker owner: {is_worker_owner}, supervisor: {is_authorized_supervisor})")
            else:
                # Not allowed for other cases
                logger.error(f"Shift {shift_id} is not scheduled. Status: {shift.status}")
                raise HTTPException(status_code=400, detail="Shift is not scheduled")
        
        attendance_type = payload.get("type")  # "in" or "out"
        if attendance_type not in ["in", "out"]:
            logger.error(f"Invalid attendance type: {attendance_type}")
            raise HTTPException(status_code=400, detail="type must be 'in' or 'out'")
        
        # Parse time (local time selected by user)
        time_selected_local_str = payload.get("time_selected_local")
        if not time_selected_local_str:
            logger.error(f"Missing time_selected_local in payload: {payload}")
            raise HTTPException(status_code=400, detail="time_selected_local is required")
        
        try:
            time_selected_local = datetime.fromisoformat(time_selected_local_str.replace('Z', '+00:00'))
        except Exception as e:
            logger.error(f"Invalid time_selected_local format: {time_selected_local_str}. Error: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Invalid time_selected_local format: {time_selected_local_str}")
        
        # Round to 15 minutes
        time_selected_local = round_to_5_minutes(time_selected_local)
        
        # Convert to UTC
        project = db.query(Project).filter(Project.id == shift.project_id).first()
        if not project:
            logger.error(f"Project not found for shift {shift_id}")
            raise HTTPException(status_code=404, detail="Project not found")
        project_timezone = project.timezone if project else settings.tz_default
        
        # Check if user is on-site lead of the project or supervisor of the worker
        is_onsite_lead = project.onsite_lead_id and str(project.onsite_lead_id) == str(user.id)
        
        # Get worker's employee profile to check supervisor
        worker_employee_profile = db.query(EmployeeProfile).filter(
            EmployeeProfile.user_id == shift.worker_id
        ).first()
        is_worker_supervisor = (
            worker_employee_profile and 
            worker_employee_profile.manager_user_id and 
            str(worker_employee_profile.manager_user_id) == str(user.id)
        )
        
        # Auto-approve if user is on-site lead OR worker's supervisor (when doing clock-in/out for another worker)
        is_authorized_for_auto_approval = is_onsite_lead or is_worker_supervisor
        
        logger.info(
            f"Authorization check - On-site lead: {is_onsite_lead}, Worker supervisor: {is_worker_supervisor}, "
            f"Authorized for auto-approval: {is_authorized_for_auto_approval}"
        )
        
        # Ensure time_selected_local is naive for conversion
        if time_selected_local.tzinfo is not None:
            time_selected_local = time_selected_local.replace(tzinfo=None)
        
        time_selected_utc = local_to_utc(time_selected_local, project_timezone)
        # Ensure timezone-aware UTC datetime
        if time_selected_utc.tzinfo is None:
            from pytz import UTC
            time_selected_utc = time_selected_utc.replace(tzinfo=UTC)
        
        # Get current UTC time (timezone-aware)
        from datetime import timezone
        time_entered_utc = datetime.now(timezone.utc)
        
        # Validate: Allow future times with 4 minute margin
        # Check if time_selected_utc is more than 4 minutes in the future
        from datetime import timedelta
        max_future = time_entered_utc + timedelta(minutes=4)
        if time_selected_utc > max_future:
            logger.warning(f"Future time blocked - Selected: {time_selected_utc}, Current: {time_entered_utc}, Max allowed: {max_future}")
            raise HTTPException(
                status_code=400,
                detail="Clock-in/out cannot be more than 4 minutes in the future. Please select a valid time."
            )
        
        # Get GPS data
        gps_lat = payload.get("gps", {}).get("lat") if payload.get("gps") else None
        gps_lng = payload.get("gps", {}).get("lng") if payload.get("gps") else None
        gps_accuracy_m = payload.get("gps", {}).get("accuracy_m") if payload.get("gps") else None
        mocked_flag = payload.get("gps", {}).get("mocked", False) if payload.get("gps") else False
        
        logger.info(f"GPS data - lat: {gps_lat}, lng: {gps_lng}, accuracy: {gps_accuracy_m}")
        
        # Check if clock-in/out is on the same day as TODAY (not shift date)
        # Convert today's date to datetime for comparison (use start of day in project timezone)
        today_local = datetime.now().date()
        today_start = datetime.combine(today_local, time.min)
        today_utc = local_to_utc(today_start, project_timezone)
        if today_utc.tzinfo is None:
            from pytz import UTC
            today_utc = today_utc.replace(tzinfo=UTC)
        
        # Check if selected time is on the same day as TODAY
        is_same_day_as_today = is_same_day(time_selected_utc, today_utc, project_timezone)
        logger.info(f"Date check - Selected time: {time_selected_utc}, Today: {today_local}, Same day as today: {is_same_day_as_today}")
        
        # Also log expected shift time for reference
        expected_datetime_local = combine_date_time(shift.date, shift.start_time if attendance_type == "in" else shift.end_time, project_timezone)
        expected_datetime_utc = local_to_utc(expected_datetime_local.replace(tzinfo=None), project_timezone)
        if expected_datetime_utc.tzinfo is None:
            from pytz import UTC
            expected_datetime_utc = expected_datetime_utc.replace(tzinfo=UTC)
        logger.info(f"Shift time reference - Expected shift time: {expected_datetime_utc}, Selected time: {time_selected_utc}")
        
        # Check geofence - use project location if shift has no geofences
        # NOTE: Location is captured but NOT mandatory - it doesn't block clock-in/out or require approval
        project = db.query(Project).filter(Project.id == shift.project_id).first()
        geofences_to_check = get_geofences_for_shift(shift, project, db)
        
        inside_geo = True  # Default: allow if no geofences
        geo_risk = False
        if geofences_to_check and len(geofences_to_check) > 0:
            # Geofences are defined, so we check location (but don't require it)
            if gps_lat and gps_lng:
                inside_geo, matching_geofence, geo_risk = inside_geofence(
                    float(gps_lat),
                    float(gps_lng),
                    geofences_to_check,
                    gps_accuracy_m
                )
                logger.info(f"Location check - Inside geofence: {inside_geo}, Geo risk: {geo_risk} (location is captured but not mandatory)")
            else:
                # No GPS data - location not captured, but that's OK (not mandatory)
                inside_geo = False
                geo_risk = True
                logger.info("No GPS data available (location is captured but not mandatory)")
        else:
            # No geofences defined - location validation not required
            inside_geo = True
            geo_risk = False
            logger.info("No geofences defined - location validation not required")
        
        # Get reason_text from payload
        reason_text = payload.get("reason_text", "").strip() if payload.get("reason_text") else ""
        logger.info(f"Reason text length: {len(reason_text)}, Min required: {settings.require_reason_min_chars}")
        
        # Determine worker_id: always use shift's worker_id (the worker assigned to the shift)
        # This ensures that attendance is recorded for the correct worker, whether it's the worker
        # themselves or an admin/supervisor doing it on their behalf
        worker_id = str(shift.worker_id)
        
        # Determine source: "supervisor" if admin/supervisor doing it for another worker, "app" if worker doing it themselves
        source = "supervisor" if (is_authorized_supervisor and not is_worker_owner) else "app"
        
        # If supervisor is doing it for another worker, ALWAYS require reason_text
        if is_authorized_supervisor and not is_worker_owner:
            if not reason_text or len(reason_text) < settings.require_reason_min_chars:
                logger.error(f"Supervisor clock-in/out requires reason text. Provided length: {len(reason_text)}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Reason text is required (minimum {settings.require_reason_min_chars} characters) when supervisor clocks in/out for a worker"
                )
        
        # Determine status
        # NEW RULES:
        # - Location is captured but NOT mandatory (doesn't block or require approval)
        # - Time range is now "same day" instead of ±30 minutes
        # - Status is PENDING only if clock-in/out is on a different day than the shift date
        # - Reason is required ONLY when supervisor clocks in/out for another worker
        if is_worker_owner:
            # Worker doing clock-in/out on their own shift
            # If worker is on-site lead of the project, auto-approve immediately
            if is_onsite_lead:
                status = "approved"
                logger.info(f"Status: APPROVED (worker's own shift - on-site lead) - auto-approved")
            elif is_same_day_as_today:
                # Clock-in/out is on the same day as TODAY → auto-approve
                # Location is captured but not mandatory
                status = "approved"
                logger.info(f"Status: APPROVED (worker's own shift - same day as today) - inside_geo={inside_geo}, geo_risk={geo_risk} (location captured but not mandatory)")
            else:
                # Clock-in/out is on a different day than TODAY → pending (requires supervisor approval)
                status = "pending"
                logger.info(f"Status: PENDING (worker's own shift - different day than today) - Selected date: {time_selected_utc.date()}, Today: {today_local}")
        elif is_authorized_supervisor and not is_worker_owner:
            # Supervisor doing clock-in/out for another worker
            # Reason is already checked above and is mandatory
            # Check if user is on-site lead OR worker's supervisor - if so, auto-approve
            if is_authorized_for_auto_approval:
                # On-site lead or worker's supervisor: auto-approve immediately (reason_text already checked above)
                status = "approved"
                logger.info(
                    f"Status: APPROVED (on-site lead or worker supervisor action - "
                    f"on-site lead: {is_onsite_lead}, worker supervisor: {is_worker_supervisor}, "
                    f"same_day: {is_same_day_as_today}, inside_geo={inside_geo}, geo_risk={geo_risk})"
                )
            elif is_same_day_as_today:
                # Other supervisor actions: auto-approve if same day as today (reason already checked above)
                status = "approved"
                logger.info(f"Status: APPROVED (supervisor action - same day as today, reason provided)")
            else:
                # Different day from today: status is pending (reason already checked above)
                status = "pending"
                logger.info(f"Status: PENDING (supervisor action - different day than today)")
        else:
            # Fallback (should not reach here due to authorization check above)
            status = "pending"
            logger.warning(f"Status: pending (fallback case)")
        
        # Create attendance record
        # Safely convert GPS values to float
        gps_lat_float = None
        gps_lng_float = None
        gps_accuracy_float = None
        
        if gps_lat is not None:
            try:
                gps_lat_float = float(gps_lat)
            except (ValueError, TypeError) as e:
                logger.warning(f"Invalid gps_lat value: {gps_lat}, error: {str(e)}")
        
        if gps_lng is not None:
            try:
                gps_lng_float = float(gps_lng)
            except (ValueError, TypeError) as e:
                logger.warning(f"Invalid gps_lng value: {gps_lng}, error: {str(e)}")
        
        if gps_accuracy_m is not None:
            try:
                gps_accuracy_float = float(gps_accuracy_m)
            except (ValueError, TypeError) as e:
                logger.warning(f"Invalid gps_accuracy_m value: {gps_accuracy_m}, error: {str(e)}")
        
        # NEW MODEL: Single record per event (clock_in_time and clock_out_time in same record)
        if attendance_type == "in":
            # Check for conflicts before creating attendance
            from ..routes.settings import check_attendance_conflict
            conflict_error = check_attendance_conflict(
                db, worker_id, time_selected_utc, None, exclude_attendance_id=None, timezone_str=project_timezone
            )
            if conflict_error:
                logger.warning(f"Attendance conflict detected: {conflict_error}")
                raise HTTPException(
                    status_code=400,
                    detail=conflict_error  # Message already includes "Cannot create attendance:" prefix
                )
            
            # Create new attendance record with clock-in (break_minutes will be calculated when clock-out is added)
            attendance = Attendance(
                shift_id=shift_id,
                worker_id=worker_id,
                clock_in_time=time_selected_utc,
                clock_in_entered_utc=time_entered_utc,
                clock_in_gps_lat=gps_lat_float,
                clock_in_gps_lng=gps_lng_float,
                clock_in_gps_accuracy_m=gps_accuracy_float,
                clock_in_mocked_flag=mocked_flag,
                clock_out_time=None,
                clock_out_entered_utc=None,
                status=status,
                source=source,
                created_by=user.id,
                reason_text=reason_text if reason_text else None,
                attachments=payload.get("attachments"),
                break_minutes=None,  # Will be calculated when clock-out is added
                # Legacy fields (required for database NOT NULL constraint)
                mocked_flag=mocked_flag,
            )
            db.add(attendance)
            db.commit()
            db.refresh(attendance)
        else:  # attendance_type == "out"
            # Find the most recent clock-in for this shift without a clock-out
            existing_attendance = db.query(Attendance).filter(
                Attendance.shift_id == shift_id,
                Attendance.worker_id == worker_id,
                Attendance.clock_in_time.isnot(None),
                Attendance.clock_out_time.is_(None)
            ).order_by(Attendance.clock_in_time.desc()).first()
            
            if existing_attendance:
                # Check for conflicts before updating with clock-out
                from ..routes.settings import check_attendance_conflict
                conflict_error = check_attendance_conflict(
                    db, worker_id, existing_attendance.clock_in_time, time_selected_utc, exclude_attendance_id=existing_attendance.id, timezone_str=project_timezone
                )
                if conflict_error:
                    logger.warning(f"Attendance conflict detected: {conflict_error}")
                    raise HTTPException(
                        status_code=400,
                        detail=conflict_error  # Message already includes "Cannot create attendance:" prefix
                    )
                
                # Update existing attendance record with clock-out
                existing_attendance.clock_out_time = time_selected_utc
                existing_attendance.clock_out_entered_utc = time_entered_utc
                existing_attendance.clock_out_gps_lat = gps_lat_float
                existing_attendance.clock_out_gps_lng = gps_lng_float
                existing_attendance.clock_out_gps_accuracy_m = gps_accuracy_float
                existing_attendance.clock_out_mocked_flag = mocked_flag
                # Calculate break minutes now that we have both times
                if existing_attendance.clock_in_time and time_selected_utc:
                    existing_attendance.break_minutes = _calculate_break_minutes(
                        db, existing_attendance.worker_id, existing_attendance.clock_in_time, time_selected_utc
                    )
                # Update status if needed (use the more restrictive status)
                if status == "pending" or existing_attendance.status == "pending":
                    existing_attendance.status = "pending"
                else:
                    existing_attendance.status = status
                # Update reason_text if provided
                if reason_text:
                    existing_attendance.reason_text = reason_text
                attendance = existing_attendance
                db.commit()
                db.refresh(attendance)
            else:
                # No matching clock-in found - check for conflicts before creating new record with only clock-out
                from ..routes.settings import check_attendance_conflict
                conflict_error = check_attendance_conflict(
                    db, worker_id, None, time_selected_utc, exclude_attendance_id=None, timezone_str=project_timezone
                )
                if conflict_error:
                    logger.warning(f"Attendance conflict detected: {conflict_error}")
                    raise HTTPException(
                        status_code=400,
                        detail=conflict_error  # Message already includes "Cannot create attendance:" prefix
                    )
                
                # No matching clock-in found - create new record with only clock-out
                # This shouldn't normally happen, but handle gracefully
                attendance = Attendance(
                    shift_id=shift_id,
                    worker_id=worker_id,
                    clock_in_time=None,
                    clock_in_entered_utc=None,
                    clock_out_time=time_selected_utc,
                    clock_out_entered_utc=time_entered_utc,
                    clock_out_gps_lat=gps_lat_float,
                    clock_out_gps_lng=gps_lng_float,
                    clock_out_gps_accuracy_m=gps_accuracy_float,
                    clock_out_mocked_flag=mocked_flag,
                    status=status,
                    source=source,
                    created_by=user.id,
                    reason_text=reason_text if reason_text else None,
                    attachments=payload.get("attachments"),
                    # Legacy fields (required for database NOT NULL constraint)
                    mocked_flag=mocked_flag,
                )
                db.add(attendance)
                db.commit()
                db.refresh(attendance)
        
        logger.info(f"Attendance created: {attendance.id}, Status: {attendance.status}")
        
        # If status is pending, send notification to worker's supervisor
        if status == "pending":
            # Get worker's supervisor
            worker_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == worker_id).first()
            if worker_profile and worker_profile.manager_user_id:
                supervisor_id = worker_profile.manager_user_id
                logger.info(f"Sending pending attendance notification to supervisor {supervisor_id} for worker {worker_id}")
                
                # Get project timezone for notification
                project = db.query(Project).filter(Project.id == shift.project_id).first()
                project_timezone = project.timezone if project else settings.tz_default
                worker_user = db.query(User).filter(User.id == worker_id).first()
                worker_name = worker_user.username if worker_user else "Employee"
                if worker_profile:
                    name = (worker_profile.preferred_name or "").strip()
                    if not name:
                        first = (worker_profile.first_name or "").strip()
                        last = (worker_profile.last_name or "").strip()
                        full = " ".join(part for part in [first, last] if part)
                        if full:
                            name = full
                    if name:
                        worker_name = name
                date_str = attendance.time_selected_utc.strftime("%Y-%m-%d") if attendance.time_selected_utc else datetime.utcnow().strftime("%Y-%m-%d")

                # Send notification to supervisor
                send_attendance_notification(
                    db=db,
                    user_id=str(supervisor_id),
                    notification_type="pending",
                    attendance_data={
                        "id": str(attendance.id),
                        "type": attendance_type,
                        "status": status,
                        "worker_id": worker_id,
                        "shift_id": shift_id,
                        "project_id": str(shift.project_id),
                        "time_selected_utc": attendance.time_selected_utc.isoformat() if attendance.time_selected_utc else None,
                    },
                    timezone_str=project_timezone
                )

                # Create actionable task for supervisor review
                try:
                    create_task_item(
                        db,
                        title=f"Approve attendance for {worker_name} – {date_str}",
                        description=f"Review and approve attendance record for {worker_name} on {date_str}",
                        requested_by_id=user.id,
                        assigned_to_id=supervisor_id,
                        priority="normal",
                        due_date=None,
                        project_id=shift.project_id,
                        origin_type="system_attendance",
                        origin_reference=f"Attendance {str(attendance.id)[:8]}",
                        origin_id=str(attendance.id),
                    )
                    db.commit()
                except Exception as exc:
                    logger.error(f"Failed to create attendance task for supervisor {supervisor_id}: {exc}")
                    db.rollback()
        
        # Create audit log
        # Determine actor role (we already have is_authorized_supervisor, but need to check admin vs supervisor)
        actor_role = "worker"
        if is_admin(user, db):
            actor_role = "admin"
        elif is_supervisor(user, db):
            actor_role = "supervisor"
        
        create_audit_log(
            db=db,
            entity_type="attendance",
            entity_id=str(attendance.id),
            action="CLOCK_IN" if attendance_type == "in" else "CLOCK_OUT",
            actor_id=str(user.id),
            actor_role=actor_role,
            source=source,
            context={
                "project_id": str(shift.project_id),
                "worker_id": worker_id,
                "shift_id": shift_id,
                "gps_lat": gps_lat,
                "gps_lng": gps_lng,
                "gps_accuracy_m": gps_accuracy_m,
                "mocked_flag": mocked_flag,
                "reason_text": reason_text,
                "inside_geofence": inside_geo,
                "same_day_as_today": is_same_day_as_today,
                "status": status,
                "created_by_supervisor": is_authorized_supervisor and not is_worker_owner,
            }
        )
        
        # If approved, create/update timesheet entry
        if status == "approved":
            _create_or_update_timesheet_from_attendance(db, attendance, shift, project_timezone, inside_geo)
        
        return {
            "id": str(attendance.id),
            "shift_id": str(attendance.shift_id),
            "worker_id": str(attendance.worker_id),
            "type": attendance_type,  # Return the type that was requested
            "clock_in_time": attendance.clock_in_time.isoformat() if attendance.clock_in_time else None,
            "clock_out_time": attendance.clock_out_time.isoformat() if attendance.clock_out_time else None,
            "time_selected_utc": (attendance.clock_in_time if attendance_type == "in" else attendance.clock_out_time).isoformat() if (attendance.clock_in_time if attendance_type == "in" else attendance.clock_out_time) else None,
            "status": attendance.status,
            "reason_text": attendance.reason_text,
            "inside_geofence": inside_geo,
            "same_day_as_today": is_same_day_as_today,
            "gps_risk": geo_risk,
        }
    except HTTPException as e:
        # Re-raise HTTPException with detailed logging
        logger.error(f"HTTPException in create_attendance: {e.status_code} - {e.detail}")
        raise
    except Exception as e:
        # Log unexpected errors with full traceback
        logger.error(f"Unexpected error in create_attendance: {str(e)}", exc_info=True)
        logger.error(f"Payload that caused error: {payload}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/attendance/supervisor")
def create_attendance_supervisor(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Supervisor clocks in/out on behalf of worker.
    Requires reason_text ALWAYS.
    Auto-approves only if supervisor is on-site and within tolerance.
    
    Permission rules:
    - User must be admin, OR
    - User must be direct supervisor of the worker (can clock-in/out in any project), OR
    - User must be on-site lead of the project where the shift is registered (can clock-in/out for any worker with shift in that project)
    """
    shift_id = payload.get("shift_id")
    if not shift_id:
        raise HTTPException(status_code=400, detail="shift_id is required")
    
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    
    worker_id = payload.get("worker_id")
    if not worker_id:
        raise HTTPException(status_code=400, detail="worker_id is required")
    
    # Check permissions: Admin can always do it
    is_admin_user = is_admin(user, db)
    if is_admin_user:
        logger.info(f"User {user.id} is admin - authorized to clock-in/out for any worker")
    else:
        # Check if user is direct supervisor of the worker
        worker_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == worker_id).first()
        is_worker_supervisor = worker_profile and worker_profile.manager_user_id and str(worker_profile.manager_user_id) == str(user.id)
        
        # Check if user is on-site lead of the project
        project = db.query(Project).filter(Project.id == shift.project_id).first()
        is_onsite_lead = project and project.onsite_lead_id and str(project.onsite_lead_id) == str(user.id)
        
        logger.info(
            f"Permission check for user {user.id} clock-in/out for worker {worker_id} in project {shift.project_id}: "
            f"is_worker_supervisor={is_worker_supervisor} (worker_profile exists: {worker_profile is not None}, "
            f"manager_user_id: {worker_profile.manager_user_id if worker_profile else None}), "
            f"is_onsite_lead={is_onsite_lead} (project onsite_lead_id: {project.onsite_lead_id if project else None})"
        )
        
        if not (is_worker_supervisor or is_onsite_lead):
            raise HTTPException(
                status_code=403,
                detail="You can only clock-in/out for workers if you are their direct supervisor or the on-site lead of this project"
            )
    
    # If worker doesn't match shift, find or use a shift for that worker on the same date
    if str(shift.worker_id) != worker_id:
        # Find a shift for the selected worker on the same date
        worker_shift = db.query(Shift).filter(
            Shift.project_id == shift.project_id,
            Shift.worker_id == worker_id,
            Shift.date == shift.date,
            Shift.status == "scheduled"
        ).first()
        
        if not worker_shift:
            raise HTTPException(
                status_code=400, 
                detail=f"Worker {worker_id} does not have a scheduled shift on {shift.date.isoformat()} for this project"
            )
        
        # Use the worker's shift instead
        shift = worker_shift
    
    attendance_type = payload.get("type")
    if attendance_type not in ["in", "out"]:
        raise HTTPException(status_code=400, detail="type must be 'in' or 'out'")
    
    # Require reason_text ALWAYS for supervisor entries
    reason_text = payload.get("reason_text")
    if not reason_text or len(reason_text.strip()) < settings.require_reason_min_chars:
        raise HTTPException(
            status_code=400,
            detail=f"reason_text is required (minimum {settings.require_reason_min_chars} characters) for supervisor entries"
        )
    
    # Parse time
    time_selected_local_str = payload.get("time_selected_local")
    if not time_selected_local_str:
        raise HTTPException(status_code=400, detail="time_selected_local is required")
    
    try:
        time_selected_local = datetime.fromisoformat(time_selected_local_str.replace('Z', '+00:00'))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid time_selected_local format")
    
    # Round to 5 minutes
    time_selected_local = round_to_5_minutes(time_selected_local)
    
    # Convert to UTC
    project = db.query(Project).filter(Project.id == shift.project_id).first()
    project_timezone = project.timezone if project else settings.tz_default
    
    # Ensure time_selected_local is naive for conversion
    if time_selected_local.tzinfo is not None:
        time_selected_local = time_selected_local.replace(tzinfo=None)
    
    time_selected_utc = local_to_utc(time_selected_local, project_timezone)
    # Ensure timezone-aware UTC datetime
    if time_selected_utc.tzinfo is None:
        from pytz import UTC
        time_selected_utc = time_selected_utc.replace(tzinfo=UTC)
    
    # Get current UTC time (timezone-aware)
    from datetime import timezone
    time_entered_utc = datetime.now(timezone.utc)
    
    # Get GPS data (supervisor's location)
    gps_lat = payload.get("gps", {}).get("lat") if payload.get("gps") else None
    gps_lng = payload.get("gps", {}).get("lng") if payload.get("gps") else None
    gps_accuracy_m = payload.get("gps", {}).get("accuracy_m") if payload.get("gps") else None
    mocked_flag = payload.get("gps", {}).get("mocked", False) if payload.get("gps") else False
    
    # Get expected time
    expected_datetime_local = combine_date_time(shift.date, shift.start_time if attendance_type == "in" else shift.end_time, project_timezone)
    expected_datetime_utc = local_to_utc(expected_datetime_local.replace(tzinfo=None), project_timezone)
    # Ensure timezone-aware
    if expected_datetime_utc.tzinfo is None:
        from pytz import UTC
        expected_datetime_utc = expected_datetime_utc.replace(tzinfo=UTC)
    
    # Check if clock-in/out is on the same day as TODAY (not shift date)
    today_local = datetime.now().date()
    today_start = datetime.combine(today_local, time.min)
    today_utc = local_to_utc(today_start, project_timezone)
    if today_utc.tzinfo is None:
        from pytz import UTC
        today_utc = today_utc.replace(tzinfo=UTC)
    
    is_same_day_as_today = is_same_day(time_selected_utc, today_utc, project_timezone)
    
    # Check geofence (supervisor's location) - use project location if shift has no geofences
    # NOTE: Location is captured but NOT mandatory - it doesn't block clock-in/out or require approval
    project = db.query(Project).filter(Project.id == shift.project_id).first()
    geofences_to_check = get_geofences_for_shift(shift, project, db)
    
    inside_geo = False
    geo_risk = False
    if geofences_to_check and len(geofences_to_check) > 0:
        if gps_lat and gps_lng:
            inside_geo, _, geo_risk = inside_geofence(
                float(gps_lat),
                float(gps_lng),
                geofences_to_check,
                gps_accuracy_m
            )
        else:
            # No GPS data - location not captured, but that's OK (not mandatory)
            inside_geo = False
            geo_risk = True
    else:
        # No geofences - location validation not required
        inside_geo = True
        geo_risk = False
    
    # Determine status
    # NEW RULES: Status is PENDING only if clock-in/out is on a different day than TODAY
    # Location is captured but not mandatory
    if is_same_day_as_today:
        status = "approved"
    else:
        status = "pending"
    
    # Create attendance record
    attendance = Attendance(
        shift_id=shift_id,
        worker_id=worker_id,
        type=attendance_type,
        time_entered_utc=time_entered_utc,
        time_selected_utc=time_selected_utc,  # Fixed: use time_selected_utc instead of time_selected_utc_naive
        status=status,
        source="supervisor",
        created_by=user.id,
        reason_text=reason_text,
        gps_lat=float(gps_lat) if gps_lat else None,
        gps_lng=float(gps_lng) if gps_lng else None,
        gps_accuracy_m=float(gps_accuracy_m) if gps_accuracy_m else None,
        mocked_flag=False,
        attachments=payload.get("attachments"),
    )
    
    db.add(attendance)
    db.commit()
    db.refresh(attendance)
    
    # Create audit log
    create_audit_log(
        db=db,
        entity_type="attendance",
        entity_id=str(attendance.id),
        action="CLOCK_IN" if attendance_type == "in" else "CLOCK_OUT",
        actor_id=str(user.id),
        actor_role=get_user_role(user, db),
        source="supervisor",
        context={
            "project_id": str(shift.project_id),
            "worker_id": worker_id,
            "shift_id": shift_id,
            "gps_lat": gps_lat,
            "gps_lng": gps_lng,
            "gps_accuracy_m": gps_accuracy_m,
            "reason_text": reason_text,
            "inside_geofence": inside_geo,
            "same_day_as_today": is_same_day_as_today,
            "status": status,
        }
    )
    
    # Send notification to worker
    send_attendance_notification(
        db=db,
        user_id=worker_id,
        notification_type="created",
        attendance_data={
            "id": str(attendance.id),
            "type": attendance_type,
            "status": status,
            "source": "supervisor",
        },
        timezone_str=project_timezone
    )
    
    # If status is pending, send notification to worker's supervisor
    if status == "pending":
        # Get worker's supervisor
        worker_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == worker_id).first()
        if worker_profile and worker_profile.manager_user_id:
            supervisor_id = str(worker_profile.manager_user_id)
            logger.info(f"Sending pending attendance notification to supervisor {supervisor_id} for worker {worker_id}")
            
            # Send notification to supervisor
            send_attendance_notification(
                db=db,
                user_id=supervisor_id,
                notification_type="pending",
                attendance_data={
                    "id": str(attendance.id),
                    "type": attendance_type,
                    "status": status,
                    "worker_id": worker_id,
                    "shift_id": shift_id,
                    "project_id": str(shift.project_id),
                    "time_selected_utc": attendance.time_selected_utc.isoformat() if attendance.time_selected_utc else None,
                },
                timezone_str=project_timezone
            )
    
    return {
        "id": str(attendance.id),
        "shift_id": str(attendance.shift_id),
        "worker_id": str(attendance.worker_id),
        "type": attendance.type,
        "time_selected_utc": attendance.time_selected_utc.isoformat(),
        "status": attendance.status,
        "source": attendance.source,
        "reason_text": attendance.reason_text,
    }


@router.post("/attendance/direct")
def create_direct_attendance(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Create attendance directly WITHOUT any shift or project.
    This is completely independent from scheduled shifts.
    Just records the hours worked.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"Received direct attendance request from user {user.id}: {payload}")
    
    try:
        attendance_type = payload.get("type")  # "in" or "out"
        if attendance_type not in ["in", "out"]:
            logger.error(f"Invalid attendance type: {attendance_type}")
            raise HTTPException(status_code=400, detail="type must be 'in' or 'out'")
        
        # Parse time (local time selected by user)
        time_selected_local_str = payload.get("time_selected_local")
        if not time_selected_local_str:
            logger.error(f"Missing time_selected_local in payload: {payload}")
            raise HTTPException(status_code=400, detail="time_selected_local is required")
        
        try:
            time_selected_local = datetime.fromisoformat(time_selected_local_str.replace('Z', '+00:00'))
        except Exception as e:
            logger.error(f"Invalid time_selected_local format: {time_selected_local_str}. Error: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Invalid time_selected_local format: {time_selected_local_str}")
        
        # Round to 15 minutes
        time_selected_local = round_to_5_minutes(time_selected_local)
        
        # Convert to UTC (use default timezone)
        from ..services.time_rules import local_to_utc
        time_selected_utc = local_to_utc(time_selected_local.replace(tzinfo=None), settings.tz_default)
        if time_selected_utc.tzinfo is None:
            from pytz import UTC
            time_selected_utc = time_selected_utc.replace(tzinfo=UTC)
        
        # Get worker_id (default to current user)
        worker_id = payload.get("worker_id", str(user.id))
        if str(worker_id) != str(user.id) and not is_admin(user, db):
            raise HTTPException(status_code=403, detail="You can only create direct attendance for yourself")
        
        # Validate worker exists
        worker = db.query(User).filter(User.id == worker_id).first()
        if not worker:
            raise HTTPException(status_code=404, detail="Worker not found")
        
        # Get job_type (required for direct attendance)
        job_type = payload.get("job_type")
        if not job_type:
            raise HTTPException(status_code=400, detail="job_type is required for direct attendance")
        
        # Get date from time_selected_local
        attendance_date = time_selected_local.date()
        
        # For clock-out: check if there's an open clock-in (same date, same job_type, NO shift, without a clock-out)
        # NEW MODEL: Look for attendance records with clock_in_time but no clock_out_time
        clock_in_attendance = None
        if attendance_type == "out":
            # Find attendance records with clock-in but no clock-out, matching job_type
            date_start = datetime.combine(attendance_date, time.min).replace(tzinfo=timezone.utc)
            date_end = datetime.combine(attendance_date + timedelta(days=1), time.min).replace(tzinfo=timezone.utc)
            
            open_attendances = db.query(Attendance).filter(
                Attendance.shift_id.is_(None),  # No shift - direct attendance
                Attendance.worker_id == worker_id,
                Attendance.clock_in_time.isnot(None),
                Attendance.clock_out_time.is_(None),
                Attendance.clock_in_time >= date_start,
                Attendance.clock_in_time < date_end
            ).order_by(Attendance.clock_in_time.desc()).all()  # Get most recent first
            
            # Filter by job_type stored in reason_text
            # Format: "JOB_TYPE:{job_type}|{reason}" or just "JOB_TYPE:{job_type}"
            for att in open_attendances:
                reason = att.reason_text or ""
                if reason.startswith("JOB_TYPE:"):
                    parts = reason.split("|")
                    job_marker = parts[0]
                    att_job_type = job_marker.replace("JOB_TYPE:", "")
                    if att_job_type == job_type:
                        clock_in_attendance = att
                        break
            
            if not clock_in_attendance:
                raise HTTPException(
                    status_code=400,
                    detail=f"You must clock in first before clocking out. No open clock-in found for this date with job type '{job_type}'."
                )
        
        # For clock-in: allow multiple clock-ins per day (no check for existing)
        # For clock-out: we already verified there's an open clock-in above
        
        # Determine status: auto-approve if today, pending if past date
        from datetime import date as date_type
        today = date_type.today()
        is_today = attendance_date == today
        
        status = "approved" if is_today else "pending"
        
        # Get GPS location if provided
        gps = payload.get("gps", {})
        gps_lat = gps.get("lat") if gps else None
        gps_lng = gps.get("lng") if gps else None
        gps_accuracy_m = gps.get("accuracy_m") if gps else None
        
        # Store job_type in reason_text as a marker (since we don't have a separate field)
        # Format: "JOB_TYPE:{job_type}" if reason_text is empty, otherwise append
        reason_text = payload.get("reason_text", "").strip() if payload.get("reason_text") else ""
        job_marker = f"JOB_TYPE:{job_type}"
        if reason_text:
            final_reason = f"{job_marker}|{reason_text}"
        else:
            final_reason = job_marker
        
        # NEW MODEL: Single record per event
        time_entered_utc = datetime.now(timezone.utc)
        
        if attendance_type == "in":
            # Check for conflicts before creating attendance
            from ..routes.settings import check_attendance_conflict
            conflict_error = check_attendance_conflict(
                db, uuid.UUID(worker_id), time_selected_utc, None, exclude_attendance_id=None, timezone_str=settings.tz_default
            )
            if conflict_error:
                logger.warning(f"Attendance conflict detected: {conflict_error}")
                raise HTTPException(
                    status_code=400,
                    detail=conflict_error  # Message already includes "Cannot create attendance:" prefix
                )
            
            # Create new attendance record with clock-in
            attendance = Attendance(
                shift_id=None,  # NO SHIFT - completely independent
                worker_id=worker_id,
                clock_in_time=time_selected_utc,
                clock_in_entered_utc=time_entered_utc,
                clock_in_gps_lat=gps_lat,
                clock_in_gps_lng=gps_lng,
                clock_in_gps_accuracy_m=gps_accuracy_m,
                clock_in_mocked_flag=gps.get("mocked", False) if gps else False,
                clock_out_time=None,
                clock_out_entered_utc=None,
                status=status,
                source="app",
                created_by=user.id,
                reason_text=final_reason,  # Store job_type here as marker
                # Legacy fields (required for database NOT NULL constraint)
                mocked_flag=gps.get("mocked", False) if gps else False,
            )
            # Auto-approve if today
            if status == "approved":
                attendance.approved_at = time_entered_utc
                attendance.approved_by = user.id
            db.add(attendance)
            db.commit()
            db.refresh(attendance)
        else:  # attendance_type == "out"
            # Check for conflicts before updating with clock-out
            from ..routes.settings import check_attendance_conflict
            conflict_error = check_attendance_conflict(
                db, uuid.UUID(worker_id), clock_in_attendance.clock_in_time, time_selected_utc, exclude_attendance_id=clock_in_attendance.id, timezone_str=settings.tz_default
            )
            if conflict_error:
                logger.warning(f"Attendance conflict detected: {conflict_error}")
                raise HTTPException(
                    status_code=400,
                    detail=conflict_error  # Message already includes "Cannot create attendance:" prefix
                )
            
            # Update existing attendance record with clock-out
            clock_in_attendance.clock_out_time = time_selected_utc
            clock_in_attendance.clock_out_entered_utc = time_entered_utc
            clock_in_attendance.clock_out_gps_lat = gps_lat
            clock_in_attendance.clock_out_gps_lng = gps_lng
            clock_in_attendance.clock_out_gps_accuracy_m = gps_accuracy_m
            clock_in_attendance.clock_out_mocked_flag = False
            # Update status if needed (use the more restrictive status)
            if status == "pending" or clock_in_attendance.status == "pending":
                clock_in_attendance.status = "pending"
            else:
                clock_in_attendance.status = status
            # Update reason_text if provided (preserve job_type marker)
            if reason_text:
                # Preserve job_type marker, update reason part
                existing_reason = clock_in_attendance.reason_text or ""
                if existing_reason.startswith("JOB_TYPE:"):
                    parts = existing_reason.split("|", 1)
                    if len(parts) > 1:
                        clock_in_attendance.reason_text = f"{parts[0]}|{reason_text}"
                    else:
                        clock_in_attendance.reason_text = f"{parts[0]}|{reason_text}"
                else:
                    clock_in_attendance.reason_text = final_reason
            # Auto-approve if today and not already approved
            if status == "approved" and clock_in_attendance.status == "approved":
                if not clock_in_attendance.approved_at:
                    clock_in_attendance.approved_at = time_entered_utc
                    clock_in_attendance.approved_by = user.id
            attendance = clock_in_attendance
            db.commit()
            db.refresh(attendance)
        
        logger.info(f"Direct attendance created (NO SHIFT): {attendance.id}, Status: {attendance.status}, Job: {job_type}")
        
        # If pending and past date, create task for supervisor
        if status == "pending":
            worker_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == worker_id).first()
            supervisor_id = worker_profile.manager_user_id if worker_profile else None
            
            if supervisor_id:
                try:
                    worker_name = worker_profile.preferred_name or f"{worker_profile.first_name or ''} {worker_profile.last_name or ''}".strip() or "Worker"
                    date_str = attendance_date.strftime("%Y-%m-%d")
                    create_task_item(
                        db=db,
                        user_id=str(supervisor_id),
                        title=f"Approve attendance for {worker_name} – {date_str}",
                        description=f"Review and approve {attendance_type} attendance record for {worker_name} on {date_str} (Non-scheduled)",
                        priority="medium",
                        origin_type="system_attendance",
                        origin_id=str(attendance.id),
                        origin_reference=f"Attendance {str(attendance.id)[:8]}",
                    )
                    logger.info(f"Created task for supervisor {supervisor_id} for attendance {attendance.id}")
                except Exception as exc:
                    logger.error(f"Failed to create task for supervisor: {exc}")
        
        # Create audit log
        create_audit_log(
            db=db,
            entity_type="attendance",
            entity_id=str(attendance.id),
            action="CLOCK_IN" if attendance_type == "in" else "CLOCK_OUT",
            actor_id=str(user.id),
            actor_role=get_user_role(user, db),
            source="app",
            changes_json={"after": {
                "worker_id": str(worker_id),
                "shift_id": None,  # No shift
                "type": attendance_type,
                "time_selected_utc": time_selected_utc.isoformat(),
                "status": status,
                "job_type": job_type,
            }},
            context={
                "worker_id": str(worker_id),
                "shift_id": None,
                "job_type": job_type,
                "direct_attendance": True,
            }
        )
        
        return {
            "id": str(attendance.id),
            "attendance_id": str(attendance.id),
            "shift_id": None,  # No shift
            "worker_id": str(worker_id),
            "type": attendance_type,  # Return the type that was requested
            "clock_in_time": attendance.clock_in_time.isoformat() if attendance.clock_in_time else None,
            "clock_out_time": attendance.clock_out_time.isoformat() if attendance.clock_out_time else None,
            "time_selected_utc": (attendance.clock_in_time if attendance_type == "in" else attendance.clock_out_time).isoformat() if (attendance.clock_in_time if attendance_type == "in" else attendance.clock_out_time) else None,
            "status": attendance.status,
            "source": attendance.source,
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in create_direct_attendance: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# Predefined jobs dict for mapping
PREDEFINED_JOBS_DICT = {
    "0": "No Project Assigned",
    "37": "Repairs",
    "47": "Shop",
    "53": "YPK Developments",
    "136": "Stat Holiday",
}

@router.get("/attendance/direct/{date}")
def get_direct_attendances_for_date(
    date: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Get direct attendances (no shift) for a specific date.
    Returns clock-in and clock-out records that are not associated with any shift.
    """
    try:
        attendance_date = datetime.fromisoformat(date).date()
    except:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    # Get all direct attendances (no shift) for this date
    # NEW MODEL: Query by clock_in_time or clock_out_time
    date_start = datetime.combine(attendance_date, time.min).replace(tzinfo=timezone.utc)
    date_end = datetime.combine(attendance_date + timedelta(days=1), time.min).replace(tzinfo=timezone.utc)
    
    attendances = db.query(Attendance).filter(
        Attendance.shift_id.is_(None),  # No shift - direct attendance
        Attendance.worker_id == user.id,
        or_(
            and_(
                Attendance.clock_in_time.isnot(None),
                Attendance.clock_in_time >= date_start,
                Attendance.clock_in_time < date_end
            ),
            and_(
                Attendance.clock_in_time.is_(None),
                Attendance.clock_out_time.isnot(None),
                Attendance.clock_out_time >= date_start,
                Attendance.clock_out_time < date_end
            )
        )
    ).order_by(
        func.coalesce(Attendance.clock_in_time, Attendance.clock_out_time).asc()
    ).all()
    
    result = []
    for att in attendances:
        # Extract job_type from reason_text
        job_type = None
        reason = att.reason_text or ""
        if reason.startswith("JOB_TYPE:"):
            parts = reason.split("|")
            job_marker = parts[0]
            job_type = job_marker.replace("JOB_TYPE:", "")
        
        # Determine type based on which fields are filled
        # For backward compatibility, return "in" if clock_in exists, "out" if only clock_out exists
        att_type = None
        if att.clock_in_time and att.clock_out_time:
            # Complete event - return "in" for the clock-in part (frontend can handle both)
            att_type = "in"
        elif att.clock_in_time:
            att_type = "in"
        elif att.clock_out_time:
            att_type = "out"
        
        # Use clock_in_time or clock_out_time for time_selected_utc (backward compatibility)
        time_selected = att.clock_in_time if att.clock_in_time else att.clock_out_time
        
        result.append({
            "id": str(att.id),
            "shift_id": None,
            "worker_id": str(att.worker_id),
            "type": att_type,  # For backward compatibility
            "clock_in_time": att.clock_in_time.isoformat() if att.clock_in_time else None,
            "clock_out_time": att.clock_out_time.isoformat() if att.clock_out_time else None,
            "time_selected_utc": time_selected.isoformat() if time_selected else None,  # Backward compatibility
            "status": att.status,
            "source": att.source,
            "job_type": job_type,
            "reason_text": att.reason_text,  # Include reason_text so frontend can extract job_type
        })
    
    return result


@router.get("/attendance/weekly-summary")
def get_weekly_attendance_summary(
    week_start: Optional[str] = None,  # YYYY-MM-DD format, defaults to current week (Sunday)
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Get weekly attendance summary for the current user.
    Returns list of daily entries with clock-in/out times, hours worked, job type, etc.
    """
    from datetime import date as date_type, timedelta
    
    # Calculate week start (Sunday)
    if week_start:
        try:
            week_start_date = datetime.fromisoformat(week_start).date()
        except:
            today = date_type.today()
            days_since_sunday = today.weekday() + 1
            if days_since_sunday == 7:
                days_since_sunday = 0
            week_start_date = today - timedelta(days=days_since_sunday)
    else:
        today = date_type.today()
        days_since_sunday = today.weekday() + 1
        if days_since_sunday == 7:
            days_since_sunday = 0
        week_start_date = today - timedelta(days=days_since_sunday)
    
    week_end_date = week_start_date + timedelta(days=6)  # Saturday
    
    # Get all attendances for this week - NEW MODEL: each record is already a complete event
    # Use clock_in_time for date filtering (or clock_out_time if clock_in_time is null)
    week_start_dt = datetime.combine(week_start_date, time.min).replace(tzinfo=timezone.utc)
    week_end_dt = datetime.combine(week_end_date + timedelta(days=1), time.min).replace(tzinfo=timezone.utc)
    
    # Query attendances where clock_in_time or clock_out_time falls within the week
    attendances = db.query(Attendance).filter(
        Attendance.worker_id == user.id,
        or_(
            and_(
                Attendance.clock_in_time.isnot(None),
                Attendance.clock_in_time >= week_start_dt,
                Attendance.clock_in_time < week_end_dt
            ),
            and_(
                Attendance.clock_in_time.is_(None),
                Attendance.clock_out_time.isnot(None),
                Attendance.clock_out_time >= week_start_dt,
                Attendance.clock_out_time < week_end_dt
            )
        )
    ).order_by(
        func.coalesce(Attendance.clock_in_time, Attendance.clock_out_time).asc()
    ).all()
    
    # Group attendances by date - each attendance is already a complete event
    daily_entries = {}
    
    for attendance in attendances:
        # Determine the date for this event (use clock_in_time if available, otherwise clock_out_time)
        event_date = None
        if attendance.clock_in_time:
            event_date = attendance.clock_in_time.date()
        elif attendance.clock_out_time:
            event_date = attendance.clock_out_time.date()
        else:
            continue  # Skip if neither clock_in nor clock_out exists
        
        if event_date < week_start_date or event_date > week_end_date:
            continue
        
        date_str = event_date.isoformat()
        
        # Initialize daily entry if not exists
        if date_str not in daily_entries:
            daily_entries[date_str] = {
                "date": date_str,
                "events": [],  # List of events (each attendance is already a complete event)
            }
        
        # Extract job_type and project_name for this attendance
        job_type = None
        project_name = None
        
        if attendance.shift_id:
            # Scheduled attendance - get from shift
            shift = db.query(Shift).filter(Shift.id == attendance.shift_id).first()
            if shift:
                job_type = shift.job_name
                # Get project name if it's not a predefined job
                if shift.project_id:
                    project = db.query(Project).filter(Project.id == shift.project_id).first()
                    if project:
                        project_name = project.name
        else:
            # Direct attendance (no shift) - extract job_type from reason_text
            # Format: "JOB_TYPE:{job_type}|{reason}" or just "JOB_TYPE:{job_type}"
            reason = attendance.reason_text or ""
            if reason.startswith("JOB_TYPE:"):
                parts = reason.split("|")
                job_marker = parts[0]
                job_type = job_marker.replace("JOB_TYPE:", "")
        
        # Extract HOURS_WORKED from reason_text if present
        hours_worked = None
        reason = attendance.reason_text or ""
        if "HOURS_WORKED:" in reason:
            parts = reason.split("|")
            for part in parts:
                if part.startswith("HOURS_WORKED:"):
                    try:
                        hours_worked = float(part.replace("HOURS_WORKED:", ""))
                    except:
                        pass
                    break
        
        # Calculate break minutes using the same function as the attendance table
        # This ensures consistency between the attendance table and weekly summary
        from ..routes.settings import calculate_break_minutes as calc_break
        break_minutes_calculated = None
        if attendance.clock_in_time and attendance.clock_out_time:
            break_minutes_calculated = calc_break(
                db, attendance.worker_id, attendance.clock_in_time, attendance.clock_out_time
            )
        # Use calculated break_minutes if available, otherwise fall back to stored value
        final_break_minutes = break_minutes_calculated if break_minutes_calculated is not None else (attendance.break_minutes if attendance.break_minutes is not None else 0)
        
        # Add event - each attendance is already a complete event
        daily_entries[date_str]["events"].append({
            "clock_in": {
                "id": str(attendance.id),
                "time": attendance.clock_in_time.isoformat() if attendance.clock_in_time else None,
                "status": attendance.status,
                "reason_text": attendance.reason_text,
            } if attendance.clock_in_time else None,
            "clock_out": {
                "id": str(attendance.id),
                "time": attendance.clock_out_time.isoformat() if attendance.clock_out_time else None,
                "status": attendance.status,
                "reason_text": attendance.reason_text,
            } if attendance.clock_out_time else None,
            "job_type": job_type,
            "project_name": project_name,
            "hours_worked": hours_worked,
            "break_minutes": final_break_minutes,
        })
    
    # Calculate hours worked for each day - handle multiple events per day
    result = []
    total_minutes = 0  # Net minutes (after break deduction) - used for "Total"
    total_gross_minutes = 0  # Gross minutes (before break deduction) - used to calculate "Reg"
    
    for i in range(7):  # Sunday to Saturday
        current_date = week_start_date + timedelta(days=i)
        date_str = current_date.isoformat()
        
        entry = daily_entries.get(date_str, {
            "date": date_str,
            "events": [],
        })
        
        # Calculate total hours for the day (sum of all completed events, minus breaks)
        day_total_minutes = 0  # Net minutes for the day
        day_gross_minutes = 0  # Gross minutes for the day (before break)
        day_break_minutes = 0
        events_list = []
        
        for event in entry["events"]:
            # Check if this is a "hours worked" entry
            hours_value = event.get("hours_worked")
            is_hours_worked = hours_value is not None
            
            # If not found, try to extract from clock-in or clock-out reason_text as fallback
            if not is_hours_worked:
                clock_in_reason = event.get("clock_in", {}).get("reason_text") if isinstance(event.get("clock_in"), dict) else None
                clock_out_reason = event.get("clock_out", {}).get("reason_text") if isinstance(event.get("clock_out"), dict) else None
                
                # Try clock-in first, then clock-out
                for reason in [clock_in_reason, clock_out_reason]:
                    if reason and "HOURS_WORKED:" in reason:
                        parts = reason.split("|")
                        for part in parts:
                            if part.startswith("HOURS_WORKED:"):
                                try:
                                    hours_value = float(part.replace("HOURS_WORKED:", ""))
                                    is_hours_worked = True
                                    break
                                except:
                                    pass
                        if is_hours_worked:
                            break
            
            clock_in_time_str = event.get("clock_in", {}).get("time") if isinstance(event.get("clock_in"), dict) else None
            clock_out_time_str = event.get("clock_out", {}).get("time") if isinstance(event.get("clock_out"), dict) else None
            clock_in_status = event.get("clock_in", {}).get("status") if isinstance(event.get("clock_in"), dict) else None
            clock_out_status = event.get("clock_out", {}).get("status") if isinstance(event.get("clock_out"), dict) else None
            
            if clock_in_time_str and clock_out_time_str:
                # Completed event - calculate hours
                # Always calculate from clock-in/out times to ensure consistency with attendance table
                # This matches exactly how the attendance table calculates hours_worked
                clock_in_time = datetime.fromisoformat(clock_in_time_str)
                clock_out_time = datetime.fromisoformat(clock_out_time_str)
                diff = clock_out_time - clock_in_time
                event_gross_minutes = int(diff.total_seconds() / 60)  # Gross minutes (before break)
                
                # Get break minutes from event (already calculated using same function as attendance table)
                break_minutes = event.get("break_minutes", 0) or 0
                
                # For "hours worked" entries, if hours_value is provided, use it as the net value
                # Otherwise, calculate net by subtracting break (same as attendance table)
                if is_hours_worked and hours_value is not None:
                    # For "hours worked" entries, the hours_value might be the net value
                    # But to be consistent, let's calculate from times and subtract break
                    # This ensures we always use the same calculation as the attendance table
                    net_minutes = max(0, event_gross_minutes - break_minutes)
                else:
                    # Regular entry: calculate total from times, then subtract break
                    # This matches exactly what the attendance table does
                    net_minutes = max(0, event_gross_minutes - break_minutes)
                
                # Determine job name
                job_name = "Unknown"
                if event["job_type"]:
                    job_name = PREDEFINED_JOBS_DICT.get(event["job_type"], event["project_name"] or "Unknown")
                elif event["project_name"]:
                    job_name = event["project_name"]
                
                day_break_minutes += break_minutes
                day_total_minutes += net_minutes  # Net (after break)
                day_gross_minutes += event_gross_minutes  # Gross (before break)
                
                events_list.append({
                    "clock_in": None if is_hours_worked else clock_in_time_str,
                    "clock_out": None if is_hours_worked else clock_out_time_str,
                    "clock_in_status": clock_in_status,
                    "clock_out_status": clock_out_status,
                    "job_type": event["job_type"],
                    "job_name": job_name,
                    "hours_worked_minutes": net_minutes,
                    "hours_worked_formatted": f"{net_minutes // 60}h {net_minutes % 60:02d}m",
                    "break_minutes": break_minutes,
                    "break_formatted": f"{break_minutes}m" if break_minutes > 0 else None,
                })
            elif clock_in_time_str:
                # Open event (clock-in without clock-out)
                job_name = "Unknown"
                if event["job_type"]:
                    job_name = PREDEFINED_JOBS_DICT.get(event["job_type"], event["project_name"] or "Unknown")
                elif event["project_name"]:
                    job_name = event["project_name"]
                
                events_list.append({
                    "clock_in": clock_in_time_str,
                    "clock_out": None,
                    "clock_in_status": clock_in_status,
                    "clock_out_status": None,
                    "job_type": event["job_type"],
                    "job_name": job_name,
                    "hours_worked_minutes": 0,
                    "hours_worked_formatted": "0h 00m",
                    "break_minutes": 0,
                    "break_formatted": None,
                })
        
        total_minutes += day_total_minutes  # Net total (after break)
        total_gross_minutes += day_gross_minutes  # Gross total (before break)
        
        # If there are events, add them to result
        if events_list:
            # Add each event as a separate entry for the day
            for event_data in events_list:
                result.append({
                    "date": date_str,
                    "day_name": current_date.strftime("%a").lower(),  # mon, tue, etc.
                    "clock_in": event_data["clock_in"],
                    "clock_out": event_data["clock_out"],
                    "clock_in_status": event_data["clock_in_status"],
                    "clock_out_status": event_data["clock_out_status"],
                    "job_type": event_data["job_type"],
                    "job_name": event_data["job_name"],
                    "hours_worked_minutes": event_data["hours_worked_minutes"],
                    "hours_worked_formatted": event_data["hours_worked_formatted"],
                    "break_minutes": event_data.get("break_minutes", 0),
                    "break_formatted": event_data.get("break_formatted"),
                })
    
    # Calculate total break minutes for the week
    total_break_minutes = 0
    for day_entry in result:
        total_break_minutes += day_entry.get("break_minutes", 0) or 0
    
    # Reg = Total de horas brutas (soma de todos os shifts sem descontar break)
    reg_minutes = total_gross_minutes
    # Total = Reg - Break (horas líquidas após descontar break)
    total_net_minutes = max(0, reg_minutes - total_break_minutes)
    
    return {
        "week_start": week_start_date.isoformat(),
        "week_end": week_end_date.isoformat(),
        "days": result,
        "total_minutes": total_net_minutes,  # Total = Reg - Break
        "total_hours_formatted": f"{total_net_minutes // 60}h {total_net_minutes % 60:02d}m",
        "reg_minutes": reg_minutes,  # Reg = Total de horas brutas
        "reg_hours_formatted": f"{reg_minutes // 60}h {reg_minutes % 60:02d}m",
        "total_break_minutes": total_break_minutes,
        "total_break_formatted": f"{total_break_minutes // 60}h {total_break_minutes % 60:02d}m",
    }


@router.post("/attendance/{attendance_id}/approve")
def approve_attendance(
    attendance_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Approve a pending attendance record."""
    attendance = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not attendance:
        raise HTTPException(status_code=404, detail="Attendance not found")
    
    # Check permissions
    if not can_approve_attendance(user, attendance, db):
        raise HTTPException(status_code=403, detail="Access denied")
    
    if attendance.status != "pending":
        raise HTTPException(status_code=400, detail="Attendance is not pending")
    
    note = payload.get("note", "")
    
    # Update status
    from datetime import timezone
    attendance.status = "approved"
    attendance.approved_at = datetime.now(timezone.utc)
    attendance.approved_by = user.id

    complete_tasks_for_origin(
        db,
        origin_type="system_attendance",
        origin_id=str(attendance.id),
        concluded_by_id=user.id,
    )
    
    db.commit()
    db.refresh(attendance)
    
    # Create audit log
    create_audit_log(
        db=db,
        entity_type="attendance",
        entity_id=str(attendance.id),
        action="APPROVE",
        actor_id=str(user.id),
        actor_role=get_user_role(user, db),
        source="api",
        changes_json={"before": {"status": "pending"}, "after": {"status": "approved"}},
        context={
            "note": note,
            "worker_id": str(attendance.worker_id),
        }
    )
    
    # Send notification
    shift = db.query(Shift).filter(Shift.id == attendance.shift_id).first()
    project = db.query(Project).filter(Project.id == shift.project_id).first() if shift else None
    project_timezone = project.timezone if project else settings.tz_default
    
    send_attendance_notification(
        db=db,
        user_id=str(attendance.worker_id),
        notification_type="approved",
        attendance_data={
            "id": str(attendance.id),
            "type": attendance.type,
        },
        timezone_str=project_timezone
    )
    
    # Create/update timesheet entry when approved
    if shift:
        # Recalculate geofence status for logging (use stored GPS data if available)
        project = db.query(Project).filter(Project.id == shift.project_id).first()
        geofences_to_check = get_geofences_for_shift(shift, project, db)
        inside_geo = False
        if geofences_to_check and len(geofences_to_check) > 0:
            if attendance.gps_lat and attendance.gps_lng:
                inside_geo, _, _ = inside_geofence(
                    float(attendance.gps_lat),
                    float(attendance.gps_lng),
                    geofences_to_check,
                    float(attendance.gps_accuracy_m) if attendance.gps_accuracy_m else None
                )
        else:
            # No geofences - location validation not required
            inside_geo = True
        
        _create_or_update_timesheet_from_attendance(db, attendance, shift, project_timezone, inside_geo)
    
    return {
        "id": str(attendance.id),
        "status": attendance.status,
        "approved_at": attendance.approved_at.isoformat() if attendance.approved_at else None,
        "approved_by": str(attendance.approved_by) if attendance.approved_by else None,
    }


@router.patch("/attendance/{attendance_id}")
def update_attendance(
    attendance_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Update a pending attendance record (edit time/location).
    Only pending records can be edited. Editing turns it back to pending if rules are broken.
    """
    attendance = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not attendance:
        raise HTTPException(status_code=404, detail="Attendance not found")
    
    # Check permissions
    if not can_modify_attendance(user, attendance, db):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Only pending attendance can be edited
    if attendance.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending attendance can be edited")
    
    # Store before state
    before_state = {
        "time_selected_utc": attendance.time_selected_utc.isoformat(),
        "reason_text": attendance.reason_text,
        "gps_lat": float(attendance.gps_lat) if attendance.gps_lat else None,
        "gps_lng": float(attendance.gps_lng) if attendance.gps_lng else None,
        "gps_accuracy_m": float(attendance.gps_accuracy_m) if attendance.gps_accuracy_m else None,
    }
    
    # Get shift and project
    shift = db.query(Shift).filter(Shift.id == attendance.shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    
    project = db.query(Project).filter(Project.id == shift.project_id).first()
    project_timezone = project.timezone if project else settings.tz_default
    
    # Update time if provided
    if "time_selected_local" in payload:
        try:
            time_selected_local = datetime.fromisoformat(payload["time_selected_local"].replace('Z', '+00:00'))
            time_selected_local = round_to_5_minutes(time_selected_local)
            
            if time_selected_local.tzinfo is not None:
                time_selected_local = time_selected_local.replace(tzinfo=None)
            
            time_selected_utc = local_to_utc(time_selected_local, project_timezone)
            if time_selected_utc.tzinfo is None:
                from pytz import UTC
                time_selected_utc = time_selected_utc.replace(tzinfo=UTC)
            
            attendance.time_selected_utc = time_selected_utc
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid time_selected_local format")
    
    # Update GPS if provided
    if "gps" in payload:
        gps_data = payload.get("gps", {})
        attendance.gps_lat = float(gps_data.get("lat")) if gps_data.get("lat") else None
        attendance.gps_lng = float(gps_data.get("lng")) if gps_data.get("lng") else None
        attendance.gps_accuracy_m = float(gps_data.get("accuracy_m")) if gps_data.get("accuracy_m") else None
        attendance.mocked_flag = gps_data.get("mocked", False)
    
    # Update reason text if provided
    if "reason_text" in payload:
        attendance.reason_text = payload.get("reason_text")
    
    # Re-validate after edits
    expected_time_local = combine_date_time(
        shift.date,
        shift.start_time if attendance.type == "in" else shift.end_time,
        project_timezone
    )
    expected_time_utc = local_to_utc(expected_time_local.replace(tzinfo=None), project_timezone)
    if expected_time_utc.tzinfo is None:
        from pytz import UTC
        expected_time_utc = expected_time_utc.replace(tzinfo=UTC)
    
    # Check if clock-in/out is on the same day as TODAY (not shift date)
    today_local = datetime.now().date()
    today_start = datetime.combine(today_local, time.min)
    today_utc = local_to_utc(today_start, project_timezone)
    if today_utc.tzinfo is None:
        from pytz import UTC
        today_utc = today_utc.replace(tzinfo=UTC)
    
    is_same_day_as_today = is_same_day(attendance.time_selected_utc, today_utc, project_timezone)
    
    inside_geo = True
    geo_risk = False
    # Check geofence - use project location if shift has no geofences
    # NOTE: Location is captured but NOT mandatory - it doesn't block clock-in/out or require approval
    project = db.query(Project).filter(Project.id == shift.project_id).first()
    geofences_to_check = get_geofences_for_shift(shift, project, db)
    
    if geofences_to_check and len(geofences_to_check) > 0:
        if attendance.gps_lat and attendance.gps_lng:
            inside_geo, _, geo_risk = inside_geofence(
                float(attendance.gps_lat),
                float(attendance.gps_lng),
                geofences_to_check,
                float(attendance.gps_accuracy_m) if attendance.gps_accuracy_m else None
            )
        else:
            # No GPS data - location not captured, but that's OK (not mandatory)
            inside_geo = False
            geo_risk = True
    else:
        # No geofences - location validation not required
        inside_geo = True
        geo_risk = False
    
    # Status remains pending after edit (supervisor must re-approve)
    # NEW RULES: Reason is only required if editing to a different day than TODAY
    if not is_same_day_as_today:
        if not attendance.reason_text or len(attendance.reason_text.strip()) < settings.require_reason_min_chars:
            raise HTTPException(
                status_code=400,
                detail=f"Reason text is required (minimum {settings.require_reason_min_chars} characters) when clock-in/out is on a different day than today"
            )
    
    db.commit()
    db.refresh(attendance)
    
    # Create audit log
    after_state = {
        "time_selected_utc": attendance.time_selected_utc.isoformat(),
        "reason_text": attendance.reason_text,
        "gps_lat": float(attendance.gps_lat) if attendance.gps_lat else None,
        "gps_lng": float(attendance.gps_lng) if attendance.gps_lng else None,
        "gps_accuracy_m": float(attendance.gps_accuracy_m) if attendance.gps_accuracy_m else None,
    }
    changes = compute_diff(before_state, after_state)
    
    create_audit_log(
        db=db,
        entity_type="attendance",
        entity_id=str(attendance.id),
        action="UPDATE",
        actor_id=str(user.id),
        actor_role=get_user_role(user, db),
        source="api",
        changes_json=changes,
        context={
            "project_id": str(shift.project_id),
            "worker_id": str(attendance.worker_id),
            "shift_id": str(attendance.shift_id),
        }
    )
    
    return {
        "id": str(attendance.id),
        "shift_id": str(attendance.shift_id),
        "worker_id": str(attendance.worker_id),
        "type": attendance.type,
        "time_selected_utc": attendance.time_selected_utc.isoformat(),
        "status": attendance.status,
        "reason_text": attendance.reason_text,
        "gps_lat": float(attendance.gps_lat) if attendance.gps_lat else None,
        "gps_lng": float(attendance.gps_lng) if attendance.gps_lng else None,
        "gps_accuracy_m": float(attendance.gps_accuracy_m) if attendance.gps_accuracy_m else None,
    }


@router.post("/attendance/{attendance_id}/reject")
def reject_attendance(
    attendance_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Reject a pending attendance record."""
    attendance = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not attendance:
        raise HTTPException(status_code=404, detail="Attendance not found")
    
    # Check permissions
    if not can_approve_attendance(user, attendance, db):
        raise HTTPException(status_code=403, detail="Access denied")
    
    if attendance.status != "pending":
        raise HTTPException(status_code=400, detail="Attendance is not pending")
    
    rejection_reason = payload.get("reason", "")
    if not rejection_reason:
        raise HTTPException(status_code=400, detail="rejection reason is required")
    
    # Update status
    from datetime import timezone
    attendance.status = "rejected"
    attendance.rejected_at = datetime.now(timezone.utc)
    attendance.rejected_by = user.id
    attendance.rejection_reason = rejection_reason

    complete_tasks_for_origin(
        db,
        origin_type="system_attendance",
        origin_id=str(attendance.id),
        concluded_by_id=user.id,
    )
    
    db.commit()
    db.refresh(attendance)
    
    # Create audit log
    create_audit_log(
        db=db,
        entity_type="attendance",
        entity_id=str(attendance.id),
        action="REJECT",
        actor_id=str(user.id),
        actor_role=get_user_role(user, db),
        source="api",
        changes_json={"before": {"status": "pending"}, "after": {"status": "rejected"}},
        context={
            "rejection_reason": rejection_reason,
            "worker_id": str(attendance.worker_id),
        }
    )
    
    # Send notification
    shift = db.query(Shift).filter(Shift.id == attendance.shift_id).first()
    project = db.query(Project).filter(Project.id == shift.project_id).first() if shift else None
    project_timezone = project.timezone if project else settings.tz_default
    
    send_attendance_notification(
        db=db,
        user_id=str(attendance.worker_id),
        notification_type="rejected",
        attendance_data={
            "id": str(attendance.id),
            "type": attendance.type,
            "reason": rejection_reason,
        },
        timezone_str=project_timezone
    )
    
    return {
        "id": str(attendance.id),
        "status": attendance.status,
        "rejected_at": attendance.rejected_at.isoformat() if attendance.rejected_at else None,
        "rejected_by": str(attendance.rejected_by) if attendance.rejected_by else None,
        "rejection_reason": attendance.rejection_reason,
    }


@router.get("/shifts/{shift_id}/attendance")
def get_shift_attendance(
    shift_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Get all attendance records for a specific shift.
    """
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    
    # Check permissions
    # Worker can see their own shift attendance
    # Supervisor/admin can see any shift attendance in their projects
    if str(shift.worker_id) != str(user.id):
        if not (is_admin(user, db) or is_supervisor(user, db, str(shift.project_id))):
            raise HTTPException(status_code=403, detail="Access denied")
    
    # NEW MODEL: Query by shift_id, order by clock_in_time or clock_out_time
    attendances = db.query(Attendance).filter(
        Attendance.shift_id == shift_id
    ).order_by(
        func.coalesce(Attendance.clock_in_time, Attendance.clock_out_time).asc()
    ).all()
    
    result = []
    for a in attendances:
        # Determine type for backward compatibility
        att_type = None
        if a.clock_in_time and a.clock_out_time:
            att_type = "in"  # Complete event - return "in" for backward compatibility
        elif a.clock_in_time:
            att_type = "in"
        elif a.clock_out_time:
            att_type = "out"
        
        # Use clock_in_time or clock_out_time for time_selected_utc (backward compatibility)
        time_selected = a.clock_in_time if a.clock_in_time else a.clock_out_time
        
        result.append({
            "id": str(a.id),
            "shift_id": str(a.shift_id),
            "worker_id": str(a.worker_id),
            "type": att_type,  # For backward compatibility
            "clock_in_time": a.clock_in_time.isoformat() if a.clock_in_time else None,
            "clock_out_time": a.clock_out_time.isoformat() if a.clock_out_time else None,
            "time_selected_utc": time_selected.isoformat() if time_selected else None,  # Backward compatibility
            "status": a.status,
            "source": a.source,
            "reason_text": a.reason_text,
            # GPS data from clock-in (or clock-out if clock-in doesn't exist)
            "gps_lat": float(a.clock_in_gps_lat) if a.clock_in_gps_lat else (float(a.clock_out_gps_lat) if a.clock_out_gps_lat else None),
            "gps_lng": float(a.clock_in_gps_lng) if a.clock_in_gps_lng else (float(a.clock_out_gps_lng) if a.clock_out_gps_lng else None),
            "gps_accuracy_m": float(a.clock_in_gps_accuracy_m) if a.clock_in_gps_accuracy_m else (float(a.clock_out_gps_accuracy_m) if a.clock_out_gps_accuracy_m else None),
            "mocked_flag": a.clock_in_mocked_flag if a.clock_in_time else (a.clock_out_mocked_flag if a.clock_out_time else False),
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "approved_at": a.approved_at.isoformat() if a.approved_at else None,
            "rejected_at": a.rejected_at.isoformat() if a.rejected_at else None,
            "rejection_reason": a.rejection_reason,
        })
    
    return result


@router.get("/attendance/pending")
def list_pending_attendance(
    project_id: Optional[str] = None,
    date_range: Optional[str] = None,
    worker_id: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    List pending attendance records for approval.
    Supports filtering by project, date range, worker.
    """
    # Check permissions
    if not (is_admin(user, db) or is_supervisor(user, db)):
        raise HTTPException(status_code=403, detail="Only supervisors and admins can view pending attendance")
    
    # Build query
    query = db.query(Attendance).filter(Attendance.status == "pending")
    
    # Track if we've already joined Shift
    has_shift_join = False
    
    # Filter by project
    if project_id:
        # Join with shifts to filter by project
        query = query.join(Shift).filter(Shift.project_id == project_id)
        has_shift_join = True
        # Check supervisor has access to this project
        if not is_admin(user, db) and not is_supervisor(user, db, project_id):
            raise HTTPException(status_code=403, detail="Access denied to this project")
    else:
        # Filter by projects supervisor has access to
        if not is_admin(user, db):
            # TODO: Implement project-specific supervisor access
            # For now, supervisors can see all pending
            pass
    
    # Filter by worker
    if worker_id:
        query = query.filter(Attendance.worker_id == worker_id)
    
    # Filter by date range
    if date_range:
        try:
            start_str, end_str = date_range.split(",")
            start_date = datetime.fromisoformat(start_str).replace(tzinfo=None)
            end_date = datetime.fromisoformat(end_str).replace(tzinfo=None)
            query = query.filter(
                and_(
                    Attendance.time_selected_utc >= start_date,
                    Attendance.time_selected_utc <= end_date
                )
            )
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid date_range format")
    
    # Join with shifts and projects for full data (only if not already joined)
    if not has_shift_join:
        query = query.join(Shift, Shift.id == Attendance.shift_id)
    query = query.join(Project, Project.id == Shift.project_id)
    
    # Query with explicit join to get shift data
    attendances = query.order_by(Attendance.time_selected_utc.desc()).all()
    
    # Build response with shift data
    # Query shifts and projects separately to avoid N+1 queries
    shift_ids = [a.shift_id for a in attendances]
    shifts_dict = {}
    projects_dict = {}
    if shift_ids:
        shifts = db.query(Shift).filter(Shift.id.in_(shift_ids)).all()
        shifts_dict = {s.id: s for s in shifts}
        # Get unique project IDs
        project_ids = list(set([s.project_id for s in shifts]))
        if project_ids:
            projects = db.query(Project).filter(Project.id.in_(project_ids)).all()
            projects_dict = {p.id: p for p in projects}
    
    result = []
    for a in attendances:
        shift = shifts_dict.get(a.shift_id)
        project = projects_dict.get(shift.project_id) if shift else None
        
        # Get geofences (from shift or project)
        geofences = []
        if shift:
            geofences = get_geofences_for_shift(shift, project, db)
        
        result.append({
            "id": str(a.id),
            "shift_id": str(a.shift_id),
            "worker_id": str(a.worker_id),
            "type": a.type,
            "time_selected_utc": a.time_selected_utc.isoformat(),
            "status": a.status,
            "source": a.source,
            "reason_text": a.reason_text,
            "gps_lat": float(a.gps_lat) if a.gps_lat else None,
            "gps_lng": float(a.gps_lng) if a.gps_lng else None,
            "gps_accuracy_m": float(a.gps_accuracy_m) if a.gps_accuracy_m else None,
            "mocked_flag": a.mocked_flag,
            "attachments": a.attachments,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "shift": {
                "id": str(shift.id) if shift else str(a.shift_id),
                "date": shift.date.isoformat() if shift else None,
                "start_time": shift.start_time.isoformat() if shift else None,
                "end_time": shift.end_time.isoformat() if shift else None,
                "geofences": geofences,
                "project_id": str(shift.project_id) if shift else None,
            } if shift else None,
        })
    
    return result


@router.get("/audit")
def get_audit_logs(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get audit logs with optional filtering."""
    # Check permissions (admin only for now)
    if not is_admin(user, db):
        raise HTTPException(status_code=403, detail="Only admins can view audit logs")
    
    from ..services.audit import get_audit_logs as get_logs
    
    logs = get_logs(db, entity_type, entity_id, limit, offset)
    
    return [
        {
            "id": str(log.id),
            "entity_type": log.entity_type,
            "entity_id": str(log.entity_id),
            "action": log.action,
            "actor_id": str(log.actor_id) if log.actor_id else None,
            "actor_role": log.actor_role,
            "source": log.source,
            "changes_json": log.changes_json,
            "timestamp_utc": log.timestamp_utc.isoformat() if log.timestamp_utc else None,
            "context": log.context,
            "integrity_hash": log.integrity_hash,
        }
        for log in logs
    ]


def _calculate_break_minutes(
    db: Session,
    worker_id: uuid.UUID,
    clock_in_time: datetime,
    clock_out_time: datetime
) -> Optional[int]:
    """
    Calculate break minutes for an attendance record.
    Returns break minutes if:
    - Both clock_in_time and clock_out_time exist
    - Total hours >= 5 hours
    - Worker is in the eligible employees list
    Otherwise returns None.
    """
    if not clock_in_time or not clock_out_time:
        return None
    
    # Calculate total minutes
    diff = clock_out_time - clock_in_time
    total_minutes = int(diff.total_seconds() / 60)
    
    # Check if >= 5 hours (300 minutes)
    if total_minutes < 300:
        return None
    
    # Get timesheet settings
    from ..models.models import SettingList, SettingItem
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
        import json
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


def _create_or_update_timesheet_from_attendance(
    db: Session,
    attendance: Attendance,
    shift: Shift,
    project_timezone: str,
    inside_geofence: bool
):
    """
    Create or update ProjectTimeEntry from approved attendance.
    When both clock-in and clock-out are approved, create a complete entry.
    NEW MODEL: Uses clock_in_time and clock_out_time instead of type field.
    """
    from ..services.time_rules import utc_to_local
    from datetime import time as time_type
    
    # Get or create timesheet entry for this shift and date
    existing_entry = db.query(ProjectTimeEntry).filter(
        ProjectTimeEntry.project_id == shift.project_id,
        ProjectTimeEntry.user_id == attendance.worker_id,
        ProjectTimeEntry.work_date == shift.date
    ).first()
    
    # NEW MODEL: Process both clock-in and clock-out if they exist
    # Process clock-in first if clock_in_time exists and we haven't processed it yet
    if attendance.clock_in_time:
        # Clock-in: create or update entry with start_time
        # Convert clock_in_time to local time
        time_selected_local = utc_to_local(attendance.clock_in_time, project_timezone)
        start_time_local = time_selected_local.time()
        
        # Only process if we don't have a start_time yet or if it's different
        should_update_start = not existing_entry or not existing_entry.start_time or existing_entry.start_time != start_time_local
        
        if should_update_start:
            if existing_entry:
                # Update existing entry
                existing_entry.start_time = start_time_local
                # Recalculate minutes if end_time exists
                if existing_entry.end_time:
                    from datetime import datetime, timedelta
                    start_dt = datetime.combine(shift.date, existing_entry.start_time)
                    end_dt = datetime.combine(shift.date, existing_entry.end_time)
                    if end_dt > start_dt:
                        diff = end_dt - start_dt
                        total_minutes = int(diff.total_seconds() / 60)
                    else:
                        # Overnight shift
                        end_dt = end_dt + timedelta(days=1)
                        diff = end_dt - start_dt
                        total_minutes = int(diff.total_seconds() / 60)
                    # Subtract break minutes if attendance has break
                    break_minutes = attendance.break_minutes if attendance.break_minutes is not None else 0
                    existing_entry.minutes = max(0, total_minutes - break_minutes)
                existing_entry.notes = existing_entry.notes or f"Clock-in via attendance system"
                db.commit()
                
                # Create log for update
                log_changes = {
                    "before": {
                        "start_time": None,
                        "minutes": existing_entry.minutes,
                    },
                    "after": {
                        "start_time": start_time_local.isoformat(),
                        "minutes": existing_entry.minutes,
                    },
                    "attendance_type": "clock-in",
                    "worker_id": str(attendance.worker_id),
                    "performed_by": str(attendance.created_by),
                    "time_selected": attendance.clock_in_time.isoformat() if attendance.clock_in_time else None,
                    "time_entered": attendance.clock_in_entered_utc.isoformat() if attendance.clock_in_entered_utc else None,
                    "status": attendance.status,
                    "reason_text": attendance.reason_text,
                    "gps_lat": float(attendance.clock_in_gps_lat) if attendance.clock_in_gps_lat is not None else None,
                    "gps_lng": float(attendance.clock_in_gps_lng) if attendance.clock_in_gps_lng is not None else None,
                    "gps_accuracy_m": float(attendance.clock_in_gps_accuracy_m) if attendance.clock_in_gps_accuracy_m is not None else None,
                    "inside_geofence": inside_geofence,
                }
                # Add worker name if different from performer
                if str(attendance.worker_id) != str(attendance.created_by):
                    worker_user = db.query(User).filter(User.id == attendance.worker_id).first()
                    if worker_user:
                        log_changes["worker_name"] = worker_user.username or worker_user.email or str(attendance.worker_id)
                
                log = ProjectTimeEntryLog(
                    entry_id=existing_entry.id,
                    project_id=existing_entry.project_id,
                    user_id=attendance.created_by,
                    action="update",
                    changes=log_changes
                )
                db.add(log)
                db.commit()
            else:
                # Create new entry
                entry = ProjectTimeEntry(
                    project_id=shift.project_id,
                    user_id=attendance.worker_id,
                    work_date=shift.date,
                    start_time=start_time_local,
                    minutes=0,  # Will be calculated when clock-out is approved
                    notes=f"Clock-in via attendance system",
                    created_by=attendance.created_by
                )
                db.add(entry)
                db.commit()
                db.refresh(entry)
                existing_entry = entry  # Update reference for clock-out processing
                
                # Create log with comprehensive attendance information
                log_changes = {
                    "minutes": entry.minutes,
                    "work_date": entry.work_date.isoformat(),
                    "notes": entry.notes,
                    "start_time": start_time_local.isoformat(),
                    "attendance_type": "clock-in",
                    "worker_id": str(attendance.worker_id),
                    "performed_by": str(attendance.created_by),
                    "time_selected": attendance.clock_in_time.isoformat() if attendance.clock_in_time else None,
                    "time_entered": attendance.clock_in_entered_utc.isoformat() if attendance.clock_in_entered_utc else None,
                    "status": attendance.status,
                    "reason_text": attendance.reason_text,
                    "gps_lat": float(attendance.clock_in_gps_lat) if attendance.clock_in_gps_lat is not None else None,
                    "gps_lng": float(attendance.clock_in_gps_lng) if attendance.clock_in_gps_lng is not None else None,
                    "gps_accuracy_m": float(attendance.clock_in_gps_accuracy_m) if attendance.clock_in_gps_accuracy_m is not None else None,
                    "inside_geofence": inside_geofence,
                }
                # Add worker name if different from performer
                if str(attendance.worker_id) != str(attendance.created_by):
                    worker_user = db.query(User).filter(User.id == attendance.worker_id).first()
                    if worker_user:
                        log_changes["worker_name"] = worker_user.username or worker_user.email or str(attendance.worker_id)
                
                log = ProjectTimeEntryLog(
                    entry_id=entry.id,
                    project_id=entry.project_id,
                    user_id=attendance.created_by,
                    action="create",
                    changes=log_changes
                )
                db.add(log)
                db.commit()
    
    # Process clock-out if clock_out_time exists
    if attendance.clock_out_time:
        # Refresh existing_entry in case it was just created
        if existing_entry:
            db.refresh(existing_entry)
        else:
            existing_entry = db.query(ProjectTimeEntry).filter(
                ProjectTimeEntry.project_id == shift.project_id,
                ProjectTimeEntry.user_id == attendance.worker_id,
                ProjectTimeEntry.work_date == shift.date
            ).first()
        
        # Convert clock_out_time to local time
        time_selected_local = utc_to_local(attendance.clock_out_time, project_timezone)
        end_time_local = time_selected_local.time()
        
        # Only process if we don't have an end_time yet or if it's different
        should_update_end = not existing_entry or not existing_entry.end_time or existing_entry.end_time != end_time_local
        
        if should_update_end and existing_entry:
            # Clock-out: update entry with end_time and calculate minutes
            existing_entry.end_time = end_time_local
            # Calculate minutes
            from datetime import datetime, timedelta
            if existing_entry.start_time:
                start_dt = datetime.combine(shift.date, existing_entry.start_time)
                end_dt = datetime.combine(shift.date, existing_entry.end_time)
                if end_dt > start_dt:
                    diff = end_dt - start_dt
                    total_minutes = int(diff.total_seconds() / 60)
                else:
                    # Overnight shift
                    end_dt = end_dt + timedelta(days=1)
                    diff = end_dt - start_dt
                    total_minutes = int(diff.total_seconds() / 60)
            else:
                # No start time, use shift start time
                start_dt = datetime.combine(shift.date, shift.start_time)
                end_dt = datetime.combine(shift.date, existing_entry.end_time)
                if end_dt > start_dt:
                    diff = end_dt - start_dt
                    total_minutes = int(diff.total_seconds() / 60)
                else:
                    end_dt = end_dt + timedelta(days=1)
                    diff = end_dt - start_dt
                    total_minutes = int(diff.total_seconds() / 60)
            
            # Subtract break minutes if attendance has break
            break_minutes = attendance.break_minutes if attendance.break_minutes is not None else 0
            existing_entry.minutes = max(0, total_minutes - break_minutes)
            if not existing_entry.start_time:
                existing_entry.start_time = shift.start_time
            
            existing_entry.notes = existing_entry.notes or f"Clock-out via attendance system"
            db.commit()
            
            # Create log with comprehensive attendance information
            log_changes = {
                "before": {
                    "end_time": None,
                    "minutes": existing_entry.minutes,
                },
                "after": {
                    "end_time": end_time_local.isoformat(),
                    "minutes": existing_entry.minutes,
                },
                "attendance_type": "clock-out",
                "worker_id": str(attendance.worker_id),
                "performed_by": str(attendance.created_by),
                "time_selected": attendance.clock_out_time.isoformat() if attendance.clock_out_time else None,
                "time_entered": attendance.clock_out_entered_utc.isoformat() if attendance.clock_out_entered_utc else None,
                "status": attendance.status,
                "reason_text": attendance.reason_text,
                "gps_lat": float(attendance.clock_out_gps_lat) if attendance.clock_out_gps_lat is not None else None,
                "gps_lng": float(attendance.clock_out_gps_lng) if attendance.clock_out_gps_lng is not None else None,
                "gps_accuracy_m": float(attendance.clock_out_gps_accuracy_m) if attendance.clock_out_gps_accuracy_m is not None else None,
                "inside_geofence": inside_geofence,
            }
            # Add worker name if different from performer
            if str(attendance.worker_id) != str(attendance.created_by):
                worker_user = db.query(User).filter(User.id == attendance.worker_id).first()
                if worker_user:
                    log_changes["worker_name"] = worker_user.username or worker_user.email or str(attendance.worker_id)
            
            log = ProjectTimeEntryLog(
                entry_id=existing_entry.id,
                project_id=existing_entry.project_id,
                user_id=attendance.created_by,
                action="update",
                changes=log_changes
            )
            db.add(log)
            db.commit()
        else:
            # Create new entry with end_time only (shouldn't happen, but handle it)
            from datetime import datetime, timedelta
            start_dt = datetime.combine(shift.date, shift.start_time)
            end_dt = datetime.combine(shift.date, end_time_local)
            if end_dt > start_dt:
                diff = end_dt - start_dt
                minutes = int(diff.total_seconds() / 60)
            else:
                end_dt = end_dt + timedelta(days=1)
                diff = end_dt - start_dt
                minutes = int(diff.total_seconds() / 60)
            
            entry = ProjectTimeEntry(
                project_id=shift.project_id,
                user_id=attendance.worker_id,
                work_date=shift.date,
                start_time=shift.start_time,
                end_time=end_time_local,
                minutes=minutes,
                notes=f"Clock-out via attendance system",
                created_by=attendance.created_by
            )
            db.add(entry)
            db.commit()
            db.refresh(entry)
            
            # Create log with comprehensive attendance information
            log_changes = {
                "minutes": entry.minutes,
                "work_date": entry.work_date.isoformat(),
                "notes": entry.notes,
                "start_time": entry.start_time.isoformat(),
                "end_time": entry.end_time.isoformat(),
                "attendance_type": "clock-out",
                "worker_id": str(attendance.worker_id),
                "performed_by": str(attendance.created_by),
                "time_selected": attendance.clock_out_time.isoformat() if attendance.clock_out_time else None,
                "time_entered": attendance.clock_out_entered_utc.isoformat() if attendance.clock_out_entered_utc else None,
                "status": attendance.status,
                "reason_text": attendance.reason_text,
                "gps_lat": float(attendance.clock_out_gps_lat) if attendance.clock_out_gps_lat is not None else None,
                "gps_lng": float(attendance.clock_out_gps_lng) if attendance.clock_out_gps_lng is not None else None,
                "gps_accuracy_m": float(attendance.clock_out_gps_accuracy_m) if attendance.clock_out_gps_accuracy_m is not None else None,
                "inside_geofence": inside_geofence,
            }
            # Add worker name if different from performer
            if str(attendance.worker_id) != str(attendance.created_by):
                worker_user = db.query(User).filter(User.id == attendance.worker_id).first()
                if worker_user:
                    log_changes["worker_name"] = worker_user.username or worker_user.email or str(attendance.worker_id)
            
            log = ProjectTimeEntryLog(
                entry_id=entry.id,
                project_id=entry.project_id,
                user_id=attendance.created_by,
                action="create",
                changes=log_changes
            )
            db.add(log)
            db.commit()

