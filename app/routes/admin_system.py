"""
Admin system panel API: global audit logs and system logs (admin only).
"""
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..db import get_db
from ..auth.security import get_current_user, require_roles
from ..models.models import User, AuditLog, SystemLog


router = APIRouter(prefix="/admin/system", tags=["admin-system"])


# ---- Audit logs (global) ----
class AuditLogEntry(BaseModel):
    id: str
    timestamp_utc: str
    entity_type: str
    entity_id: str
    action: str
    actor_id: Optional[str]
    actor_role: Optional[str]
    source: Optional[str]
    changes_json: Optional[dict]
    context: Optional[dict]

    class Config:
        from_attributes = True


@router.get("/audit-logs", response_model=List[AuditLogEntry])
def list_audit_logs(
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    entity_id: Optional[str] = Query(None, description="Filter by entity ID"),
    action: Optional[str] = Query(None, description="Filter by action"),
    actor_id: Optional[str] = Query(None, description="Filter by actor user ID"),
    date_from: Optional[str] = Query(None, description="From date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="To date (YYYY-MM-DD)"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
):
    """List audit logs with filters (admin only)."""
    query = db.query(AuditLog)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if actor_id:
        query = query.filter(AuditLog.actor_id == actor_id)
    if date_from:
        try:
            dt = datetime.fromisoformat(date_from + "T00:00:00")
            query = query.filter(AuditLog.timestamp_utc >= dt)
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to + "T23:59:59.999999")
            query = query.filter(AuditLog.timestamp_utc <= dt)
        except ValueError:
            pass
    query = query.order_by(AuditLog.timestamp_utc.desc())
    query = query.limit(limit).offset(offset)
    rows = query.all()
    return [
        AuditLogEntry(
            id=str(r.id),
            timestamp_utc=r.timestamp_utc.isoformat() if r.timestamp_utc else "",
            entity_type=r.entity_type,
            entity_id=str(r.entity_id) if r.entity_id else "",
            action=r.action,
            actor_id=str(r.actor_id) if r.actor_id else None,
            actor_role=r.actor_role,
            source=r.source,
            changes_json=r.changes_json,
            context=r.context,
        )
        for r in rows
    ]


# ---- System logs (app/errors) ----
class SystemLogEntry(BaseModel):
    id: str
    timestamp_utc: str
    level: str
    category: str
    message: str
    request_id: Optional[str]
    path: Optional[str]
    method: Optional[str]
    user_id: Optional[str]
    status_code: Optional[int]
    detail: Optional[str]
    extra: Optional[dict]

    class Config:
        from_attributes = True


@router.get("/logs", response_model=List[SystemLogEntry])
def list_system_logs(
    level: Optional[str] = Query(None, description="Filter by level (info, warning, error)"),
    category: Optional[str] = Query(None, description="Filter by category"),
    request_id: Optional[str] = Query(None, description="Filter by request ID"),
    path: Optional[str] = Query(None, description="Filter by path (contains)"),
    date_from: Optional[str] = Query(None, description="From date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="To date (YYYY-MM-DD)"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
):
    """List system/application logs with filters (admin only)."""
    query = db.query(SystemLog)
    if level:
        query = query.filter(SystemLog.level == level)
    if category:
        query = query.filter(SystemLog.category == category)
    if request_id:
        query = query.filter(SystemLog.request_id == request_id)
    if path:
        query = query.filter(SystemLog.path.contains(path))
    if date_from:
        try:
            dt = datetime.fromisoformat(date_from + "T00:00:00")
            query = query.filter(SystemLog.timestamp_utc >= dt)
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to + "T23:59:59.999999")
            query = query.filter(SystemLog.timestamp_utc <= dt)
        except ValueError:
            pass
    query = query.order_by(SystemLog.timestamp_utc.desc())
    query = query.limit(limit).offset(offset)
    rows = query.all()
    return [
        SystemLogEntry(
            id=str(r.id),
            timestamp_utc=r.timestamp_utc.isoformat() if r.timestamp_utc else "",
            level=r.level,
            category=r.category,
            message=r.message,
            request_id=r.request_id,
            path=r.path,
            method=r.method,
            user_id=str(r.user_id) if r.user_id else None,
            status_code=r.status_code,
            detail=r.detail,
            extra=r.extra,
        )
        for r in rows
    ]


# ---- Health (optional) ----
class HealthResponse(BaseModel):
    status: str = "ok"


@router.get("/health", response_model=HealthResponse)
def system_health(admin: User = Depends(require_roles("admin"))):
    """Basic health/summary for admin panel (admin only)."""
    return HealthResponse(status="ok")
