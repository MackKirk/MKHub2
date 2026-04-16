"""
Authorization helpers for file upload and download (see app/routes/files.py).
"""
from __future__ import annotations

import uuid
from typing import Any, Optional, Set, Tuple

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
    Proposal,
)
from ..services.permissions import is_admin

# Upload categories / path segments from ProposalForm & ImagePicker (see frontend ProposalForm.tsx).
_PROPOSAL_TAB_CLIENT_FILE_MARKERS = (
    "proposal-cover-derived",
    "proposal-page2-derived",
    "proposal-section-derived",
    "proposal-upload",
    "opportunity-cover-derived",
    "opportunity-cover",
    "client-logo-derived",
    "project-cover-derived",
    "project-cover",
    "site-cover-derived",
    "cover",
    "hero-cover",
    "image-picker-temp",
    "document-creator",
)


def _category_is_proposal_tab_client_asset(category: Optional[str]) -> bool:
    c = (category or "").lower().strip()
    if not c:
        return False
    if c in _PROPOSAL_TAB_CLIENT_FILE_MARKERS:
        return True
    if c.startswith("contact-photo-"):
        return True
    return False


def _storage_key_suggests_proposal_tab_client_asset(key: Optional[str]) -> bool:
    if not key:
        return False
    k = key.replace("\\", "/").lower().strip()
    return any(f"/{m}/" in k for m in _PROPOSAL_TAB_CLIENT_FILE_MARKERS) or "/contact-photo-" in k


def _storage_key_is_proposal_builder_upload(key: Optional[str]) -> bool:
    """True for blob keys produced by proposal cover / page2 / sections / image picker uploads."""
    return _storage_key_suggests_proposal_tab_client_asset(key)


def can_access_project_for_proposal_assets(user: User, proj: Project) -> bool:
    """
    Normal business-line rules OR business:projects:proposal:read alone.

    Services roles often grant proposal:read without business:rm:projects:read /
    business:construction:projects:read; can_access_business_line would block thumbnails otherwise.
    """
    if can_access_business_line(user, getattr(proj, "business_line", None)):
        return True
    return _has_permission(user, "business:projects:proposal:read")


def _user_can_access_any_project_for_client(user: User, db: Session, client_id: uuid.UUID) -> bool:
    projs = (
        db.query(Project)
        .filter(Project.client_id == client_id, Project.deleted_at.is_(None))
        .all()
    )
    for proj in projs:
        if can_access_project_for_proposal_assets(user, proj):
            return True
    return False


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
    norm = storage_key.strip().replace("\\", "/").lstrip("/")
    if norm:
        for candidate in (norm, f"/{norm}"):
            fo = db.query(FileObject).filter(FileObject.key == candidate).first()
            if fo and _is_employee_profile_photo_file(db, fo):
                return
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


def _is_employee_profile_photo_file(db: Session, fo: FileObject) -> bool:
    """Avatar shown app-wide; /employees is visible to any logged-in user, so reads must not require HR."""
    return (
        db.query(EmployeeProfile.id)
        .filter(EmployeeProfile.profile_photo_file_id == fo.id)
        .first()
        is not None
    )


def _collect_file_object_ids_from_proposal_data(data: Any, out: Set[uuid.UUID]) -> None:
    """Walk proposal JSON (cover, page2, section images, etc.) and collect file_object UUIDs."""
    if isinstance(data, dict):
        for k, v in data.items():
            if k in ("cover_file_object_id", "page2_file_object_id", "file_object_id") and v:
                try:
                    out.add(uuid.UUID(str(v)))
                except (ValueError, TypeError):
                    pass
            else:
                _collect_file_object_ids_from_proposal_data(v, out)
    elif isinstance(data, list):
        for item in data:
            _collect_file_object_ids_from_proposal_data(item, out)


def _is_file_object_referenced_in_project_proposals(
    db: Session, project_id: uuid.UUID, fo_id: uuid.UUID
) -> bool:
    rows = (
        db.query(Proposal)
        .filter(
            Proposal.project_id == project_id,
            Proposal.deleted_at.is_(None),
        )
        .all()
    )
    for r in rows:
        blob = r.data if isinstance(r.data, dict) else None
        found: Set[uuid.UUID] = set()
        _collect_file_object_ids_from_proposal_data(blob, found)
        if fo_id in found:
            return True
    return False


def _can_read_project_file_via_proposal_tab(
    user: User, db: Session, proj: Project, fo: FileObject
) -> bool:
    """
    Proposal tab uses business:projects:proposal:read; project Files use business:projects:files:read.
    Allow viewing images embedded in proposal flows — either listed in proposal JSON or stored under a
    known proposal-upload path (covers timing where JSON and FileObject rows differ).
    """
    if not can_access_project_for_proposal_assets(user, proj):
        return False
    if not _has_permission(user, "business:projects:proposal:read"):
        return False
    if _is_file_object_referenced_in_project_proposals(db, proj.id, fo.id):
        return True
    # Proposal uploads use org/{year}/{project_id OR client_id}/proposal-*/… — match either segment to this project.
    if _storage_key_is_proposal_builder_upload(getattr(fo, "key", None)):
        try:
            parts = str(fo.key or "").replace("\\", "/").strip("/").split("/")
            if len(parts) >= 3 and parts[0] == "org":
                uid = _parse_uuid(parts[2])
                if uid:
                    if str(proj.id) == str(uid):
                        return True
                    if getattr(proj, "client_id", None) and str(proj.client_id) == str(uid):
                        return True
        except Exception:
            pass
    return False


def _can_read_client_scoped_file_via_proposal(
    user: User, db: Session, fo: FileObject, client_id: uuid.UUID
) -> bool:
    """
    Proposal uploads often set client_id on FileObject (and ClientFile) without listing the UUID in
    proposal JSON (e.g. proposal-cover-derived). User may have business:projects:proposal:read but not
    business:customers:read — still allow thumbnails for known proposal/opportunity asset categories.
    """
    if not _has_permission(user, "business:projects:proposal:read"):
        return False
    rows = (
        db.query(Proposal)
        .filter(Proposal.client_id == client_id, Proposal.deleted_at.is_(None))
        .all()
    )
    for r in rows:
        pid = getattr(r, "project_id", None)
        if not pid:
            continue
        blob = r.data if isinstance(r.data, dict) else None
        found: Set[uuid.UUID] = set()
        _collect_file_object_ids_from_proposal_data(blob, found)
        if fo.id not in found:
            continue
        proj = (
            db.query(Project)
            .filter(Project.id == pid, Project.deleted_at.is_(None))
            .first()
        )
        if proj and can_access_project_for_proposal_assets(user, proj):
            return True

    cf = (
        db.query(ClientFile)
        .filter(
            ClientFile.file_object_id == fo.id,
            ClientFile.client_id == client_id,
            ClientFile.deleted_at.is_(None),
        )
        .first()
    )
    if cf:
        if _category_is_proposal_tab_client_asset(cf.category) or _storage_key_suggests_proposal_tab_client_asset(
            getattr(fo, "key", None)
        ):
            return _user_can_access_any_project_for_client(user, db, client_id)
    elif _storage_key_suggests_proposal_tab_client_asset(getattr(fo, "key", None)):
        return _user_can_access_any_project_for_client(user, db, client_id)

    return False


def _can_read_file_object_via_inferred_storage_scope(
    user: User, db: Session, fo: FileObject
) -> bool:
    """
    Legacy / buggy uploads can leave FileObject rows orphaned (no project_id/client_id/created_by),
    while the blob key still encodes the owning client/project. Use that path as a last scoped check.
    """
    key = getattr(fo, "key", None)
    if not key:
        return False

    p, c, e, cat = infer_scope_from_storage_key(db, key)
    pid = _parse_uuid(p)
    cid = _parse_uuid(c)
    eid = _parse_uuid(e)

    if pid:
        proj = db.query(Project).filter(Project.id == pid, Project.deleted_at.is_(None)).first()
        if not proj:
            return False
        if has_project_files_category_permission(user, cat, action="read", project=proj):
            return True
        return _can_read_project_file_via_proposal_tab(user, db, proj, fo)

    if cid:
        if _has_permission(user, "business:customers:read"):
            return True
        return _can_read_client_scoped_file_via_proposal(user, db, fo, cid)

    if eid:
        return bool(
            _has_permission(user, "hr:users:read")
            or _has_permission(user, "users:read")
        )

    return False


def assert_can_read_file_object(user: User, db: Session, fo: FileObject) -> None:
    """Raise 403 if user may not read/download this file."""
    if _is_employee_profile_photo_file(db, fo):
        return

    pid, cid, eid = _resolve_file_scope_from_references(db, fo)

    if pid:
        proj = db.query(Project).filter(Project.id == pid, Project.deleted_at.is_(None)).first()
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        if not can_access_project_for_proposal_assets(user, proj):
            raise HTTPException(status_code=403, detail="Forbidden")
        cat = str(fo.category_id) if fo.category_id else None
        if has_project_files_category_permission(
            user, cat, action="read", project=proj
        ):
            return
        if _can_read_project_file_via_proposal_tab(user, db, proj, fo):
            return
        raise HTTPException(status_code=403, detail="Forbidden")

    if cid:
        cl = db.query(Client).filter(Client.id == cid).first()
        if not cl:
            raise HTTPException(status_code=404, detail="Client not found")
        if _has_permission(user, "business:customers:read"):
            return
        if _can_read_client_scoped_file_via_proposal(user, db, fo, cid):
            return
        raise HTTPException(status_code=403, detail="Forbidden")

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
        if not can_access_project_for_proposal_assets(user, proj_img):
            raise HTTPException(status_code=403, detail="Forbidden")
        if not (
            _has_permission(user, "business:projects:read")
            or _has_permission(user, "business:projects:files:read")
            or _has_permission(user, "business:projects:files:write")
            or _has_permission(user, "business:projects:proposal:read")
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

    if _can_read_file_object_via_inferred_storage_scope(user, db, fo):
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
