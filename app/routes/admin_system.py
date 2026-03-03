"""
Admin system panel API: global audit logs and system logs (admin only).
"""
import uuid
from datetime import datetime
from typing import Optional, List, Dict

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..db import get_db
from ..auth.security import get_current_user, require_roles
from ..models.models import User, AuditLog, SystemLog, Project, Client, Proposal, Quote


router = APIRouter(prefix="/admin/system", tags=["admin-system"])


def _user_display(u: User) -> str:
    """Display string for a user (username + email for clarity)."""
    if not u:
        return "—"
    part = u.username or ""
    email = u.email_corporate or u.email_personal or ""
    if email:
        part = f"{part} ({email})" if part else email
    return part or str(u.id)[:8] + "…"


# ---- Audit logs (global) ----
class AuditLogEntry(BaseModel):
    id: str
    timestamp_utc: str
    entity_type: str
    entity_id: str
    entity_display: Optional[str] = None
    action: str
    actor_id: Optional[str]
    actor_name: Optional[str] = None
    actor_role: Optional[str]
    source: Optional[str]
    changes_json: Optional[dict]
    context: Optional[dict]


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
    """List audit logs with filters (admin only). Enriches with actor name and entity display name."""
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

    actor_ids = list({r.actor_id for r in rows if r.actor_id})
    actors: Dict[uuid.UUID, User] = {}
    if actor_ids:
        for u in db.query(User).filter(User.id.in_(actor_ids)).all():
            actors[u.id] = u

    entity_keys = [(r.entity_type, str(r.entity_id)) for r in rows if r.entity_id]
    entity_displays: Dict[tuple, str] = {}
    for et, eid in entity_keys:
        if (et, eid) in entity_displays:
            continue
        try:
            uid = uuid.UUID(eid)
        except ValueError:
            entity_displays[(et, eid)] = eid[:20] + "…" if len(eid) > 20 else eid
            continue
        if et == "project":
            p = db.query(Project).filter(Project.id == uid, Project.deleted_at.is_(None)).first()
            entity_displays[(et, eid)] = f"{p.name} ({p.code})" if p and getattr(p, "code", None) else (p.name if p else eid[:8] + "…")
        elif et == "client":
            c = db.query(Client).filter(Client.id == uid, Client.deleted_at.is_(None)).first()
            entity_displays[(et, eid)] = (c.display_name or c.name) if c else eid[:8] + "…"
        elif et == "proposal":
            p = db.query(Proposal).filter(Proposal.id == uid, Proposal.deleted_at.is_(None)).first()
            entity_displays[(et, eid)] = (p.title or f"Proposal {eid[:8]}") if p else eid[:8] + "…"
        elif et == "quote":
            q = db.query(Quote).filter(Quote.id == uid, Quote.deleted_at.is_(None)).first()
            entity_displays[(et, eid)] = (q.title or q.code or f"Quote {eid[:8]}") if q else eid[:8] + "…"
        else:
            entity_displays[(et, eid)] = f"{et} {eid[:8]}…"

    return [
        AuditLogEntry(
            id=str(r.id),
            timestamp_utc=r.timestamp_utc.isoformat() if r.timestamp_utc else "",
            entity_type=r.entity_type,
            entity_id=str(r.entity_id) if r.entity_id else "",
            entity_display=entity_displays.get((r.entity_type, str(r.entity_id))) if r.entity_id else None,
            action=r.action,
            actor_id=str(r.actor_id) if r.actor_id else None,
            actor_name=_user_display(actors.get(r.actor_id)) if r.actor_id else None,
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
    user_name: Optional[str] = None
    status_code: Optional[int]
    detail: Optional[str]
    extra: Optional[dict]


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
    """List system/application logs with filters (admin only). Enriches with user display name."""
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

    user_ids = list({r.user_id for r in rows if r.user_id})
    users: Dict[uuid.UUID, User] = {}
    if user_ids:
        for u in db.query(User).filter(User.id.in_(user_ids)).all():
            users[u.id] = u

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
            user_name=_user_display(users.get(r.user_id)) if r.user_id else None,
            status_code=r.status_code,
            detail=r.detail,
            extra=r.extra,
        )
        for r in rows
    ]


# ---- User activity (last login) ----
class UserActivityEntry(BaseModel):
    user_id: str
    username: str
    email: Optional[str] = None
    last_login_at: Optional[str] = None


@router.get("/user-activity", response_model=List[UserActivityEntry])
def list_user_activity(
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
):
    """List users with last login (admin only). Load only when requested (e.g. when panel section is expanded)."""
    rows = (
        db.query(User)
        .filter(User.is_active == True)
        .order_by(User.last_login_at.desc().nullslast())
        .limit(limit)
        .all()
    )
    return [
        UserActivityEntry(
            user_id=str(u.id),
            username=u.username or "",
            email=u.email_corporate or u.email_personal,
            last_login_at=u.last_login_at.isoformat() if u.last_login_at else None,
        )
        for u in rows
    ]


# ---- Health (optional) ----
class HealthResponse(BaseModel):
    status: str = "ok"


@router.get("/health", response_model=HealthResponse)
def system_health(admin: User = Depends(require_roles("admin"))):
    """Basic health/summary for admin panel (admin only)."""
    return HealthResponse(status="ok")
