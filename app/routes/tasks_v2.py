import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from ..auth.security import get_current_user
from ..db import get_db
from ..models.models import EmployeeProfile, SettingItem, TaskItem, User
from ..services.task_service import get_user_display


router = APIRouter(prefix="/tasks", tags=["tasks"])


def _get_viewer_divisions(db: Session, user_id: uuid.UUID) -> list[str]:
    """
    Get user's division labels (supports multiple divisions).
    Checks both user.divisions (many-to-many with SettingItem) and EmployeeProfile.division (legacy).
    Returns a list of division labels.
    """
    divisions = []
    
    # Load user with divisions relationship
    user = db.query(User).options(joinedload(User.divisions)).filter(User.id == user_id).first()
    if not user:
        return divisions
    
    # First check user.divisions (new system - many-to-many with SettingItem)
    if hasattr(user, 'divisions') and user.divisions:
        for division in user.divisions:
            if hasattr(division, 'label') and division.label:
                divisions.append(division.label)
    
    # Fallback to EmployeeProfile.division (legacy system) - only if no divisions found
    if not divisions:
        profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first()
        if profile and profile.division:
            divisions.append(profile.division)
    
    return divisions


def _get_viewer_division(db: Session, user_id: uuid.UUID) -> Optional[str]:
    """
    Get user's first division label (for backward compatibility).
    """
    divisions = _get_viewer_divisions(db, user_id)
    return divisions[0] if divisions else None


def _serialize_task(task: TaskItem, viewer_id: uuid.UUID, viewer_division: Optional[str], viewer_divisions: Optional[list[str]] = None) -> Dict[str, Any]:
    is_owner = task.assigned_to_id == viewer_id
    # Check if user is member of the task's division (supports multiple divisions)
    if viewer_divisions:
        is_division_member = task.assigned_division_label and task.assigned_division_label in viewer_divisions
    else:
        # Fallback to single division check for backward compatibility
        is_division_member = task.assigned_division_label and viewer_division == task.assigned_division_label
    return {
        "id": str(task.id),
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "requested_by": {
            "id": str(task.requested_by_id) if task.requested_by_id else None,
            "name": task.requested_by_name,
        },
        "assigned_to": {
            "id": str(task.assigned_to_id) if task.assigned_to_id else None,
            "name": task.assigned_to_name,
            "division": task.assigned_division_label,
        },
        "project": {
            "id": str(task.project_id) if task.project_id else None,
            "name": task.project_name,
            "code": task.project_code,
        },
        "origin": {
            "type": task.origin_type,
            "reference": task.origin_reference,
            "id": task.origin_id,
        },
        "request": {
            "id": str(task.request.id),
            "title": task.request.title,
            "status": task.request.status,
        } if task.request else None,
        "created_at": task.created_at.isoformat(),
        "started_at": task.started_at.isoformat() if task.started_at else None,
        "started_by": {
            "id": str(task.started_by_id) if task.started_by_id else None,
            "name": task.started_by_name,
        } if task.started_by_id else None,
        "concluded_at": task.concluded_at.isoformat() if task.concluded_at else None,
        "concluded_by": {
            "id": str(task.concluded_by_id) if task.concluded_by_id else None,
            "name": task.concluded_by_name,
        } if task.concluded_by_id else None,
        "permissions": {
            "can_start": task.status == "accepted" and (is_owner or (not task.assigned_to_id and is_division_member)),
            "can_conclude": task.status == "in_progress" and (is_owner or (not task.assigned_to_id and is_division_member)),
        },
    }


def _tasks_for_user(db: Session, me: User, viewer_divisions: list[str]):
    """
    Get tasks for user:
    - Tasks assigned directly to the user
    - Tasks assigned to any of the user's divisions (when not assigned to specific user)
    """
    filters = [TaskItem.assigned_to_id == me.id]
    
    if viewer_divisions:
        # Tasks assigned to any of the user's divisions (when not assigned to specific user)
        division_filters = [
            and_(
                TaskItem.assigned_to_id.is_(None),
                TaskItem.assigned_division_label == div_label
            )
            for div_label in viewer_divisions
        ]
        if division_filters:
            filters.append(or_(*division_filters))
    
    return (
        db.query(TaskItem)
        .filter(or_(*filters))
        .order_by(TaskItem.created_at.desc())
        .all()
    )


@router.get("")
def list_tasks(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    viewer_divisions = _get_viewer_divisions(db, me.id)
    viewer_division = viewer_divisions[0] if viewer_divisions else None  # For backward compatibility in serialization
    tasks = _tasks_for_user(db, me, viewer_divisions)
    grouped: Dict[str, list] = {"accepted": [], "in_progress": [], "done": []}
    for task in tasks:
        payload = _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division, viewer_divisions=viewer_divisions)
        grouped.setdefault(task.status, []).append(payload)
    return grouped


def _get_task(task_id: str, db: Session) -> TaskItem:
    try:
        task_uuid = uuid.UUID(str(task_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid task id") from exc
    task = db.query(TaskItem).filter(TaskItem.id == task_uuid).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _ensure_view_permission(task: TaskItem, me: User, viewer_divisions: list[str]) -> None:
    if task.assigned_to_id == me.id:
        return
    if task.assigned_to_id is None and task.assigned_division_label:
        if task.assigned_division_label in viewer_divisions:
            return
    raise HTTPException(status_code=403, detail="You do not have access to this task")


@router.get("/{task_id}")
def get_task(task_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    viewer_divisions = _get_viewer_divisions(db, me.id)
    viewer_division = viewer_divisions[0] if viewer_divisions else None  # For backward compatibility
    task = _get_task(task_id, db)
    _ensure_view_permission(task, me, viewer_divisions)
    return _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division, viewer_divisions=viewer_divisions)


@router.post("/{task_id}/start")
def start_task(task_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    viewer_divisions = _get_viewer_divisions(db, me.id)
    viewer_division = viewer_divisions[0] if viewer_divisions else None  # For backward compatibility
    task = _get_task(task_id, db)
    _ensure_view_permission(task, me, viewer_divisions)
    if task.status != "accepted":
        raise HTTPException(status_code=400, detail="Task is not in Accepted status")

    if task.assigned_to_id and task.assigned_to_id != me.id:
        raise HTTPException(status_code=403, detail="Task is assigned to another user")

    if not task.assigned_to_id:
        if not viewer_divisions or task.assigned_division_label not in viewer_divisions:
            raise HTTPException(status_code=403, detail="Task is not assigned to any of your divisions")
        task.assigned_to_id = me.id
        task.assigned_to_name = get_user_display(db, me.id)

    now = datetime.utcnow()
    task.status = "in_progress"
    task.started_at = now
    task.started_by_id = me.id
    task.started_by_name = get_user_display(db, me.id)
    task.updated_at = now

    db.commit()
    db.refresh(task)
    return _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division, viewer_divisions=viewer_divisions)


@router.post("/{task_id}/conclude")
def conclude_task(task_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    viewer_divisions = _get_viewer_divisions(db, me.id)
    viewer_division = viewer_divisions[0] if viewer_divisions else None  # For backward compatibility
    task = _get_task(task_id, db)
    _ensure_view_permission(task, me, viewer_divisions)
    if task.status != "in_progress":
        raise HTTPException(status_code=400, detail="Task is not In Progress")

    if task.assigned_to_id and task.assigned_to_id != me.id:
        raise HTTPException(status_code=403, detail="Task is assigned to another user")

    now = datetime.utcnow()
    task.status = "done"
    task.concluded_at = now
    task.concluded_by_id = me.id
    task.concluded_by_name = get_user_display(db, me.id)
    task.updated_at = now

    db.commit()
    db.refresh(task)
    return _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division, viewer_divisions=viewer_divisions)

