"""
Authorization helpers for file upload and download (see app/routes/files.py).
"""
from __future__ import annotations

import uuid
from typing import Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.security import (
    User,
    _has_permission,
    has_project_files_category_permission,
    can_access_business_line,
    can_write_business_line,
)
from ..models.models import (
    FileObject,
    Project,
    Client,
    ClientFile,
    ClientDocument,
    EmployeeProfile,
    WorkOrderFile,
)
from ..services.permissions import is_admin


def _parse_uuid(s: Optional[str]) -> Optional[uuid.UUID]:
    if not s or not str(s).strip():
        return None
    try:
        return uuid.UUID(str(s).strip())
    except ValueError:
        return None


def infer_scope_from_storage_key(
    db: Session, key: str
) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
    """
    Parse /org/{year}/{segment}/... keys from canonical_key().
    Returns (project_id, client_id, employee_id, category_id) as optional strings.
    category_id is the path folder slug (e.g. client-docs, company-files).
    """
    parts = key.strip().replace("\\", "/").strip("/").split("/")
    if len(parts) < 3 or parts[0] != "org":
        return None, None, None, None
    seg = parts[2]
    cat_slug = parts[3] if len(parts) > 3 else None
    category_hint = (cat_slug or "files").strip() or "files"

    if seg == "misc":
        return None, None, None, category_hint

    uid = _parse_uuid(seg)
    if uid:
        proj = db.query(Project).filter(Project.id == uid, Project.deleted_at.is_(None)).first()
        if proj:
            return str(proj.id), None, None, category_hint
        cl = db.query(Client).filter(Client.id == uid).first()
        if cl:
            return None, str(cl.id), None, category_hint

    proj = (
        db.query(Project)
        .filter(Project.deleted_at.is_(None), func.lower(Project.code) == seg.lower())
        .first()
    )
    if proj:
        return str(proj.id), None, None, category_hint

    return None, None, None, category_hint


def merge_confirm_scope(
    db: Session,
    key: str,
    project_id: Optional[str],
    client_id: Optional[str],
    employee_id: Optional[str],
    category_id: Optional[str],
) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
    """Explicit confirm body fields override inference from storage key."""
    ip, ic, ie, ikat = infer_scope_from_storage_key(db, key)
    return (
        project_id or ip,
        client_id or ic,
        employee_id or ie,
        category_id or ikat,
    )


def assert_can_initiate_upload(
    user: User,
    db: Session,
    *,
    project_id: Optional[str],
    client_id: Optional[str],
    employee_id: Optional[str],
    category_id: Optional[str],
) -> None:
    """Raise 403 if user may not upload under the given scope."""
    pid = _parse_uuid(project_id)
    cid = _parse_uuid(client_id)
    eid = _parse_uuid(employee_id)

    if pid:
        proj = db.query(Project).filter(Project.id == pid, Project.deleted_at.is_(None)).first()
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        if not can_write_business_line(user, getattr(proj, "business_line", None)):
            raise HTTPException(status_code=403, detail="Forbidden")
        if not has_project_files_category_permission(
            user, category_id, action="write", project=proj
        ):
            raise HTTPException(status_code=403, detail="Forbidden")
        return

    if cid:
        cl = db.query(Client).filter(Client.id == cid).first()
        if not cl:
            raise HTTPException(status_code=404, detail="Client not found")
        if not _has_permission(user, "business:customers:write"):
            raise HTTPException(status_code=403, detail="Forbidden")
        return

    if eid:
        ep = db.query(EmployeeProfile).filter(EmployeeProfile.id == eid).first()
        if not ep:
            ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == eid).first()
        if not ep:
            raise HTTPException(status_code=404, detail="Employee not found")
        if not (
            _has_permission(user, "hr:users:write")
            or _has_permission(user, "users:write")
        ):
            raise HTTPException(status_code=403, detail="Forbidden")
        return

    # "misc" uploads (no project/client/employee)
    if not (
        _has_permission(user, "business:projects:files:write")
        or _has_permission(user, "business:customers:write")
        or _has_permission(user, "users:write")
        or _has_permission(user, "hr:users:write")
        or _has_permission(user, "documents:write")
        or _has_permission(user, "documents:access")
    ):
        raise HTTPException(status_code=403, detail="Forbidden")


def assert_can_read_storage_key(user: User, db: Session, storage_key: str) -> None:
    """Authorize GET /files/local/* using the same rules as FileObject reads (no DB row)."""
    p, c, e, cat = infer_scope_from_storage_key(db, storage_key)
    if p:
        try:
            puid = uuid.UUID(str(p))
        except ValueError:
            raise HTTPException(status_code=403, detail="Forbidden")
        proj = db.query(Project).filter(Project.id == puid, Project.deleted_at.is_(None)).first()
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        if not can_access_business_line(user, getattr(proj, "business_line", None)):
            raise HTTPException(status_code=403, detail="Forbidden")
        if not has_project_files_category_permission(user, cat, action="read", project=proj):
            raise HTTPException(status_code=403, detail="Forbidden")
        return
    if c:
        if not _has_permission(user, "business:customers:read"):
            raise HTTPException(status_code=403, detail="Forbidden")
        return
    if e:
        if not (
            _has_permission(user, "hr:users:read")
            or _has_permission(user, "users:read")
        ):
            raise HTTPException(status_code=403, detail="Forbidden")
        return
    if not (
        _has_permission(user, "business:projects:files:read")
        or _has_permission(user, "business:projects:files:write")
        or _has_permission(user, "business:customers:read")
        or _has_permission(user, "users:read")
        or _has_permission(user, "hr:users:read")
        or _has_permission(user, "documents:read")
        or _has_permission(user, "documents:access")
    ):
        raise HTTPException(status_code=403, detail="Forbidden")


def _resolve_file_scope_from_references(
    db: Session, fo: FileObject
) -> Tuple[Optional[uuid.UUID], Optional[uuid.UUID], Optional[uuid.UUID]]:
    """Best-effort: infer project/client/employee from FKs on FileObject or ClientFile."""
    if fo.project_id or fo.client_id or fo.employee_id:
        return fo.project_id, fo.client_id, fo.employee_id

    cf = (
        db.query(ClientFile)
        .filter(ClientFile.file_object_id == fo.id, ClientFile.deleted_at.is_(None))
        .first()
    )
    if cf and cf.client_id:
        return None, cf.client_id, None

    return None, None, None


def assert_can_read_file_object(user: User, db: Session, fo: FileObject) -> None:
    """Raise 403 if user may not read/download this file."""
    pid, cid, eid = _resolve_file_scope_from_references(db, fo)

    if pid:
        proj = db.query(Project).filter(Project.id == pid, Project.deleted_at.is_(None)).first()
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        if not can_access_business_line(user, getattr(proj, "business_line", None)):
            raise HTTPException(status_code=403, detail="Forbidden")
        cat = str(fo.category_id) if fo.category_id else None
        if not has_project_files_category_permission(
            user, cat, action="read", project=proj
        ):
            raise HTTPException(status_code=403, detail="Forbidden")
        return

    if cid:
        cl = db.query(Client).filter(Client.id == cid).first()
        if not cl:
            raise HTTPException(status_code=404, detail="Client not found")
        if not _has_permission(user, "business:customers:read"):
            raise HTTPException(status_code=403, detail="Forbidden")
        return

    if eid:
        ep = db.query(EmployeeProfile).filter(EmployeeProfile.id == eid).first()
        if not ep:
            ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == eid).first()
        if not ep:
            raise HTTPException(status_code=404, detail="Employee not found")
        if not (
            _has_permission(user, "hr:users:read")
            or _has_permission(user, "users:read")
        ):
            raise HTTPException(status_code=403, detail="Forbidden")
        return

    wof = db.query(WorkOrderFile).filter(WorkOrderFile.file_object_id == fo.id).first()
    if wof:
        if _has_permission(user, "fleet:access"):
            return
        raise HTTPException(status_code=403, detail="Forbidden")

    proj_img = (
        db.query(Project)
        .filter(
            Project.deleted_at.is_(None),
            Project.image_file_object_id == fo.id,
        )
        .first()
    )
    if proj_img:
        if not can_access_business_line(user, getattr(proj_img, "business_line", None)):
            raise HTTPException(status_code=403, detail="Forbidden")
        if not (
            _has_permission(user, "business:projects:read")
            or _has_permission(user, "business:projects:files:read")
            or _has_permission(user, "business:projects:files:write")
        ):
            raise HTTPException(status_code=403, detail="Forbidden")
        return

    cdoc = db.query(ClientDocument).filter(ClientDocument.file_id == fo.id).first()
    if cdoc:
        if (
            _has_permission(user, "documents:read")
            or _has_permission(user, "documents:access")
            or _has_permission(user, "clients:read")
        ):
            return
        raise HTTPException(status_code=403, detail="Forbidden")

    _, _, _, cat_slug = infer_scope_from_storage_key(db, fo.key)
    if cat_slug == "form-template-reference":
        if (
            _has_permission(user, "business:projects:read")
            or _has_permission(user, "business:projects:files:read")
            or _has_permission(user, "business:projects:files:write")
            or _has_permission(user, "documents:read")
            or _has_permission(user, "documents:access")
        ):
            return

    if fo.created_by and fo.created_by == user.id:
        return
    if is_admin(user, db):
        return
    raise HTTPException(status_code=403, detail="Forbidden")


def file_object_row_fields(
    user: User,
    *,
    project_id: Optional[str],
    client_id: Optional[str],
    employee_id: Optional[str],
) -> dict:
    """Map string ids to FileObject columns."""
    out: dict = {"created_by": user.id}
    pid = _parse_uuid(project_id)
    cid = _parse_uuid(client_id)
    eid = _parse_uuid(employee_id)
    if pid:
        out["project_id"] = pid
    if cid:
        out["client_id"] = cid
    if eid:
        out["employee_id"] = eid
    return out
