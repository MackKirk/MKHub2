import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, exists
from sqlalchemy.orm import joinedload

from ..db import get_db
from ..auth.security import get_current_user, require_permissions
from ..models.models import (
    Task, TaskSubtask, TaskComment, User, Invite, EmployeeProfile, 
    SettingItem, SettingList, Project, task_assignees
)


router = APIRouter(prefix="/tasks", tags=["tasks"])


def _task_to_dict(task: Task, db: Session, include_relations: bool = True) -> dict:
    """Helper function to convert Task to dict with related data"""
    result = {
        "id": str(task.id),
        "title": task.title,
        "description": task.description,
        "task_type": task.task_type,
        "status": task.status,
        "priority": task.priority,
        "project_id": str(task.project_id) if task.project_id else None,
        "division_id": str(task.division_id) if task.division_id else None,
        "invite_id": str(task.invite_id) if task.invite_id else None,
        "user_id": str(task.user_id) if task.user_id else None,
        "assigned_to": str(task.assigned_to) if task.assigned_to else None,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "category": task.category,
        "origin_source": task.origin_source,
        "origin_id": str(task.origin_id) if task.origin_id else None,
        "extra_data": task.extra_data,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
    }
    
    # Add assigned user name if available (legacy single assignee)
    if task.assigned_to and include_relations:
        assigned_user = db.query(User).filter(User.id == task.assigned_to).first()
        if assigned_user:
            ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == assigned_user.id).first()
            name = None
            if ep:
                name = (ep.preferred_name or '').strip()
                if not name:
                    first = (ep.first_name or '').strip()
                    last = (ep.last_name or '').strip()
                    name = ' '.join([x for x in [first, last] if x]) or None
            result["assigned_to_name"] = name or assigned_user.username
    
    # Add multiple assignees if available
    if include_relations and hasattr(task, 'assignees'):
        assignee_ids = []
        assignee_names = []
        for assignee in task.assignees:
            assignee_ids.append(str(assignee.id))
            ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == assignee.id).first()
            name = None
            if ep:
                name = (ep.preferred_name or '').strip()
                if not name:
                    first = (ep.first_name or '').strip()
                    last = (ep.last_name or '').strip()
                    name = ' '.join([x for x in [first, last] if x]) or None
            assignee_names.append(name or assignee.username)
        result["assigned_to_users"] = assignee_ids
        result["assigned_to_users_names"] = assignee_names
    
    # Add project name if available
    if task.project_id and include_relations:
        project = db.query(Project).filter(Project.id == task.project_id).first()
        if project:
            result["project_name"] = project.name
            result["project_code"] = project.code
    
    # Add subtasks and comments if requested
    if include_relations:
        result["subtasks"] = [
            {
                "id": str(st.id),
                "title": st.title,
                "is_completed": st.is_completed,
                "order": st.order,
                "created_at": st.created_at.isoformat() if st.created_at else None,
                "completed_at": st.completed_at.isoformat() if st.completed_at else None,
            }
            for st in sorted(task.subtasks, key=lambda x: x.order)
        ]
        result["comments"] = [
            {
                "id": str(c.id),
                "user_id": str(c.user_id),
                "text": c.text,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in sorted(task.comments, key=lambda x: x.created_at)
        ]
        # Add comment author names
        for comment in result["comments"]:
            comment_user = db.query(User).filter(User.id == uuid.UUID(comment["user_id"])).first()
            if comment_user:
                ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == comment_user.id).first()
                name = None
                if ep:
                    name = (ep.preferred_name or '').strip()
                    if not name:
                        first = (ep.first_name or '').strip()
                        last = (ep.last_name or '').strip()
                        name = ' '.join([x for x in [first, last] if x]) or None
                comment["user_name"] = name or comment_user.username
    
    return result


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
    project_id: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    overdue_only: Optional[bool] = Query(False),
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
    
    # Filter by project_id if provided
    if project_id:
        try:
            proj_uuid = uuid.UUID(str(project_id))
            query = query.filter(Task.project_id == proj_uuid)
        except Exception:
            pass
    
    # Filter by assigned_to if provided
    if assigned_to:
        try:
            assigned_uuid = uuid.UUID(str(assigned_to))
            # Check both legacy assigned_to and new assignees relationship via task_assignees table
            from sqlalchemy import exists
            query = query.filter(
                or_(
                    Task.assigned_to == assigned_uuid,
                    exists().where(
                        and_(
                            task_assignees.c.task_id == Task.id,
                            task_assignees.c.user_id == assigned_uuid
                        )
                    )
                )
            )
        except Exception:
            pass
    
    # Filter by category if provided
    if category:
        query = query.filter(Task.category == category)
    
    # Filter by overdue if provided
    if overdue_only:
        now = datetime.now(timezone.utc)
        query = query.filter(
            and_(
                Task.due_date.isnot(None),
                Task.due_date < now,
                Task.status.notin_(["done", "completed"])
            )
        )
    
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
            "metadata": t.extra_data,
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
    
    # Load assignees relationship
    from sqlalchemy.orm import joinedload
    task_with_relations = db.query(Task).options(joinedload(Task.assignees)).filter(Task.id == task_uuid).first()
    if not task_with_relations:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return _task_to_dict(task_with_relations, db)


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
    old_status = task.status
    old_assigned_to = task.assigned_to
    
    if "status" in payload:
        task.status = payload["status"]
        if payload["status"] in ["done", "completed"] and not task.completed_at:
            task.completed_at = datetime.utcnow()
        elif payload["status"] not in ["done", "completed"]:
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
    
    if "title" in payload:
        task.title = payload["title"]
    
    if "due_date" in payload:
        if payload["due_date"]:
            try:
                task.due_date = datetime.fromisoformat(payload["due_date"].replace('Z', '+00:00'))
            except Exception:
                pass
        else:
            task.due_date = None
    
    if "project_id" in payload:
        if payload["project_id"]:
            try:
                task.project_id = uuid.UUID(str(payload["project_id"]))
            except Exception:
                pass
        else:
            task.project_id = None
    
    if "division_id" in payload:
        if payload["division_id"]:
            try:
                task.division_id = uuid.UUID(str(payload["division_id"]))
            except Exception:
                pass
        else:
            task.division_id = None
    
    # Handle multiple assignees (assigned_to_users)
    if "assigned_to_users" in payload:
        if payload["assigned_to_users"] and isinstance(payload["assigned_to_users"], list):
            assignee_ids = []
            for user_id_str in payload["assigned_to_users"]:
                try:
                    user_id = uuid.UUID(str(user_id_str))
                    assignee_ids.append(user_id)
                except Exception:
                    pass
            
            # Update assignees relationship
            if assignee_ids:
                assignee_users = db.query(User).filter(User.id.in_(assignee_ids)).all()
                task.assignees = assignee_users
            else:
                task.assignees = []
        else:
            task.assignees = []
    
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    
    # Reload task with assignees relationship
    task_with_relations = db.query(Task).options(joinedload(Task.assignees)).filter(Task.id == task_uuid).first()
    if not task_with_relations:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # TODO: Trigger notification events (prepared but not active)
    # if old_status != task.status:
    #     notify_task_status_changed(task, old_status, task.status)
    # if old_assigned_to != task.assigned_to:
    #     notify_task_assigned(task, old_assigned_to, task.assigned_to)
    
    return _task_to_dict(task_with_relations, db)


# ========== NEW TASK MANAGEMENT ROUTES ==========

@router.post("")
def create_task(
    payload: dict,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Create a new task"""
    # Validate required fields
    if not payload.get("title"):
        raise HTTPException(status_code=400, detail="Title is required")
    
    # Create task
    task = Task(
        title=payload["title"],
        description=payload.get("description"),
        task_type=payload.get("task_type", "manual"),
        status=payload.get("status", "todo"),
        priority=payload.get("priority", "normal"),
        category=payload.get("category", "manual"),
        project_id=uuid.UUID(str(payload["project_id"])) if payload.get("project_id") else None,
        division_id=uuid.UUID(str(payload["division_id"])) if payload.get("division_id") else None,
        assigned_to=uuid.UUID(str(payload["assigned_to"])) if payload.get("assigned_to") else None,
        created_by=me.id,
    )
    
    # Set due date if provided
    if payload.get("due_date"):
        try:
            task.due_date = datetime.fromisoformat(payload["due_date"].replace('Z', '+00:00'))
        except Exception:
            pass
    
    # Set origin info if provided
    if payload.get("origin_source"):
        task.origin_source = payload["origin_source"]
    if payload.get("origin_id"):
        try:
            task.origin_id = uuid.UUID(str(payload["origin_id"]))
        except Exception:
            pass
    
    db.add(task)
    db.flush()  # Flush to get task.id
    
    # Handle multiple assignees (assigned_to_users)
    if payload.get("assigned_to_users") and isinstance(payload["assigned_to_users"], list):
        assignee_ids = []
        for user_id_str in payload["assigned_to_users"]:
            try:
                user_id = uuid.UUID(str(user_id_str))
                assignee_ids.append(user_id)
            except Exception:
                pass
        
        # Add assignees to the relationship
        if assignee_ids:
            assignee_users = db.query(User).filter(User.id.in_(assignee_ids)).all()
            task.assignees = assignee_users
    
    db.commit()
    db.refresh(task)
    
    # Reload task with assignees relationship
    task_with_relations = db.query(Task).options(joinedload(Task.assignees)).filter(Task.id == task.id).first()
    if not task_with_relations:
        raise HTTPException(status_code=500, detail="Failed to load created task")
    
    # TODO: Trigger notification event (prepared but not active)
    # if task.assigned_to:
    #     notify_task_created(task)
    
    return _task_to_dict(task_with_relations, db)


@router.get("/projects/{project_id}")
def list_project_tasks(
    project_id: str,
    status: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    overdue_only: Optional[bool] = Query(False),
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """List all tasks for a specific project"""
    try:
        project_uuid = uuid.UUID(str(project_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project id")
    
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    query = db.query(Task).filter(Task.project_id == project_uuid)
    
    # Apply filters
    if status:
        query = query.filter(Task.status == status)
    
    if assigned_to:
        try:
            assigned_uuid = uuid.UUID(str(assigned_to))
            query = query.filter(Task.assigned_to == assigned_uuid)
        except Exception:
            pass
    
    if category:
        query = query.filter(Task.category == category)
    
    if overdue_only:
        now = datetime.now(timezone.utc)
        query = query.filter(
            and_(
                Task.due_date.isnot(None),
                Task.due_date < now,
                Task.status.notin_(["done", "completed"])
            )
        )
    
    # Load assignees relationship
    tasks = query.options(joinedload(Task.assignees)).order_by(Task.created_at.desc()).all()
    return [_task_to_dict(t, db, include_relations=True) for t in tasks]


@router.get("/me/tasks")
def list_my_tasks(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    overdue_only: Optional[bool] = Query(False),
    task_type: Optional[str] = Query(None),  # 'personal' or 'division'
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """List all tasks assigned to the current user (personal) or their division"""
    # Get user's division_id
    user_division_id = get_user_division_id(db, me.id)
    
    # Build query based on task_type
    if task_type == 'personal':
        # Personal tasks: assigned directly to user (legacy assigned_to or in assignees)
        query = db.query(Task).filter(
            or_(
                Task.assigned_to == me.id,
                exists().where(
                    and_(
                        task_assignees.c.task_id == Task.id,
                        task_assignees.c.user_id == me.id
                    )
                )
            )
        )
    elif task_type == 'division':
        # Division tasks: tasks assigned to user's division
        if user_division_id:
            query = db.query(Task).filter(Task.division_id == user_division_id)
        else:
            # User has no division, return empty
            query = db.query(Task).filter(Task.id == None)  # Always false
    else:
        # Default: return both personal and division tasks
        if user_division_id:
            query = db.query(Task).filter(
                or_(
                    Task.assigned_to == me.id,
                    exists().where(
                        and_(
                            task_assignees.c.task_id == Task.id,
                            task_assignees.c.user_id == me.id
                        )
                    ),
                    Task.division_id == user_division_id
                )
            )
        else:
            # User has no division, only personal tasks
            query = db.query(Task).filter(
                or_(
                    Task.assigned_to == me.id,
                    exists().where(
                        and_(
                            task_assignees.c.task_id == Task.id,
                            task_assignees.c.user_id == me.id
                        )
                    )
                )
            )
    
    # Apply filters
    if status:
        query = query.filter(Task.status == status)
    
    if category:
        query = query.filter(Task.category == category)
    
    if overdue_only:
        now = datetime.now(timezone.utc)
        query = query.filter(
            and_(
                Task.due_date.isnot(None),
                Task.due_date < now,
                Task.status.notin_(["done", "completed"])
            )
        )
    
    # Load assignees relationship
    tasks = query.options(joinedload(Task.assignees)).order_by(Task.due_date.asc().nullslast(), Task.created_at.desc()).all()
    return [_task_to_dict(t, db, include_relations=True) for t in tasks]


@router.patch("/{task_id}/status")
def update_task_status(
    task_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Update task status (for drag and drop in Kanban)"""
    try:
        task_uuid = uuid.UUID(str(task_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid task id")
    
    # Extract status from payload
    status = payload.get("status") if isinstance(payload, dict) else None
    if not status:
        raise HTTPException(status_code=400, detail="Status is required")
    
    task = db.query(Task).filter(Task.id == task_uuid).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check if user can update this task (assigned to them or admin)
    is_admin = any(r.name == "admin" for r in me.roles)
    if not is_admin and task.assigned_to != me.id:
        raise HTTPException(status_code=403, detail="You can only update tasks assigned to you")
    
    old_status = task.status
    task.status = status
    
    if status in ["done", "completed"] and not task.completed_at:
        task.completed_at = datetime.utcnow()
    elif status not in ["done", "completed"]:
        task.completed_at = None
    
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    
    # TODO: Trigger notification event (prepared but not active)
    # if old_status != status:
    #     notify_task_status_changed(task, old_status, status)
    
    return _task_to_dict(task, db)


# ========== SUBTASKS ROUTES ==========

@router.post("/{task_id}/subtasks")
def create_subtask(
    task_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Create a subtask for a task"""
    try:
        task_uuid = uuid.UUID(str(task_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid task id")
    
    task = db.query(Task).filter(Task.id == task_uuid).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if not payload.get("title"):
        raise HTTPException(status_code=400, detail="Title is required")
    
    # Get max order for subtasks
    max_order = db.query(TaskSubtask).filter(TaskSubtask.task_id == task_uuid).count()
    
    subtask = TaskSubtask(
        task_id=task_uuid,
        title=payload["title"],
        order=max_order,
    )
    
    db.add(subtask)
    db.commit()
    db.refresh(subtask)
    
    return {
        "id": str(subtask.id),
        "title": subtask.title,
        "is_completed": subtask.is_completed,
        "order": subtask.order,
        "created_at": subtask.created_at.isoformat() if subtask.created_at else None,
        "completed_at": subtask.completed_at.isoformat() if subtask.completed_at else None,
    }


@router.patch("/subtasks/{subtask_id}")
def update_subtask(
    subtask_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Update a subtask (mark as completed, change title, etc.)"""
    try:
        subtask_uuid = uuid.UUID(str(subtask_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid subtask id")
    
    subtask = db.query(TaskSubtask).filter(TaskSubtask.id == subtask_uuid).first()
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    if "title" in payload:
        subtask.title = payload["title"]
    
    if "is_completed" in payload:
        subtask.is_completed = payload["is_completed"]
        if payload["is_completed"] and not subtask.completed_at:
            subtask.completed_at = datetime.utcnow()
        elif not payload["is_completed"]:
            subtask.completed_at = None
    
    if "order" in payload:
        subtask.order = payload["order"]
    
    db.commit()
    db.refresh(subtask)
    
    return {
        "id": str(subtask.id),
        "title": subtask.title,
        "is_completed": subtask.is_completed,
        "order": subtask.order,
        "created_at": subtask.created_at.isoformat() if subtask.created_at else None,
        "completed_at": subtask.completed_at.isoformat() if subtask.completed_at else None,
    }


@router.delete("/subtasks/{subtask_id}")
def delete_subtask(
    subtask_id: str,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Delete a subtask"""
    try:
        subtask_uuid = uuid.UUID(str(subtask_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid subtask id")
    
    subtask = db.query(TaskSubtask).filter(TaskSubtask.id == subtask_uuid).first()
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    db.delete(subtask)
    db.commit()
    
    return {"status": "deleted"}


# ========== COMMENTS ROUTES ==========

@router.post("/{task_id}/comments")
def create_comment(
    task_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Add a comment to a task"""
    try:
        task_uuid = uuid.UUID(str(task_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid task id")
    
    task = db.query(Task).filter(Task.id == task_uuid).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if not payload.get("text"):
        raise HTTPException(status_code=400, detail="Text is required")
    
    comment = TaskComment(
        task_id=task_uuid,
        user_id=me.id,
        text=payload["text"],
    )
    
    db.add(comment)
    db.commit()
    db.refresh(comment)
    
    # Get user name for response
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == me.id).first()
    name = None
    if ep:
        name = (ep.preferred_name or '').strip()
        if not name:
            first = (ep.first_name or '').strip()
            last = (ep.last_name or '').strip()
            name = ' '.join([x for x in [first, last] if x]) or None
    
    return {
        "id": str(comment.id),
        "user_id": str(comment.user_id),
        "user_name": name or me.username,
        "text": comment.text,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
        "updated_at": comment.updated_at.isoformat() if comment.updated_at else None,
    }


@router.patch("/comments/{comment_id}")
def update_comment(
    comment_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Update a comment (only the author can update)"""
    try:
        comment_uuid = uuid.UUID(str(comment_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid comment id")
    
    comment = db.query(TaskComment).filter(TaskComment.id == comment_uuid).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    if comment.user_id != me.id:
        raise HTTPException(status_code=403, detail="You can only update your own comments")
    
    if "text" in payload:
        comment.text = payload["text"]
        comment.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(comment)
    
    # Get user name for response
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == me.id).first()
    name = None
    if ep:
        name = (ep.preferred_name or '').strip()
        if not name:
            first = (ep.first_name or '').strip()
            last = (ep.last_name or '').strip()
            name = ' '.join([x for x in [first, last] if x]) or None
    
    return {
        "id": str(comment.id),
        "user_id": str(comment.user_id),
        "user_name": name or me.username,
        "text": comment.text,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
        "updated_at": comment.updated_at.isoformat() if comment.updated_at else None,
    }


@router.delete("/all")
def delete_all_tasks(
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Delete all tasks (development/testing only)"""
    # Only allow admins for safety
    is_admin = any(r.name == "admin" for r in me.roles)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Only admins can delete all tasks")
    
    # Delete all tasks (cascade will handle subtasks and comments)
    count = db.query(Task).delete()
    db.commit()
    
    return {"deleted": count, "message": f"Deleted {count} task(s)"}


@router.delete("/comments/{comment_id}")
def delete_comment(
    comment_id: str,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Delete a comment (only the author can delete)"""
    try:
        comment_uuid = uuid.UUID(str(comment_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid comment id")
    
    comment = db.query(TaskComment).filter(TaskComment.id == comment_uuid).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    if comment.user_id != me.id:
        raise HTTPException(status_code=403, detail="You can only delete your own comments")
    
    db.delete(comment)
    db.commit()
    
    return {"status": "deleted"}
