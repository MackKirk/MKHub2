from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth.security import get_current_user
from ..auth.settings_permissions import can_read_auto_tasks, can_write_auto_tasks
from ..db import get_db
from ..models.models import AutoTaskLog, AutoTaskRoute, TaskItem, User
from ..services.auto_task_catalog import AUTO_TASK_TRIGGERS, get_trigger, starts_after_would_cycle
from ..services.auto_task_service import (
    get_or_empty_route,
    resolve_starts_after_key,
    resolve_task_copy,
    serialize_route_recipients,
    starts_after_map_from_routes,
)

router = APIRouter(prefix="/settings/auto-tasks", tags=["auto-tasks"])


class AutoTaskRouteUpdate(BaseModel):
    enabled: bool = True
    recipient_user_ids: list[str] = Field(default_factory=list)
    recipient_division_ids: list[str] = Field(default_factory=list)
    due_in_days: Optional[int] = None
    task_title: Optional[str] = None
    task_description: Optional[str] = None
    notify_push: bool = True
    notify_email: bool = False
    starts_after_key: Optional[str] = None


def _require_read(user: User) -> None:
    if not can_read_auto_tasks(user):
        raise HTTPException(status_code=403, detail="Forbidden")


def _require_write(user: User) -> None:
    if not can_write_auto_tasks(user):
        raise HTTPException(status_code=403, detail="Forbidden")


def _clean_ids(values: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in values or []:
        try:
            key = str(uuid.UUID(str(raw)))
        except (ValueError, TypeError, AttributeError):
            continue
        if key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def _serialize_trigger(db: Session, trigger) -> dict:
    route = get_or_empty_route(db, trigger.key)
    recipients = serialize_route_recipients(db, route)
    task_title, task_description = resolve_task_copy(trigger, route)
    starts_after_key = resolve_starts_after_key(trigger, route)
    starts_after_name = None
    starts_after_title = None
    if starts_after_key:
        other = get_trigger(starts_after_key)
        if other:
            other_route = get_or_empty_route(db, starts_after_key)
            starts_after_name = other.name
            starts_after_title, _ = resolve_task_copy(other, other_route)
    return {
        "key": trigger.key,
        "category": trigger.category,
        "category_label": trigger.category_label,
        "name": trigger.name,
        "when": trigger.when,
        "task_title": task_title,
        "task_description": task_description,
        "enabled": True if route is None else bool(route.enabled),
        "due_in_days": route.due_in_days if route else None,
        "notify_push": True if route is None else bool(route.notify_push),
        "notify_email": False if route is None else bool(route.notify_email),
        "chain_only": bool(trigger.chain_only),
        "starts_after_key": starts_after_key,
        "starts_after_name": starts_after_name,
        "starts_after_title": starts_after_title,
        "recipients": recipients,
        "has_recipients": bool(recipients["users"] or recipients["divisions"]),
    }


@router.get("")
def list_auto_task_triggers(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_read(user)
    return {"items": [_serialize_trigger(db, t) for t in AUTO_TASK_TRIGGERS]}


@router.get("/logs")
def list_auto_task_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    trigger_key: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_read(user)
    query = db.query(AutoTaskLog)
    if trigger_key:
        query = query.filter(AutoTaskLog.trigger_key == trigger_key)
    total = query.count()
    rows = query.order_by(AutoTaskLog.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    all_task_ids: list[uuid.UUID] = []
    for row in rows:
        for raw in row.task_ids or []:
            try:
                all_task_ids.append(uuid.UUID(str(raw)))
            except (ValueError, TypeError, AttributeError):
                continue
    tasks_by_id: dict[str, TaskItem] = {}
    if all_task_ids:
        for task in db.query(TaskItem).filter(TaskItem.id.in_(all_task_ids)).all():
            tasks_by_id[str(task.id)] = task

    items = []
    for row in rows:
        trigger = get_trigger(row.trigger_key)
        tasks = []
        open_count = 0
        done_count = 0
        for raw in row.task_ids or []:
            task = tasks_by_id.get(str(raw))
            if not task:
                continue
            status = task.status or "accepted"
            if status == "done":
                done_count += 1
            else:
                open_count += 1
            tasks.append(
                {
                    "id": str(task.id),
                    "title": task.title,
                    "status": status,
                    "assigned_to": task.assigned_to_name,
                    "assigned_division": task.assigned_division_label,
                }
            )
        items.append(
            {
                "id": str(row.id),
                "trigger_key": row.trigger_key,
                "trigger_name": trigger.name if trigger else row.trigger_key,
                "origin_type": row.origin_type,
                "origin_id": row.origin_id,
                "origin_label": row.origin_label,
                "status": row.status,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "tasks": tasks,
                "open_count": open_count,
                "done_count": done_count,
                "error_message": row.error_message,
                "task_title": (row.payload_json or {}).get("title")
                if isinstance(row.payload_json, dict)
                else None,
            }
        )

    return {"items": items, "total": total, "page": page, "limit": limit}


@router.put("/{trigger_key}")
def update_auto_task_route(
    trigger_key: str,
    payload: AutoTaskRouteUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write(user)
    trigger = get_trigger(trigger_key)
    if not trigger:
        raise HTTPException(status_code=404, detail="Unknown auto-task trigger")
    due_in_days = payload.due_in_days
    if due_in_days is not None and (due_in_days < 1 or due_in_days > 365):
        raise HTTPException(status_code=400, detail="due_in_days must be between 1 and 365")
    title = (payload.task_title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Task title is required")
    if len(title) > 255:
        raise HTTPException(status_code=400, detail="Task title must be 255 characters or less")
    starts_after_key = (payload.starts_after_key or "").strip() or None
    if trigger.chain_only and not starts_after_key:
        raise HTTPException(
            status_code=400,
            detail="This task must start after another auto task",
        )
    if starts_after_key:
        if starts_after_key == trigger_key:
            raise HTTPException(status_code=400, detail="A task cannot start after itself")
        if not get_trigger(starts_after_key):
            raise HTTPException(status_code=400, detail="Unknown Starts after trigger")
        routes = db.query(AutoTaskRoute).all()
        if starts_after_would_cycle(trigger_key, starts_after_key, starts_after_map_from_routes(routes)):
            raise HTTPException(status_code=400, detail="Starts after would create a cycle")
    route = get_or_empty_route(db, trigger_key)
    if route is None:
        route = AutoTaskRoute(trigger_key=trigger_key)
        db.add(route)
    route.enabled = bool(payload.enabled)
    route.recipient_user_ids = _clean_ids(payload.recipient_user_ids)
    route.recipient_division_ids = _clean_ids(payload.recipient_division_ids)
    route.due_in_days = due_in_days
    route.task_title = title
    route.task_description = (payload.task_description or "").strip() or None
    route.notify_push = bool(payload.notify_push)
    route.notify_email = bool(payload.notify_email)
    route.starts_after_key = starts_after_key
    route.updated_at = datetime.utcnow()
    route.updated_by_id = user.id
    db.commit()
    db.refresh(route)
    return _serialize_trigger(db, trigger)
