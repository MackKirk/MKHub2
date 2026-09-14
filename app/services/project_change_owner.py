"""Atomic project owner (primary customer) change with folder/file move and validation."""

from __future__ import annotations

import uuid
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..models.models import (
    Client,
    ClientContact,
    ClientDocument,
    ClientFile,
    ClientFolder,
    ClientSite,
    FileObject,
    Project,
    Proposal,
)
from .billing_snapshot import apply_billing_snapshot_to_project


def _parse_uuid(raw: Any, *, field: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(raw))
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid {field}")


def _client_display_name(client: Optional[Client]) -> Optional[str]:
    if not client:
        return None
    return getattr(client, "display_name", None) or getattr(client, "name", None) or getattr(client, "legal_name", None)


def _normalize_related_ids(
    db: Session,
    raw_ids: Any,
    *,
    main_client_id: uuid.UUID,
) -> Optional[list[str]]:
    if raw_ids is None:
        return None
    if not isinstance(raw_ids, list):
        raise HTTPException(status_code=400, detail="related_client_ids must be a list or null")
    main_str = str(main_client_id)
    validated: list[str] = []
    seen: set[str] = set()
    for cid in raw_ids:
        if not cid:
            continue
        try:
            cid_uuid = uuid.UUID(str(cid))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid related_client_id: {cid}")
        cid_str = str(cid_uuid)
        if cid_str == main_str or cid_str in seen:
            continue
        if db.query(Client.id).filter(Client.id == cid_uuid).first() is None:
            raise HTTPException(status_code=400, detail=f"Related client not found: {cid}")
        seen.add(cid_str)
        validated.append(cid_str)
    return validated if validated else None


def _normalize_awarded_ids(
    db: Session,
    raw_ids: Any,
    *,
    related_set: set[str],
) -> Optional[list[str]]:
    if raw_ids is None:
        return None
    if not isinstance(raw_ids, list):
        raise HTTPException(status_code=400, detail="awarded_related_client_ids must be a list or null")
    validated: list[str] = []
    seen: set[str] = set()
    for cid in raw_ids:
        if not cid:
            continue
        try:
            cid_uuid = uuid.UUID(str(cid))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid awarded_related_client_ids entry: {cid}")
        cid_str = str(cid_uuid)
        if cid_str in seen:
            continue
        if cid_str not in related_set:
            raise HTTPException(
                status_code=400,
                detail="Awarded customer must be one of the related customers",
            )
        if db.query(Client.id).filter(Client.id == cid_uuid).first() is None:
            raise HTTPException(status_code=400, detail=f"Awarded client not found: {cid}")
        seen.add(cid_str)
        validated.append(cid_str)
    return validated if validated else None


def _collect_folder_subtree(db: Session, root: ClientFolder) -> list[ClientFolder]:
    """BFS all folders under root (including root), by parent_id."""
    result: list[ClientFolder] = [root]
    queue = [root.id]
    while queue:
        parent_id = queue.pop(0)
        children = db.query(ClientFolder).filter(ClientFolder.parent_id == parent_id).all()
        for child in children:
            result.append(child)
            queue.append(child.id)
    return result


def _resolve_new_parent_folder(
    db: Session,
    *,
    new_client_id: uuid.UUID,
    site: Optional[ClientSite],
) -> Optional[uuid.UUID]:
    """Mirror project-create: prefer site-named root folder under new client, else client root."""
    if site:
        sname = (
            getattr(site, "site_name", None)
            or getattr(site, "site_address_line1", None)
            or str(site.id)
        ).strip()
        if sname:
            parent = (
                db.query(ClientFolder)
                .filter(
                    ClientFolder.client_id == new_client_id,
                    ClientFolder.name == sname,
                    ClientFolder.parent_id.is_(None),
                )
                .first()
            )
            if parent:
                return parent.id
    return None


def move_project_folders_and_files(
    db: Session,
    project: Project,
    *,
    new_client_id: uuid.UUID,
    site: Optional[ClientSite],
) -> None:
    """Move ClientFolder subtree, ClientDocuments, ClientFiles, and FileObject.client_id."""
    project_id = project.id
    new_parent_id = _resolve_new_parent_folder(db, new_client_id=new_client_id, site=site)

    roots = (
        db.query(ClientFolder)
        .filter(ClientFolder.project_id == project_id)
        .all()
    )
    moved_folder_ids: list[uuid.UUID] = []
    for root in roots:
        subtree = _collect_folder_subtree(db, root)
        for folder in subtree:
            folder.client_id = new_client_id
            moved_folder_ids.append(folder.id)
        # Reparent only the project root folder (the one with project_id set)
        root.parent_id = new_parent_id

    if moved_folder_ids:
        tags = [f"folder:{fid}" for fid in moved_folder_ids]
        docs = (
            db.query(ClientDocument)
            .filter(ClientDocument.doc_type.in_(tags))
            .all()
        )
        for doc in docs:
            doc.client_id = new_client_id

    file_objects = (
        db.query(FileObject)
        .filter(FileObject.project_id == project_id)
        .all()
    )
    fo_ids = [fo.id for fo in file_objects]
    for fo in file_objects:
        fo.client_id = new_client_id

    if fo_ids:
        cfiles = (
            db.query(ClientFile)
            .filter(ClientFile.file_object_id.in_(fo_ids))
            .all()
        )
        for cf in cfiles:
            cf.client_id = new_client_id
            # Clear site_id if it pointed at old customer's site
            if cf.site_id is not None:
                site_ok = (
                    db.query(ClientSite.id)
                    .filter(ClientSite.id == cf.site_id, ClientSite.client_id == new_client_id)
                    .first()
                )
                if not site_ok:
                    cf.site_id = None


def apply_site_geo_to_project(project: Project, site: Optional[ClientSite]) -> None:
    if not site:
        return
    if getattr(site, "site_lat", None) is not None:
        project.lat = float(site.site_lat)
    if getattr(site, "site_lng", None) is not None:
        project.lng = float(site.site_lng)
    if site.site_address_line1:
        project.address = site.site_address_line1
    if site.site_city:
        project.address_city = site.site_city
    if site.site_province:
        project.address_province = site.site_province
    if site.site_country:
        project.address_country = site.site_country


def change_project_owner(
    db: Session,
    project: Project,
    payload: dict,
) -> dict:
    """
    Apply owner change in-memory (caller commits).
    Returns audit context with before/after client names.
    """
    raw_client = payload.get("client_id")
    if not raw_client:
        raise HTTPException(status_code=400, detail="client_id is required")
    new_client_id = _parse_uuid(raw_client, field="client_id")

    old_client_id = getattr(project, "client_id", None)
    if old_client_id and str(old_client_id) == str(new_client_id):
        raise HTTPException(status_code=400, detail="New owner must be different from the current owner")

    new_client = db.query(Client).filter(Client.id == new_client_id).first()
    if not new_client:
        raise HTTPException(status_code=404, detail="Customer not found")

    old_client = (
        db.query(Client).filter(Client.id == old_client_id).first() if old_client_id else None
    )
    had_site = bool(getattr(project, "site_id", None))
    is_bidding = bool(getattr(project, "is_bidding", False))

    # Site
    raw_site = payload.get("site_id")
    site: Optional[ClientSite] = None
    if raw_site is None or (isinstance(raw_site, str) and not str(raw_site).strip()):
        if is_bidding or had_site:
            raise HTTPException(
                status_code=400,
                detail="site_id is required when changing owner for opportunities or projects that had a site",
            )
        project.site_id = None
    else:
        site_uuid = _parse_uuid(raw_site, field="site_id")
        site = (
            db.query(ClientSite)
            .filter(ClientSite.id == site_uuid, ClientSite.client_id == new_client_id)
            .first()
        )
        if not site:
            raise HTTPException(status_code=400, detail="Site must belong to the new customer")
        project.site_id = site_uuid

    # Contact
    raw_contact = payload.get("contact_id")
    if raw_contact is None or (isinstance(raw_contact, str) and not str(raw_contact).strip()):
        project.contact_id = None
    else:
        contact_uuid = _parse_uuid(raw_contact, field="contact_id")
        contact = (
            db.query(ClientContact)
            .filter(ClientContact.id == contact_uuid, ClientContact.client_id == new_client_id)
            .first()
        )
        if not contact:
            raise HTTPException(status_code=400, detail="Contact must belong to the new customer")
        project.contact_id = contact_uuid

    # Related / awarded — payload may omit; scrub current lists against new owner
    if "related_client_ids" in payload:
        related = _normalize_related_ids(db, payload.get("related_client_ids"), main_client_id=new_client_id)
    else:
        existing = getattr(project, "related_client_ids", None) or []
        related = _normalize_related_ids(db, existing, main_client_id=new_client_id)

    related_set = set(related or [])
    if "awarded_related_client_ids" in payload:
        awarded = _normalize_awarded_ids(
            db, payload.get("awarded_related_client_ids"), related_set=related_set
        )
    else:
        existing_aw = getattr(project, "awarded_related_client_ids", None)
        if existing_aw is None and getattr(project, "awarded_related_client_id", None):
            existing_aw = [str(project.awarded_related_client_id)]
        # Filter to remaining related only
        if isinstance(existing_aw, list):
            existing_aw = [x for x in existing_aw if x and str(x) in related_set]
        awarded = _normalize_awarded_ids(db, existing_aw, related_set=related_set) if related_set else None

    project.client_id = new_client_id
    project.related_client_ids = related
    project.awarded_related_client_ids = awarded
    project.awarded_related_client_id = None
    flag_modified(project, "related_client_ids")
    flag_modified(project, "awarded_related_client_ids")

    apply_site_geo_to_project(project, site)

    move_project_folders_and_files(
        db,
        project,
        new_client_id=new_client_id,
        site=site,
    )

    # Proposals linked to this project
    proposals = (
        db.query(Proposal)
        .filter(Proposal.project_id == project.id, Proposal.deleted_at.is_(None))
        .all()
    )
    for prop in proposals:
        prop.client_id = new_client_id
        if site:
            # Clear proposal site if it no longer belongs to new client
            if prop.site_id:
                prop_site_ok = (
                    db.query(ClientSite.id)
                    .filter(ClientSite.id == prop.site_id, ClientSite.client_id == new_client_id)
                    .first()
                )
                if not prop_site_ok:
                    prop.site_id = site.id if site else None
            else:
                prop.site_id = site.id
        elif prop.site_id:
            prop_site_ok = (
                db.query(ClientSite.id)
                .filter(ClientSite.id == prop.site_id, ClientSite.client_id == new_client_id)
                .first()
            )
            if not prop_site_ok:
                prop.site_id = None

    resync_billing = bool(payload.get("resync_billing_from_client"))
    if not is_bidding and resync_billing:
        apply_billing_snapshot_to_project(project, new_client)

    return {
        "old_client_id": str(old_client_id) if old_client_id else None,
        "new_client_id": str(new_client_id),
        "old_client_name": _client_display_name(old_client),
        "new_client_name": _client_display_name(new_client),
        "resync_billing_from_client": bool(not is_bidding and resync_billing),
    }
