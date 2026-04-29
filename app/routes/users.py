import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from pydantic import BaseModel
from sqlalchemy import update, or_, func as sa_func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import Optional, List, Any, Tuple, Literal, Dict
from collections import Counter, defaultdict
import math
import uuid

from ..db import get_db
from ..models.models import (
    User,
    Role,
    EmployeeProfile,
    UserHomeDashboard,
    FileObject,
    Invite,
    ProjectReport,
    ProjectEvent,
    Client,
    EmployeeNote,
    SystemLog,
    AuditLog,
    user_divisions,
    SettingItem,
)
from ..services.audit_log_entries import audit_rows_to_entry_dicts
from ..auth.security import require_permissions, require_roles, get_current_user, _has_permission
from ..services.home_dashboard_policy import sanitize_home_dashboard
from ..services.home_dashboard_templates import (
    get_template_for_user,
    resolve_template_key,
    template_payload,
    user_may_apply_named_template,
)


router = APIRouter(prefix="/users", tags=["users"])


def _viewer_can_access_user_activity_log(viewer: User, target_user_id: uuid.UUID) -> bool:
    from ..auth.security import _has_permission

    if any(getattr(r, "name", "").lower() == "admin" for r in (viewer.roles or [])):
        return True
    if not _has_permission(viewer, "hr:users:view:activity"):
        return False
    if viewer.id == target_user_id:
        return True
    return _has_permission(viewer, "hr:users:read") or _has_permission(viewer, "users:read")


def _resolve_activity_page(total: int, page: int, page_size: int) -> Tuple[int, int, int]:
    """Returns (clamped_page, offset, total_pages)."""
    if page_size <= 0:
        page_size = 15
    if total <= 0:
        return 1, 0, 0
    total_pages = max(1, math.ceil(total / page_size))
    p = min(max(1, page), total_pages)
    offset = (p - 1) * page_size
    return p, offset, total_pages


# ---------- Home dashboard (must be before /{user_id}) ----------


def _ensure_list(value: Any) -> list:
    """Ensure value is a list (SQLite/JSON columns can sometimes return str)."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except (TypeError, ValueError):
            return []
    return []


class HomeDashboardUpdate(BaseModel):
    """Request body for PUT /users/me/home-dashboard."""
    layout: List[Any] = []
    widgets: List[Any] = []


class HomeDashboardApplyTemplate(BaseModel):
    """Request body for POST /users/me/home-dashboard/apply-template."""
    template: Literal["estimator"]


def _home_dashboard_json_equal(a: list, b: list) -> bool:
    try:
        return json.dumps(a, sort_keys=True, default=str) == json.dumps(b, sort_keys=True, default=str)
    except (TypeError, ValueError):
        return a == b


@router.get("/me/home-dashboard")
def get_my_home_dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Get home dashboard; creates row from Estimator/Basic template on first access."""
    row = db.query(UserHomeDashboard).filter(UserHomeDashboard.user_id == user.id).first()
    template_key = resolve_template_key(user)
    if not row:
        _tk, layout, widgets = get_template_for_user(user)
        layout, widgets = sanitize_home_dashboard(user, layout, widgets)
        row = UserHomeDashboard(user_id=user.id, layout=layout, widgets=widgets)
        db.add(row)
        db.commit()
        db.refresh(row)
        return {"layout": layout, "widgets": widgets, "template_key": _tk}
    layout = _ensure_list(row.layout)
    widgets = _ensure_list(row.widgets)
    slayout, swidgets = sanitize_home_dashboard(user, layout, widgets)
    if not _home_dashboard_json_equal(layout, slayout) or not _home_dashboard_json_equal(widgets, swidgets):
        row.layout = slayout
        row.widgets = swidgets
        row.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(row)
    return {"layout": slayout, "widgets": swidgets, "template_key": template_key}


@router.put("/me/home-dashboard")
def put_my_home_dashboard(
    payload: HomeDashboardUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create or update home dashboard; widgets not allowed for the user are stripped."""
    layout = payload.layout if payload.layout is not None else []
    widgets = payload.widgets if payload.widgets is not None else []
    if not isinstance(layout, list):
        layout = _ensure_list(layout)
    if not isinstance(widgets, list):
        widgets = _ensure_list(widgets)
    layout, widgets = sanitize_home_dashboard(user, layout, widgets)
    row = db.query(UserHomeDashboard).filter(UserHomeDashboard.user_id == user.id).first()
    if row:
        row.layout = layout
        row.widgets = widgets
        row.updated_at = datetime.now(timezone.utc)
    else:
        row = UserHomeDashboard(user_id=user.id, layout=layout, widgets=widgets)
        db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "layout": _ensure_list(row.layout),
        "widgets": _ensure_list(row.widgets),
        "template_key": resolve_template_key(user),
    }


@router.post("/me/home-dashboard/reset-template")
def reset_my_home_dashboard_template(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Replace dashboard with the server template for this user (Estimator vs Basic)."""
    template_key, layout, widgets = get_template_for_user(user)
    layout, widgets = sanitize_home_dashboard(user, layout, widgets)
    row = db.query(UserHomeDashboard).filter(UserHomeDashboard.user_id == user.id).first()
    if row:
        row.layout = layout
        row.widgets = widgets
        row.updated_at = datetime.now(timezone.utc)
    else:
        row = UserHomeDashboard(user_id=user.id, layout=layout, widgets=widgets)
        db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "layout": _ensure_list(row.layout),
        "widgets": _ensure_list(row.widgets),
        "template_key": template_key,
    }


@router.post("/me/home-dashboard/apply-template")
def apply_my_home_dashboard_template(
    payload: HomeDashboardApplyTemplate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Apply a named server template (e.g. Estimator). Admin or estimator role only."""
    if not user_may_apply_named_template(user, payload.template):
        raise HTTPException(status_code=403, detail="Forbidden")
    layout, widgets = template_payload(payload.template)
    layout, widgets = sanitize_home_dashboard(user, layout, widgets)
    row = db.query(UserHomeDashboard).filter(UserHomeDashboard.user_id == user.id).first()
    if row:
        row.layout = layout
        row.widgets = widgets
        row.updated_at = datetime.now(timezone.utc)
    else:
        row = UserHomeDashboard(user_id=user.id, layout=layout, widgets=widgets)
        db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "layout": _ensure_list(row.layout),
        "widgets": _ensure_list(row.widgets),
        "template_key": resolve_template_key(user),
    }


def _hr_profile_display_name(
    username: str,
    preferred_name: Optional[str],
    first_name: Optional[str],
    last_name: Optional[str],
) -> str:
    if preferred_name and str(preferred_name).strip():
        return str(preferred_name).strip()
    fn = (first_name or "").strip()
    ln = (last_name or "").strip()
    parts = [x for x in [fn, ln] if x]
    if parts:
        return " ".join(parts)
    return username or ""


@router.get("/hr-data-quality")
def hr_data_quality(
    db: Session = Depends(get_db),
    viewer: User = Depends(require_permissions("hr:users:read", "users:read")),
):
    """
    HR overview: active employees with incomplete org/profile fields.
    Summary counts include all eligible users with at least one gap; rows are capped at 500 (alphabetical by username).
    Pay rate/type are never returned in rows (sensitive); compensation gaps appear only in summary counts and issue tags for viewers with hr:users:view:job:compensation.
    """
    can_comp = _has_permission(viewer, "hr:users:view:job:compensation")
    now = datetime.now(timezone.utc)

    slim = (
        db.query(
            User.id,
            User.username,
            User.email_personal,
            EmployeeProfile.manager_user_id,
            EmployeeProfile.division,
            EmployeeProfile.project_division_ids,
            EmployeeProfile.job_title,
            EmployeeProfile.pay_rate,
            EmployeeProfile.pay_type,
            EmployeeProfile.updated_at,
            EmployeeProfile.updated_by,
            EmployeeProfile.first_name,
            EmployeeProfile.last_name,
            EmployeeProfile.preferred_name,
            EmployeeProfile.id.label("ep_id"),
        )
        .outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)
        .filter(User.is_active == True)
        .filter(
            or_(
                EmployeeProfile.id.is_(None),
                EmployeeProfile.termination_date.is_(None),
                EmployeeProfile.termination_date >= now,
            )
        )
        .order_by(User.username.asc())
        .all()
    )

    if not slim:
        return {
            "total_eligible": 0,
            "total_with_gaps": 0,
            "truncated": False,
            "summary": {
                "missing_supervisor": 0,
                "missing_department": 0,
                "missing_project_division": 0,
                "missing_job_title": 0,
                "missing_compensation": 0,
            },
            "rows": [],
        }

    user_ids = [r.id for r in slim]
    ud_counts: Dict[uuid.UUID, int] = defaultdict(int)
    for uid, cnt in (
        db.query(user_divisions.c.user_id, sa_func.count())
        .filter(user_divisions.c.user_id.in_(user_ids))
        .group_by(user_divisions.c.user_id)
        .all()
    ):
        ud_counts[uid] = int(cnt)

    def gaps_for_row(r) -> List[str]:
        ep_present = r.ep_id is not None
        issues: List[str] = []
        if not ep_present or r.manager_user_id is None:
            issues.append("missing_supervisor")
        dept_ok = ud_counts.get(r.id, 0) > 0 or (
            ep_present and r.division and str(r.division).strip()
        )
        if not dept_ok:
            issues.append("missing_department")
        pdi = _ensure_list(r.project_division_ids) if ep_present else []
        if not ep_present or not pdi:
            issues.append("missing_project_division")
        if not ep_present or not (r.job_title and str(r.job_title).strip()):
            issues.append("missing_job_title")
        if can_comp:
            pr = (str(r.pay_rate).strip() if ep_present and r.pay_rate is not None else "") if ep_present else ""
            pt = (str(r.pay_type).strip() if ep_present and r.pay_type is not None else "") if ep_present else ""
            if not pr and not pt:
                issues.append("missing_compensation")
        return issues

    with_gaps: List[Tuple[Any, List[str]]] = []
    summary_counter: Counter = Counter()
    for r in slim:
        issues = gaps_for_row(r)
        if not issues:
            continue
        with_gaps.append((r, issues))
        for key in issues:
            summary_counter[key] += 1

    cap = 500
    truncated = len(with_gaps) > cap
    slice_pairs = with_gaps[:cap]

    all_pd_ids: set = set()
    editor_ids: set = set()
    for r, _ in slice_pairs:
        if r.project_division_ids and r.ep_id:
            for x in _ensure_list(r.project_division_ids):
                all_pd_ids.add(str(x))
        if r.updated_by:
            editor_ids.add(r.updated_by)

    pd_labels: Dict[str, str] = {}
    if all_pd_ids:
        try:
            uuids = [uuid.UUID(x) for x in all_pd_ids]
            for it in db.query(SettingItem).filter(SettingItem.id.in_(uuids)).all():
                pd_labels[str(it.id)] = (it.label or "").strip() or str(it.id)
        except (ValueError, TypeError):
            pass

    editors: Dict[str, str] = {}
    if editor_ids:
        for u, ep in (
            db.query(User, EmployeeProfile)
            .outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)
            .filter(User.id.in_(editor_ids))
            .all()
        ):
            editors[str(u.id)] = _hr_profile_display_name(
                u.username,
                getattr(ep, "preferred_name", None) if ep else None,
                getattr(ep, "first_name", None) if ep else None,
                getattr(ep, "last_name", None) if ep else None,
            )

    slice_uids = [r.id for r, _ in slice_pairs]
    dept_labels_by_user: Dict[uuid.UUID, List[str]] = defaultdict(list)
    if slice_uids:
        for uid, lbl in (
            db.query(user_divisions.c.user_id, SettingItem.label)
            .join(SettingItem, SettingItem.id == user_divisions.c.division_id)
            .filter(user_divisions.c.user_id.in_(slice_uids))
            .all()
        ):
            if lbl and str(lbl).strip():
                dept_labels_by_user[uid].append(str(lbl).strip())

    out_rows = []
    for r, issues in slice_pairs:
        dept_labels = dept_labels_by_user.get(r.id, [])
        department = ", ".join(dept_labels) if dept_labels else None
        if not department and r.division and str(r.division).strip():
            department = str(r.division).strip()

        pd_ids = _ensure_list(r.project_division_ids) if r.ep_id else []
        project_division_labels = [pd_labels.get(str(pid), str(pid)) for pid in pd_ids]

        row_payload: dict = {
            "user_id": str(r.id),
            "username": r.username,
            "email": r.email_personal,
            "name": _hr_profile_display_name(
                r.username,
                r.preferred_name,
                r.first_name,
                r.last_name,
            ),
            "job_title": (str(r.job_title).strip() if r.job_title else None) if r.ep_id else None,
            "department": department,
            "project_division_labels": project_division_labels,
            "manager_user_id": str(r.manager_user_id) if r.manager_user_id else None,
            "issues": issues,
            "profile_updated_at": r.updated_at.isoformat() if r.updated_at else None,
            "profile_updated_by_id": str(r.updated_by) if r.updated_by else None,
            "profile_updated_by_name": editors.get(str(r.updated_by)) if r.updated_by else None,
        }
        out_rows.append(row_payload)

    return {
        "total_eligible": len(slim),
        "total_with_gaps": len(with_gaps),
        "truncated": truncated,
        "summary": {
            "missing_supervisor": summary_counter.get("missing_supervisor", 0),
            "missing_department": summary_counter.get("missing_department", 0),
            "missing_project_division": summary_counter.get("missing_project_division", 0),
            "missing_job_title": summary_counter.get("missing_job_title", 0),
            "missing_compensation": summary_counter.get("missing_compensation", 0),
        },
        "rows": out_rows,
    }


def _user_to_dict(u: User, ep: Optional[EmployeeProfile]) -> dict:
    name = (getattr(ep, 'preferred_name', None) or '').strip() if ep else ''
    if not name:
        first = (getattr(ep, 'first_name', None) or '').strip() if ep else ''
        last = (getattr(ep, 'last_name', None) or '').strip() if ep else ''
        name = ' '.join([x for x in [first, last] if x])
    roles = [r.name for r in getattr(u, 'roles', [])]
    divisions = [{"id": str(d.id), "label": d.label} for d in getattr(u, 'divisions', [])]
    return {
        "id": str(u.id),
        "username": u.username,
        "email": u.email_personal,
        "is_active": u.is_active,
        "name": name or None,
        "roles": roles,
        "divisions": divisions,
        "profile_photo_file_id": str(getattr(ep, 'profile_photo_file_id')) if (ep and getattr(ep, 'profile_photo_file_id', None)) else None,
        "manager_user_id": str(ep.manager_user_id) if (ep and ep.manager_user_id) else None,
        "job_title": getattr(ep, 'job_title', None) if ep else None,
        "phone": getattr(ep, 'phone', None) if ep else None,
        "mobile_phone": getattr(ep, 'mobile_phone', None) if ep else None,
    }


@router.get("")
def list_users(
    q: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("hr:users:read", "users:read"))  # New HR permission or legacy
):
    """
    List users with pagination
    
    Args:
        q: Search query (username, email, or name)
        page: Page number (1-indexed)
        limit: Number of items per page (default 50, max 2000)
    """
    # Ensure reasonable limits
    limit = min(max(1, limit), 2000)
    page = max(1, page)
    offset = (page - 1) * limit
    
    query = db.query(User, EmployeeProfile).outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)
    if q:
        like = f"%{q}%"
        query = query.filter(
            (User.username.ilike(like)) | 
            (User.email_personal.ilike(like)) | 
            (EmployeeProfile.first_name.ilike(like)) | 
            (EmployeeProfile.last_name.ilike(like)) | 
            (EmployeeProfile.preferred_name.ilike(like))
        )
    
    # Get total count for pagination
    total_count = query.count()
    
    # Get paginated results
    rows = query.order_by(User.created_at.desc()).offset(offset).limit(limit).all()
    
    return {
        "items": [_user_to_dict(u, ep) for u, ep in rows],
        "total": total_count,
        "page": page,
        "limit": limit,
        "total_pages": (total_count + limit - 1) // limit if limit > 0 else 0
    }


@router.get("/{user_id}/activity-log/audit/{audit_entry_id}")
def get_user_activity_audit_entry(
    user_id: str,
    audit_entry_id: str,
    db: Session = Depends(get_db),
    viewer: User = Depends(get_current_user),
):
    """Full audit row (with changes/context) for the Activity tab detail modal."""
    try:
        uid = uuid.UUID(str(user_id))
        aid = uuid.UUID(str(audit_entry_id))
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found")

    u = db.query(User).filter(User.id == uid).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")

    if not _viewer_can_access_user_activity_log(viewer, uid):
        raise HTTPException(status_code=403, detail="Not allowed to view this activity log")

    row = (
        db.query(AuditLog)
        .filter(AuditLog.id == aid, AuditLog.actor_id == uid)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Not found")

    full = audit_rows_to_entry_dicts(db, [row])
    return full[0] if full else {}


@router.get("/{user_id}/activity-log")
def get_user_activity_log(
    user_id: str,
    logins_page: int = Query(1, ge=1),
    logins_page_size: int = Query(15, ge=1, le=50),
    audit_page: int = Query(1, ge=1),
    audit_page_size: int = Query(15, ge=1, le=50),
    db: Session = Depends(get_db),
    viewer: User = Depends(get_current_user),
):
    """
    Paginated sign-in history (system_logs) and audit summaries (no heavy JSON in list).
    Requires hr:users:view:activity, except system admin. For other users' profiles, also requires
    hr:users:read or users:read (same idea as opening employee details).
    """
    try:
        uid = uuid.UUID(str(user_id))
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found")

    u = db.query(User).filter(User.id == uid).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")

    if not _viewer_can_access_user_activity_log(viewer, uid):
        raise HTTPException(status_code=403, detail="Not allowed to view this activity log")

    login_base = db.query(SystemLog).filter(
        SystemLog.user_id == uid,
        SystemLog.category == "auth",
        SystemLog.message == "Login successful",
    )
    login_total = login_base.count()
    lp, loff, lpages = _resolve_activity_page(login_total, logins_page, logins_page_size)
    login_rows = (
        login_base.order_by(SystemLog.timestamp_utc.desc())
        .offset(loff)
        .limit(logins_page_size)
        .all()
    )
    login_events = [
        {
            "id": str(r.id),
            "timestamp_utc": r.timestamp_utc.isoformat() if r.timestamp_utc else "",
            "title": "Sign-in",
            "path": r.path,
            "request_id": r.request_id,
        }
        for r in login_rows
    ]

    audit_base = db.query(AuditLog).filter(AuditLog.actor_id == uid)
    audit_total = audit_base.count()
    ap, aoff, apages = _resolve_activity_page(audit_total, audit_page, audit_page_size)
    audit_rows = (
        audit_base.order_by(AuditLog.timestamp_utc.desc())
        .offset(aoff)
        .limit(audit_page_size)
        .all()
    )
    full_audit = audit_rows_to_entry_dicts(db, audit_rows)
    _omit = frozenset({"changes_json", "context", "actor_id", "actor_name", "actor_role"})
    audit_entries = [{k: v for k, v in e.items() if k not in _omit} for e in full_audit]

    return {
        "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
        "logins": {
            "items": login_events,
            "total": login_total,
            "page": lp,
            "page_size": logins_page_size,
            "total_pages": lpages,
        },
        "audit": {
            "items": audit_entries,
            "total": audit_total,
            "page": ap,
            "page_size": audit_page_size,
            "total_pages": apages,
        },
    }


@router.get("/{user_id}")
def get_user(user_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Get user details. All users can view their own data."""
    from ..auth.security import _has_permission
    
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    
    # Check if user has permission to view other users, or if viewing own data
    has_permission = _has_permission(user, "hr:users:read") or _has_permission(user, "users:read")
    is_own_data = str(user.id) == str(user_id)
    
    if not has_permission and not is_own_data:
        raise HTTPException(status_code=403, detail="You can only view your own user data")
    
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == u.id).first()
    return _user_to_dict(u, ep)


@router.get("/roles/all")
def list_roles(db: Session = Depends(get_db), _=Depends(require_permissions("hr:users:read", "users:read"))):  # New HR permission or legacy
    rows = db.query(Role).order_by(Role.name.asc()).all()
    return [{"id": str(r.id), "name": r.name} for r in rows]


@router.patch("/{user_id}")
def update_user(
    user_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permissions("hr:users:write", "users:write")),
):
    from ..models.models import SettingList, SettingItem

    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    roles = payload.get("roles")
    is_active = payload.get("is_active")
    divisions = payload.get("divisions")
    touched_profile_audit = False
    if roles is not None:
        role_rows = db.query(Role).filter(Role.name.in_(roles)).all() if roles else []
        u.roles = role_rows
        touched_profile_audit = True
    if is_active is not None:
        u.is_active = bool(is_active)
        touched_profile_audit = True
    if divisions is not None:
        divisions_list = db.query(SettingList).filter(SettingList.name == "divisions").first()
        if divisions_list:
            division_items = db.query(SettingItem).filter(
                SettingItem.list_id == divisions_list.id,
                SettingItem.id.in_([uuid.UUID(did) for did in divisions])
            ).all() if divisions else []
            u.divisions = division_items
        touched_profile_audit = True
    if touched_profile_audit:
        ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == u.id).first()
        if not ep:
            ep = EmployeeProfile(user_id=u.id)
            db.add(ep)
        ep.updated_at = datetime.now(timezone.utc)
        ep.updated_by = actor.id
    db.commit()
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == u.id).first()
    return _user_to_dict(u, ep)


def _nullify_optional_user_references(db: Session, user_uuid: uuid.UUID) -> None:
    """
    Postgres uses NO ACTION on several optional FKs to users.id (model omits ondelete).
    Clear those before deleting the user row.
    """
    db.execute(update(FileObject).where(FileObject.created_by == user_uuid).values(created_by=None))
    db.execute(update(Invite).where(Invite.created_by == user_uuid).values(created_by=None))
    db.execute(update(EmployeeProfile).where(EmployeeProfile.manager_user_id == user_uuid).values(manager_user_id=None))
    db.execute(update(ProjectReport).where(ProjectReport.approved_by == user_uuid).values(approved_by=None))
    db.execute(update(ProjectEvent).where(ProjectEvent.created_by == user_uuid).values(created_by=None))
    db.execute(update(Client).where(Client.estimator_id == user_uuid).values(estimator_id=None))
    db.execute(update(EmployeeNote).where(EmployeeNote.created_by == user_uuid).values(created_by=None))


@router.delete("/{user_id}")
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
):
    """Permanently delete a user. Restricted to accounts with the admin system role (Administrator Access)."""
    if str(admin.id) == str(user_id):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    user_info = {
        "user_id": str(u.id),
        "email_personal": getattr(u, "email_personal", None),
        "username": getattr(u, "username", None),
    }
    uid = u.id if isinstance(u.id, uuid.UUID) else uuid.UUID(str(u.id))
    try:
        _nullify_optional_user_references(db, uid)
        db.delete(u)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Cannot delete user while other data still references this account. "
            + (str(exc.orig) if getattr(exc, "orig", None) else str(exc)),
        ) from exc
    try:
        from ..services.audit import create_audit_log

        create_audit_log(
            db=db,
            entity_type="user",
            entity_id=user_info["user_id"],
            action="DELETE",
            actor_id=str(admin.id) if admin else None,
            actor_role="admin",
            source="api",
            changes_json={"deleted_user": user_info},
            context={},
        )
    except Exception:
        pass
    return {"deleted": True}


# =====================
# TEMPORARY: BambooHR Sync All (to be removed later)
# =====================

@router.post("/sync-bamboohr-all")
def sync_all_users_from_bamboohr(
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("hr:users:write", "users:write"))
):
    """
    BambooHR bulk sync.

    payload.mode:
    - "full" (default): create/update users from BambooHR + photos + visas + emergency contacts.
    - "photos": only profile photos for each directory employee (no profile field updates, no file cabinet).
    - "documents": only BambooHR file cabinet documents (no profile photos).

    Optional: force_update_photos (bool), force_update_documents (bool) for replacing existing imports.
    """
    import sys
    import importlib.util
    from pathlib import Path

    current_file = Path(__file__)
    project_root = current_file.parent.parent.parent
    script_dir = project_root / "scripts"
    sys.path.insert(0, str(script_dir))

    mode = str(payload.get("mode") or "full").strip().lower()
    if mode not in ("full", "photos", "documents"):
        mode = "full"
    force_update_photos = bool(payload.get("force_update_photos", False))
    force_update_documents = bool(payload.get("force_update_documents", False))
    limit = payload.get("limit")

    try:
        if mode in ("photos", "documents"):
            spec = importlib.util.spec_from_file_location(
                "sync_bamboohr_documents", script_dir / "sync_bamboohr_documents.py"
            )
            if spec is None or spec.loader is None:
                raise HTTPException(status_code=500, detail="Could not load documents sync module")
            doc_mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(doc_mod)
            sync_all_documents = doc_mod.sync_all_documents

            if mode == "photos":
                sync_all_documents(
                    dry_run=False,
                    employee_id=None,
                    include_photos=True,
                    limit=limit,
                    force_update_photos=force_update_photos,
                    skip_documents=True,
                )
                msg = "BambooHR profile photos sync completed. Check server logs for details."
            else:
                sync_all_documents(
                    dry_run=False,
                    employee_id=None,
                    include_photos=False,
                    limit=limit,
                    force_update_photos=False,
                    skip_documents=False,
                    force_update_documents=force_update_documents,
                )
                msg = "BambooHR documents sync completed. Check server logs for details."

            return {"status": "success", "message": msg, "mode": mode}

        # full (default): employee records + photos + visas + contacts
        spec = importlib.util.spec_from_file_location(
            "sync_bamboohr_employees", script_dir / "sync_bamboohr_employees.py"
        )
        if spec is None or spec.loader is None:
            raise HTTPException(status_code=500, detail="Could not load sync module")
        sync_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(sync_module)
        sync_employees = sync_module.sync_employees

        update_existing = payload.get("update_existing", True)
        include_photos = payload.get("include_photos", True)

        sync_employees(
            dry_run=False,
            update_existing=update_existing,
            limit=limit,
            include_photos=include_photos,
            force_update_photos=force_update_photos,
        )

        return {
            "status": "success",
            "message": "BambooHR full sync completed. Check server logs for details.",
            "mode": "full",
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_msg = str(e)
        traceback_str = traceback.format_exc()
        print(f"[ERROR] Error during BambooHR sync: {error_msg}")
        print(f"[ERROR] Traceback: {traceback_str}")
        raise HTTPException(status_code=500, detail=f"Error during sync: {error_msg}")


