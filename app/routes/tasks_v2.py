import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from ..auth.security import get_current_user
from ..db import get_db
from ..models.models import EmployeeProfile, TaskItem, User
from ..services.task_service import get_user_display


router = APIRouter(prefix="/tasks", tags=["tasks"])


def _get_viewer_division(db: Session, user_id: uuid.UUID) -> Optional[str]:
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first()
    return profile.division if profile else None


def _serialize_task(task: TaskItem, viewer_id: uuid.UUID, viewer_division: Optional[str]) -> Dict[str, Any]:
    is_owner = task.assigned_to_id == viewer_id
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


def _tasks_for_user(db: Session, me: User, viewer_division: Optional[str]):
    filters = [TaskItem.assigned_to_id == me.id]
    if viewer_division:
        filters.append(
            and_(TaskItem.assigned_to_id.is_(None), TaskItem.assigned_division_label == viewer_division)
        )
    return (
        db.query(TaskItem)
        .filter(or_(*filters))
        .order_by(TaskItem.created_at.desc())
        .all()
    )


@router.get("")
def list_tasks(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    viewer_division = _get_viewer_division(db, me.id)
    tasks = _tasks_for_user(db, me, viewer_division)
    grouped: Dict[str, list] = {"accepted": [], "in_progress": [], "done": []}
    for task in tasks:
        payload = _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division)
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


def _ensure_view_permission(task: TaskItem, me: User, viewer_division: Optional[str]) -> None:
    if task.assigned_to_id == me.id:
        return
    if task.assigned_to_id is None and task.assigned_division_label and viewer_division == task.assigned_division_label:
        return
    raise HTTPException(status_code=403, detail="You do not have access to this task")


@router.get("/{task_id}")
def get_task(task_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    viewer_division = _get_viewer_division(db, me.id)
    task = _get_task(task_id, db)
    _ensure_view_permission(task, me, viewer_division)
    return _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division)


@router.post("/{task_id}/start")
def start_task(task_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    viewer_division = _get_viewer_division(db, me.id)
    task = _get_task(task_id, db)
    _ensure_view_permission(task, me, viewer_division)
    if task.status != "accepted":
        raise HTTPException(status_code=400, detail="Task is not in Accepted status")

    if task.assigned_to_id and task.assigned_to_id != me.id:
        raise HTTPException(status_code=403, detail="Task is assigned to another user")

    if not task.assigned_to_id:
        if not viewer_division or task.assigned_division_label != viewer_division:
            raise HTTPException(status_code=403, detail="Task is not assigned to your division")
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
    return _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division)


@router.post("/{task_id}/conclude")
def conclude_task(task_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    viewer_division = _get_viewer_division(db, me.id)
    task = _get_task(task_id, db)
    _ensure_view_permission(task, me, viewer_division)
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
    return _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division)

