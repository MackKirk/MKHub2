"""Subcontractor companies, workers, and project attendance (clock-in/out)."""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import asc, desc, func, or_
from sqlalchemy.orm import Session

from ..auth.security import get_current_user, _has_permission, require_roles
from ..db import get_db
from ..models.models import (
    ClientFile,
    FileObject,
    Project,
    SubcontractorAttendance,
    SubcontractorCompany,
    SubcontractorCompanyContact,
    SubcontractorCompanyFile,
    SubcontractorWorker,
    SubcontractorWorkerFile,
    User,
    WorkOrderFile,
)

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


def _company_row_to_dict(c: SubcontractorCompany, worker_count: int = 0) -> dict:
    d = _company_to_dict(c)
    d["worker_count"] = worker_count
    return d


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

    items = [_company_row_to_dict(c, counts.get(c.id, 0)) for c in rows]
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
    if "category" in payload:
        row.category = payload["category"]
    if "original_name" in payload:
        row.original_name = payload["original_name"]
    db.commit()
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
                }
            )

    items = [x for x in items if x.get("at")]
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

    delta_h = (clock_out - row.clock_in_time).total_seconds() / 3600.0

    row.clock_out_time = clock_out
    row.clock_out_entered_utc = now
    row.clock_out_confirmed_by_user_id = user.id
    row.clock_out_notes = payload.get("clock_out_notes")
    row.clock_out_signature_file_id = sig_uuid
    row.total_hours = round(delta_h, 4)
    row.status = "finalized"
    if payload.get("notes"):
        row.notes = (row.notes or "") + ("\n" if row.notes else "") + str(payload.get("notes"))

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
        delta_h = (clock_out - clock_in).total_seconds() / 3600.0
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
            total_hours=round(delta_h, 4),
            status="finalized",
            notes=notes,
        )
        db.add(row)
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

    if row.clock_in_time and row.clock_out_time:
        if row.clock_out_time <= row.clock_in_time:
            raise HTTPException(status_code=400, detail="clock_out_time must be after clock_in_time")
        row.total_hours = round((row.clock_out_time - row.clock_in_time).total_seconds() / 3600.0, 4)
        row.status = "finalized"
    else:
        row.total_hours = None
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
                "status": r.status,
            }
        )
    return out
