"""Aggregated site safety inspection endpoints (all awarded projects the user can access)."""

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..auth.security import get_current_user, require_permissions, can_access_business_line
from ..db import get_db
from ..models.models import (
    Project,
    ProjectSafetyInspection,
    ProjectSafetyFollowUp,
    User,
    FormTemplate,
    EmployeeProfile,
)

router = APIRouter(prefix="/safety", tags=["safety"])


def _parse_range_date(s: str, default_time: str) -> datetime:
    s = (s or "").strip()
    if not s:
        raise ValueError("Empty")
    if "T" in s or " " in s:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    else:
        dt = datetime.fromisoformat(s + default_time)
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _normalize_status(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    v = str(raw).strip().lower()
    if v in ("draft", "finalized", "pending_signatures"):
        return v
    return None


def _worker_label(u: Optional[User], ep: Optional[EmployeeProfile]) -> Optional[str]:
    if not u:
        return None
    if ep:
        wn = (getattr(ep, "preferred_name", None) or "").strip()
        if not wn:
            wn = " ".join(
                x
                for x in [
                    (getattr(ep, "first_name", None) or "").strip(),
                    (getattr(ep, "last_name", None) or "").strip(),
                ]
                if x
            )
        if wn:
            return wn
    return u.username or None


def _allowed_project_ids(db: Session, user: User):
    """Awarded, non-deleted projects the user may access by business line."""
    out = []
    for (pid, bl) in (
        db.query(Project.id, Project.business_line)
        .filter(Project.deleted_at.is_(None))
        .filter(Project.is_bidding.is_(False))
        .all()
    ):
        if can_access_business_line(user, bl):
            out.append(pid)
    return out


@router.get("/inspections")
def list_safety_inspections(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:safety:read")),
    search: Optional[str] = Query(None, description="Filter by project name or code"),
    status: Optional[str] = Query(None, description="draft, finalized, or pending_signatures"),
    assigned_to_me: bool = Query(False, description="Only inspections assigned to the current user"),
    sort: str = Query("inspection_date", description="inspection_date | project"),
    dir: str = Query("desc", description="asc or desc"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    st = _normalize_status(status)
    allowed_ids = _allowed_project_ids(db, user)
    if not allowed_ids:
        return []
    q = (
        db.query(ProjectSafetyInspection, Project, FormTemplate, User, EmployeeProfile)
        .join(Project, Project.id == ProjectSafetyInspection.project_id)
        .outerjoin(FormTemplate, FormTemplate.id == ProjectSafetyInspection.form_template_id)
        .outerjoin(User, User.id == ProjectSafetyInspection.assigned_user_id)
        .outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)
        .filter(ProjectSafetyInspection.project_id.in_(allowed_ids))
    )
    if st:
        q = q.filter(ProjectSafetyInspection.status == st)
    if assigned_to_me:
        q = q.filter(ProjectSafetyInspection.assigned_user_id == user.id)
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        q = q.filter(
            or_(
                Project.name.ilike(term),
                Project.code.ilike(term),
            )
        )
    is_desc = (dir or "desc").lower() == "desc"
    sort_key = (sort or "inspection_date").strip().lower()
    if sort_key == "project":
        name_k = Project.name.asc() if not is_desc else Project.name.desc()
        code_k = Project.code.asc() if not is_desc else Project.code.desc()
        q = q.order_by(name_k, code_k, ProjectSafetyInspection.inspection_date.desc())
    else:
        idt = (
            ProjectSafetyInspection.inspection_date.desc()
            if is_desc
            else ProjectSafetyInspection.inspection_date.asc()
        )
        q = q.order_by(idt, Project.name.asc())

    rows = q.offset(offset).limit(limit).all()
    out: List[dict] = []
    for insp, proj, ft, asg_u, asg_ep in rows:
        st_val = getattr(insp, "status", None) or "draft"
        if st_val not in ("draft", "finalized", "pending_signatures"):
            st_val = "draft"
        template_name = (ft.name or "") if ft else ""
        if not template_name and (insp.template_version or "").startswith("mki"):
            template_name = "MKI Safety Inspection"
        template_version_label = (getattr(ft, "version_label", None) or "").strip() or None if ft else None
        out.append(
            {
                "id": str(insp.id),
                "project_id": str(proj.id),
                "project_name": proj.name or "",
                "project_code": proj.code or "",
                "business_line": getattr(proj, "business_line", None) or "construction",
                "inspection_date": insp.inspection_date.isoformat() if insp.inspection_date else None,
                "status": st_val,
                "template_name": template_name or None,
                "template_version_label": template_version_label,
                "worker_name": _worker_label(asg_u, asg_ep),
                "assigned_user_id": str(insp.assigned_user_id) if getattr(insp, "assigned_user_id", None) else None,
                "form_template_id": str(insp.form_template_id) if getattr(insp, "form_template_id", None) else None,
                "created_at": insp.created_at.isoformat() if insp.created_at else None,
                "updated_at": insp.updated_at.isoformat() if insp.updated_at else None,
            }
        )
    return out


@router.get("/follow-ups")
def list_safety_follow_ups(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:safety:read")),
    status: Optional[str] = Query(None, description="pending or completed"),
    search: Optional[str] = Query(None, description="Filter by project name, code, or follow-up label"),
    assigned_to_me: bool = Query(False, description="Only follow-ups assigned to the current user"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Aggregated safety follow-ups across awarded projects the user can access."""
    st = None
    if status and str(status).strip():
        v = str(status).strip().lower()
        if v in ("pending", "completed"):
            st = v
    allowed_ids = _allowed_project_ids(db, user)
    if not allowed_ids:
        return []
    q = (
        db.query(ProjectSafetyFollowUp, Project, FormTemplate, User, EmployeeProfile)
        .join(Project, Project.id == ProjectSafetyFollowUp.project_id)
        .outerjoin(FormTemplate, FormTemplate.id == ProjectSafetyFollowUp.form_template_id)
        .outerjoin(User, User.id == ProjectSafetyFollowUp.assigned_user_id)
        .outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)
        .filter(ProjectSafetyFollowUp.project_id.in_(allowed_ids))
    )
    if st:
        q = q.filter(ProjectSafetyFollowUp.status == st)
    if assigned_to_me:
        q = q.filter(ProjectSafetyFollowUp.assigned_user_id == user.id)
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        q = q.filter(
            or_(
                Project.name.ilike(term),
                Project.code.ilike(term),
                ProjectSafetyFollowUp.label.ilike(term),
            )
        )
    q = q.order_by(ProjectSafetyFollowUp.created_at.desc())
    rows = q.offset(offset).limit(limit).all()
    out: List[dict] = []
    for fu, proj, ft, asg_u, asg_ep in rows:
        st_val = (getattr(fu, "status", None) or "pending").strip().lower()
        if st_val not in ("pending", "completed"):
            st_val = "pending"
        src_date = getattr(fu, "source_inspection_date_snapshot", None)
        out.append(
            {
                "id": str(fu.id),
                "project_id": str(proj.id),
                "project_name": proj.name or "",
                "project_code": proj.code or "",
                "project_address": getattr(proj, "address", None) or "",
                "project_address_city": getattr(proj, "address_city", None) or "",
                "project_address_province": getattr(proj, "address_province", None) or "",
                "business_line": getattr(proj, "business_line", None) or "construction",
                "source_inspection_id": str(fu.source_inspection_id),
                "source_field_key": fu.source_field_key or "",
                "source_field_label_snapshot": fu.source_field_label_snapshot,
                "source_value_snapshot": fu.source_value_snapshot
                if isinstance(getattr(fu, "source_value_snapshot", None), dict)
                else None,
                "source_inspection_date": src_date.isoformat() if src_date else None,
                "source_template_name": getattr(fu, "source_template_name_snapshot", None) or None,
                "label": (getattr(fu, "label", None) or "") or None,
                "template_name": (ft.name or "") if ft else None,
                "form_template_id": str(fu.form_template_id) if fu.form_template_id else None,
                "assigned_user_id": str(fu.assigned_user_id) if fu.assigned_user_id else None,
                "worker_name": _worker_label(asg_u, asg_ep),
                "due_date": fu.due_date.isoformat() if fu.due_date else None,
                "status": st_val,
                "created_at": fu.created_at.isoformat() if fu.created_at else None,
                "completed_at": fu.completed_at.isoformat() if fu.completed_at else None,
            }
        )
    return out


@router.get("/inspections/calendar")
def list_safety_inspections_calendar(
    start: str = Query(..., description="Start date (YYYY-MM-DD) or ISO datetime"),
    end: str = Query(..., description="End date (YYYY-MM-DD) or ISO datetime"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:safety:read")),
):
    try:
        start_dt = _parse_range_date(start, "T00:00:00")
        end_dt = _parse_range_date(end, "T23:59:59.999999")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid start or end date/datetime")

    allowed_ids = _allowed_project_ids(db, user)
    if not allowed_ids:
        return []

    rows = (
        db.query(ProjectSafetyInspection, Project, FormTemplate)
        .join(Project, Project.id == ProjectSafetyInspection.project_id)
        .outerjoin(FormTemplate, FormTemplate.id == ProjectSafetyInspection.form_template_id)
        .filter(ProjectSafetyInspection.project_id.in_(allowed_ids))
        .filter(ProjectSafetyInspection.inspection_date >= start_dt)
        .filter(ProjectSafetyInspection.inspection_date <= end_dt)
        .order_by(ProjectSafetyInspection.inspection_date.asc())
        .all()
    )
    out: List[dict] = []
    for insp, proj, ft in rows:
        st_val = getattr(insp, "status", None) or "draft"
        if st_val not in ("draft", "finalized", "pending_signatures"):
            st_val = "draft"
        template_name = (ft.name or "") if ft else ""
        if not template_name and (insp.template_version or "").startswith("mki"):
            template_name = "MKI Safety Inspection"
        out.append(
            {
                "id": str(insp.id),
                "project_id": str(proj.id),
                "project_name": proj.name or "",
                "project_code": proj.code or "",
                "business_line": getattr(proj, "business_line", None) or "construction",
                "inspection_date": insp.inspection_date.isoformat() if insp.inspection_date else None,
                "status": st_val,
                "template_name": template_name or None,
            }
        )
    return out
