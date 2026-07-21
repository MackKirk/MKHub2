"""
Admin system panel API: global audit logs and system logs (admin only).
"""
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import cast, String, or_
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..db import get_db
from ..auth.security import require_roles
from ..models.models import User, AuditLog, SystemLog, EmployeeProfile
from ..services.audit_log_entries import audit_rows_to_entry_dicts, user_display_for_audit


def _user_ids_matching_search(db: Session, term: str, limit: int = 200) -> List[uuid.UUID]:
    """Match users by username, email, or employee profile name."""
    like = f"%{term.strip()}%"
    by_user = [
        u.id
        for u in db.query(User.id)
        .filter(
            or_(
                User.username.ilike(like),
                User.email_corporate.ilike(like),
                User.email_personal.ilike(like),
            )
        )
        .limit(limit)
        .all()
    ]
    by_profile = [
        p.user_id
        for p in db.query(EmployeeProfile.user_id)
        .filter(
            or_(
                EmployeeProfile.first_name.ilike(like),
                EmployeeProfile.last_name.ilike(like),
            )
        )
        .limit(limit)
        .all()
        if p.user_id
    ]
    seen = set()
    out: List[uuid.UUID] = []
    for uid in by_user + by_profile:
        if uid in seen:
            continue
        seen.add(uid)
        out.append(uid)
        if len(out) >= limit:
            break
    return out


router = APIRouter(prefix="/admin/system", tags=["admin-system"])


def _parse_day_start(date_from: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(date_from + "T00:00:00")
    except ValueError:
        return None


def _parse_day_end(date_to: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(date_to + "T23:59:59.999999")
    except ValueError:
        return None


def _parse_uuid(value: Optional[str]) -> Optional[uuid.UUID]:
    if not value:
        return None
    try:
        return uuid.UUID(str(value).strip())
    except ValueError:
        return None


# ---- Filter option catalogs ----
class LogFilterOptions(BaseModel):
    entity_types: List[str]
    actions: List[str]
    sources: List[str]
    categories: List[str]
    levels: List[str]


@router.get("/filter-options", response_model=LogFilterOptions)
def list_log_filter_options(
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
):
    """Distinct values for filter dropdowns (admin only)."""
    entity_types = [
        r[0]
        for r in db.query(AuditLog.entity_type)
        .filter(AuditLog.entity_type.isnot(None))
        .distinct()
        .order_by(AuditLog.entity_type)
        .limit(200)
        .all()
        if r[0]
    ]
    actions = [
        r[0]
        for r in db.query(AuditLog.action)
        .filter(AuditLog.action.isnot(None))
        .distinct()
        .order_by(AuditLog.action)
        .limit(100)
        .all()
        if r[0]
    ]
    sources = [
        r[0]
        for r in db.query(AuditLog.source)
        .filter(AuditLog.source.isnot(None), AuditLog.source != "")
        .distinct()
        .order_by(AuditLog.source)
        .limit(50)
        .all()
        if r[0]
    ]
    categories = [
        r[0]
        for r in db.query(SystemLog.category)
        .filter(SystemLog.category.isnot(None))
        .distinct()
        .order_by(SystemLog.category)
        .limit(100)
        .all()
        if r[0]
    ]
    levels = [
        r[0]
        for r in db.query(SystemLog.level)
        .filter(SystemLog.level.isnot(None))
        .distinct()
        .order_by(SystemLog.level)
        .limit(20)
        .all()
        if r[0]
    ]
    return LogFilterOptions(
        entity_types=entity_types,
        actions=actions,
        sources=sources,
        categories=categories,
        levels=levels or ["info", "warning", "error"],
    )


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
    change_field_count: int = 0


def _change_field_count(changes: Any) -> int:
    if changes is None:
        return 0
    if isinstance(changes, list):
        return len(changes)
    if isinstance(changes, dict):
        return len(changes)
    return 1


@router.get("/audit-logs", response_model=List[AuditLogEntry])
def list_audit_logs(
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    entity_id: Optional[str] = Query(None, description="Filter by entity ID (exact or partial UUID)"),
    action: Optional[str] = Query(None, description="Filter by action"),
    actor_id: Optional[str] = Query(None, description="Filter by actor user ID"),
    source: Optional[str] = Query(None, description="Filter by source"),
    q: Optional[str] = Query(None, description="Search entity type/id, action, source, actor username/email"),
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
        eid = entity_id.strip()
        exact = _parse_uuid(eid)
        if exact:
            query = query.filter(AuditLog.entity_id == exact)
        else:
            query = query.filter(cast(AuditLog.entity_id, String).ilike(f"%{eid}%"))
    if action:
        query = query.filter(AuditLog.action == action)
    if actor_id:
        aid = _parse_uuid(actor_id)
        if aid:
            query = query.filter(AuditLog.actor_id == aid)
    if source:
        query = query.filter(AuditLog.source == source)
    if date_from:
        dt = _parse_day_start(date_from)
        if dt:
            query = query.filter(AuditLog.timestamp_utc >= dt)
    if date_to:
        dt = _parse_day_end(date_to)
        if dt:
            query = query.filter(AuditLog.timestamp_utc <= dt)
    if q and q.strip():
        term = f"%{q.strip()}%"
        actor_ids = _user_ids_matching_search(db, q)
        clauses = [
            AuditLog.entity_type.ilike(term),
            AuditLog.action.ilike(term),
            AuditLog.source.ilike(term),
            cast(AuditLog.entity_id, String).ilike(term),
            cast(AuditLog.actor_id, String).ilike(term),
        ]
        if actor_ids:
            clauses.append(AuditLog.actor_id.in_(actor_ids))
        query = query.filter(or_(*clauses))

    query = query.order_by(AuditLog.timestamp_utc.desc())
    query = query.limit(limit).offset(offset)
    rows = query.all()
    dicts = audit_rows_to_entry_dicts(db, rows)
    return [
        AuditLogEntry(**{**d, "change_field_count": _change_field_count(d.get("changes_json"))})
        for d in dicts
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
    request_id: Optional[str] = Query(None, description="Filter by request ID (exact or prefix)"),
    path: Optional[str] = Query(None, description="Filter by path (contains)"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    status_code: Optional[int] = Query(None, description="Filter by HTTP status code"),
    q: Optional[str] = Query(None, description="Search message, detail, path, category, request id"),
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
        rid = request_id.strip()
        if len(rid) >= 32:
            query = query.filter(SystemLog.request_id == rid)
        else:
            query = query.filter(SystemLog.request_id.ilike(f"{rid}%"))
    if path:
        query = query.filter(SystemLog.path.ilike(f"%{path.strip()}%"))
    if user_id:
        uid = _parse_uuid(user_id)
        if uid:
            query = query.filter(SystemLog.user_id == uid)
    if status_code is not None:
        query = query.filter(SystemLog.status_code == status_code)
    if date_from:
        dt = _parse_day_start(date_from)
        if dt:
            query = query.filter(SystemLog.timestamp_utc >= dt)
    if date_to:
        dt = _parse_day_end(date_to)
        if dt:
            query = query.filter(SystemLog.timestamp_utc <= dt)
    if q and q.strip():
        term = f"%{q.strip()}%"
        matched_users = _user_ids_matching_search(db, q)
        clauses = [
            SystemLog.message.ilike(term),
            SystemLog.detail.ilike(term),
            SystemLog.path.ilike(term),
            SystemLog.category.ilike(term),
            SystemLog.request_id.ilike(term),
            SystemLog.method.ilike(term),
            cast(SystemLog.user_id, String).ilike(term),
        ]
        if matched_users:
            clauses.append(SystemLog.user_id.in_(matched_users))
        query = query.filter(or_(*clauses))

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
            user_name=user_display_for_audit(users.get(r.user_id)) if r.user_id else None,
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
    full_name: Optional[str] = None
    last_login_at: Optional[str] = None
    is_active: bool = True


@router.get("/user-activity", response_model=List[UserActivityEntry])
def list_user_activity(
    q: Optional[str] = Query(None, description="Search username, email, or name"),
    never_logged_in: Optional[bool] = Query(None, description="Only users with no login"),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
):
    """List users with last login (admin only)."""
    query = db.query(User).filter(User.is_active == True)
    if q and q.strip():
        matched = _user_ids_matching_search(db, q, limit=500)
        if matched:
            query = query.filter(User.id.in_(matched))
        else:
            term = f"%{q.strip()}%"
            query = query.filter(
                or_(
                    User.username.ilike(term),
                    User.email_corporate.ilike(term),
                    User.email_personal.ilike(term),
                )
            )
    if never_logged_in is True:
        query = query.filter(User.last_login_at.is_(None))
    elif never_logged_in is False:
        query = query.filter(User.last_login_at.isnot(None))

    rows = (
        query.order_by(User.last_login_at.desc().nullslast())
        .limit(limit)
        .offset(offset)
        .all()
    )
    profile_by_user: Dict[uuid.UUID, EmployeeProfile] = {}
    if rows:
        for p in db.query(EmployeeProfile).filter(EmployeeProfile.user_id.in_([u.id for u in rows])).all():
            profile_by_user[p.user_id] = p

    def _full_name(u: User) -> Optional[str]:
        p = profile_by_user.get(u.id)
        if not p:
            return None
        name = " ".join(x for x in [p.first_name, p.last_name] if x).strip()
        return name or None

    return [
        UserActivityEntry(
            user_id=str(u.id),
            username=u.username or "",
            email=u.email_corporate or u.email_personal,
            full_name=_full_name(u),
            last_login_at=u.last_login_at.isoformat() if u.last_login_at else None,
            is_active=bool(u.is_active),
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
