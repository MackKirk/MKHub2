"""
Dispatch & Time Tracking API routes.
Handles shifts, attendance, and approvals.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List, Optional, Dict
from datetime import date, time, datetime, timedelta
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
    round_to_15_minutes, is_within_tolerance, 
    local_to_utc, utc_to_local, combine_date_time
)
from ..services.audit import create_audit_log, compute_diff
from ..services.notifications import send_shift_notification, send_attendance_notification
from ..services.permissions import (
    is_admin, is_supervisor, is_worker,
    can_modify_shift, can_modify_attendance, can_approve_attendance
)

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
    query = db.query(Shift).filter(Shift.status == "scheduled")
    
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
        time_selected_local = round_to_15_minutes(time_selected_local)
        
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
        
        # Get GPS data
        gps_lat = payload.get("gps", {}).get("lat") if payload.get("gps") else None
        gps_lng = payload.get("gps", {}).get("lng") if payload.get("gps") else None
        gps_accuracy_m = payload.get("gps", {}).get("accuracy_m") if payload.get("gps") else None
        mocked_flag = payload.get("gps", {}).get("mocked", False) if payload.get("gps") else False
        
        logger.info(f"GPS data - lat: {gps_lat}, lng: {gps_lng}, accuracy: {gps_accuracy_m}")
        
        # Check tolerance: compare selected time with CURRENT time (when clock-in/out is being done)
        # This allows users to record the actual time they worked, as long as it's within tolerance of when they're submitting
        # Example: If it's 11:08 now and user selects 10:45, difference is 23min (within 30min tolerance) → approved
        within_tolerance = is_within_tolerance(time_selected_utc, time_entered_utc)
        # Calculate difference for detailed logging
        diff_minutes = abs((time_selected_utc - time_entered_utc).total_seconds() / 60)
        tolerance_minutes = settings.tolerance_window_min
        logger.info(f"Tolerance check - Selected time: {time_selected_utc}, Current time: {time_entered_utc}, Diff: {diff_minutes:.1f}min, Tolerance: {tolerance_minutes}min, Within: {within_tolerance}")
        
        # Also log expected shift time for reference (but not used for tolerance check)
        expected_datetime_local = combine_date_time(shift.date, shift.start_time if attendance_type == "in" else shift.end_time, project_timezone)
        expected_datetime_utc = local_to_utc(expected_datetime_local.replace(tzinfo=None), project_timezone)
        if expected_datetime_utc.tzinfo is None:
            from pytz import UTC
            expected_datetime_utc = expected_datetime_utc.replace(tzinfo=UTC)
        expected_diff_minutes = abs((time_selected_utc - expected_datetime_utc).total_seconds() / 60)
        logger.info(f"Shift time reference - Expected shift time: {expected_datetime_utc}, Selected time diff from expected: {expected_diff_minutes:.1f}min")
        
        # Check geofence - use project location if shift has no geofences
        project = db.query(Project).filter(Project.id == shift.project_id).first()
        geofences_to_check = get_geofences_for_shift(shift, project, db)
        
        inside_geo = True  # Default: allow if no geofences
        geo_risk = False
        if geofences_to_check and len(geofences_to_check) > 0:
            # Geofences are defined, so we need to validate
            if gps_lat and gps_lng:
                inside_geo, matching_geofence, geo_risk = inside_geofence(
                    float(gps_lat),
                    float(gps_lng),
                    geofences_to_check,
                    gps_accuracy_m
                )
                logger.info(f"Inside geofence: {inside_geo}, Geo risk: {geo_risk}")
            else:
                # No GPS data but geofences are required
                inside_geo = False
                geo_risk = True
                logger.info("No GPS data available but geofences are required")
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
        # For worker doing clock-in/out on their own shift:
        #   - If worker is on-site lead of the project: auto-approve immediately (no geofence/tolerance check needed)
        #   - Otherwise, auto-approve ONLY if BOTH inside geofence AND within 30min tolerance of CURRENT time
        #   - Tolerance is checked against current time (when submitting), not expected shift time
        #   - This allows users to record actual work time as long as it's within 30min of when they submit
        #   - geo_risk is logged but doesn't block auto-approval if location and time are correct
        #   - Otherwise, status is pending (requires supervisor approval)
        # For supervisor doing clock-in/out for another worker:
        #   - Auto-approve if rules met (reason already checked above)
        if is_worker_owner:
            # Worker doing clock-in/out on their own shift
            # If worker is on-site lead of the project, auto-approve immediately
            if is_onsite_lead:
                status = "approved"
                logger.info(f"Status: APPROVED (worker's own shift - on-site lead) - auto-approved regardless of geofence/tolerance")
            elif inside_geo and within_tolerance:
                # Both location and time tolerance requirements met → auto-approve
                # Note: geo_risk is logged for monitoring but doesn't block auto-approval
                # if the user is at the correct location (inside geofence) and within time tolerance
                status = "approved"
                logger.info(f"Status: APPROVED (worker's own shift) - inside_geo={inside_geo}, within_tolerance={within_tolerance} (diff: {diff_minutes:.1f}min), geo_risk={geo_risk}")
            else:
                # Location OR time tolerance requirement not met → pending (requires supervisor approval)
                status = "pending"
                reason_pending = []
                if not inside_geo:
                    reason_pending.append("outside geofence")
                if not within_tolerance:
                    reason_pending.append(f"outside time tolerance (diff: {diff_minutes:.1f}min, allowed: {tolerance_minutes}min)")
                logger.info(f"Status: PENDING (worker's own shift) - Reasons: {', '.join(reason_pending) if reason_pending else 'unknown'} - inside_geo={inside_geo}, within_tolerance={within_tolerance}, geo_risk={geo_risk}")
                
                # Require reason if outside geofence (not at the correct site)
                # If inside geofence but outside tolerance, reason is optional (location is correct, just timing)
                if not inside_geo:
                    logger.info(f"Checking reason_text requirement. Inside geo: {inside_geo}, Reason text length: {len(reason_text) if reason_text else 0}, Required: {settings.require_reason_min_chars}")
                    if not reason_text or len(reason_text) < settings.require_reason_min_chars:
                        logger.error(f"Reason text required but not provided or too short. Inside geo: {inside_geo}, Within tolerance: {within_tolerance}, Provided length: {len(reason_text) if reason_text else 0}, Required: {settings.require_reason_min_chars}")
                        raise HTTPException(
                            status_code=400,
                            detail=f"Reason text is required (minimum {settings.require_reason_min_chars} characters) when you are not at the correct site. Please describe the reason; your entry will be sent for supervisor review."
                        )
                # If inside geofence but outside tolerance, reason is optional (location is correct, just timing)
                # We'll create the attendance as pending and let supervisor review, but don't require reason
        elif is_authorized_supervisor and not is_worker_owner:
            # Supervisor doing clock-in/out for another worker
            # Check if user is on-site lead OR worker's supervisor - if so, auto-approve (but still require reason_text)
            if is_authorized_for_auto_approval:
                # On-site lead or worker's supervisor: auto-approve immediately (reason_text already checked above)
                status = "approved"
                logger.info(
                    f"Status: APPROVED (on-site lead or worker supervisor action - "
                    f"on-site lead: {is_onsite_lead}, worker supervisor: {is_worker_supervisor}, "
                    f"inside_geo={inside_geo}, within_tolerance={within_tolerance}, geo_risk={geo_risk})"
                )
            elif inside_geo and within_tolerance:
                # Other supervisor actions: auto-approve if rules met (reason already checked above)
                # Note: geo_risk is logged but doesn't block auto-approval if location and time are correct
                status = "approved"
                logger.info(f"Status: approved (supervisor action - rules met: inside_geo={inside_geo}, within_tolerance={within_tolerance}, geo_risk={geo_risk})")
            else:
                # Rules not met: status is pending
                status = "pending"
                logger.info(f"Status: pending (supervisor action - rules not met: inside_geo={inside_geo}, within_tolerance={within_tolerance}, geo_risk={geo_risk})")
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
        
        attendance = Attendance(
            shift_id=shift_id,
            worker_id=worker_id,
            type=attendance_type,
            time_entered_utc=time_entered_utc,
            time_selected_utc=time_selected_utc,
            status=status,
            source=source,
            created_by=user.id,
            reason_text=reason_text if reason_text else None,
            gps_lat=gps_lat_float,
            gps_lng=gps_lng_float,
            gps_accuracy_m=gps_accuracy_float,
            mocked_flag=mocked_flag,
            attachments=payload.get("attachments"),
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
                supervisor_id = str(worker_profile.manager_user_id)
                logger.info(f"Sending pending attendance notification to supervisor {supervisor_id} for worker {worker_id}")
                
                # Get project timezone for notification
                project = db.query(Project).filter(Project.id == shift.project_id).first()
                project_timezone = project.timezone if project else settings.tz_default
                
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
                "within_tolerance": within_tolerance,
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
            "type": attendance.type,
            "time_selected_utc": attendance.time_selected_utc.isoformat(),
            "status": attendance.status,
            "reason_text": attendance.reason_text,
            "inside_geofence": inside_geo,
            "within_tolerance": within_tolerance,
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
    
    # Round to 15 minutes
    time_selected_local = round_to_15_minutes(time_selected_local)
    
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
    
    # Check tolerance (both should be timezone-aware)
    within_tolerance = is_within_tolerance(time_selected_utc, expected_datetime_utc)
    
    # Check geofence (supervisor's location) - use project location if shift has no geofences
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
            # No GPS data but geofences are required
            inside_geo = False
            geo_risk = True
    else:
        # No geofences - location validation not required
        inside_geo = True
        geo_risk = False
    
    # Determine status
    # Auto-approve if supervisor is on-site AND within tolerance AND not risky GPS (if allowed)
    if settings.allow_supervisor_autoapprove_when_on_site and inside_geo and within_tolerance and not geo_risk:
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
            "within_tolerance": within_tolerance,
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
            time_selected_local = round_to_15_minutes(time_selected_local)
            
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
    
    within_tolerance = is_within_tolerance(attendance.time_selected_utc, expected_time_utc)
    
    inside_geo = True
    geo_risk = False
    # Check geofence - use project location if shift has no geofences
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
            # No GPS data but geofences are required
            inside_geo = False
            geo_risk = True
    else:
        # No geofences - location validation not required
        inside_geo = True
        geo_risk = False
    
    # Status remains pending after edit (supervisor must re-approve)
    # But ensure reason is present if outside rules
    if not (inside_geo and within_tolerance and not geo_risk):
        if not attendance.reason_text or len(attendance.reason_text.strip()) < settings.require_reason_min_chars:
            raise HTTPException(
                status_code=400,
                detail=f"Reason text is required (minimum {settings.require_reason_min_chars} characters) when outside geofence or tolerance"
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
    
    attendances = db.query(Attendance).filter(Attendance.shift_id == shift_id).order_by(Attendance.time_selected_utc.asc()).all()
    
    return [
        {
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
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "approved_at": a.approved_at.isoformat() if a.approved_at else None,
            "rejected_at": a.rejected_at.isoformat() if a.rejected_at else None,
            "rejection_reason": a.rejection_reason,
        }
        for a in attendances
    ]


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
    """
    from ..services.time_rules import utc_to_local
    from datetime import time as time_type
    
    # Convert attendance time to local time
    time_selected_local = utc_to_local(attendance.time_selected_utc, project_timezone)
    
    # Get or create timesheet entry for this shift and date
    existing_entry = db.query(ProjectTimeEntry).filter(
        ProjectTimeEntry.project_id == shift.project_id,
        ProjectTimeEntry.user_id == attendance.worker_id,
        ProjectTimeEntry.work_date == shift.date
    ).first()
    
    if attendance.type == "in":
        # Clock-in: create or update entry with start_time
        start_time_local = time_selected_local.time()
        
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
                    existing_entry.minutes = int(diff.total_seconds() / 60)
                else:
                    # Overnight shift
                    end_dt = end_dt + timedelta(days=1)
                    diff = end_dt - start_dt
                    existing_entry.minutes = int(diff.total_seconds() / 60)
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
                "time_selected": attendance.time_selected_utc.isoformat() if attendance.time_selected_utc else None,
                "time_entered": attendance.time_entered_utc.isoformat() if attendance.time_entered_utc else None,
                "status": attendance.status,
                "reason_text": attendance.reason_text,
                "gps_lat": float(attendance.gps_lat) if attendance.gps_lat is not None else None,
                "gps_lng": float(attendance.gps_lng) if attendance.gps_lng is not None else None,
                "gps_accuracy_m": float(attendance.gps_accuracy_m) if attendance.gps_accuracy_m is not None else None,
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
            
            # Create log with comprehensive attendance information
            log_changes = {
                "minutes": entry.minutes,
                "work_date": entry.work_date.isoformat(),
                "notes": entry.notes,
                "start_time": start_time_local.isoformat(),
                "attendance_type": "clock-in",
                "worker_id": str(attendance.worker_id),
                "performed_by": str(attendance.created_by),
                "time_selected": attendance.time_selected_utc.isoformat() if attendance.time_selected_utc else None,
                "time_entered": attendance.time_entered_utc.isoformat() if attendance.time_entered_utc else None,
                "status": attendance.status,
                "reason_text": attendance.reason_text,
                "gps_lat": float(attendance.gps_lat) if attendance.gps_lat is not None else None,
                "gps_lng": float(attendance.gps_lng) if attendance.gps_lng is not None else None,
                "gps_accuracy_m": float(attendance.gps_accuracy_m) if attendance.gps_accuracy_m is not None else None,
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
    
    elif attendance.type == "out":
        # Clock-out: update entry with end_time and calculate minutes
        end_time_local = time_selected_local.time()
        
        if existing_entry:
            # Update existing entry
            existing_entry.end_time = end_time_local
            # Calculate minutes
            from datetime import datetime, timedelta
            if existing_entry.start_time:
                start_dt = datetime.combine(shift.date, existing_entry.start_time)
                end_dt = datetime.combine(shift.date, existing_entry.end_time)
                if end_dt > start_dt:
                    diff = end_dt - start_dt
                    existing_entry.minutes = int(diff.total_seconds() / 60)
                else:
                    # Overnight shift
                    end_dt = end_dt + timedelta(days=1)
                    diff = end_dt - start_dt
                    existing_entry.minutes = int(diff.total_seconds() / 60)
            else:
                # No start time, use shift start time
                start_dt = datetime.combine(shift.date, shift.start_time)
                end_dt = datetime.combine(shift.date, existing_entry.end_time)
                if end_dt > start_dt:
                    diff = end_dt - start_dt
                    existing_entry.minutes = int(diff.total_seconds() / 60)
                else:
                    end_dt = end_dt + timedelta(days=1)
                    diff = end_dt - start_dt
                    existing_entry.minutes = int(diff.total_seconds() / 60)
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
                "time_selected": attendance.time_selected_utc.isoformat() if attendance.time_selected_utc else None,
                "time_entered": attendance.time_entered_utc.isoformat() if attendance.time_entered_utc else None,
                "status": attendance.status,
                "reason_text": attendance.reason_text,
                "gps_lat": float(attendance.gps_lat) if attendance.gps_lat is not None else None,
                "gps_lng": float(attendance.gps_lng) if attendance.gps_lng is not None else None,
                "gps_accuracy_m": float(attendance.gps_accuracy_m) if attendance.gps_accuracy_m is not None else None,
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
                "time_selected": attendance.time_selected_utc.isoformat() if attendance.time_selected_utc else None,
                "time_entered": attendance.time_entered_utc.isoformat() if attendance.time_entered_utc else None,
                "status": attendance.status,
                "reason_text": attendance.reason_text,
                "gps_lat": float(attendance.gps_lat) if attendance.gps_lat is not None else None,
                "gps_lng": float(attendance.gps_lng) if attendance.gps_lng is not None else None,
                "gps_accuracy_m": float(attendance.gps_accuracy_m) if attendance.gps_accuracy_m is not None else None,
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

