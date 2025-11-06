import uuid
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..auth.security import get_current_user, require_permissions
from ..models.models import Task, User, Invite, EmployeeProfile, SettingItem, SettingList


router = APIRouter(prefix="/tasks", tags=["tasks"])


def get_user_division_id(db: Session, user_id: uuid.UUID) -> Optional[uuid.UUID]:
    """Get user's division_id from their profile or division string."""
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first()
    if not profile:
        return None
    
    # If division is stored as string, try to find matching SettingItem
    division_str = getattr(profile, 'division', None)
    if division_str:
        # Find division by label in settings
        divisions_list = db.query(SettingList).filter(SettingList.name == "divisions").first()
        if divisions_list:
            division_item = db.query(SettingItem).filter(
                SettingItem.list_id == divisions_list.id,
                SettingItem.label == division_str
            ).first()
            if division_item:
                return division_item.id
    
    # Check if there's a division_id field directly (if added later)
    division_id = getattr(profile, 'division_id', None)
    if division_id:
        return division_id
    
    return None


@router.get("")
def list_tasks(
    division_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    task_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    query = db.query(Task)
    
    # Filter by division_id if provided
    if division_id:
        try:
            div_uuid = uuid.UUID(str(division_id))
            query = query.filter(Task.division_id == div_uuid)
        except Exception:
            pass
    
    # Filter by status if provided
    if status:
        query = query.filter(Task.status == status)
    
    # Filter by task_type if provided
    if task_type:
        query = query.filter(Task.task_type == task_type)
    
    # Filter by user's division if not admin and no explicit division filter
    is_admin = any(r.name == "admin" for r in me.roles)
    if not is_admin and not division_id:
        user_division_id = get_user_division_id(db, me.id)
        if user_division_id:
            query = query.filter(Task.division_id == user_division_id)
        else:
            # If user has no division, return empty list
            return []
    
    tasks = query.order_by(Task.created_at.desc()).limit(200).all()
    
    return [
        {
            "id": str(t.id),
            "title": t.title,
            "description": t.description,
            "task_type": t.task_type,
            "status": t.status,
            "priority": t.priority,
            "division_id": str(t.division_id) if t.division_id else None,
            "invite_id": str(t.invite_id) if t.invite_id else None,
            "user_id": str(t.user_id) if t.user_id else None,
            "assigned_to": str(t.assigned_to) if t.assigned_to else None,
            "metadata": t.metadata,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        }
        for t in tasks
    ]


@router.get("/{task_id}")
def get_task(task_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    try:
        task_uuid = uuid.UUID(str(task_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid task id")
    
    task = db.query(Task).filter(Task.id == task_uuid).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check if user can access this task (same division or admin)
    is_admin = any(r.name == "admin" for r in me.roles)
    if not is_admin and task.division_id:
        user_division_id = get_user_division_id(db, me.id)
        if user_division_id != task.division_id:
            raise HTTPException(status_code=403, detail="Forbidden")
    
    return {
        "id": str(task.id),
        "title": task.title,
        "description": task.description,
        "task_type": task.task_type,
        "status": task.status,
        "priority": task.priority,
        "division_id": str(task.division_id) if task.division_id else None,
        "invite_id": str(task.invite_id) if task.invite_id else None,
        "user_id": str(task.user_id) if task.user_id else None,
        "assigned_to": str(task.assigned_to) if task.assigned_to else None,
        "metadata": task.metadata,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
    }


@router.patch("/{task_id}")
def update_task(
    task_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    try:
        task_uuid = uuid.UUID(str(task_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid task id")
    
    task = db.query(Task).filter(Task.id == task_uuid).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check if user can access this task (same division or admin)
    is_admin = any(r.name == "admin" for r in me.roles)
    if not is_admin and task.division_id:
        user_division_id = get_user_division_id(db, me.id)
        if user_division_id != task.division_id:
            raise HTTPException(status_code=403, detail="Forbidden")
    
    # Update fields
    if "status" in payload:
        task.status = payload["status"]
        if payload["status"] == "completed" and not task.completed_at:
            task.completed_at = datetime.utcnow()
        elif payload["status"] != "completed":
            task.completed_at = None
    
    if "assigned_to" in payload:
        if payload["assigned_to"]:
            try:
                task.assigned_to = uuid.UUID(str(payload["assigned_to"]))
            except Exception:
                pass
        else:
            task.assigned_to = None
    
    if "priority" in payload:
        task.priority = payload["priority"]
    
    if "description" in payload:
        task.description = payload["description"]
    
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    
    return {
        "id": str(task.id),
        "title": task.title,
        "description": task.description,
        "task_type": task.task_type,
        "status": task.status,
        "priority": task.priority,
        "division_id": str(task.division_id) if task.division_id else None,
        "invite_id": str(task.invite_id) if task.invite_id else None,
        "user_id": str(task.user_id) if task.user_id else None,
        "assigned_to": str(task.assigned_to) if task.assigned_to else None,
        "metadata": task.metadata,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
    }
