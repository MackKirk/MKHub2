import uuid
from datetime import datetime
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from ..models.models import (
    EmployeeProfile,
    Project,
    TaskItem,
    TaskRequest,
    User,
)


def _resolve_user_display(db: Session, user_id: Optional[uuid.UUID]) -> Optional[str]:
    if not user_id:
        return None
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first()
    if profile:
        if profile.preferred_name:
            return profile.preferred_name
        name_parts = [profile.first_name or "", profile.last_name or ""]
        composed = " ".join(part for part in name_parts if part).strip()
        if composed:
            return composed
    return user.username or user.email_personal


def _resolve_project_snapshot(db: Session, project_id: Optional[uuid.UUID]) -> Tuple[Optional[str], Optional[str]]:
    if not project_id:
        return None, None
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return None, None
    name = project.name or ""
    code = project.code or ""
    return name or None, code or None


def create_task_item(
    db: Session,
    *,
    title: str,
    description: Optional[str],
    requested_by_id: Optional[uuid.UUID],
    assigned_to_id: Optional[uuid.UUID],
    priority: str = "normal",
    due_date: Optional[datetime] = None,
    project_id: Optional[uuid.UUID] = None,
    origin_type: str = "manual_request",
    origin_reference: Optional[str] = None,
    origin_id: Optional[str] = None,
    assigned_division_label: Optional[str] = None,
    request: Optional[TaskRequest] = None,
) -> TaskItem:
    project_name, project_code = _resolve_project_snapshot(db, project_id)
    task = TaskItem(
        title=title.strip(),
        description=description or "",
        priority=priority or "normal",
        due_date=due_date,
        requested_by_id=requested_by_id,
        requested_by_name=_resolve_user_display(db, requested_by_id),
        assigned_to_id=assigned_to_id,
        assigned_to_name=_resolve_user_display(db, assigned_to_id),
        assigned_division_label=assigned_division_label,
        project_id=project_id,
        project_name=project_name,
        project_code=project_code,
        origin_type=origin_type,
        origin_reference=origin_reference,
        origin_id=origin_id,
        request=request,
    )
    db.add(task)
    db.flush()
    if request:
        request.accepted_task_id = task.id
    return task


def create_task_from_request(
    db: Session,
    request: TaskRequest,
    *,
    assigned_to_id: Optional[uuid.UUID],
    assigned_division_label: Optional[str] = None,
) -> TaskItem:
    return create_task_item(
        db,
        title=request.title,
        description=request.description,
        requested_by_id=request.requested_by_id,
        assigned_to_id=assigned_to_id,
        priority=request.priority or "normal",
        due_date=request.due_date,
        project_id=request.project_id,
        origin_type="manual_request",
        origin_reference=f"Request {request.id}",
        origin_id=str(request.id),
        assigned_division_label=assigned_division_label,
        request=request,
    )


def complete_tasks_for_origin(
    db: Session,
    *,
    origin_type: str,
    origin_id: str,
    concluded_by_id: Optional[uuid.UUID] = None,
) -> None:
    tasks = (
        db.query(TaskItem)
        .filter(
            TaskItem.origin_type == origin_type,
            TaskItem.origin_id == str(origin_id),
            TaskItem.status != "done",
        )
        .all()
    )
    if not tasks:
        return
    concluded_by_name = _resolve_user_display(db, concluded_by_id) if concluded_by_id else None
    now = datetime.utcnow()
    for task in tasks:
        task.status = "done"
        task.concluded_at = now
        task.concluded_by_id = concluded_by_id
        task.concluded_by_name = concluded_by_name


def get_user_display(db: Session, user_id: Optional[uuid.UUID]) -> Optional[str]:
    return _resolve_user_display(db, user_id)