"""Subcontractor companies, workers, and project attendance (clock-in/out)."""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import asc, desc, func, nullslast, or_
from sqlalchemy.orm import Session

from ..auth.security import get_current_user, _has_permission, require_roles
from ..db import get_db
from ..models.models import (
    AuditLog,
    ClientFile,
    EmployeeReport,
    EmployeeTrainingRecord,
    FileObject,
    Project,
    ReportAttachment,
    ReportComment,
    SubcontractorAttendance,
    SubcontractorCompany,
    SubcontractorCompanyContact,
    SubcontractorCompanyFile,
    SubcontractorWorker,
    SubcontractorWorkerFile,
    User,
    WorkOrderFile,
)
from ..schemas.employee_training import EmployeeTrainingRecordCreate, EmployeeTrainingRecordUpdate
from ..services.audit import compute_diff, create_audit_log
from ..services.training_matrix_slots import get_matrix_training_defs, is_valid_matrix_training_id
from ..training_matrix_catalog import format_record_cell_display, normalize_matrix_training_id

router = APIRouter(prefix="/subcontractors", tags=["subcontractors"])


def _require_subcontractor_access(user: User) -> None:
    if any((getattr(r, "name", None) or "").lower() == "admin" for r in user.roles):
        return
    ok = (
        _has_permission(user, "business:customers:read")
        or _has_permission(user, "business:construction:projects:read")
        or _has_permission(user, "business:rm:projects:read")
        or _has_permission(user, "hr:attendance:read")
        or _has_permission(user, "hr:attendance:write")
    )
    if not ok:
        raise HTTPException(status_code=403, detail="Forbidden")


def _require_subcontractor_write(user: User) -> None:
    if any((getattr(r, "name", None) or "").lower() == "admin" for r in user.roles):
        return
    if not _has_permission(user, "business:customers:write"):
        raise HTTPException(status_code=403, detail="Forbidden")


LMS_PROVIDER_LABEL = "MKHub LMS"
LMS_NOTE_PREFIX = "[MKHub LMS]"


def _worker_training_can_edit(user: User) -> bool:
    if any((getattr(r, "name", None) or "").lower() == "admin" for r in user.roles):
        return True
    return (
        _has_permission(user, "business:customers:write")
        or _has_permission(user, "users:write")
        or _has_permission(user, "hr:users:edit:general")
    )


def _worker_reports_can_view(user: User) -> bool:
    if any((getattr(r, "name", None) or "").lower() == "admin" for r in user.roles):
        return True
    return _has_permission(user, "hr:users:view:general") or _has_permission(user, "users:read")


def _worker_reports_can_edit(user: User) -> bool:
    return _worker_training_can_edit(user)


def _serialize_subcontractor_training_row(r: EmployeeTrainingRecord) -> dict[str, Any]:
    mid = getattr(r, "matrix_training_id", None)
    uid = getattr(r, "user_id", None)
    wid = getattr(r, "subcontractor_worker_id", None)
    return {
        "id": str(r.id),
        "user_id": str(uid) if uid else None,
        "subcontractor_worker_id": str(wid) if wid else None,
        "title": r.title,
        "provider": r.provider,
        "category": r.category,
        "delivery_format": r.delivery_format,
        "start_date": r.start_date.isoformat() if r.start_date else None,
        "end_date": r.end_date.isoformat() if r.end_date else None,
        "completion_date": r.completion_date.isoformat() if r.completion_date else None,
        "duration_hours": float(r.duration_hours) if r.duration_hours is not None else None,
        "status": r.status or "completed",
        "certificate_number": r.certificate_number,
        "expiry_date": r.expiry_date.isoformat() if r.expiry_date else None,
        "notes": r.notes,
        "crew": getattr(r, "crew", None),
        "location": getattr(r, "location", None),
        "session_time": getattr(r, "session_time", None),
        "matrix_training_id": str(mid).strip() if mid else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        "created_by_user_id": str(r.created_by_user_id) if r.created_by_user_id else None,
        "training_source": (
            "lms"
            if (r.provider or "").strip() == LMS_PROVIDER_LABEL or (LMS_NOTE_PREFIX in (r.notes or ""))
            else "manual"
        ),
    }


def _enforce_unique_matrix_subcontractor_worker(
    db: Session,
    worker_id: uuid.UUID,
    matrix_training_id: Optional[str],
    *,
    exclude_record_id: Optional[uuid.UUID] = None,
) -> Optional[str]:
    mid = normalize_matrix_training_id(matrix_training_id)
    if not mid:
        return None
    if not is_valid_matrix_training_id(mid, db):
        raise HTTPException(status_code=400, detail="Invalid matrix_training_id")
    q = db.query(EmployeeTrainingRecord).filter(
        EmployeeTrainingRecord.subcontractor_worker_id == worker_id,
        EmployeeTrainingRecord.matrix_training_id == mid,
    )
    if exclude_record_id:
        q = q.filter(EmployeeTrainingRecord.id != exclude_record_id)
    if q.first():
        raise HTTPException(
            status_code=400,
            detail="Another training record already uses this matrix slot for this worker",
        )
    return mid


def _pick_explicit_matrix_training_record(
    records: List[EmployeeTrainingRecord], matrix_id: str
) -> Optional[EmployeeTrainingRecord]:
    direct = [
        x
        for x in records
        if getattr(x, "matrix_training_id", None) is not None
        and str(getattr(x, "matrix_training_id")).strip() == matrix_id
    ]
    if not direct:
        return None
    if len(direct) == 1:
        return direct[0]
    return max(
        direct,
        key=lambda r: (
            r.completion_date or r.updated_at or r.created_at,
            r.id,
        ),
    )


def _subcontractor_worker_for_training_or_404(db: Session, worker_id: uuid.UUID) -> SubcontractorWorker:
    w = db.query(SubcontractorWorker).filter(SubcontractorWorker.id == worker_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")
    return w


def _norm_opt_str(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def _parse_iso_dt(s: Optional[str]) -> Optional[datetime]:
    if not s or not str(s).strip():
        return None
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid datetime format")


def _company_to_dict(c: SubcontractorCompany) -> dict:
    return {
        "id": str(c.id),
        "name": c.name,
        "contact_name": c.contact_name,
        "phone": c.phone,
        "email": c.email,
        "address_line1": c.address_line1,
        "address_line2": c.address_line2,
        "city": c.city,
        "province": c.province,
        "postal_code": c.postal_code,
        "country": c.country,
        "is_active": c.is_active,
        "notes": c.notes,
        "document_attachment_ids": c.document_attachment_ids or [],
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


def _compose_worker_name(w: SubcontractorWorker) -> str:
    pref = (getattr(w, "preferred_name", None) or "").strip()
    if pref:
        return pref
    fn = (getattr(w, "first_name", None) or "").strip()
    mn = (getattr(w, "middle_name", None) or "").strip()
    ln = (getattr(w, "last_name", None) or "").strip()
    parts = [p for p in (fn, mn, ln) if p]
    if parts:
        return " ".join(parts)
    cur = (w.name or "").strip()
    return cur or "Worker"


def _worker_to_dict(w: SubcontractorWorker, include_qr_token: bool = False) -> dict:
    d = {
        "id": str(w.id),
        "company_id": str(w.company_id),
        "name": w.name,
        "first_name": w.first_name,
        "last_name": w.last_name,
        "middle_name": w.middle_name,
        "preferred_name": w.preferred_name,
        "gender": w.gender,
        "phone": w.phone,
        "email": w.email,
        "photo_file_id": str(w.photo_file_id) if w.photo_file_id else None,
        "is_active": w.is_active,
        "notes": w.notes,
        "job_title": w.job_title,
        "address_line1": w.address_line1,
        "address_line2": w.address_line2,
        "city": w.city,
        "province": w.province,
        "postal_code": w.postal_code,
        "country": w.country,
        "emergency_contact_name": w.emergency_contact_name,
        "emergency_contact_relationship": w.emergency_contact_relationship,
        "emergency_contact_phone": w.emergency_contact_phone,
        "emergency_contact_home_phone": w.emergency_contact_home_phone,
        "emergency_contact_work_phone": w.emergency_contact_work_phone,
        "emergency_contact_email": w.emergency_contact_email,
        "emergency_contact_address": w.emergency_contact_address,
        "created_at": w.created_at.isoformat() if w.created_at else None,
        "updated_at": w.updated_at.isoformat() if w.updated_at else None,
    }
    if include_qr_token:
        d["qr_token"] = str(w.qr_token)
    return d


WORKER_AUDIT_FIELD_LABELS: dict[str, str] = {
    "name": "Name",
    "first_name": "First name",
    "last_name": "Last name",
    "middle_name": "Middle name",
    "preferred_name": "Preferred name",
    "gender": "Gender",
    "phone": "Phone",
    "email": "Email",
    "notes": "Notes",
    "job_title": "Job title",
    "address_line1": "Address line 1",
    "address_line2": "Address line 2",
    "city": "City",
    "province": "Province",
    "postal_code": "Postal code",
    "country": "Country",
    "emergency_contact_name": "Emergency contact",
    "emergency_contact_relationship": "Emergency relationship",
    "emergency_contact_phone": "Emergency phone",
    "emergency_contact_home_phone": "Emergency home phone",
    "emergency_contact_work_phone": "Emergency work phone",
    "emergency_contact_email": "Emergency email",
    "emergency_contact_address": "Emergency address",
    "is_active": "Active status",
    "photo_file_id": "Photo",
    "category": "File category",
    "original_name": "File name",
}


def _snap_str(v: Any) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, bool):
        return "Yes" if v else "No"
    s = str(v).strip()
    return s if s else None


def _subcontractor_worker_audit_fields(w: SubcontractorWorker) -> dict[str, Any]:
    return {
        "name": _snap_str(w.name),
        "first_name": _snap_str(w.first_name),
        "last_name": _snap_str(w.last_name),
        "middle_name": _snap_str(w.middle_name),
        "preferred_name": _snap_str(w.preferred_name),
        "gender": _snap_str(w.gender),
        "phone": _snap_str(w.phone),
        "email": _snap_str(w.email),
        "notes": _snap_str(w.notes),
        "job_title": _snap_str(w.job_title),
        "address_line1": _snap_str(w.address_line1),
        "address_line2": _snap_str(w.address_line2),
        "city": _snap_str(w.city),
        "province": _snap_str(w.province),
        "postal_code": _snap_str(w.postal_code),
        "country": _snap_str(w.country),
        "emergency_contact_name": _snap_str(w.emergency_contact_name),
        "emergency_contact_relationship": _snap_str(w.emergency_contact_relationship),
        "emergency_contact_phone": _snap_str(w.emergency_contact_phone),
        "emergency_contact_home_phone": _snap_str(w.emergency_contact_home_phone),
        "emergency_contact_work_phone": _snap_str(w.emergency_contact_work_phone),
        "emergency_contact_email": _snap_str(w.emergency_contact_email),
        "emergency_contact_address": _snap_str(w.emergency_contact_address),
        "is_active": bool(w.is_active),
        "photo_file_id": str(w.photo_file_id) if w.photo_file_id else None,
    }


def _activity_scalar_display(v: Any, field: str = "") -> str:
    if v is None or v == "":
        return "—"
    if field == "is_active":
        return "Active" if v else "Inactive"
    if field == "photo_file_id" and isinstance(v, str) and len(v) > 12:
        return f"{v[:8]}…"
    s = str(v).replace("\n", " ")
    if len(s) > 48:
        return s[:45] + "…"
    return s


def _worker_audit_diff_detail_lines(changes_json: Optional[dict[str, Any]]) -> List[str]:
    if not changes_json:
        return []
    lines: List[str] = []
    for k, entry in list(changes_json.items())[:14]:
        if not isinstance(entry, dict):
            continue
        b, a = entry.get("before"), entry.get("after")
        label = WORKER_AUDIT_FIELD_LABELS.get(k, k.replace("_", " ").title())
        lines.append(
            f"{label}: {_activity_scalar_display(b, k)} → {_activity_scalar_display(a, k)}"
        )
    return lines


def _worker_audit_diff_summary(changes_json: Optional[dict[str, Any]], max_labels: int = 6) -> str:
    if not changes_json:
        return ""
    keys = [k for k, e in changes_json.items() if isinstance(e, dict)]
    if not keys:
        return ""
    parts = [WORKER_AUDIT_FIELD_LABELS.get(k, k.replace("_", " ")) for k in keys[:max_labels]]
    out = ", ".join(parts)
    if len(keys) > max_labels:
        out += f" (+{len(keys) - max_labels} more)"
    return out


def _activity_username_map(db: Session, ids: set[uuid.UUID]) -> dict[str, str]:
    clean = {i for i in ids if i is not None}
    if not clean:
        return {}
    rows = db.query(User.id, User.username).filter(User.id.in_(list(clean))).all()
    return {str(r[0]): ((r[1] or "").strip() or str(r[0]))[:80] for r in rows}


def _open_attendance_for_worker(db: Session, worker_id: uuid.UUID) -> Optional[SubcontractorAttendance]:
    return (
        db.query(SubcontractorAttendance)
        .filter(
            SubcontractorAttendance.worker_id == worker_id,
            SubcontractorAttendance.clock_out_time.is_(None),
            SubcontractorAttendance.status == "open",
        )
        .order_by(SubcontractorAttendance.clock_in_time.desc())
        .first()
    )


SUBCONTRACTOR_COMPANY_LOGO_CATEGORY = "subcontractor-company-logo-derived"


def _company_logo_file_by_ids(db: Session, company_ids: List[Any]) -> dict[Any, SubcontractorCompanyFile]:
    """First logo file per company (category subcontractor-company-logo-derived)."""
    if not company_ids:
        return {}
    logo_rows = (
        db.query(SubcontractorCompanyFile)
        .filter(
            SubcontractorCompanyFile.company_id.in_(company_ids),
            SubcontractorCompanyFile.category.ilike(SUBCONTRACTOR_COMPANY_LOGO_CATEGORY),
            SubcontractorCompanyFile.deleted_at.is_(None),
        )
        .all()
    )
    out: dict[Any, SubcontractorCompanyFile] = {}
    for cf in logo_rows:
        if cf.company_id not in out:
            out[cf.company_id] = cf
    return out


def _attach_logo_url(company_dict: dict, logo_file: Optional[SubcontractorCompanyFile]) -> dict:
    company_dict["logo_url"] = None
    if logo_file:
        timestamp = logo_file.uploaded_at.isoformat() if logo_file.uploaded_at else None
        timestamp_param = f"&t={timestamp}" if timestamp else ""
        company_dict["logo_url"] = (
            f"/files/{logo_file.file_object_id}/thumbnail?w=96{timestamp_param}"
        )
    return company_dict


def _company_row_to_dict(
    c: SubcontractorCompany,
    worker_count: int = 0,
    logo_file: Optional[SubcontractorCompanyFile] = None,
) -> dict:
    d = _company_to_dict(c)
    d["worker_count"] = worker_count
    return _attach_logo_url(d, logo_file)


@router.get("/companies/locations")
def get_company_locations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Distinct city and province values for filter dropdowns."""
    _require_subcontractor_access(user)
    city_rows = (
        db.query(SubcontractorCompany.city)
        .filter(SubcontractorCompany.city.isnot(None), SubcontractorCompany.city != "")
        .distinct()
        .order_by(SubcontractorCompany.city.asc())
        .all()
    )
    province_rows = (
        db.query(SubcontractorCompany.province)
        .filter(SubcontractorCompany.province.isnot(None), SubcontractorCompany.province != "")
        .distinct()
        .order_by(SubcontractorCompany.province.asc())
        .all()
    )
    cities = sorted({str(r[0]).strip() for r in city_rows if r[0] and str(r[0]).strip()})
    provinces = sorted({str(r[0]).strip() for r in province_rows if r[0] and str(r[0]).strip()})
    return {"cities": cities, "provinces": provinces}


@router.get("/companies")
def list_companies(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=500),
    q: Optional[str] = Query(None, description="Search name, contact, email, phone, city, province"),
    sort: str = Query("name", description="name|city|province|created|workers"),
    sort_direction: str = Query("asc", alias="dir", description="asc or desc"),
    status: Optional[str] = Query(
        None,
        description="active|inactive|all; legacy include_inactive=true is equivalent to all",
    ),
    status_not: Optional[str] = Query(None, description="Exclude active or inactive"),
    city: Optional[str] = Query(None),
    city_not: Optional[str] = Query(None),
    province: Optional[str] = Query(None),
    province_not: Optional[str] = Query(None),
    include_inactive: bool = Query(False, description="Legacy: false = active only, true = all"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Paginated list. Response: { items, total, page, limit, total_pages }.
    For dropdowns needing all rows, use limit=500&page=1&status=all.
    """
    _require_subcontractor_access(user)

    eff_status = (status or "").strip().lower() or None
    if eff_status is None:
        eff_status = "all" if include_inactive else "active"
    if eff_status not in ("active", "inactive", "all"):
        eff_status = "all"

    base = db.query(SubcontractorCompany)
    if eff_status == "active":
        base = base.filter(SubcontractorCompany.is_active.is_(True))
    elif eff_status == "inactive":
        base = base.filter(SubcontractorCompany.is_active.is_(False))

    if status_not:
        stn = str(status_not).strip().lower()
        if stn == "active":
            base = base.filter(SubcontractorCompany.is_active.is_(False))
        elif stn == "inactive":
            base = base.filter(SubcontractorCompany.is_active.is_(True))

    if city:
        base = base.filter(SubcontractorCompany.city == city)
    if city_not:
        base = base.filter(SubcontractorCompany.city != city_not)
    if province:
        base = base.filter(SubcontractorCompany.province == province)
    if province_not:
        base = base.filter(SubcontractorCompany.province != province_not)

    if q and str(q).strip():
        term = f"%{str(q).strip()}%"
        base = base.filter(
            or_(
                SubcontractorCompany.name.ilike(term),
                SubcontractorCompany.contact_name.ilike(term),
                SubcontractorCompany.email.ilike(term),
                SubcontractorCompany.phone.ilike(term),
                SubcontractorCompany.city.ilike(term),
                SubcontractorCompany.province.ilike(term),
                SubcontractorCompany.address_line1.ilike(term),
            )
        )

    wc_sq = (
        db.query(func.count(SubcontractorWorker.id))
        .filter(SubcontractorWorker.company_id == SubcontractorCompany.id)
        .correlate(SubcontractorCompany)
        .scalar_subquery()
    )

    sort_key = (sort or "name").lower()
    direction = desc if (sort_direction or "asc").lower() == "desc" else asc
    if sort_key == "city":
        base = base.order_by(direction(SubcontractorCompany.city), direction(SubcontractorCompany.name))
    elif sort_key == "province":
        base = base.order_by(direction(SubcontractorCompany.province), direction(SubcontractorCompany.name))
    elif sort_key == "created":
        base = base.order_by(direction(SubcontractorCompany.created_at), direction(SubcontractorCompany.name))
    elif sort_key == "workers":
        base = base.order_by(direction(wc_sq), direction(SubcontractorCompany.name))
    else:
        base = base.order_by(direction(SubcontractorCompany.name))

    total = base.count()
    offset = (page - 1) * limit
    rows: List[SubcontractorCompany] = base.offset(offset).limit(limit).all()

    ids = [r.id for r in rows]
    counts: dict[Any, int] = {}
    if ids:
        cnt_rows = (
            db.query(SubcontractorWorker.company_id, func.count(SubcontractorWorker.id))
            .filter(SubcontractorWorker.company_id.in_(ids))
            .group_by(SubcontractorWorker.company_id)
            .all()
        )
        counts = {cid: int(n) for cid, n in cnt_rows}

    logo_files = _company_logo_file_by_ids(db, ids)
    items = [
        _company_row_to_dict(c, counts.get(c.id, 0), logo_files.get(c.id))
        for c in rows
    ]
    total_pages = max(1, (total + limit - 1) // limit) if total else 1
    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
    }


@router.post("/companies")
def create_company(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    c = SubcontractorCompany(
        name=name,
        contact_name=payload.get("contact_name"),
        phone=payload.get("phone"),
        email=payload.get("email"),
        address_line1=payload.get("address_line1"),
        address_line2=payload.get("address_line2"),
        city=payload.get("city"),
        province=payload.get("province"),
        postal_code=payload.get("postal_code"),
        country=payload.get("country"),
        is_active=bool(payload.get("is_active", True)),
        notes=payload.get("notes"),
        document_attachment_ids=payload.get("document_attachment_ids") or [],
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _company_to_dict(c)


@router.get("/companies/{company_id}")
def get_company(
    company_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    return _company_to_dict(c)


@router.get("/companies/{company_id}/activity-feed")
def company_activity_feed(
    company_id: uuid.UUID,
    limit: int = Query(80, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    items: List[dict[str, Any]] = []

    if c.created_at:
        items.append(
            {
                "type": "company_created",
                "at": c.created_at.isoformat(),
                "title": "Company added",
                "subtitle": c.name,
            }
        )

    company_files = (
        db.query(SubcontractorCompanyFile)
        .filter(SubcontractorCompanyFile.company_id == company_id)
        .all()
    )
    for cf in company_files:
        label = cf.original_name or cf.key or "Document"
        if cf.uploaded_at:
            items.append(
                {
                    "type": "document_uploaded",
                    "at": cf.uploaded_at.isoformat(),
                    "title": "Document uploaded",
                    "subtitle": label,
                    "company_file_id": str(cf.id),
                    "file_object_id": str(cf.file_object_id),
                    "by_user_id": str(cf.uploaded_by) if cf.uploaded_by else None,
                }
            )
        if cf.deleted_at:
            items.append(
                {
                    "type": "document_removed",
                    "at": cf.deleted_at.isoformat(),
                    "title": "Document removed",
                    "subtitle": label,
                    "company_file_id": str(cf.id),
                    "file_object_id": str(cf.file_object_id),
                    "by_user_id": str(cf.deleted_by_id) if cf.deleted_by_id else None,
                }
            )

    workers = (
        db.query(SubcontractorWorker)
        .filter(SubcontractorWorker.company_id == company_id)
        .order_by(SubcontractorWorker.created_at.desc())
        .all()
    )
    worker_ids = [w.id for w in workers]
    workers_by_id = {str(w.id): w for w in workers}

    for w in workers:
        if w.created_at:
            items.append(
                {
                    "type": "worker_added",
                    "at": w.created_at.isoformat(),
                    "title": "Worker added",
                    "subtitle": w.name,
                    "worker_id": str(w.id),
                }
            )

    if worker_ids:
        attendances = (
            db.query(SubcontractorAttendance)
            .filter(SubcontractorAttendance.worker_id.in_(worker_ids))
            .order_by(SubcontractorAttendance.clock_in_time.desc())
            .limit(200)
            .all()
        )
        project_ids = list({a.project_id for a in attendances})
        projects = (
            {str(p.id): p for p in db.query(Project).filter(Project.id.in_(project_ids)).all()}
            if project_ids
            else {}
        )
        for a in attendances:
            w = workers_by_id.get(str(a.worker_id))
            wname = w.name if w else None
            pname = projects[str(a.project_id)].name if projects.get(str(a.project_id)) else None
            worker_part = wname or "Worker"
            t_in = a.clock_in_entered_utc or a.clock_in_time
            if t_in:
                sub_parts = [p for p in [worker_part, pname] if p]
                items.append(
                    {
                        "type": "clock_in",
                        "at": t_in.isoformat(),
                        "title": "Clock in",
                        "subtitle": " · ".join(sub_parts) if sub_parts else None,
                        "project_id": str(a.project_id),
                        "attendance_id": str(a.id),
                        "worker_id": str(a.worker_id),
                        "by_user_id": str(a.clock_in_confirmed_by_user_id)
                        if a.clock_in_confirmed_by_user_id
                        else None,
                    }
                )
            if a.clock_out_time:
                t_out = a.clock_out_entered_utc or a.clock_out_time
                th = a.total_hours
                hours_f = float(th) if th is not None else None
                sub_parts = [p for p in [worker_part, pname] if p]
                items.append(
                    {
                        "type": "clock_out",
                        "at": t_out.isoformat() if t_out else None,
                        "title": "Clock out",
                        "subtitle": " · ".join(sub_parts) if sub_parts else None,
                        "project_id": str(a.project_id),
                        "attendance_id": str(a.id),
                        "worker_id": str(a.worker_id),
                        "total_hours": hours_f,
                        "by_user_id": str(a.clock_out_confirmed_by_user_id)
                        if a.clock_out_confirmed_by_user_id
                        else None,
                    }
                )

        audit_rows = (
            db.query(AuditLog)
            .filter(
                AuditLog.entity_type == "subcontractor_worker",
                AuditLog.entity_id.in_(worker_ids),
            )
            .order_by(AuditLog.timestamp_utc.desc())
            .limit(200)
            .all()
        )
        for al in audit_rows:
            w = workers_by_id.get(str(al.entity_id))
            wname = w.name if w else None
            ts = al.timestamp_utc
            at_s = ts.isoformat() if ts is not None else None
            ctx = al.context if isinstance(al.context, dict) else {}
            summary = (ctx or {}).get("summary") or ""
            detail_lines = (ctx or {}).get("detail_lines")
            if not detail_lines and al.changes_json:
                detail_lines = _worker_audit_diff_detail_lines(al.changes_json)
            action = (al.action or "").upper()
            if action == "CREATE":
                title = "Worker created"
                subtitle = wname or (ctx or {}).get("display_name") or summary or None
            elif (ctx or {}).get("scope") == "worker_file":
                title = "Worker document updated"
                base = summary or "File metadata"
                subtitle = f"{wname} · {base}" if wname and base else (wname or base or None)
            else:
                title = "Worker profile updated" if action == "UPDATE" else (action.title() or "Record")
                base = summary or None
                subtitle = f"{wname} · {base}" if wname and base else (wname or base or None)
            items.append(
                {
                    "type": "audit",
                    "at": at_s,
                    "title": title,
                    "subtitle": subtitle,
                    "worker_id": str(al.entity_id) if al.entity_id else None,
                    "by_user_id": str(al.actor_id) if al.actor_id else None,
                    "audit_id": str(al.id),
                    "audit_action": action,
                    "detail_lines": detail_lines or [],
                }
            )

    items = [x for x in items if x.get("at")]
    uids: set[uuid.UUID] = set()
    for it in items:
        bid = it.get("by_user_id")
        if not bid:
            continue
        try:
            uids.add(uuid.UUID(str(bid)))
        except Exception:
            pass
    unames = _activity_username_map(db, uids)
    for it in items:
        bid = it.get("by_user_id")
        it["by_username"] = unames.get(str(bid)) if bid else None

    items.sort(key=lambda x: x["at"], reverse=True)
    return items[:limit]


@router.patch("/companies/{company_id}")
def patch_company(
    company_id: uuid.UUID,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    for key in (
        "name",
        "contact_name",
        "phone",
        "email",
        "address_line1",
        "address_line2",
        "city",
        "province",
        "postal_code",
        "country",
        "notes",
        "document_attachment_ids",
    ):
        if key in payload:
            setattr(c, key, payload[key])
    if "is_active" in payload:
        c.is_active = bool(payload["is_active"])
    c.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(c)
    return _company_to_dict(c)


def _contact_to_dict(ct: SubcontractorCompanyContact) -> dict:
    return {
        "id": str(ct.id),
        "company_id": str(ct.company_id),
        "name": ct.name,
        "role_title": ct.role_title,
        "department": ct.department,
        "email": ct.email,
        "phone": ct.phone,
        "mobile_phone": ct.mobile_phone,
        "is_primary": ct.is_primary,
        "sort_index": ct.sort_index,
        "notes": ct.notes,
        "role_tags": ct.role_tags or [],
        "photo_file_id": str(ct.photo_file_id) if ct.photo_file_id else None,
    }


def _sync_primary_contact_to_company(db: Session, company_id: uuid.UUID) -> None:
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == company_id).first()
    if not c:
        return
    primary = (
        db.query(SubcontractorCompanyContact)
        .filter(
            SubcontractorCompanyContact.company_id == company_id,
            SubcontractorCompanyContact.is_primary.is_(True),
        )
        .order_by(SubcontractorCompanyContact.sort_index.asc(), SubcontractorCompanyContact.name.asc())
        .first()
    )
    if not primary:
        primary = (
            db.query(SubcontractorCompanyContact)
            .filter(SubcontractorCompanyContact.company_id == company_id)
            .order_by(SubcontractorCompanyContact.sort_index.asc(), SubcontractorCompanyContact.name.asc())
            .first()
        )
    if primary:
        c.contact_name = primary.name
        c.phone = primary.phone or primary.mobile_phone
        c.email = primary.email
    c.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(c)


def _try_remove_orphan_file_object_subco(db: Session, file_object_id: uuid.UUID) -> None:
    """After removing a SubcontractorCompanyFile row, delete storage + FileObject if unreferenced."""
    if db.query(SubcontractorCompanyFile).filter(SubcontractorCompanyFile.file_object_id == file_object_id).count() > 0:
        return
    if db.query(SubcontractorWorkerFile).filter(SubcontractorWorkerFile.file_object_id == file_object_id).count() > 0:
        return
    if (
        db.query(SubcontractorWorker)
        .filter(SubcontractorWorker.photo_file_id == file_object_id)
        .count()
        > 0
    ):
        return
    if db.query(ClientFile).filter(ClientFile.file_object_id == file_object_id).count() > 0:
        return
    if db.query(WorkOrderFile).filter(WorkOrderFile.file_object_id == file_object_id).count() > 0:
        return
    fo = db.query(FileObject).filter(FileObject.id == file_object_id).first()
    if not fo:
        return
    try:
        from ..routes.files import get_storage_for_file

        storage = get_storage_for_file(fo)
        storage.delete(fo.key)
    except Exception:
        pass
    db.delete(fo)


def _maybe_migrate_legacy_company_files(db: Session, company: SubcontractorCompany) -> None:
    raw = company.document_attachment_ids or []
    if not raw:
        return
    existing = (
        db.query(SubcontractorCompanyFile)
        .filter(SubcontractorCompanyFile.company_id == company.id, SubcontractorCompanyFile.deleted_at.is_(None))
        .count()
    )
    if existing > 0:
        return
    added = False
    for raw in raw:
        try:
            uid = uuid.UUID(str(raw))
        except Exception:
            continue
        fo = db.query(FileObject).filter(FileObject.id == uid).first()
        if not fo:
            continue
        display_name = os.path.basename(fo.key) if fo.key else str(uid)
        db.add(
            SubcontractorCompanyFile(
                company_id=company.id,
                file_object_id=uid,
                category=None,
                key=fo.key,
                original_name=display_name,
                uploaded_at=datetime.now(timezone.utc),
            )
        )
        added = True
    if added:
        db.commit()
        db.refresh(company)
        _sync_document_attachment_ids_from_files(db, company.id)


def _sync_document_attachment_ids_from_files(db: Session, company_id: uuid.UUID) -> None:
    company = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == company_id).first()
    if not company:
        return
    rows = (
        db.query(SubcontractorCompanyFile)
        .filter(SubcontractorCompanyFile.company_id == company_id, SubcontractorCompanyFile.deleted_at.is_(None))
        .all()
    )
    out_pairs: List[tuple] = []
    for cf in rows:
        fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
        sort_index = 0
        try:
            if fo and getattr(fo, "tags", None):
                m = (fo.tags or {}).get("subcontractor_company_sort") or {}
                sort_index = int(m.get(str(company_id), 0) or 0)
        except Exception:
            sort_index = 0
        out_pairs.append((cf, sort_index))
    try:
        out_pairs.sort(key=lambda x: (int(x[1] or 0), (x[0].uploaded_at.isoformat() if x[0].uploaded_at else "")))
        out_pairs.sort(key=lambda x: (x[0].uploaded_at.isoformat() if x[0].uploaded_at else ""), reverse=True)
    except Exception:
        pass
    company.document_attachment_ids = [str(x[0].file_object_id) for x in out_pairs]
    company.updated_at = datetime.now(timezone.utc)
    db.commit()


def _company_file_row_dict(cf: SubcontractorCompanyFile, fo: Optional[FileObject], company_id: uuid.UUID) -> dict:
    ct = getattr(fo, "content_type", None) if fo else None
    name = cf.original_name or cf.key or ""
    ext = (name.rsplit(".", 1)[-1] if "." in name else "").lower()
    is_img_ext = ext in {"png", "jpg", "jpeg", "webp", "gif", "bmp", "heic", "heif"}
    is_image = (ct or "").startswith("image/") or is_img_ext
    sort_index = 0
    try:
        if fo and getattr(fo, "tags", None):
            m = (fo.tags or {}).get("subcontractor_company_sort") or {}
            sort_index = int(m.get(str(company_id), 0) or 0)
    except Exception:
        sort_index = 0
    return {
        "id": str(cf.id),
        "file_object_id": str(cf.file_object_id),
        "category": cf.category,
        "key": cf.key,
        "original_name": cf.original_name,
        "site_id": None,
        "uploaded_at": cf.uploaded_at.isoformat() if cf.uploaded_at else None,
        "uploaded_by": str(cf.uploaded_by) if cf.uploaded_by else None,
        "content_type": ct,
        "is_image": is_image,
        "sort_index": sort_index,
    }


def _worker_file_row_dict(wf: SubcontractorWorkerFile, fo: Optional[FileObject], worker_id: uuid.UUID) -> dict:
    ct = getattr(fo, "content_type", None) if fo else None
    name = wf.original_name or wf.key or ""
    ext = (name.rsplit(".", 1)[-1] if "." in name else "").lower()
    is_img_ext = ext in {"png", "jpg", "jpeg", "webp", "gif", "bmp", "heic", "heif"}
    is_image = (ct or "").startswith("image/") or is_img_ext
    sort_index = 0
    try:
        if fo and getattr(fo, "tags", None):
            m = (fo.tags or {}).get("subcontractor_worker_sort") or {}
            sort_index = int(m.get(str(worker_id), 0) or 0)
    except Exception:
        sort_index = 0
    return {
        "id": str(wf.id),
        "file_object_id": str(wf.file_object_id),
        "category": wf.category,
        "key": wf.key,
        "original_name": wf.original_name,
        "site_id": None,
        "uploaded_at": wf.uploaded_at.isoformat() if wf.uploaded_at else None,
        "uploaded_by": str(wf.uploaded_by) if wf.uploaded_by else None,
        "content_type": ct,
        "is_image": is_image,
        "sort_index": sort_index,
    }


@router.get("/companies/{company_id}/files")
def list_company_files(
    company_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    _maybe_migrate_legacy_company_files(db, c)
    rows = (
        db.query(SubcontractorCompanyFile)
        .filter(SubcontractorCompanyFile.company_id == company_id, SubcontractorCompanyFile.deleted_at.is_(None))
        .all()
    )
    out: List[dict] = []
    for cf in rows:
        fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
        out.append(_company_file_row_dict(cf, fo, company_id))
    try:
        out.sort(key=lambda x: (int(x.get("sort_index") or 0), (x.get("uploaded_at") or "")))
        out.sort(key=lambda x: (x.get("uploaded_at") or ""), reverse=True)
    except Exception:
        pass
    return out


@router.get("/companies/{company_id}/files/deleted")
def list_deleted_company_files(
    company_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    rows = (
        db.query(SubcontractorCompanyFile)
        .filter(SubcontractorCompanyFile.company_id == company_id, SubcontractorCompanyFile.deleted_at.isnot(None))
        .order_by(SubcontractorCompanyFile.deleted_at.desc())
        .all()
    )
    out: List[dict] = []
    for cf in rows:
        fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
        if not fo or getattr(fo, "project_id", None) is not None:
            continue
        ct = getattr(fo, "content_type", None) if fo else None
        name = cf.original_name or cf.key or ""
        ext = (name.rsplit(".", 1)[-1] if "." in name else "").lower()
        is_img_ext = ext in {"png", "jpg", "jpeg", "webp", "gif", "bmp", "heic", "heif"}
        is_image = (ct or "").startswith("image/") or is_img_ext
        out.append(
            {
                "id": str(cf.id),
                "file_object_id": str(cf.file_object_id),
                "category": cf.category,
                "key": cf.key,
                "original_name": cf.original_name,
                "site_id": None,
                "uploaded_at": cf.uploaded_at.isoformat() if cf.uploaded_at else None,
                "deleted_at": cf.deleted_at.isoformat() if cf.deleted_at else None,
                "deleted_by_id": str(cf.deleted_by_id) if getattr(cf, "deleted_by_id", None) else None,
                "content_type": ct,
                "is_image": is_image,
            }
        )
    return out


@router.post("/companies/{company_id}/files")
def attach_company_file(
    company_id: uuid.UUID,
    file_object_id: str,
    category: Optional[str] = None,
    original_name: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_write(user)
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    fo = db.query(FileObject).filter(FileObject.id == file_object_id).first()
    if not fo:
        raise HTTPException(status_code=404, detail="File not found")
    row = SubcontractorCompanyFile(
        company_id=company_id,
        file_object_id=fo.id,
        category=category,
        key=fo.key,
        original_name=original_name,
        uploaded_by=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    _sync_document_attachment_ids_from_files(db, company_id)
    return {"id": str(row.id)}


@router.put("/companies/{company_id}/files/{company_file_id}")
def update_company_file(
    company_id: uuid.UUID,
    company_file_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_write(user)
    try:
        fuid = uuid.UUID(str(company_file_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file id")
    row = (
        db.query(SubcontractorCompanyFile)
        .filter(SubcontractorCompanyFile.id == fuid, SubcontractorCompanyFile.company_id == company_id)
        .first()
    )
    if not row or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail="File not found")
    if "category" in payload:
        row.category = payload["category"]
    if "original_name" in payload:
        row.original_name = payload["original_name"]
    db.commit()
    return {"status": "ok"}


@router.delete("/companies/{company_id}/files/{company_file_id}")
def delete_company_file(
    company_id: uuid.UUID,
    company_file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_write(user)
    try:
        fid = uuid.UUID(str(company_file_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file id")
    row = (
        db.query(SubcontractorCompanyFile)
        .filter(SubcontractorCompanyFile.id == fid, SubcontractorCompanyFile.company_id == company_id)
        .first()
    )
    if not row:
        return {"status": "ok"}
    if row.deleted_at is not None:
        return {"status": "ok"}
    row.deleted_at = datetime.now(timezone.utc)
    row.deleted_by_id = user.id
    db.commit()
    _sync_document_attachment_ids_from_files(db, company_id)
    return {"status": "ok"}


@router.post("/companies/{company_id}/files/deleted/{file_id}/restore")
def restore_deleted_company_file(
    company_id: uuid.UUID,
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    try:
        fid = uuid.UUID(str(file_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file id")
    cf = (
        db.query(SubcontractorCompanyFile)
        .filter(SubcontractorCompanyFile.id == fid, SubcontractorCompanyFile.company_id == company_id)
        .first()
    )
    if not cf or cf.deleted_at is None:
        raise HTTPException(status_code=404, detail="Deleted file not found")
    fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
    if not fo or getattr(fo, "project_id", None) is not None:
        raise HTTPException(status_code=404, detail="Deleted file not found")
    cf.deleted_at = None
    cf.deleted_by_id = None
    db.commit()
    _sync_document_attachment_ids_from_files(db, company_id)
    return {"status": "ok", "id": str(cf.id)}


@router.delete("/companies/{company_id}/files/deleted/{file_id}")
def permanently_delete_company_file_admin(
    company_id: uuid.UUID,
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    try:
        fid = uuid.UUID(str(file_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file id")
    cf = (
        db.query(SubcontractorCompanyFile)
        .filter(SubcontractorCompanyFile.id == fid, SubcontractorCompanyFile.company_id == company_id)
        .first()
    )
    if not cf or cf.deleted_at is None:
        raise HTTPException(status_code=404, detail="Deleted file not found")
    fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
    if not fo or getattr(fo, "project_id", None) is not None:
        raise HTTPException(status_code=404, detail="Deleted file not found")
    fo_id = fo.id
    db.delete(cf)
    db.flush()
    _try_remove_orphan_file_object_subco(db, fo_id)
    db.commit()
    _sync_document_attachment_ids_from_files(db, company_id)
    return {"status": "ok"}


@router.post("/companies/{company_id}/files/reorder")
def reorder_company_files(
    company_id: uuid.UUID,
    order: List[str] = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_write(user)
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    cfiles = (
        db.query(SubcontractorCompanyFile)
        .filter(SubcontractorCompanyFile.company_id == company_id, SubcontractorCompanyFile.deleted_at.is_(None))
        .all()
    )
    index = {str(cid): i for i, cid in enumerate(order or [])}
    for cf in cfiles:
        idx = index.get(str(cf.id))
        if idx is None:
            continue
        fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
        if not fo:
            continue
        tags = dict(getattr(fo, "tags", None) or {})
        sub_sort = dict(tags.get("subcontractor_company_sort") or {})
        sub_sort[str(company_id)] = int(idx)
        tags["subcontractor_company_sort"] = sub_sort
        fo.tags = tags
    db.commit()
    _sync_document_attachment_ids_from_files(db, company_id)
    return {"status": "ok"}


@router.get("/companies/{company_id}/attachments-meta")
def list_company_attachments_meta(
    company_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    _maybe_migrate_legacy_company_files(db, c)
    rows = (
        db.query(SubcontractorCompanyFile)
        .filter(SubcontractorCompanyFile.company_id == company_id, SubcontractorCompanyFile.deleted_at.is_(None))
        .all()
    )
    if rows:
        out: List[dict] = []
        for cf in rows:
            fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
            if not fo:
                out.append(
                    {
                        "id": str(cf.file_object_id),
                        "original_name": None,
                        "content_type": None,
                        "created_at": None,
                        "missing": True,
                    }
                )
                continue
            display_name = cf.original_name or (os.path.basename(fo.key) if fo.key else str(fo.id))
            out.append(
                {
                    "id": str(fo.id),
                    "original_name": display_name,
                    "content_type": fo.content_type,
                    "created_at": fo.created_at.isoformat() if fo.created_at else None,
                    "missing": False,
                }
            )
        try:
            enriched = []
            for item in out:
                fo2 = db.query(FileObject).filter(FileObject.id == uuid.UUID(str(item["id"]))).first()
                si = 0
                if fo2 and getattr(fo2, "tags", None):
                    try:
                        m = (fo2.tags or {}).get("subcontractor_company_sort") or {}
                        si = int(m.get(str(company_id), 0) or 0)
                    except Exception:
                        si = 0
                enriched.append((item, si, item.get("created_at") or ""))
            enriched.sort(key=lambda x: (int(x[1] or 0), x[2]))
            enriched.sort(key=lambda x: x[2], reverse=True)
            return [x[0] for x in enriched]
        except Exception:
            return out
    raw_ids = c.document_attachment_ids or []
    out_legacy: List[dict] = []
    for raw in raw_ids:
        try:
            fid = uuid.UUID(str(raw))
        except Exception:
            continue
        fo = db.query(FileObject).filter(FileObject.id == fid).first()
        if not fo:
            out_legacy.append(
                {
                    "id": str(fid),
                    "original_name": None,
                    "content_type": None,
                    "created_at": None,
                    "missing": True,
                }
            )
            continue
        display_name = os.path.basename(fo.key) if fo.key else str(fo.id)
        out_legacy.append(
            {
                "id": str(fo.id),
                "original_name": display_name,
                "content_type": fo.content_type,
                "created_at": fo.created_at.isoformat() if fo.created_at else None,
                "missing": False,
            }
        )
    return out_legacy


@router.get("/companies/{company_id}/contacts")
def list_company_contacts(
    company_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    rows = (
        db.query(SubcontractorCompanyContact)
        .filter(SubcontractorCompanyContact.company_id == company_id)
        .order_by(SubcontractorCompanyContact.sort_index.asc(), SubcontractorCompanyContact.name.asc())
        .all()
    )
    return [_contact_to_dict(x) for x in rows]


@router.post("/companies/{company_id}/contacts")
def create_company_contact(
    company_id: uuid.UUID,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    _require_subcontractor_write(user)
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    count = db.query(SubcontractorCompanyContact).filter(SubcontractorCompanyContact.company_id == company_id).count()
    if "is_primary" in payload:
        want_primary = bool(payload.get("is_primary"))
    else:
        want_primary = count == 0
    max_sort = (
        db.query(func.max(SubcontractorCompanyContact.sort_index))
        .filter(SubcontractorCompanyContact.company_id == company_id)
        .scalar()
    )
    next_sort = int(max_sort or -1) + 1
    if want_primary:
        for row in db.query(SubcontractorCompanyContact).filter(SubcontractorCompanyContact.company_id == company_id).all():
            row.is_primary = False
    photo_uuid = None
    if payload.get("photo_file_id"):
        try:
            photo_uuid = uuid.UUID(str(payload.get("photo_file_id")))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid photo_file_id")
    ct = SubcontractorCompanyContact(
        company_id=company_id,
        name=name,
        role_title=payload.get("role_title"),
        department=payload.get("department"),
        email=payload.get("email"),
        phone=payload.get("phone"),
        mobile_phone=payload.get("mobile_phone"),
        is_primary=want_primary,
        sort_index=int(payload.get("sort_index") if payload.get("sort_index") is not None else next_sort),
        notes=payload.get("notes"),
        role_tags=payload.get("role_tags") or [],
        photo_file_id=photo_uuid,
    )
    db.add(ct)
    db.commit()
    db.refresh(ct)
    _sync_primary_contact_to_company(db, company_id)
    return _contact_to_dict(ct)


@router.patch("/companies/{company_id}/contacts/{contact_id}")
def patch_company_contact(
    company_id: uuid.UUID,
    contact_id: uuid.UUID,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    _require_subcontractor_write(user)
    ct = (
        db.query(SubcontractorCompanyContact)
        .filter(SubcontractorCompanyContact.id == contact_id, SubcontractorCompanyContact.company_id == company_id)
        .first()
    )
    if not ct:
        raise HTTPException(status_code=404, detail="Contact not found")
    if payload.get("is_primary") is True:
        for row in db.query(SubcontractorCompanyContact).filter(SubcontractorCompanyContact.company_id == company_id).all():
            row.is_primary = False
        ct.is_primary = True
    for key in (
        "name",
        "role_title",
        "department",
        "email",
        "phone",
        "mobile_phone",
        "notes",
        "sort_index",
        "role_tags",
    ):
        if key in payload:
            setattr(ct, key, payload[key])
    if "photo_file_id" in payload:
        pid = payload.get("photo_file_id")
        if pid:
            try:
                ct.photo_file_id = uuid.UUID(str(pid))
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid photo_file_id")
        else:
            ct.photo_file_id = None
    if "is_primary" in payload and payload.get("is_primary") is False and ct.is_primary:
        ct.is_primary = False
    db.commit()
    db.refresh(ct)
    _sync_primary_contact_to_company(db, company_id)
    return _contact_to_dict(ct)


@router.delete("/companies/{company_id}/contacts/{contact_id}")
def delete_company_contact(
    company_id: uuid.UUID,
    contact_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    _require_subcontractor_write(user)
    ct = (
        db.query(SubcontractorCompanyContact)
        .filter(SubcontractorCompanyContact.id == contact_id, SubcontractorCompanyContact.company_id == company_id)
        .first()
    )
    if not ct:
        return {"status": "ok"}
    db.delete(ct)
    db.commit()
    _sync_primary_contact_to_company(db, company_id)
    return {"status": "ok"}


@router.post("/companies/{company_id}/contacts/reorder")
def reorder_company_contacts(
    company_id: uuid.UUID,
    order: List[str] = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    _require_subcontractor_write(user)
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    contacts = db.query(SubcontractorCompanyContact).filter(SubcontractorCompanyContact.company_id == company_id).all()
    index = {str(cid): i for i, cid in enumerate(order)}
    for row in contacts:
        row.sort_index = index.get(str(row.id), row.sort_index)
    db.commit()
    return {"status": "ok"}


@router.get("/companies/{company_id}/workers")
def list_workers(
    company_id: uuid.UUID,
    include_inactive: bool = Query(False, description="Legacy when status omitted: false = active workers only"),
    status: Optional[str] = Query(
        None,
        description="active|inactive|all; when set, overrides legacy include_inactive",
    ),
    sort: str = Query("name", description="name|status|created"),
    sort_direction: str = Query("asc", alias="dir", description="asc or desc"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    eff_status = (status or "").strip().lower() or None
    if eff_status is None:
        eff_status = "all" if include_inactive else "active"
    if eff_status not in ("active", "inactive", "all"):
        eff_status = "all"

    q = db.query(SubcontractorWorker).filter(SubcontractorWorker.company_id == company_id)
    if eff_status == "active":
        q = q.filter(SubcontractorWorker.is_active.is_(True))
    elif eff_status == "inactive":
        q = q.filter(SubcontractorWorker.is_active.is_(False))

    direction = desc if (sort_direction or "asc").lower() == "desc" else asc
    sk = (sort or "name").lower()
    name_key = func.lower(SubcontractorWorker.name)
    if sk == "created":
        q = q.order_by(direction(SubcontractorWorker.created_at), asc(name_key))
    elif sk == "status":
        if direction == asc:
            q = q.order_by(desc(SubcontractorWorker.is_active), asc(name_key))
        else:
            q = q.order_by(asc(SubcontractorWorker.is_active), asc(name_key))
    else:
        q = q.order_by(direction(name_key))
    return [_worker_to_dict(w, include_qr_token=True) for w in q.all()]


@router.post("/companies/{company_id}/workers")
def create_worker(
    company_id: uuid.UUID,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    _require_subcontractor_write(user)
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    photo_id = payload.get("photo_file_id")
    photo_uuid = None
    if photo_id:
        try:
            photo_uuid = uuid.UUID(str(photo_id))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid photo_file_id")
    w = SubcontractorWorker(
        company_id=company_id,
        name=name,
        first_name=_norm_opt_str(payload.get("first_name")),
        last_name=_norm_opt_str(payload.get("last_name")),
        middle_name=_norm_opt_str(payload.get("middle_name")),
        preferred_name=_norm_opt_str(payload.get("preferred_name")),
        gender=_norm_opt_str(payload.get("gender")),
        phone=_norm_opt_str(payload.get("phone")),
        email=_norm_opt_str(payload.get("email")),
        photo_file_id=photo_uuid,
        is_active=bool(payload.get("is_active", True)),
        notes=_norm_opt_str(payload.get("notes")),
        job_title=_norm_opt_str(payload.get("job_title")),
        address_line1=_norm_opt_str(payload.get("address_line1")),
        address_line2=_norm_opt_str(payload.get("address_line2")),
        city=_norm_opt_str(payload.get("city")),
        province=_norm_opt_str(payload.get("province")),
        postal_code=_norm_opt_str(payload.get("postal_code")),
        country=_norm_opt_str(payload.get("country")),
        emergency_contact_name=_norm_opt_str(payload.get("emergency_contact_name")),
        emergency_contact_relationship=_norm_opt_str(payload.get("emergency_contact_relationship")),
        emergency_contact_phone=_norm_opt_str(payload.get("emergency_contact_phone")),
        emergency_contact_home_phone=_norm_opt_str(payload.get("emergency_contact_home_phone")),
        emergency_contact_work_phone=_norm_opt_str(payload.get("emergency_contact_work_phone")),
        emergency_contact_email=_norm_opt_str(payload.get("emergency_contact_email")),
        emergency_contact_address=_norm_opt_str(payload.get("emergency_contact_address")),
    )
    w.name = _compose_worker_name(w)
    db.add(w)
    db.commit()
    db.refresh(w)
    try:
        create_audit_log(
            db,
            "subcontractor_worker",
            str(w.id),
            "CREATE",
            actor_id=str(user.id),
            source="app",
            changes_json=None,
            context={
                "display_name": w.name,
                "company_id": str(company_id),
            },
        )
    except Exception:
        pass
    return _worker_to_dict(w, include_qr_token=True)


@router.get("/workers/resolve")
def resolve_worker_by_token(
    token: str = Query(..., description="Worker qr_token UUID"),
    project_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    try:
        tok = uuid.UUID(str(token).strip())
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid token")
    w = db.query(SubcontractorWorker).filter(SubcontractorWorker.qr_token == tok).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == w.company_id).first()
    open_a = _open_attendance_for_worker(db, w.id)
    ctx_project_id: Optional[uuid.UUID] = None
    if project_id:
        try:
            ctx_project_id = uuid.UUID(str(project_id).strip())
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid project_id")

    open_payload = None
    open_on_other = False
    other_project_name = None
    can_clock_in = False
    can_clock_out_on_this_project = False

    if open_a:
        proj = db.query(Project).filter(Project.id == open_a.project_id).first()
        open_payload = {
            "id": str(open_a.id),
            "project_id": str(open_a.project_id),
            "project_name": proj.name if proj else None,
            "clock_in_time": open_a.clock_in_time.isoformat() if open_a.clock_in_time else None,
        }
        if ctx_project_id:
            if open_a.project_id == ctx_project_id:
                can_clock_out_on_this_project = True
            else:
                open_on_other = True
                other_project_name = proj.name if proj else str(open_a.project_id)
        else:
            open_on_other = False
    else:
        can_clock_in = True
        if ctx_project_id:
            can_clock_out_on_this_project = False

    return {
        "worker": _worker_to_dict(w, include_qr_token=False),
        "company": _company_to_dict(c) if c else None,
        "worker_active": w.is_active,
        "company_active": c.is_active if c else False,
        "open_attendance": open_payload,
        "can_clock_in": can_clock_in,
        "can_clock_out_on_this_project": can_clock_out_on_this_project,
        "open_on_other_project": open_on_other,
        "other_project_name": other_project_name,
    }


@router.get("/workers/{worker_id}")
def get_worker(
    worker_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    w = db.query(SubcontractorWorker).filter(SubcontractorWorker.id == worker_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == w.company_id).first()
    open_a = _open_attendance_for_worker(db, w.id)
    out: dict[str, Any] = {"worker": _worker_to_dict(w, include_qr_token=True), "company": _company_to_dict(c) if c else None}
    if open_a:
        proj = db.query(Project).filter(Project.id == open_a.project_id).first()
        out["open_attendance"] = {
            "id": str(open_a.id),
            "project_id": str(open_a.project_id),
            "project_name": proj.name if proj else None,
            "clock_in_time": open_a.clock_in_time.isoformat() if open_a.clock_in_time else None,
        }
    else:
        out["open_attendance"] = None
    return out


@router.patch("/workers/{worker_id}")
def patch_worker(
    worker_id: uuid.UUID,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    _require_subcontractor_write(user)
    w = db.query(SubcontractorWorker).filter(SubcontractorWorker.id == worker_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")
    before_snap = _subcontractor_worker_audit_fields(w)
    if "name" in payload and (payload.get("name") or "").strip():
        w.name = (payload.get("name") or "").strip()
    for key in (
        "phone",
        "email",
        "notes",
        "job_title",
        "first_name",
        "last_name",
        "middle_name",
        "preferred_name",
        "gender",
        "address_line1",
        "address_line2",
        "city",
        "province",
        "postal_code",
        "country",
        "emergency_contact_name",
        "emergency_contact_relationship",
        "emergency_contact_phone",
        "emergency_contact_home_phone",
        "emergency_contact_work_phone",
        "emergency_contact_email",
        "emergency_contact_address",
    ):
        if key in payload:
            setattr(w, key, _norm_opt_str(payload.get(key)))
    if any(k in payload for k in ("first_name", "middle_name", "last_name", "preferred_name")):
        w.name = _compose_worker_name(w)
    if "is_active" in payload:
        w.is_active = bool(payload["is_active"])
    if "photo_file_id" in payload:
        pid = payload.get("photo_file_id")
        if pid:
            try:
                w.photo_file_id = uuid.UUID(str(pid))
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid photo_file_id")
        else:
            w.photo_file_id = None
    w.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(w)
    diff = compute_diff(before_snap, _subcontractor_worker_audit_fields(w))
    if diff:
        try:
            create_audit_log(
                db,
                "subcontractor_worker",
                str(worker_id),
                "UPDATE",
                actor_id=str(user.id),
                actor_role=None,
                source="app",
                changes_json=diff,
                context={
                    "summary": _worker_audit_diff_summary(diff),
                    "detail_lines": _worker_audit_diff_detail_lines(diff),
                },
            )
        except Exception:
            pass
    return _worker_to_dict(w, include_qr_token=True)


@router.get("/workers/{worker_id}/files")
def list_worker_files(
    worker_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    w = db.query(SubcontractorWorker).filter(SubcontractorWorker.id == worker_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")
    rows = (
        db.query(SubcontractorWorkerFile)
        .filter(SubcontractorWorkerFile.worker_id == worker_id, SubcontractorWorkerFile.deleted_at.is_(None))
        .all()
    )
    out: List[dict] = []
    for wf in rows:
        fo = db.query(FileObject).filter(FileObject.id == wf.file_object_id).first()
        out.append(_worker_file_row_dict(wf, fo, worker_id))
    try:
        out.sort(key=lambda x: (int(x.get("sort_index") or 0), (x.get("uploaded_at") or "")))
        out.sort(key=lambda x: (x.get("uploaded_at") or ""), reverse=True)
    except Exception:
        pass
    return out


@router.get("/workers/{worker_id}/files/deleted")
def list_deleted_worker_files(
    worker_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    w = db.query(SubcontractorWorker).filter(SubcontractorWorker.id == worker_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")
    rows = (
        db.query(SubcontractorWorkerFile)
        .filter(SubcontractorWorkerFile.worker_id == worker_id, SubcontractorWorkerFile.deleted_at.isnot(None))
        .order_by(SubcontractorWorkerFile.deleted_at.desc())
        .all()
    )
    out: List[dict] = []
    for wf in rows:
        fo = db.query(FileObject).filter(FileObject.id == wf.file_object_id).first()
        if not fo or getattr(fo, "project_id", None) is not None:
            continue
        ct = getattr(fo, "content_type", None) if fo else None
        name = wf.original_name or wf.key or ""
        ext = (name.rsplit(".", 1)[-1] if "." in name else "").lower()
        is_img_ext = ext in {"png", "jpg", "jpeg", "webp", "gif", "bmp", "heic", "heif"}
        is_image = (ct or "").startswith("image/") or is_img_ext
        out.append(
            {
                "id": str(wf.id),
                "file_object_id": str(wf.file_object_id),
                "category": wf.category,
                "key": wf.key,
                "original_name": wf.original_name,
                "site_id": None,
                "uploaded_at": wf.uploaded_at.isoformat() if wf.uploaded_at else None,
                "deleted_at": wf.deleted_at.isoformat() if wf.deleted_at else None,
                "deleted_by_id": str(wf.deleted_by_id) if getattr(wf, "deleted_by_id", None) else None,
                "content_type": ct,
                "is_image": is_image,
            }
        )
    return out


@router.post("/workers/{worker_id}/files")
def attach_worker_file(
    worker_id: uuid.UUID,
    file_object_id: str,
    category: Optional[str] = None,
    original_name: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    _require_subcontractor_write(user)
    w = db.query(SubcontractorWorker).filter(SubcontractorWorker.id == worker_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")
    fo = db.query(FileObject).filter(FileObject.id == file_object_id).first()
    if not fo:
        raise HTTPException(status_code=404, detail="File not found")
    row = SubcontractorWorkerFile(
        worker_id=worker_id,
        file_object_id=fo.id,
        category=category,
        key=fo.key,
        original_name=original_name,
        uploaded_by=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": str(row.id)}


@router.put("/workers/{worker_id}/files/{worker_file_id}")
def update_worker_file(
    worker_id: uuid.UUID,
    worker_file_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    _require_subcontractor_write(user)
    try:
        fuid = uuid.UUID(str(worker_file_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file id")
    row = (
        db.query(SubcontractorWorkerFile)
        .filter(SubcontractorWorkerFile.id == fuid, SubcontractorWorkerFile.worker_id == worker_id)
        .first()
    )
    if not row or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail="File not found")
    before_snap = {"category": _snap_str(row.category), "original_name": _snap_str(row.original_name)}
    if "category" in payload:
        row.category = payload["category"]
    if "original_name" in payload:
        row.original_name = payload["original_name"]
    db.commit()
    after_snap = {"category": _snap_str(row.category), "original_name": _snap_str(row.original_name)}
    fdiff = compute_diff(before_snap, after_snap)
    if fdiff:
        try:
            create_audit_log(
                db,
                "subcontractor_worker",
                str(worker_id),
                "UPDATE",
                actor_id=str(user.id),
                source="app",
                changes_json=fdiff,
                context={
                    "scope": "worker_file",
                    "worker_file_id": str(row.id),
                    "summary": _worker_audit_diff_summary(fdiff),
                    "detail_lines": _worker_audit_diff_detail_lines(fdiff),
                },
            )
        except Exception:
            pass
    return {"status": "ok"}


@router.delete("/workers/{worker_id}/files/{worker_file_id}")
def delete_worker_file(
    worker_id: uuid.UUID,
    worker_file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    _require_subcontractor_write(user)
    try:
        fid = uuid.UUID(str(worker_file_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file id")
    row = (
        db.query(SubcontractorWorkerFile)
        .filter(SubcontractorWorkerFile.id == fid, SubcontractorWorkerFile.worker_id == worker_id)
        .first()
    )
    if not row:
        return {"status": "ok"}
    if row.deleted_at is not None:
        return {"status": "ok"}
    row.deleted_at = datetime.now(timezone.utc)
    row.deleted_by_id = user.id
    db.commit()
    return {"status": "ok"}


@router.post("/workers/{worker_id}/files/deleted/{file_id}/restore")
def restore_deleted_worker_file(
    worker_id: uuid.UUID,
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    w = db.query(SubcontractorWorker).filter(SubcontractorWorker.id == worker_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")
    try:
        fid = uuid.UUID(str(file_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file id")
    wf = (
        db.query(SubcontractorWorkerFile)
        .filter(SubcontractorWorkerFile.id == fid, SubcontractorWorkerFile.worker_id == worker_id)
        .first()
    )
    if not wf or wf.deleted_at is None:
        raise HTTPException(status_code=404, detail="Deleted file not found")
    fo = db.query(FileObject).filter(FileObject.id == wf.file_object_id).first()
    if not fo or getattr(fo, "project_id", None) is not None:
        raise HTTPException(status_code=404, detail="Deleted file not found")
    wf.deleted_at = None
    wf.deleted_by_id = None
    db.commit()
    return {"status": "ok", "id": str(wf.id)}


@router.delete("/workers/{worker_id}/files/deleted/{file_id}")
def permanently_delete_worker_file_admin(
    worker_id: uuid.UUID,
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    w = db.query(SubcontractorWorker).filter(SubcontractorWorker.id == worker_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")
    try:
        fid = uuid.UUID(str(file_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file id")
    wf = (
        db.query(SubcontractorWorkerFile)
        .filter(SubcontractorWorkerFile.id == fid, SubcontractorWorkerFile.worker_id == worker_id)
        .first()
    )
    if not wf or wf.deleted_at is None:
        raise HTTPException(status_code=404, detail="Deleted file not found")
    fo = db.query(FileObject).filter(FileObject.id == wf.file_object_id).first()
    if not fo or getattr(fo, "project_id", None) is not None:
        raise HTTPException(status_code=404, detail="Deleted file not found")
    fo_id = fo.id
    db.delete(wf)
    db.flush()
    _try_remove_orphan_file_object_subco(db, fo_id)
    db.commit()
    return {"status": "ok"}


@router.post("/workers/{worker_id}/files/reorder")
def reorder_worker_files(
    worker_id: uuid.UUID,
    order: List[str] = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    _require_subcontractor_write(user)
    w = db.query(SubcontractorWorker).filter(SubcontractorWorker.id == worker_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")
    wfiles = (
        db.query(SubcontractorWorkerFile)
        .filter(SubcontractorWorkerFile.worker_id == worker_id, SubcontractorWorkerFile.deleted_at.is_(None))
        .all()
    )
    index = {str(cid): i for i, cid in enumerate(order or [])}
    for wf in wfiles:
        idx = index.get(str(wf.id))
        if idx is None:
            continue
        fo = db.query(FileObject).filter(FileObject.id == wf.file_object_id).first()
        if not fo:
            continue
        tags = dict(getattr(fo, "tags", None) or {})
        sub_sort = dict(tags.get("subcontractor_worker_sort") or {})
        sub_sort[str(worker_id)] = int(idx)
        tags["subcontractor_worker_sort"] = sub_sort
        fo.tags = tags
    db.commit()
    return {"status": "ok"}


@router.get("/workers/{worker_id}/activity-feed")
def worker_activity_feed(
    worker_id: uuid.UUID,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    w = db.query(SubcontractorWorker).filter(SubcontractorWorker.id == worker_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")
    items: List[dict[str, Any]] = []

    attendances = (
        db.query(SubcontractorAttendance)
        .filter(SubcontractorAttendance.worker_id == worker_id)
        .order_by(SubcontractorAttendance.clock_in_time.desc())
        .limit(200)
        .all()
    )
    project_ids = list({a.project_id for a in attendances})
    projects = {str(p.id): p for p in db.query(Project).filter(Project.id.in_(project_ids)).all()} if project_ids else {}
    for a in attendances:
        pname = projects[str(a.project_id)].name if projects.get(str(a.project_id)) else None
        t_in = a.clock_in_entered_utc or a.clock_in_time
        if t_in:
            items.append(
                {
                    "type": "clock_in",
                    "at": t_in.isoformat(),
                    "title": "Clock in",
                    "subtitle": pname,
                    "project_id": str(a.project_id),
                    "attendance_id": str(a.id),
                    "by_user_id": str(a.clock_in_confirmed_by_user_id)
                    if a.clock_in_confirmed_by_user_id
                    else None,
                }
            )
        if a.clock_out_time:
            t_out = a.clock_out_entered_utc or a.clock_out_time
            th = a.total_hours
            hours_f = float(th) if th is not None else None
            items.append(
                {
                    "type": "clock_out",
                    "at": t_out.isoformat() if t_out else None,
                    "title": "Clock out",
                    "subtitle": pname,
                    "project_id": str(a.project_id),
                    "attendance_id": str(a.id),
                    "total_hours": hours_f,
                    "by_user_id": str(a.clock_out_confirmed_by_user_id)
                    if a.clock_out_confirmed_by_user_id
                    else None,
                }
            )

    file_rows = db.query(SubcontractorWorkerFile).filter(SubcontractorWorkerFile.worker_id == worker_id).all()
    for wf in file_rows:
        label = wf.original_name or wf.key or "Document"
        if wf.uploaded_at:
            items.append(
                {
                    "type": "document_uploaded",
                    "at": wf.uploaded_at.isoformat(),
                    "title": "Document uploaded",
                    "subtitle": label,
                    "worker_file_id": str(wf.id),
                    "file_object_id": str(wf.file_object_id),
                    "by_user_id": str(wf.uploaded_by) if wf.uploaded_by else None,
                }
            )
        if wf.deleted_at:
            items.append(
                {
                    "type": "document_removed",
                    "at": wf.deleted_at.isoformat(),
                    "title": "Document removed",
                    "subtitle": label,
                    "worker_file_id": str(wf.id),
                    "file_object_id": str(wf.file_object_id),
                    "by_user_id": str(wf.deleted_by_id) if wf.deleted_by_id else None,
                }
            )

    audit_rows = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "subcontractor_worker", AuditLog.entity_id == worker_id)
        .order_by(AuditLog.timestamp_utc.desc())
        .limit(200)
        .all()
    )
    for al in audit_rows:
        ts = al.timestamp_utc
        at_s = ts.isoformat() if ts is not None else None
        ctx = al.context if isinstance(al.context, dict) else {}
        summary = (ctx or {}).get("summary") or ""
        detail_lines = (ctx or {}).get("detail_lines")
        if not detail_lines and al.changes_json:
            detail_lines = _worker_audit_diff_detail_lines(al.changes_json)
        action = (al.action or "").upper()
        if action == "CREATE":
            title = "Worker created"
            subtitle = (ctx or {}).get("display_name") or summary or None
        elif (ctx or {}).get("scope") == "worker_file":
            title = "Document details updated"
            subtitle = summary or "File metadata"
        else:
            title = "Profile updated" if action == "UPDATE" else (action.title() or "Record")
            subtitle = summary or None
        items.append(
            {
                "type": "audit",
                "at": at_s,
                "title": title,
                "subtitle": subtitle,
                "by_user_id": str(al.actor_id) if al.actor_id else None,
                "audit_id": str(al.id),
                "audit_action": action,
                "detail_lines": detail_lines or [],
            }
        )

    items = [x for x in items if x.get("at")]
    uids: set[uuid.UUID] = set()
    for it in items:
        bid = it.get("by_user_id")
        if not bid:
            continue
        try:
            uids.add(uuid.UUID(str(bid)))
        except Exception:
            pass
    unames = _activity_username_map(db, uids)
    for it in items:
        bid = it.get("by_user_id")
        it["by_username"] = unames.get(str(bid)) if bid else None

    items.sort(key=lambda x: x["at"], reverse=True)
    return items[:limit]


@router.get("/workers/{worker_id}/reports-summary")
def worker_reports_summary(
    worker_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    w = db.query(SubcontractorWorker).filter(SubcontractorWorker.id == worker_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")
    rows = (
        db.query(
            SubcontractorAttendance.project_id,
            func.count(SubcontractorAttendance.id),
            func.sum(SubcontractorAttendance.total_hours),
            func.max(SubcontractorAttendance.clock_out_time),
        )
        .filter(
            SubcontractorAttendance.worker_id == worker_id,
            SubcontractorAttendance.clock_out_time.isnot(None),
            SubcontractorAttendance.total_hours.isnot(None),
        )
        .group_by(SubcontractorAttendance.project_id)
        .all()
    )
    project_ids = [r[0] for r in rows]
    projects: dict[str, Project] = {}
    if project_ids:
        projects = {str(p.id): p for p in db.query(Project).filter(Project.id.in_(project_ids)).all()}
    out: List[dict[str, Any]] = []
    for project_id, session_count, hours_sum, last_out in rows:
        p = projects.get(str(project_id))
        hs = hours_sum
        hours_f = float(hs) if hs is not None else None
        out.append(
            {
                "project_id": str(project_id),
                "project_name": p.name if p else None,
                "session_count": int(session_count or 0),
                "total_hours": hours_f,
                "last_clock_out": last_out.isoformat() if last_out else None,
            }
        )
    out.sort(key=lambda x: (x.get("last_clock_out") or ""), reverse=True)
    return {"projects": out, "note": "Hours from subcontractor attendance only (not internal user project reports)."}


def _subcontractor_worker_report_list_dict(db: Session, report: EmployeeReport) -> dict[str, Any]:
    created_by_user = db.query(User).filter(User.id == report.created_by).first()
    reported_by_user = db.query(User).filter(User.id == report.reported_by).first()
    updated_by_user = None
    if report.updated_by:
        updated_by_user = db.query(User).filter(User.id == report.updated_by).first()
    return {
        "id": str(report.id),
        "report_type": report.report_type,
        "title": report.title,
        "description": report.description,
        "occurrence_date": report.occurrence_date.isoformat() if report.occurrence_date else None,
        "severity": report.severity,
        "status": report.status,
        "vehicle": report.vehicle,
        "ticket_number": report.ticket_number,
        "fine_amount": float(report.fine_amount) if report.fine_amount else None,
        "due_date": report.due_date.isoformat() if report.due_date else None,
        "related_project_department": report.related_project_department,
        "suspension_start_date": report.suspension_start_date.isoformat() if report.suspension_start_date else None,
        "suspension_end_date": report.suspension_end_date.isoformat() if report.suspension_end_date else None,
        "behavior_note_type": report.behavior_note_type,
        "reported_by": {
            "id": str(report.reported_by),
            "username": reported_by_user.username if reported_by_user else None,
        },
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "created_by": {
            "id": str(report.created_by),
            "username": created_by_user.username if created_by_user else None,
        },
        "updated_at": report.updated_at.isoformat() if report.updated_at else None,
        "updated_by": {
            "id": str(report.updated_by),
            "username": updated_by_user.username if updated_by_user else None,
        }
        if report.updated_by
        else None,
        "attachments_count": len(report.attachments) if report.attachments else 0,
        "comments_count": len(report.comments) if report.comments else 0,
    }


def _subcontractor_worker_report_detail_dict(db: Session, report: EmployeeReport) -> dict[str, Any]:
    created_by_user = db.query(User).filter(User.id == report.created_by).first()
    reported_by_user = db.query(User).filter(User.id == report.reported_by).first()
    updated_by_user = None
    if report.updated_by:
        updated_by_user = db.query(User).filter(User.id == report.updated_by).first()
    attachments: List[dict[str, Any]] = []
    for att in report.attachments:
        created_by_att_user = db.query(User).filter(User.id == att.created_by).first()
        attachments.append(
            {
                "id": str(att.id),
                "file_id": str(att.file_id),
                "file_name": att.file_name,
                "file_size": att.file_size,
                "file_type": att.file_type,
                "created_at": att.created_at.isoformat() if att.created_at else None,
                "created_by": {
                    "id": str(att.created_by),
                    "username": created_by_att_user.username if created_by_att_user else None,
                },
            }
        )
    comments: List[dict[str, Any]] = []
    for comment in report.comments:
        created_by_comment_user = db.query(User).filter(User.id == comment.created_by).first()
        comments.append(
            {
                "id": str(comment.id),
                "comment_text": comment.comment_text,
                "comment_type": comment.comment_type,
                "created_at": comment.created_at.isoformat() if comment.created_at else None,
                "created_by": {
                    "id": str(comment.created_by),
                    "username": created_by_comment_user.username if created_by_comment_user else None,
                },
            }
        )
    return {
        "id": str(report.id),
        "report_type": report.report_type,
        "title": report.title,
        "description": report.description,
        "occurrence_date": report.occurrence_date.isoformat() if report.occurrence_date else None,
        "severity": report.severity,
        "status": report.status,
        "vehicle": report.vehicle,
        "ticket_number": report.ticket_number,
        "fine_amount": float(report.fine_amount) if report.fine_amount else None,
        "due_date": report.due_date.isoformat() if report.due_date else None,
        "related_project_department": report.related_project_department,
        "suspension_start_date": report.suspension_start_date.isoformat() if report.suspension_start_date else None,
        "suspension_end_date": report.suspension_end_date.isoformat() if report.suspension_end_date else None,
        "behavior_note_type": report.behavior_note_type,
        "reported_by": {
            "id": str(report.reported_by),
            "username": reported_by_user.username if reported_by_user else None,
        },
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "created_by": {
            "id": str(report.created_by),
            "username": created_by_user.username if created_by_user else None,
        },
        "updated_at": report.updated_at.isoformat() if report.updated_at else None,
        "updated_by": {
            "id": str(report.updated_by),
            "username": updated_by_user.username if updated_by_user else None,
        }
        if report.updated_by
        else None,
        "attachments": attachments,
        "comments": comments,
    }


def _subcontractor_worker_report_for_worker_or_404(db: Session, worker_id: uuid.UUID, report_id: uuid.UUID) -> EmployeeReport:
    report = (
        db.query(EmployeeReport)
        .filter(
            EmployeeReport.id == report_id,
            EmployeeReport.subcontractor_worker_id == worker_id,
        )
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.get("/workers/{worker_id}/reports")
def list_subcontractor_worker_reports(
    worker_id: uuid.UUID,
    report_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    if not _worker_reports_can_view(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    w = db.query(SubcontractorWorker).filter(SubcontractorWorker.id == worker_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")
    query = db.query(EmployeeReport).filter(EmployeeReport.subcontractor_worker_id == worker_id)
    if report_type:
        query = query.filter(EmployeeReport.report_type == report_type)
    if status:
        query = query.filter(EmployeeReport.status == status)
    if severity:
        query = query.filter(EmployeeReport.severity == severity)
    if start_date:
        start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
        query = query.filter(EmployeeReport.occurrence_date >= start)
    if end_date:
        end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
        query = query.filter(EmployeeReport.occurrence_date <= end)
    if q:
        like = f"%{q}%"
        query = query.filter(
            (EmployeeReport.title.ilike(like))
            | (EmployeeReport.description.ilike(like))
            | (EmployeeReport.ticket_number.ilike(like))
        )
    reports = query.order_by(EmployeeReport.occurrence_date.desc()).all()
    return [_subcontractor_worker_report_list_dict(db, report) for report in reports]


@router.get("/workers/{worker_id}/reports/{report_id}")
def get_subcontractor_worker_report_detail(
    worker_id: uuid.UUID,
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    if not _worker_reports_can_view(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    w = db.query(SubcontractorWorker).filter(SubcontractorWorker.id == worker_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")
    report = (
        db.query(EmployeeReport)
        .filter(EmployeeReport.id == report_id, EmployeeReport.subcontractor_worker_id == worker_id)
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return _subcontractor_worker_report_detail_dict(db, report)


@router.post("/workers/{worker_id}/reports")
def create_subcontractor_worker_report(
    worker_id: uuid.UUID,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_subcontractor_access(current_user)
    if not _worker_reports_can_edit(current_user):
        raise HTTPException(status_code=403, detail="Forbidden")
    w = db.query(SubcontractorWorker).filter(SubcontractorWorker.id == worker_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")
    occurrence_date_str = payload.get("occurrence_date")
    if not occurrence_date_str:
        occurrence_date = datetime.now(timezone.utc)
    else:
        occurrence_date = datetime.fromisoformat(str(occurrence_date_str).replace("Z", "+00:00"))
    due_date = None
    if payload.get("due_date"):
        due_date = datetime.fromisoformat(str(payload.get("due_date")).replace("Z", "+00:00"))
    suspension_start_date = None
    if payload.get("suspension_start_date"):
        suspension_start_date = datetime.fromisoformat(str(payload.get("suspension_start_date")).replace("Z", "+00:00"))
    suspension_end_date = None
    if payload.get("suspension_end_date"):
        suspension_end_date = datetime.fromisoformat(str(payload.get("suspension_end_date")).replace("Z", "+00:00"))
    report = EmployeeReport(
        id=uuid.uuid4(),
        user_id=None,
        subcontractor_worker_id=w.id,
        report_type=payload.get("report_type", "Other"),
        title=payload.get("title", ""),
        description=payload.get("description"),
        occurrence_date=occurrence_date,
        severity=payload.get("severity", "Medium"),
        status=payload.get("status", "Open"),
        vehicle=payload.get("vehicle"),
        ticket_number=payload.get("ticket_number"),
        fine_amount=Decimal(str(payload.get("fine_amount"))) if payload.get("fine_amount") else None,
        due_date=due_date,
        related_project_department=payload.get("related_project_department"),
        suspension_start_date=suspension_start_date,
        suspension_end_date=suspension_end_date,
        behavior_note_type=payload.get("behavior_note_type"),
        reported_by=current_user.id,
        created_by=current_user.id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    comment = ReportComment(
        id=uuid.uuid4(),
        report_id=report.id,
        comment_text=f"Report created: {report.title}",
        comment_type="system",
        created_by=current_user.id,
    )
    db.add(comment)
    db.commit()
    return {"id": str(report.id), "status": "ok"}


@router.patch("/workers/{worker_id}/reports/{report_id}")
def update_subcontractor_worker_report(
    worker_id: uuid.UUID,
    report_id: uuid.UUID,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_subcontractor_access(current_user)
    if not _worker_reports_can_edit(current_user):
        raise HTTPException(status_code=403, detail="Forbidden")
    report = _subcontractor_worker_report_for_worker_or_404(db, worker_id, report_id)
    old_status = report.status
    changes: List[str] = []
    if "title" in payload:
        new_title = payload["title"]
        if report.title != new_title:
            report.title = new_title
            changes.append(f"Title updated to '{new_title}'")
    if "description" in payload:
        new_description = payload.get("description")
        old_description = report.description or ""
        new_description_str = new_description or ""
        if old_description != new_description_str:
            report.description = new_description
            changes.append("Description updated")
    if "occurrence_date" in payload:
        new_occurrence_date = datetime.fromisoformat(payload["occurrence_date"].replace("Z", "+00:00"))
        if report.occurrence_date != new_occurrence_date:
            report.occurrence_date = new_occurrence_date
            changes.append("Occurrence date updated")
    if "severity" in payload:
        new_severity = payload["severity"]
        if report.severity != new_severity:
            report.severity = new_severity
            changes.append(f"Severity changed to {new_severity}")
    if "status" in payload:
        new_status = payload["status"]
        if old_status != new_status:
            report.status = new_status
            changes.append(f"Status changed from {old_status} to {new_status}")
    if "vehicle" in payload:
        new_vehicle = payload.get("vehicle") or None
        old_vehicle = report.vehicle or None
        if old_vehicle != new_vehicle:
            report.vehicle = new_vehicle
    if "ticket_number" in payload:
        new_ticket = payload.get("ticket_number") or None
        old_ticket = report.ticket_number or None
        if old_ticket != new_ticket:
            report.ticket_number = new_ticket
    if "fine_amount" in payload:
        new_fine_amount = Decimal(str(payload["fine_amount"])) if payload.get("fine_amount") else None
        old_fine_amount = report.fine_amount
        if old_fine_amount != new_fine_amount:
            report.fine_amount = new_fine_amount
    if "due_date" in payload:
        new_due_date = (
            datetime.fromisoformat(payload["due_date"].replace("Z", "+00:00")) if payload.get("due_date") else None
        )
        old_due_date = report.due_date
        if old_due_date != new_due_date:
            report.due_date = new_due_date
    if "related_project_department" in payload:
        new_related = payload.get("related_project_department") or None
        old_related = report.related_project_department or None
        if old_related != new_related:
            report.related_project_department = new_related
    if "suspension_start_date" in payload:
        new_start = (
            datetime.fromisoformat(payload["suspension_start_date"].replace("Z", "+00:00"))
            if payload.get("suspension_start_date")
            else None
        )
        old_start = report.suspension_start_date
        if old_start != new_start:
            report.suspension_start_date = new_start
    if "suspension_end_date" in payload:
        new_end = (
            datetime.fromisoformat(payload["suspension_end_date"].replace("Z", "+00:00"))
            if payload.get("suspension_end_date")
            else None
        )
        old_end = report.suspension_end_date
        if old_end != new_end:
            report.suspension_end_date = new_end
    if "behavior_note_type" in payload:
        new_behavior_type = payload.get("behavior_note_type") or None
        old_behavior_type = report.behavior_note_type or None
        if old_behavior_type != new_behavior_type:
            report.behavior_note_type = new_behavior_type
            old_display = old_behavior_type if old_behavior_type else "Not specified"
            new_display = new_behavior_type if new_behavior_type else "Not specified"
            changes.append(f"Behavior note type changed from {old_display} to {new_display}")
    report.updated_at = datetime.now(timezone.utc)
    report.updated_by = current_user.id
    db.commit()
    if changes:
        comment_type = "status_change" if old_status != report.status else "system"
        comment = ReportComment(
            id=uuid.uuid4(),
            report_id=report.id,
            comment_text="; ".join(changes),
            comment_type=comment_type,
            created_by=current_user.id,
        )
        db.add(comment)
        db.commit()
    return {"status": "ok"}


@router.delete("/workers/{worker_id}/reports/{report_id}")
def delete_subcontractor_worker_report(
    worker_id: uuid.UUID,
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_subcontractor_access(current_user)
    if not _worker_reports_can_edit(current_user):
        raise HTTPException(status_code=403, detail="Forbidden")
    report = _subcontractor_worker_report_for_worker_or_404(db, worker_id, report_id)
    db.delete(report)
    db.commit()
    return {"status": "ok"}


@router.post("/workers/{worker_id}/reports/{report_id}/comments")
def add_subcontractor_worker_report_comment(
    worker_id: uuid.UUID,
    report_id: uuid.UUID,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_subcontractor_access(current_user)
    if not _worker_reports_can_edit(current_user):
        raise HTTPException(status_code=403, detail="Forbidden")
    report = _subcontractor_worker_report_for_worker_or_404(db, worker_id, report_id)
    comment = ReportComment(
        id=uuid.uuid4(),
        report_id=report.id,
        comment_text=payload.get("comment_text", ""),
        comment_type=payload.get("comment_type", "comment"),
        created_by=current_user.id,
    )
    db.add(comment)
    report.updated_at = datetime.now(timezone.utc)
    report.updated_by = current_user.id
    db.commit()
    db.refresh(comment)
    created_by_user = db.query(User).filter(User.id == comment.created_by).first()
    return {
        "id": str(comment.id),
        "comment_text": comment.comment_text,
        "comment_type": comment.comment_type,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
        "created_by": {
            "id": str(comment.created_by),
            "username": created_by_user.username if created_by_user else None,
        },
    }


@router.post("/workers/{worker_id}/reports/{report_id}/attachments")
def add_subcontractor_worker_report_attachment(
    worker_id: uuid.UUID,
    report_id: uuid.UUID,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_subcontractor_access(current_user)
    if not _worker_reports_can_edit(current_user):
        raise HTTPException(status_code=403, detail="Forbidden")
    report = _subcontractor_worker_report_for_worker_or_404(db, worker_id, report_id)
    attachment = ReportAttachment(
        id=uuid.uuid4(),
        report_id=report.id,
        file_id=uuid.UUID(str(payload.get("file_id"))),
        file_name=payload.get("file_name"),
        file_size=payload.get("file_size"),
        file_type=payload.get("file_type"),
        created_by=current_user.id,
    )
    db.add(attachment)
    report.updated_at = datetime.now(timezone.utc)
    report.updated_by = current_user.id
    comment = ReportComment(
        id=uuid.uuid4(),
        report_id=report.id,
        comment_text=f"Attachment added: {payload.get('file_name', 'File')}",
        comment_type="system",
        created_by=current_user.id,
    )
    db.add(comment)
    db.commit()
    return {"id": str(attachment.id), "status": "ok"}


@router.delete("/workers/{worker_id}/reports/{report_id}/attachments/{attachment_id}")
def delete_subcontractor_worker_report_attachment(
    worker_id: uuid.UUID,
    report_id: uuid.UUID,
    attachment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_subcontractor_access(current_user)
    if not _worker_reports_can_edit(current_user):
        raise HTTPException(status_code=403, detail="Forbidden")
    report = _subcontractor_worker_report_for_worker_or_404(db, worker_id, report_id)
    attachment = (
        db.query(ReportAttachment)
        .filter(ReportAttachment.id == attachment_id, ReportAttachment.report_id == report_id)
        .first()
    )
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    file_name = attachment.file_name or "File"
    db.delete(attachment)
    report.updated_at = datetime.now(timezone.utc)
    report.updated_by = current_user.id
    comment = ReportComment(
        id=uuid.uuid4(),
        report_id=report.id,
        comment_text=f"Attachment removed: {file_name}",
        comment_type="system",
        created_by=current_user.id,
    )
    db.add(comment)
    db.commit()
    return {"status": "ok"}


@router.post("/attendance/clock-in")
def subcontractor_clock_in(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    try:
        worker_id = uuid.UUID(str(payload.get("worker_id")))
        project_id = uuid.UUID(str(payload.get("project_id")))
    except Exception:
        raise HTTPException(status_code=400, detail="worker_id and project_id are required UUIDs")

    w = db.query(SubcontractorWorker).filter(SubcontractorWorker.id == worker_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")
    if not w.is_active:
        raise HTTPException(status_code=400, detail="Worker is inactive")
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == w.company_id).first()
    if not c or not c.is_active:
        raise HTTPException(status_code=400, detail="Subcontractor company is inactive")

    existing = _open_attendance_for_worker(db, worker_id)
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Worker already has an open attendance. Clock out first.",
        )

    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    now = datetime.now(timezone.utc)
    clock_in = _parse_iso_dt(payload.get("clock_in_time")) or now

    sig_in = payload.get("clock_in_signature_file_id")
    sig_uuid = None
    if sig_in:
        try:
            sig_uuid = uuid.UUID(str(sig_in))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid clock_in_signature_file_id")

    row = SubcontractorAttendance(
        worker_id=worker_id,
        company_id=w.company_id,
        project_id=project_id,
        clock_in_time=clock_in,
        clock_in_entered_utc=now,
        clock_in_confirmed_by_user_id=user.id,
        clock_in_notes=payload.get("clock_in_notes"),
        clock_in_signature_file_id=sig_uuid,
        status="open",
        hr_status="pending",
        notes=payload.get("notes"),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": str(row.id), "status": row.status}


@router.post("/attendance/clock-out")
def subcontractor_clock_out(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    if not payload.get("hours_accuracy_confirmed"):
        raise HTTPException(status_code=400, detail="hours_accuracy_confirmed is required for clock-out")

    attendance_id = payload.get("attendance_id")
    row: Optional[SubcontractorAttendance] = None
    if attendance_id:
        try:
            aid = uuid.UUID(str(attendance_id))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid attendance_id")
        row = db.query(SubcontractorAttendance).filter(SubcontractorAttendance.id == aid).first()
    else:
        try:
            worker_id = uuid.UUID(str(payload.get("worker_id")))
        except Exception:
            raise HTTPException(status_code=400, detail="worker_id is required when attendance_id omitted")
        row = _open_attendance_for_worker(db, worker_id)

    if not row:
        raise HTTPException(status_code=404, detail="Open attendance not found")
    if row.clock_out_time is not None:
        raise HTTPException(status_code=400, detail="Attendance already closed")

    project_id_opt = payload.get("project_id")
    if project_id_opt:
        try:
            ctx_pid = uuid.UUID(str(project_id_opt))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid project_id")
        if row.project_id != ctx_pid:
            raise HTTPException(
                status_code=400,
                detail="Open attendance is for a different project",
            )

    sig_out = payload.get("clock_out_signature_file_id")
    if not sig_out:
        raise HTTPException(status_code=400, detail="clock_out_signature_file_id is required")
    try:
        sig_uuid = uuid.UUID(str(sig_out))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid clock_out_signature_file_id")

    now = datetime.now(timezone.utc)
    clock_out = _parse_iso_dt(payload.get("clock_out_time")) or now
    if clock_out < row.clock_in_time:
        raise HTTPException(status_code=400, detail="clock_out_time must be after clock_in_time")

    row.clock_out_time = clock_out
    row.clock_out_entered_utc = now
    row.clock_out_confirmed_by_user_id = user.id
    row.clock_out_notes = payload.get("clock_out_notes")
    row.clock_out_signature_file_id = sig_uuid
    row.status = "finalized"
    if payload.get("hr_status"):
        row.hr_status = _norm_hr_status(payload.get("hr_status"))
    else:
        row.hr_status = "approved"
    if payload.get("notes"):
        row.notes = (row.notes or "") + ("\n" if row.notes else "") + str(payload.get("notes"))

    _recompute_subcontractor_totals(db, row, manual_break_minutes=payload.get("manual_break_minutes"))

    db.commit()
    db.refresh(row)
    return {"id": str(row.id), "status": row.status, "total_hours": float(row.total_hours) if row.total_hours is not None else None}


def _opt_uuid(v: Any) -> Optional[uuid.UUID]:
    if v is None or v == "":
        return None
    try:
        return uuid.UUID(str(v))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid UUID value")


def _recompute_subcontractor_totals(
    db: Session,
    row: SubcontractorAttendance,
    *,
    manual_break_minutes: Any = ...,
) -> None:
    """Set break_minutes and total_hours (gross time minus break) when session is closed; clear when open."""
    if not row.clock_in_time or not row.clock_out_time:
        row.total_hours = None
        row.break_minutes = None
        return
    from ..routes.settings import calculate_break_minutes

    if manual_break_minutes is not ...:
        if manual_break_minutes is None or manual_break_minutes == "":
            brk = calculate_break_minutes(
                db, row.worker_id, row.clock_in_time, row.clock_out_time, manual_break_minutes=None
            )
        else:
            try:
                m = int(manual_break_minutes)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="manual_break_minutes must be an integer")
            if m < 0:
                raise HTTPException(status_code=400, detail="manual_break_minutes cannot be negative")
            brk = calculate_break_minutes(
                db, row.worker_id, row.clock_in_time, row.clock_out_time, manual_break_minutes=m
            )
    else:
        brk = calculate_break_minutes(
            db,
            row.worker_id,
            row.clock_in_time,
            row.clock_out_time,
            manual_break_minutes=row.break_minutes,
        )
    row.break_minutes = brk
    br = int(brk or 0)
    gross_h = (row.clock_out_time - row.clock_in_time).total_seconds() / 3600.0
    if br > 0 and gross_h * 60 <= br:
        raise HTTPException(status_code=400, detail="Break time cannot be greater than or equal to total attendance time")
    row.total_hours = round(max(0.0, gross_h - br / 60.0), 4)


def _norm_hr_status(v: Any) -> str:
    if v is None or v == "":
        return "approved"
    s = str(v).lower().strip()
    if s not in ("pending", "approved", "rejected"):
        raise HTTPException(status_code=400, detail="hr_status must be pending, approved, or rejected")
    return s


@router.post("/workers/{worker_id}/attendance/manual")
def create_subcontractor_attendance_manual(
    worker_id: uuid.UUID,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a subcontractor attendance row (closed session or open clock-in) from the office UI."""
    _require_subcontractor_access(user)
    _require_subcontractor_write(user)
    w = db.query(SubcontractorWorker).filter(SubcontractorWorker.id == worker_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")
    if not w.is_active:
        raise HTTPException(status_code=400, detail="Worker is inactive")
    c = db.query(SubcontractorCompany).filter(SubcontractorCompany.id == w.company_id).first()
    if not c or not c.is_active:
        raise HTTPException(status_code=400, detail="Subcontractor company is inactive")

    try:
        project_id = uuid.UUID(str(payload.get("project_id")))
    except Exception:
        raise HTTPException(status_code=400, detail="project_id is required and must be a UUID")
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    clock_in = _parse_iso_dt(payload.get("clock_in_time"))
    if not clock_in:
        raise HTTPException(status_code=400, detail="clock_in_time is required")
    clock_out = _parse_iso_dt(payload.get("clock_out_time"))

    sig_in = _opt_uuid(payload.get("clock_in_signature_file_id")) if payload.get("clock_in_signature_file_id") else None
    sig_out = _opt_uuid(payload.get("clock_out_signature_file_id")) if payload.get("clock_out_signature_file_id") else None

    now = datetime.now(timezone.utc)
    notes = _norm_opt_str(payload.get("notes"))

    if clock_out:
        if clock_out <= clock_in:
            raise HTTPException(status_code=400, detail="clock_out_time must be after clock_in_time")
        row = SubcontractorAttendance(
            worker_id=worker_id,
            company_id=w.company_id,
            project_id=project_id,
            clock_in_time=clock_in,
            clock_in_entered_utc=now,
            clock_in_confirmed_by_user_id=user.id,
            clock_in_notes=_norm_opt_str(payload.get("clock_in_notes")),
            clock_in_signature_file_id=sig_in,
            clock_out_time=clock_out,
            clock_out_entered_utc=now,
            clock_out_confirmed_by_user_id=user.id,
            clock_out_notes=_norm_opt_str(payload.get("clock_out_notes")),
            clock_out_signature_file_id=sig_out,
            total_hours=None,
            status="finalized",
            hr_status=_norm_hr_status(payload.get("hr_status")),
            notes=notes,
        )
        db.add(row)
        db.flush()
        _recompute_subcontractor_totals(db, row, manual_break_minutes=payload.get("manual_break_minutes"))
        db.commit()
        db.refresh(row)
        return {"id": str(row.id), "status": row.status, "total_hours": float(row.total_hours) if row.total_hours is not None else None}

    if _open_attendance_for_worker(db, worker_id):
        raise HTTPException(
            status_code=400,
            detail="Worker already has an open attendance. Close it or add clock-out to the new manual entry.",
        )
    row = SubcontractorAttendance(
        worker_id=worker_id,
        company_id=w.company_id,
        project_id=project_id,
        clock_in_time=clock_in,
        clock_in_entered_utc=now,
        clock_in_confirmed_by_user_id=user.id,
        clock_in_notes=_norm_opt_str(payload.get("clock_in_notes")),
        clock_in_signature_file_id=sig_in,
        status="open",
        hr_status=_norm_hr_status(payload.get("hr_status")),
        notes=notes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": str(row.id), "status": row.status}


@router.patch("/attendance/{attendance_id}")
def patch_subcontractor_attendance(
    attendance_id: uuid.UUID,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update clock times, project, notes, or signature file ids on a subcontractor attendance row."""
    _require_subcontractor_access(user)
    _require_subcontractor_write(user)
    row = db.query(SubcontractorAttendance).filter(SubcontractorAttendance.id == attendance_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Attendance not found")

    if "project_id" in payload and payload.get("project_id"):
        try:
            pid = uuid.UUID(str(payload["project_id"]))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid project_id")
        if not db.query(Project).filter(Project.id == pid).first():
            raise HTTPException(status_code=404, detail="Project not found")
        row.project_id = pid

    if "clock_in_time" in payload and payload.get("clock_in_time"):
        row.clock_in_time = _parse_iso_dt(payload.get("clock_in_time"))

    if "clock_out_time" in payload:
        co_raw = payload.get("clock_out_time")
        if co_raw is None or co_raw == "":
            row.clock_out_time = None
            row.clock_out_entered_utc = None
            row.clock_out_confirmed_by_user_id = None
            row.clock_out_signature_file_id = None
        else:
            row.clock_out_time = _parse_iso_dt(co_raw)
            row.clock_out_entered_utc = datetime.now(timezone.utc)
            row.clock_out_confirmed_by_user_id = user.id

    if "clock_in_signature_file_id" in payload:
        v = payload.get("clock_in_signature_file_id")
        row.clock_in_signature_file_id = _opt_uuid(v) if v else None

    if "clock_out_signature_file_id" in payload:
        v = payload.get("clock_out_signature_file_id")
        row.clock_out_signature_file_id = _opt_uuid(v) if v else None

    if "notes" in payload:
        row.notes = _norm_opt_str(payload.get("notes"))

    if "hr_status" in payload and payload.get("hr_status") is not None and str(payload.get("hr_status")).strip() != "":
        row.hr_status = _norm_hr_status(payload.get("hr_status"))

    manual_break_arg: Any = ...
    if "manual_break_minutes" in payload:
        manual_break_arg = payload.get("manual_break_minutes")

    if row.clock_in_time and row.clock_out_time:
        if row.clock_out_time <= row.clock_in_time:
            raise HTTPException(status_code=400, detail="clock_out_time must be after clock_in_time")
        row.status = "finalized"
        _recompute_subcontractor_totals(db, row, manual_break_minutes=manual_break_arg)
    else:
        row.total_hours = None
        row.break_minutes = None
        row.status = "open"

    db.commit()
    db.refresh(row)
    return {
        "id": str(row.id),
        "status": row.status,
        "total_hours": float(row.total_hours) if row.total_hours is not None else None,
    }


@router.delete("/attendance/{attendance_id}")
def delete_subcontractor_attendance(
    attendance_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    _require_subcontractor_write(user)
    row = db.query(SubcontractorAttendance).filter(SubcontractorAttendance.id == attendance_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Attendance not found")
    db.delete(row)
    db.commit()
    return {"status": "ok"}


@router.get("/workers/{worker_id}/attendances")
def list_worker_attendances(
    worker_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    w = db.query(SubcontractorWorker).filter(SubcontractorWorker.id == worker_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")
    rows = (
        db.query(SubcontractorAttendance)
        .filter(SubcontractorAttendance.worker_id == worker_id)
        .order_by(SubcontractorAttendance.clock_in_time.desc())
        .limit(limit)
        .all()
    )
    project_ids = list({r.project_id for r in rows})
    projects = {}
    if project_ids:
        projects = {str(p.id): p for p in db.query(Project).filter(Project.id.in_(project_ids)).all()}
    out = []
    for r in rows:
        p = projects.get(str(r.project_id))
        out.append(
            {
                "id": str(r.id),
                "project_id": str(r.project_id),
                "project_name": p.name if p else None,
                "clock_in_time": r.clock_in_time.isoformat() if r.clock_in_time else None,
                "clock_out_time": r.clock_out_time.isoformat() if r.clock_out_time else None,
                "total_hours": float(r.total_hours) if r.total_hours is not None else None,
                "break_minutes": getattr(r, "break_minutes", None),
                "hr_status": getattr(r, "hr_status", None) or "approved",
                "status": r.status,
            }
        )
    return out


@router.get("/workers/{worker_id}/training-records")
def list_subcontractor_worker_training_records(
    worker_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    _subcontractor_worker_for_training_or_404(db, worker_id)
    rows = (
        db.query(EmployeeTrainingRecord)
        .filter(EmployeeTrainingRecord.subcontractor_worker_id == worker_id)
        .order_by(nullslast(desc(EmployeeTrainingRecord.completion_date)), desc(EmployeeTrainingRecord.created_at))
        .all()
    )
    return [_serialize_subcontractor_training_row(r) for r in rows]


@router.get("/workers/{worker_id}/training-matrix")
def subcontractor_worker_training_matrix_snapshot(
    worker_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    _subcontractor_worker_for_training_or_404(db, worker_id)
    records = (
        db.query(EmployeeTrainingRecord)
        .filter(EmployeeTrainingRecord.subcontractor_worker_id == worker_id)
        .order_by(nullslast(desc(EmployeeTrainingRecord.completion_date)), desc(EmployeeTrainingRecord.created_at))
        .all()
    )
    defs = get_matrix_training_defs(db)
    items = []
    for col in defs:
        picked = _pick_explicit_matrix_training_record(records, col.id)
        disp = format_record_cell_display(picked, col.id, defs) if picked else ""
        items.append(
            {
                "id": col.id,
                "label": col.label,
                "cell_kind": col.cell_kind,
                "display": disp,
                "record": _serialize_subcontractor_training_row(picked) if picked else None,
            }
        )
    return {"items": items}


@router.post("/workers/{worker_id}/training-records")
def create_subcontractor_worker_training_record(
    worker_id: uuid.UUID,
    payload: EmployeeTrainingRecordCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    if not _worker_training_can_edit(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    _subcontractor_worker_for_training_or_404(db, worker_id)
    now = datetime.now(timezone.utc)
    wid = worker_id
    mid = _enforce_unique_matrix_subcontractor_worker(db, wid, getattr(payload, "matrix_training_id", None))
    r = EmployeeTrainingRecord(
        user_id=None,
        subcontractor_worker_id=wid,
        title=payload.title.strip(),
        provider=(payload.provider or "").strip() or None,
        category=(payload.category or "").strip() or None,
        delivery_format=(payload.delivery_format or "").strip() or None,
        start_date=payload.start_date,
        end_date=payload.end_date,
        completion_date=payload.completion_date,
        duration_hours=payload.duration_hours,
        status=(payload.status or "completed").strip() or "completed",
        certificate_number=(payload.certificate_number or "").strip() or None,
        expiry_date=payload.expiry_date,
        notes=payload.notes,
        crew=(payload.crew or "").strip() or None,
        location=(payload.location or "").strip() or None,
        session_time=(payload.session_time or "").strip() or None,
        matrix_training_id=mid,
        created_at=now,
        updated_at=now,
        created_by_user_id=user.id,
        updated_by_user_id=user.id,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return _serialize_subcontractor_training_row(r)


@router.patch("/workers/{worker_id}/training-records/{record_id}")
def update_subcontractor_worker_training_record(
    worker_id: uuid.UUID,
    record_id: str,
    payload: EmployeeTrainingRecordUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    if not _worker_training_can_edit(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    _subcontractor_worker_for_training_or_404(db, worker_id)
    try:
        rid = uuid.UUID(str(record_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid record id")
    r = (
        db.query(EmployeeTrainingRecord)
        .filter(
            EmployeeTrainingRecord.subcontractor_worker_id == worker_id,
            EmployeeTrainingRecord.id == rid,
        )
        .first()
    )
    if not r:
        raise HTTPException(status_code=404, detail="Training record not found")

    data = payload.model_dump(exclude_unset=True)
    if "matrix_training_id" in data:
        raw_mid = data["matrix_training_id"]
        if raw_mid is None or (isinstance(raw_mid, str) and not raw_mid.strip()):
            r.matrix_training_id = None
        else:
            r.matrix_training_id = _enforce_unique_matrix_subcontractor_worker(
                db, worker_id, raw_mid, exclude_record_id=r.id
            )

    for key in (
        "title",
        "provider",
        "category",
        "delivery_format",
        "start_date",
        "end_date",
        "completion_date",
        "duration_hours",
        "status",
        "certificate_number",
        "expiry_date",
        "notes",
        "crew",
        "location",
        "session_time",
    ):
        if key in data:
            val = data[key]
            if key == "title" and val is not None:
                val = str(val).strip()
            elif key in ("provider", "category", "delivery_format", "certificate_number") and val is not None:
                val = str(val).strip() or None
            elif key in ("crew", "location", "session_time") and val is not None:
                val = str(val).strip() or None
            setattr(r, key, val)
    sd = r.start_date
    ed = r.end_date
    if sd and ed and ed < sd:
        raise HTTPException(status_code=400, detail="end_date must be on or after start_date")

    fst = (r.status or "completed").strip().lower()
    if fst in ("completed", "expired") and r.completion_date is None:
        raise HTTPException(
            status_code=400, detail="completion_date is required when status is completed or expired"
        )

    r.updated_at = datetime.now(timezone.utc)
    r.updated_by_user_id = user.id
    db.commit()
    db.refresh(r)
    return _serialize_subcontractor_training_row(r)


@router.delete("/workers/{worker_id}/training-records/{record_id}")
def delete_subcontractor_worker_training_record(
    worker_id: uuid.UUID,
    record_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_subcontractor_access(user)
    if not _worker_training_can_edit(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    _subcontractor_worker_for_training_or_404(db, worker_id)
    try:
        rid = uuid.UUID(str(record_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid record id")
    r = (
        db.query(EmployeeTrainingRecord)
        .filter(
            EmployeeTrainingRecord.subcontractor_worker_id == worker_id,
            EmployeeTrainingRecord.id == rid,
        )
        .first()
    )
    if not r:
        raise HTTPException(status_code=404, detail="Training record not found")
    db.delete(r)
    db.commit()
    return {"status": "ok"}
