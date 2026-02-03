import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, joinedload

from ..auth.security import get_current_user
from ..db import get_db
from ..models.models import EmployeeProfile, SettingItem, TaskItem, TaskLogEntry, User, user_divisions
from ..services.task_service import create_task_item, get_user_display


router = APIRouter(prefix="/tasks", tags=["tasks"])


class TaskTitleUpdate(BaseModel):
    title: str


class TaskDescriptionUpdate(BaseModel):
    description: Optional[str] = None


class TaskUpdate(BaseModel):
    """Partial update for task (priority, assignment). Only provided fields are updated."""
    priority: Optional[str] = None
    assigned_user_id: Optional[str] = None  # UUID; set to clear division and assign to user
    assigned_division_id: Optional[str] = None  # SettingItem UUID; set to clear user and assign to division


VALID_PRIORITIES = {"low", "normal", "high", "urgent"}


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "normal"
    due_date: Optional[datetime] = None
    assigned_user_ids: Optional[list[str]] = None  # Array of user IDs
    assigned_division_ids: Optional[list[str]] = None  # Array of division (SettingItem) IDs


class TaskLogCreate(BaseModel):
    message: str


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
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
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
        "archived_at": task.archived_at.isoformat() if task.archived_at else None,
        "permissions": {
            "can_start": task.status == "accepted" and (is_owner or is_division_member),
            "can_conclude": task.status == "in_progress" and (is_owner or is_division_member),
            "can_block": task.status == "in_progress" and (is_owner or is_division_member),
            "can_unblock": task.status == "blocked" and (is_owner or is_division_member),
            "can_archive": task.status == "done" and task.archived_at is None and (is_owner or is_division_member),
            "can_delete": task.requested_by_id == viewer_id,  # Only if user created the task
        },
    }


def _tasks_for_user(db: Session, me: User, viewer_divisions: list[str]):
    """
    Get tasks for user:
    - Tasks assigned directly to the user
    - Tasks assigned to any of the user's divisions (when not assigned to specific user)
    - Excludes archived tasks (archived_at IS NULL)
    """
    ownership_filters = [TaskItem.assigned_to_id == me.id]
    
    if viewer_divisions:
        # Tasks assigned to any of the user's divisions (division-scoped tasks)
        # Do NOT require assigned_to_id IS NULL; division members can always see the task.
        division_filters = [TaskItem.assigned_division_label == div_label for div_label in viewer_divisions]
        if division_filters:
            ownership_filters.append(or_(*division_filters))
    
    # Combine ownership filters with OR, then AND with archived_at IS NULL
    return (
        db.query(TaskItem)
        .filter(
            and_(
                or_(*ownership_filters),
                TaskItem.archived_at.is_(None)
            )
        )
        .order_by(TaskItem.created_at.desc())
        .all()
    )


def _tasks_filter_for_user(me: User, viewer_divisions: list[str]):
    """
    Build a SQLAlchemy filter for tasks visible to a user:
    - Direct assignment to the user
    - Division-scoped tasks for any of the user's divisions
    """
    ownership_filters = [TaskItem.assigned_to_id == me.id]
    if viewer_divisions:
        ownership_filters.append(TaskItem.assigned_division_label.in_(viewer_divisions))
    return or_(*ownership_filters)


@router.get("")
def list_tasks(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    viewer_divisions = _get_viewer_divisions(db, me.id)
    viewer_division = viewer_divisions[0] if viewer_divisions else None  # For backward compatibility in serialization
    tasks = _tasks_for_user(db, me, viewer_divisions)
    grouped: Dict[str, list] = {"accepted": [], "in_progress": [], "blocked": [], "done": []}
    for task in tasks:
        payload = _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division, viewer_divisions=viewer_divisions)
        grouped.setdefault(task.status, []).append(payload)
    return grouped


@router.get("/sync")
def tasks_sync(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    """
    Lightweight endpoint for polling.
    Returns the most recent updated_at among the user's visible non-archived tasks.
    Frontend can poll this frequently and only refetch /tasks when it changes.
    """
    viewer_divisions = _get_viewer_divisions(db, me.id)
    latest = (
        db.query(func.max(TaskItem.updated_at))
        .filter(and_(_tasks_filter_for_user(me, viewer_divisions), TaskItem.archived_at.is_(None)))
        .scalar()
    )
    return {
        "latest_task_updated_at": latest.isoformat() if latest else None,
        "server_time": datetime.utcnow().isoformat(),
    }


@router.get("/archived")
def list_archived_tasks(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    """
    Get archived tasks for the current user.
    Returns tasks that have archived_at IS NOT NULL.
    """
    viewer_divisions = _get_viewer_divisions(db, me.id)
    viewer_division = viewer_divisions[0] if viewer_divisions else None  # For backward compatibility in serialization
    
    # Build ownership filters (same as _tasks_for_user)
    ownership_filters = [TaskItem.assigned_to_id == me.id]
    
    if viewer_divisions:
        division_filters = [TaskItem.assigned_division_label == div_label for div_label in viewer_divisions]
        if division_filters:
            ownership_filters.append(or_(*division_filters))
    
    # Get archived tasks (archived_at IS NOT NULL)
    archived_tasks = (
        db.query(TaskItem)
        .filter(
            and_(
                or_(*ownership_filters),
                TaskItem.archived_at.isnot(None)
            )
        )
        .order_by(TaskItem.archived_at.desc())  # Most recently archived first
        .all()
    )
    
    return [
        _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division, viewer_divisions=viewer_divisions)
        for task in archived_tasks
    ]


def _get_users_in_divisions(db: Session, division_ids: list[uuid.UUID]) -> list[User]:
    """
    Get all users that belong to any of the given divisions.
    Uses the user_divisions many-to-many relationship.
    """
    if not division_ids:
        return []
    
    # Query users that have any of the given division_ids
    # Use distinct(User.id) instead of distinct() to avoid PostgreSQL JSON comparison issues
    users = (
        db.query(User)
        .join(user_divisions, User.id == user_divisions.c.user_id)
        .filter(user_divisions.c.division_id.in_(division_ids))
        .filter(User.is_active == True)  # Only active users
        .distinct(User.id)
        .all()
    )
    return users


@router.post("", status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    viewer_divisions = _get_viewer_divisions(db, me.id)
    viewer_division = viewer_divisions[0] if viewer_divisions else None  # For backward compatibility

    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    assigned_user_ids_raw = payload.assigned_user_ids or []
    assigned_division_ids_raw = payload.assigned_division_ids or []

    created_tasks: list[TaskItem] = []
    origin_id = str(uuid.uuid4())  # Same origin_id for all tasks created in this batch

    # Division assignment => create ONE shared task per division (visible/synced for all members)
    if assigned_division_ids_raw:
        division_ids: list[uuid.UUID] = []
        for div_id_str in assigned_division_ids_raw:
            try:
                division_ids.append(uuid.UUID(div_id_str))
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid division ID: {div_id_str}")

        divisions = db.query(SettingItem).filter(SettingItem.id.in_(division_ids)).all()
        if not divisions:
            raise HTTPException(status_code=400, detail="No valid divisions specified")

        for div in divisions:
            div_label = getattr(div, "label", None)
            if not div_label:
                continue
            task = create_task_item(
                db,
                title=title,
                description=(payload.description or "").strip() or None,
                requested_by_id=me.id,
                assigned_to_id=None,
                priority=payload.priority or "normal",
                due_date=payload.due_date,
                origin_type="manual_request",
                origin_reference="Manual",
                origin_id=origin_id,
                assigned_division_label=div_label,
                request=None,
            )
            task.status = "accepted"
            task.updated_at = datetime.utcnow()
            _add_task_log(db, task, me, "created", f'Task created: "{title}"')
            created_tasks.append(task)

    # Direct user assignment => keep legacy behavior (one task per user)
    elif assigned_user_ids_raw:
        target_user_ids: list[uuid.UUID] = []
        for user_id_str in assigned_user_ids_raw:
            try:
                target_user_ids.append(uuid.UUID(user_id_str))
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid user ID: {user_id_str}")

        for user_id in target_user_ids:
            target_user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
            if not target_user:
                continue
            task = create_task_item(
                db,
                title=title,
                description=(payload.description or "").strip() or None,
                requested_by_id=me.id,
                assigned_to_id=user_id,
                priority=payload.priority or "normal",
                due_date=payload.due_date,
                origin_type="manual_request",
                origin_reference="Manual",
                origin_id=origin_id,
                assigned_division_label=None,
                request=None,
            )
            task.status = "accepted"
            task.updated_at = datetime.utcnow()
            _add_task_log(db, task, me, "created", f'Task created: "{title}"')
            created_tasks.append(task)

    # No assignment => default to current user (backward compatibility)
    else:
        task = create_task_item(
            db,
            title=title,
            description=(payload.description or "").strip() or None,
            requested_by_id=me.id,
            assigned_to_id=me.id,
            priority=payload.priority or "normal",
            due_date=payload.due_date,
            origin_type="manual_request",
            origin_reference="Manual",
            origin_id=origin_id,
            assigned_division_label=None,
            request=None,
        )
        task.status = "accepted"
        task.updated_at = datetime.utcnow()
        _add_task_log(db, task, me, "created", f'Task created: "{title}"')
        created_tasks.append(task)

    if not created_tasks:
        raise HTTPException(status_code=400, detail="No valid assignees found")

    db.commit()

    # Return the first created task (frontend will refresh the list)
    db.refresh(created_tasks[0])
    return _serialize_task(created_tasks[0], viewer_id=me.id, viewer_division=viewer_division, viewer_divisions=viewer_divisions)


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
    # Division-scoped tasks: any member of the division can view (even if the task is "claimed")
    if task.assigned_division_label and task.assigned_division_label in (viewer_divisions or []):
        return
    raise HTTPException(status_code=403, detail="You do not have access to this task")


def _ensure_action_permission(task: TaskItem, me: User, viewer_divisions: list[str]) -> None:
    """
    Ensure the viewer can perform a state transition action on the task.
    Mirrors the owner-or-division-member rules used by start/conclude permissions.
    """
    is_owner = task.assigned_to_id == me.id
    is_division_member = task.assigned_division_label is not None and task.assigned_division_label in (viewer_divisions or [])
    if not (is_owner or is_division_member):
        raise HTTPException(status_code=403, detail="You do not have permission to update this task")
    # If it's assigned to someone else AND you don't have division access, block the action
    if task.assigned_to_id and task.assigned_to_id != me.id and not is_division_member:
        raise HTTPException(status_code=403, detail="Task is assigned to another user")


def _serialize_log_entry(entry: TaskLogEntry) -> Dict[str, Any]:
    return {
        "id": str(entry.id),
        "task_id": str(entry.task_id),
        "type": entry.entry_type,
        "message": entry.message,
        "actor": {
            "id": str(entry.actor_id) if entry.actor_id else None,
            "name": entry.actor_name,
        },
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
    }


def _add_task_log(
    db: Session,
    task: TaskItem,
    me: Optional[User],
    entry_type: str,
    message: str,
) -> None:
    msg = (message or "").strip()
    if not msg:
        return
    actor_id = me.id if me else None
    actor_name = get_user_display(db, me.id) if me else "System"
    db.add(
        TaskLogEntry(
            task_id=task.id,
            entry_type=entry_type,
            message=msg,
            actor_id=actor_id,
            actor_name=actor_name,
        )
    )


@router.get("/{task_id}/sync")
def task_sync(task_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    """
    Lightweight endpoint for polling a single task modal.
    Returns task.updated_at and the latest log entry timestamp.
    """
    viewer_divisions = _get_viewer_divisions(db, me.id)
    task = _get_task(task_id, db)
    _ensure_view_permission(task, me, viewer_divisions)

    latest_log = (
        db.query(func.max(TaskLogEntry.created_at))
        .filter(TaskLogEntry.task_id == task.id)
        .scalar()
    )
    return {
        "task_updated_at": task.updated_at.isoformat() if task.updated_at else None,
        "log_last_created_at": latest_log.isoformat() if latest_log else None,
        "server_time": datetime.utcnow().isoformat(),
    }


@router.get("/{task_id}")
def get_task(task_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    viewer_divisions = _get_viewer_divisions(db, me.id)
    viewer_division = viewer_divisions[0] if viewer_divisions else None  # For backward compatibility
    task = _get_task(task_id, db)
    _ensure_view_permission(task, me, viewer_divisions)
    return _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division, viewer_divisions=viewer_divisions)


@router.patch("/{task_id}/title")
def update_task_title(
    task_id: str,
    payload: TaskTitleUpdate,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    viewer_divisions = _get_viewer_divisions(db, me.id)
    viewer_division = viewer_divisions[0] if viewer_divisions else None  # For backward compatibility
    task = _get_task(task_id, db)
    _ensure_view_permission(task, me, viewer_divisions)

    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    old_title = task.title or ""
    task.title = title
    task.updated_at = datetime.utcnow()
    if old_title.strip() != title.strip():
        _add_task_log(db, task, me, "title_changed", f'Title changed: "{old_title}" → "{title}"')
    db.commit()
    db.refresh(task)
    return _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division, viewer_divisions=viewer_divisions)


@router.patch("/{task_id}/description")
def update_task_description(
    task_id: str,
    payload: TaskDescriptionUpdate,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    viewer_divisions = _get_viewer_divisions(db, me.id)
    viewer_division = viewer_divisions[0] if viewer_divisions else None  # For backward compatibility
    task = _get_task(task_id, db)
    _ensure_view_permission(task, me, viewer_divisions)

    old_desc = (task.description or "").strip()
    new_desc = (payload.description or "").strip()
    task.description = payload.description or ""
    task.updated_at = datetime.utcnow()
    if old_desc != new_desc:
        _add_task_log(db, task, me, "description_changed", "Description updated")
    db.commit()
    db.refresh(task)
    return _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division, viewer_divisions=viewer_divisions)


@router.patch("/{task_id}")
def update_task(
    task_id: str,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Update task priority and/or assignment. Only provided fields are updated."""
    viewer_divisions = _get_viewer_divisions(db, me.id)
    viewer_division = viewer_divisions[0] if viewer_divisions else None
    task = _get_task(task_id, db)
    _ensure_view_permission(task, me, viewer_divisions)
    _ensure_action_permission(task, me, viewer_divisions)

    changes: list[str] = []

    if payload.priority is not None:
        priority = (payload.priority or "normal").lower()
        if priority not in VALID_PRIORITIES:
            raise HTTPException(status_code=400, detail=f"Invalid priority. Must be one of: {sorted(VALID_PRIORITIES)}")
        if task.priority != priority:
            task.priority = priority
            changes.append(f"Priority set to {priority}")

    assignment_cleared = False

    if payload.assigned_division_id is not None:
        if payload.assigned_division_id == "":
            task.assigned_to_id = None
            task.assigned_to_name = None
            task.assigned_division_label = None
            assignment_cleared = True
        else:
            try:
                div_uuid = uuid.UUID(payload.assigned_division_id)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid division ID")
            div = db.query(SettingItem).filter(SettingItem.id == div_uuid).first()
            if not div or not getattr(div, "label", None):
                raise HTTPException(status_code=400, detail="Division not found")
            div_label = div.label
            task.assigned_to_id = None
            task.assigned_to_name = None
            task.assigned_division_label = div_label
            changes.append(f"Assigned to division: {div_label}")

    if payload.assigned_user_id is not None:
        if payload.assigned_user_id == "":
            task.assigned_to_id = None
            task.assigned_to_name = None
            task.assigned_division_label = None
            assignment_cleared = True
        else:
            try:
                user_uuid = uuid.UUID(payload.assigned_user_id)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid user ID")
            user = db.query(User).filter(User.id == user_uuid, User.is_active == True).first()
            if not user:
                raise HTTPException(status_code=400, detail="User not found")
            task.assigned_to_id = user.id
            task.assigned_to_name = get_user_display(db, user.id)
            task.assigned_division_label = None
            changes.append(f"Assigned to: {task.assigned_to_name}")

    if assignment_cleared and not any("Assigned to" in c for c in changes):
        changes.append("Assignment cleared")

    if not changes:
        db.refresh(task)
        return _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division, viewer_divisions=viewer_divisions)

    task.updated_at = datetime.utcnow()
    _add_task_log(db, task, me, "updated", "; ".join(changes))
    db.commit()
    db.refresh(task)
    return _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division, viewer_divisions=viewer_divisions)


@router.post("/{task_id}/block")
def block_task(task_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    viewer_divisions = _get_viewer_divisions(db, me.id)
    viewer_division = viewer_divisions[0] if viewer_divisions else None  # For backward compatibility
    task = _get_task(task_id, db)
    _ensure_view_permission(task, me, viewer_divisions)
    _ensure_action_permission(task, me, viewer_divisions)

    if task.status != "in_progress":
        raise HTTPException(status_code=400, detail="Task is not In Progress")

    now = datetime.utcnow()
    task.status = "blocked"
    task.updated_at = now
    _add_task_log(db, task, me, "status_changed", "Status changed: In progress → Blocked")

    db.commit()
    db.refresh(task)
    return _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division, viewer_divisions=viewer_divisions)


@router.post("/{task_id}/unblock")
def unblock_task(task_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    viewer_divisions = _get_viewer_divisions(db, me.id)
    viewer_division = viewer_divisions[0] if viewer_divisions else None  # For backward compatibility
    task = _get_task(task_id, db)
    _ensure_view_permission(task, me, viewer_divisions)
    _ensure_action_permission(task, me, viewer_divisions)

    if task.status != "blocked":
        raise HTTPException(status_code=400, detail="Task is not Blocked")

    now = datetime.utcnow()
    task.status = "in_progress"
    task.updated_at = now
    _add_task_log(db, task, me, "status_changed", "Status changed: Blocked → In progress")

    db.commit()
    db.refresh(task)
    return _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division, viewer_divisions=viewer_divisions)


@router.post("/{task_id}/start")
def start_task(task_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    viewer_divisions = _get_viewer_divisions(db, me.id)
    viewer_division = viewer_divisions[0] if viewer_divisions else None  # For backward compatibility
    task = _get_task(task_id, db)
    _ensure_view_permission(task, me, viewer_divisions)
    _ensure_action_permission(task, me, viewer_divisions)
    if task.status != "accepted":
        raise HTTPException(status_code=400, detail="Task is not in Accepted status")

    # Division-scoped tasks are collaborative: do NOT "claim" by setting assigned_to_id.
    # For user-assigned tasks, keep ownership rules (handled by _ensure_action_permission + assigned_to_id checks).
    if task.assigned_division_label is None:
        if task.assigned_to_id and task.assigned_to_id != me.id:
            raise HTTPException(status_code=403, detail="Task is assigned to another user")

    now = datetime.utcnow()
    task.status = "in_progress"
    task.started_at = now
    task.started_by_id = me.id
    task.started_by_name = get_user_display(db, me.id)
    task.updated_at = now
    _add_task_log(db, task, me, "status_changed", "Status changed: To do → In progress")

    db.commit()
    db.refresh(task)
    return _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division, viewer_divisions=viewer_divisions)


@router.post("/{task_id}/conclude")
def conclude_task(task_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    viewer_divisions = _get_viewer_divisions(db, me.id)
    viewer_division = viewer_divisions[0] if viewer_divisions else None  # For backward compatibility
    task = _get_task(task_id, db)
    _ensure_view_permission(task, me, viewer_divisions)
    _ensure_action_permission(task, me, viewer_divisions)
    if task.status != "in_progress":
        raise HTTPException(status_code=400, detail="Task is not In Progress")

    now = datetime.utcnow()
    task.status = "done"
    task.concluded_at = now
    task.concluded_by_id = me.id
    task.concluded_by_name = get_user_display(db, me.id)
    task.updated_at = now
    _add_task_log(db, task, me, "status_changed", "Status changed: In progress → Done")

    db.commit()
    db.refresh(task)
    return _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division, viewer_divisions=viewer_divisions)


@router.post("/{task_id}/archive")
def archive_task(task_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    viewer_divisions = _get_viewer_divisions(db, me.id)
    viewer_division = viewer_divisions[0] if viewer_divisions else None  # For backward compatibility
    task = _get_task(task_id, db)
    _ensure_view_permission(task, me, viewer_divisions)
    _ensure_action_permission(task, me, viewer_divisions)
    
    if task.status != "done":
        raise HTTPException(status_code=400, detail="Only done tasks can be archived")
    
    if task.archived_at is not None:
        raise HTTPException(status_code=400, detail="Task is already archived")

    now = datetime.utcnow()
    task.archived_at = now
    task.updated_at = now
    _add_task_log(db, task, me, "archived", "Task archived")

    db.commit()
    db.refresh(task)
    return _serialize_task(task, viewer_id=me.id, viewer_division=viewer_division, viewer_divisions=viewer_divisions)


@router.delete("/{task_id}")
def delete_task(task_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    """
    Delete a task. Only allowed if the current user created the task (requested_by_id == me.id).
    """
    task = db.query(TaskItem).filter(TaskItem.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Only allow deletion if the user created the task
    if task.requested_by_id != me.id:
        raise HTTPException(status_code=403, detail="You can only delete tasks you created")
    
    db.delete(task)
    db.commit()
    return {"message": "Task deleted"}


@router.get("/{task_id}/log")
def get_task_log(task_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    viewer_divisions = _get_viewer_divisions(db, me.id)
    task = _get_task(task_id, db)
    _ensure_view_permission(task, me, viewer_divisions)

    entries = (
        db.query(TaskLogEntry)
        .filter(TaskLogEntry.task_id == task.id)
        .order_by(TaskLogEntry.created_at.asc())
        .all()
    )
    return [_serialize_log_entry(e) for e in entries]


@router.post("/{task_id}/log", status_code=status.HTTP_201_CREATED)
def add_task_log(task_id: str, payload: TaskLogCreate, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    viewer_divisions = _get_viewer_divisions(db, me.id)
    task = _get_task(task_id, db)
    _ensure_view_permission(task, me, viewer_divisions)

    msg = (payload.message or "").strip()
    if not msg:
        raise HTTPException(status_code=400, detail="Message is required")

    entry = TaskLogEntry(
        task_id=task.id,
        entry_type="comment",
        message=msg,
        actor_id=me.id,
        actor_name=get_user_display(db, me.id),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _serialize_log_entry(entry)

