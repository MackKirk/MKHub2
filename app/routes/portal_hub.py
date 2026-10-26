"""Authenticated Hub customer portal APIs (projects, files, commercial docs)."""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.portal_security import get_current_portal_user
from ..db import get_db
from ..models.models import ClientFile, FileObject, PortalHubUser, Proposal
from ..services.portal_hub_project_access import (
    active_membership_client_ids,
    client_display_name,
    get_accessible_project,
    list_accessible_projects,
    serialize_portal_project,
    user_can_access_project,
    user_has_client_membership,
)

router = APIRouter(prefix="/portal/hub", tags=["portal-hub"])


@router.get("/projects")
def list_portal_projects(
    user: PortalHubUser = Depends(get_current_portal_user),
    db: Session = Depends(get_db),
):
    rows = list_accessible_projects(db, user)
    out = []
    name_cache: dict[str, Optional[str]] = {}
    for p, part, mid in rows:
        key = str(mid)
        if key not in name_cache:
            name_cache[key] = client_display_name(db, mid)
        out.append(serialize_portal_project(p, part, mid, name_cache[key]))
    return {"items": out}


@router.get("/projects/{project_id}")
def get_portal_project(
    project_id: str,
    user: PortalHubUser = Depends(get_current_portal_user),
    db: Session = Depends(get_db),
):
    try:
        pid = uuid.UUID(project_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    got = get_accessible_project(db, user, pid)
    if not got:
        raise HTTPException(status_code=404, detail="Not found")
    p, part, mid = got
    return serialize_portal_project(p, part, mid, client_display_name(db, mid))


def _file_in_portal_scope(db: Session, user: PortalHubUser, cf: ClientFile, fo: Optional[FileObject]) -> bool:
    if not getattr(cf, "customer_visible", False):
        return False
    if getattr(cf, "deleted_at", None):
        return False
    project_id = getattr(fo, "project_id", None) if fo else None
    if project_id:
        return user_can_access_project(db, user, project_id)
    return user_has_client_membership(db, user, cf.client_id)


@router.get("/files")
def list_portal_files(
    user: PortalHubUser = Depends(get_current_portal_user),
    db: Session = Depends(get_db),
    client_id: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
):
    member_ids = active_membership_client_ids(db, user)
    if not member_ids:
        return {"items": []}

    project_uuid: Optional[uuid.UUID] = None
    if project_id:
        try:
            project_uuid = uuid.UUID(project_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid project_id")
        if not user_can_access_project(db, user, project_uuid):
            raise HTTPException(status_code=404, detail="Not found")

    q = (
        db.query(ClientFile, FileObject)
        .outerjoin(FileObject, FileObject.id == ClientFile.file_object_id)
        .filter(
            ClientFile.client_id.in_(member_ids),
            ClientFile.deleted_at.is_(None),
            ClientFile.customer_visible.is_(True),
        )
    )
    if client_id:
        try:
            cid = uuid.UUID(client_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid client_id")
        if cid not in member_ids:
            raise HTTPException(status_code=404, detail="Not found")
        q = q.filter(ClientFile.client_id == cid)
    if project_uuid is not None:
        q = q.filter(FileObject.project_id == project_uuid)

    items = []
    for cf, fo in q.order_by(ClientFile.uploaded_at.desc()).all():
        if not _file_in_portal_scope(db, user, cf, fo):
            continue
        # Project-scoped listing: only files tied to that project
        if project_uuid is not None:
            if not fo or fo.project_id != project_uuid:
                continue
        items.append(
            {
                "id": str(cf.id),
                "client_id": str(cf.client_id),
                "file_object_id": str(cf.file_object_id),
                "original_name": cf.original_name or (fo.key.split("/")[-1] if fo and fo.key else None),
                "category": cf.category,
                "uploaded_at": cf.uploaded_at.isoformat() if cf.uploaded_at else None,
                "content_type": getattr(fo, "content_type", None) if fo else None,
                "project_id": str(fo.project_id) if fo and fo.project_id else None,
            }
        )
    return {"items": items}


@router.get("/files/{file_id}/download")
def download_portal_file(
    file_id: str,
    user: PortalHubUser = Depends(get_current_portal_user),
    db: Session = Depends(get_db),
):
    from pathlib import Path

    from fastapi.responses import FileResponse

    from ..routes.files import get_storage_for_file
    from ..storage.local_provider import LocalStorageProvider

    try:
        fid = uuid.UUID(file_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    cf = db.query(ClientFile).filter(ClientFile.id == fid, ClientFile.deleted_at.is_(None)).first()
    if not cf:
        raise HTTPException(status_code=404, detail="Not found")
    fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
    if not fo or not _file_in_portal_scope(db, user, cf, fo):
        raise HTTPException(status_code=404, detail="Not found")

    storage = get_storage_for_file(fo)
    download_filename = cf.original_name or Path(fo.key).name
    if isinstance(storage, LocalStorageProvider):
        file_path = storage._get_path(fo.key)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        return FileResponse(
            path=str(file_path),
            media_type=fo.content_type or "application/octet-stream",
            filename=download_filename,
        )
    url = storage.get_download_url(fo.key, expires_s=300)
    if not url:
        raise HTTPException(status_code=404, detail="File not available")
    return {"download_url": url, "expires_in": 300, "filename": download_filename}


def _commercial_in_scope(
    db: Session,
    user: PortalHubUser,
    *,
    client_id: uuid.UUID,
    project_id: Optional[uuid.UUID],
) -> bool:
    if project_id:
        return user_can_access_project(db, user, project_id)
    return user_has_client_membership(db, user, client_id)


@router.get("/proposals")
def list_portal_proposals(
    user: PortalHubUser = Depends(get_current_portal_user),
    db: Session = Depends(get_db),
    project_id: Optional[str] = Query(None),
):
    member_ids = active_membership_client_ids(db, user)
    if not member_ids:
        return {"items": []}

    project_uuid: Optional[uuid.UUID] = None
    if project_id:
        try:
            project_uuid = uuid.UUID(project_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid project_id")
        if not user_can_access_project(db, user, project_uuid):
            raise HTTPException(status_code=404, detail="Not found")

    q = db.query(Proposal).filter(
        Proposal.deleted_at.is_(None),
        Proposal.customer_visible.is_(True),
        Proposal.client_id.in_(member_ids),
    )
    if project_uuid is not None:
        q = q.filter(Proposal.project_id == project_uuid)

    rows = q.order_by(Proposal.created_at.desc()).all()
    items = []
    for p in rows:
        if not _commercial_in_scope(db, user, client_id=p.client_id, project_id=p.project_id):
            continue
        # Project-scoped listing: only proposals tied to that project
        if project_uuid is not None and p.project_id != project_uuid:
            continue
        items.append(
            {
                "id": str(p.id),
                "title": p.title,
                "order_number": p.order_number,
                "client_id": str(p.client_id),
                "project_id": str(p.project_id) if p.project_id else None,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "shared_with_customer_at": p.shared_with_customer_at.isoformat()
                if p.shared_with_customer_at
                else None,
            }
        )
    return {"items": items}


def _text_match(q: str, *parts: Optional[str]) -> bool:
    needle = (q or "").strip().lower()
    if len(needle) < 2:
        return False
    hay = " ".join(str(p or "") for p in parts).lower()
    return needle in hay


@router.get("/search")
def portal_global_search(
    q: str = Query("", min_length=0),
    limit: int = Query(10, ge=1, le=50),
    user: PortalHubUser = Depends(get_current_portal_user),
    db: Session = Depends(get_db),
):
    """Search portal-scoped projects, project files, and shared proposals."""
    query = (q or "").strip()
    if len(query) < 2:
        return {"sections": []}

    sections: list[dict] = []

    project_items = []
    for p, part, mid in list_accessible_projects(db, user):
        if not _text_match(query, p.name, p.code, getattr(p, "status_label", None)):
            continue
        project_items.append(
            {
                "type": "project",
                "id": str(p.id),
                "title": p.name,
                "subtitle": f"{p.code or ''} · {part}".strip(" ·"),
                "href": f"/projects/{p.id}",
            }
        )
        if len(project_items) >= limit:
            break
    if project_items:
        sections.append({"id": "projects", "label": "Projects", "items": project_items})

    member_ids = active_membership_client_ids(db, user)
    file_items = []
    if member_ids:
        rows = (
            db.query(ClientFile, FileObject)
            .outerjoin(FileObject, FileObject.id == ClientFile.file_object_id)
            .filter(
                ClientFile.client_id.in_(member_ids),
                ClientFile.deleted_at.is_(None),
                ClientFile.customer_visible.is_(True),
                FileObject.project_id.isnot(None),
            )
            .order_by(ClientFile.uploaded_at.desc())
            .limit(limit * 3)
            .all()
        )
        for cf, fo in rows:
            if not fo or not fo.project_id:
                continue
            if not _file_in_portal_scope(db, user, cf, fo):
                continue
            name = cf.original_name or (fo.key.split("/")[-1] if fo.key else None)
            if not _text_match(query, name, cf.category):
                continue
            pid = str(fo.project_id)
            file_items.append(
                {
                    "type": "file",
                    "id": str(cf.id),
                    "title": name or "File",
                    "subtitle": cf.category,
                    "href": f"/projects/{pid}?tab=files",
                }
            )
            if len(file_items) >= limit:
                break
    if file_items:
        sections.append({"id": "files", "label": "Files", "items": file_items})

    doc_items = []
    if member_ids:
        props = (
            db.query(Proposal)
            .filter(
                Proposal.deleted_at.is_(None),
                Proposal.customer_visible.is_(True),
                Proposal.client_id.in_(member_ids),
                Proposal.project_id.isnot(None),
            )
            .order_by(Proposal.created_at.desc())
            .limit(limit * 2)
            .all()
        )
        for p in props:
            if not p.project_id:
                continue
            if not _commercial_in_scope(db, user, client_id=p.client_id, project_id=p.project_id):
                continue
            title = p.title or p.order_number or str(p.id)
            if not _text_match(query, title, p.order_number):
                continue
            pid = str(p.project_id)
            doc_items.append(
                {
                    "type": "proposal",
                    "id": str(p.id),
                    "title": title,
                    "subtitle": "Proposal",
                    "href": f"/projects/{pid}?tab=documents",
                }
            )
            if len(doc_items) >= limit:
                break

    if doc_items:
        sections.append({"id": "documents", "label": "Documents", "items": doc_items[:limit]})

    return {"sections": sections}
