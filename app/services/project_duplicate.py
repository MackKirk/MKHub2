"""Project / opportunity / leak investigation duplication (deep copy, new MK code)."""

from __future__ import annotations

import copy
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, class_mapper

from ..models.models import (
    Client,
    ClientFile,
    ClientFolder,
    ClientSite,
    FileObject,
    Project,
    ProjectEvent,
    ProjectFolder,
    ProjectReport,
    ProjectUpdate,
    Proposal,
    SettingItem,
    SettingList,
    User,
)


def generate_project_code(db: Session, client: Client) -> str:
    """Same pattern as create_project: MK-<seq>/<client_code>-<year>."""
    if not client.code:
        raise HTTPException(status_code=400, detail="Client must have a code. Please update the client first.")

    client_code = client.code
    if not (client_code.isdigit() and len(client_code) == 5):
        logging.warning(
            "Client %s has non-numeric code '%s'. Migration may be incomplete.",
            client.id,
            client_code,
        )

    year = datetime.utcnow().year
    seq = db.query(func.count(Project.id)).scalar() or 0
    seq += 1
    code = f"MK-{seq:05d}/{client_code}-{year}"
    while db.query(Project).filter(Project.code == code, Project.deleted_at.is_(None)).first():
        seq += 1
        code = f"MK-{seq:05d}/{client_code}-{year}"
    return code


def _prospecting_fields(db: Session) -> Tuple[Optional[uuid.UUID], Optional[str], datetime]:
    now = datetime.now(timezone.utc)
    status_list = db.query(SettingList).filter(SettingList.name == "project_statuses").first()
    if status_list:
        prospecting = (
            db.query(SettingItem)
            .filter(SettingItem.list_id == status_list.id, SettingItem.label == "Prospecting")
            .first()
        )
        if prospecting:
            return prospecting.id, "Prospecting", now
    return None, None, now


def _project_copy_kwargs_with_db(db: Session, src: Project, *, code: str, name: str, now: datetime) -> Dict[str, Any]:
    exclude = {"id", "code", "created_at", "deleted_at", "deleted_by_id"}
    mapper = class_mapper(Project)
    out: Dict[str, Any] = {}
    for col in mapper.columns:
        key = col.key
        if key in exclude:
            continue
        val = getattr(src, key, None)
        if isinstance(val, (dict, list)) and val is not None:
            val = copy.deepcopy(val)
        out[key] = val
    out["code"] = code
    out["name"] = name
    out["slug"] = None
    out["image_manually_set"] = False
    out["date_awarded"] = None
    out["status_changed_at"] = now

    if getattr(src, "is_bidding", False) or getattr(src, "is_leak_investigation", False):
        sid, slabel, st_changed = _prospecting_fields(db)
        out["status_id"] = sid
        out["status_label"] = slabel
        out["status_changed_at"] = st_changed
    else:
        out["status_id"] = None
        out["status_label"] = None
        out["status_changed_at"] = now

    return out


def ensure_client_folder_for_project(db: Session, proj: Project) -> None:
    """Mirror create_project post-commit folder bootstrap (best-effort)."""
    try:
        name = (proj.name or str(proj.id) or "project").strip()
        if not name:
            return
        parent_id = None
        if getattr(proj, "site_id", None):
            site = db.query(ClientSite).filter(ClientSite.id == proj.site_id).first()
            if site:
                sname = (
                    getattr(site, "site_name", None)
                    or getattr(site, "site_address_line1", None)
                    or str(site.id)
                ).strip()
                parent = (
                    db.query(ClientFolder)
                    .filter(
                        ClientFolder.client_id == proj.client_id,
                        ClientFolder.name == sname,
                        ClientFolder.parent_id.is_(None),
                    )
                    .first()
                )
                if parent:
                    parent_id = parent.id
        exists = db.query(ClientFolder).filter(ClientFolder.project_id == proj.id).first()
        if not exists:
            exists = (
                db.query(ClientFolder)
                .filter(
                    ClientFolder.client_id == proj.client_id,
                    ClientFolder.name == name,
                    ClientFolder.parent_id == parent_id,
                )
                .first()
            )
        if not exists:
            f = ClientFolder(client_id=proj.client_id, name=name, parent_id=parent_id, project_id=proj.id)
            db.add(f)
            db.commit()
            db.refresh(f)
            try:
                from ..routes.clients import create_default_folders_for_parent

                create_default_folders_for_parent(db, proj.client_id, f.id, proj.id)
            except Exception as e:
                logging.getLogger(__name__).warning("Failed to create default subfolders: %s", e)
    except Exception:
        db.rollback()


def duplicate_project_deep(db: Session, src: Project, user: User) -> uuid.UUID:
    """
    Create a deep copy: project row + updates + reports + events + proposals + folders + files (new DB rows, same storage key).
    Does not copy: timesheet, safety, audit rows.
    """
    if not src.client_id:
        raise HTTPException(status_code=400, detail="Source project has no client_id")

    client = db.query(Client).filter(Client.id == src.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    code = generate_project_code(db, client)
    now = datetime.now(timezone.utc)
    copy_name = f"{(src.name or '').strip() or 'Untitled'} (Copy)"

    kwargs = _project_copy_kwargs_with_db(db, src, code=code, name=copy_name, now=now)
    new_proj = Project(**kwargs)
    db.add(new_proj)
    db.flush()  # assign id

    new_id = new_proj.id
    src_id = src.id

    # --- ProjectUpdate ---
    for u in (
        db.query(ProjectUpdate)
        .filter(ProjectUpdate.project_id == src_id)
        .order_by(ProjectUpdate.timestamp.asc())
        .all()
    ):
        imgs = copy.deepcopy(u.images) if u.images is not None else None
        db.add(
            ProjectUpdate(
                project_id=new_id,
                timestamp=u.timestamp,
                text=u.text,
                images=imgs,
            )
        )

    # --- ProjectReport (map ids for proposals.approved_report_id) ---
    report_map: Dict[uuid.UUID, uuid.UUID] = {}
    for r in db.query(ProjectReport).filter(ProjectReport.project_id == src_id).order_by(ProjectReport.created_at.asc()).all():
        new_rid = uuid.uuid4()
        report_map[r.id] = new_rid
        db.add(
            ProjectReport(
                id=new_rid,
                project_id=new_id,
                title=r.title,
                category_id=r.category_id,
                division_id=r.division_id,
                description=r.description,
                images=copy.deepcopy(r.images) if r.images is not None else None,
                status=r.status,
                created_at=r.created_at,
                created_by=r.created_by,
                financial_value=r.financial_value,
                financial_type=r.financial_type,
                estimate_data=copy.deepcopy(r.estimate_data) if r.estimate_data is not None else None,
                approval_status=None,
                approved_by=None,
                approved_at=None,
            )
        )

    # --- ProjectEvent ---
    for ev in db.query(ProjectEvent).filter(ProjectEvent.project_id == src_id).order_by(ProjectEvent.start_datetime.asc()).all():
        db.add(
            ProjectEvent(
                project_id=new_id,
                name=ev.name,
                location=ev.location,
                start_datetime=ev.start_datetime,
                end_datetime=ev.end_datetime,
                notes=ev.notes,
                is_all_day=ev.is_all_day,
                timezone=ev.timezone,
                repeat_type=ev.repeat_type,
                repeat_config=copy.deepcopy(ev.repeat_config) if ev.repeat_config is not None else None,
                repeat_until=ev.repeat_until,
                repeat_count=ev.repeat_count,
                exceptions=copy.deepcopy(ev.exceptions) if ev.exceptions is not None else None,
                extra_dates=copy.deepcopy(ev.extra_dates) if ev.extra_dates is not None else None,
                overrides=copy.deepcopy(ev.overrides) if ev.overrides is not None else None,
                created_at=ev.created_at,
                created_by=ev.created_by,
            )
        )

    # --- ProjectFolder (two-phase: satisfy parent FK on insert) ---
    old_folders = db.query(ProjectFolder).filter(ProjectFolder.project_id == src_id).all()
    folder_map: Dict[uuid.UUID, uuid.UUID] = {f.id: uuid.uuid4() for f in old_folders}
    for f in old_folders:
        db.add(
            ProjectFolder(
                id=folder_map[f.id],
                project_id=new_id,
                category=f.category,
                parent_id=None,
                name=f.name,
                sort_index=f.sort_index,
                created_at=f.created_at,
            )
        )
    db.flush()
    for f in old_folders:
        if f.parent_id and f.parent_id in folder_map:
            row = db.query(ProjectFolder).filter(ProjectFolder.id == folder_map[f.id]).first()
            if row:
                row.parent_id = folder_map[f.parent_id]
    db.flush()

    # --- Proposal ---
    proposals = (
        db.query(Proposal)
        .filter(Proposal.project_id == src_id, Proposal.deleted_at.is_(None))
        .order_by(Proposal.created_at.asc())
        .all()
    )
    proposal_map: Dict[uuid.UUID, uuid.UUID] = {}
    for p in proposals:
        proposal_map[p.id] = uuid.uuid4()

    for p in proposals:
        parent_new = proposal_map.get(p.parent_proposal_id) if p.parent_proposal_id else None
        if p.parent_proposal_id and p.parent_proposal_id not in proposal_map:
            parent_new = None
        appr_rep = report_map.get(p.approved_report_id) if p.approved_report_id else None
        if p.approved_report_id and p.approved_report_id not in report_map:
            appr_rep = None
        db.add(
            Proposal(
                id=proposal_map[p.id],
                project_id=new_id,
                client_id=p.client_id,
                site_id=p.site_id,
                order_number=p.order_number,
                title=p.title,
                data=copy.deepcopy(p.data) if p.data is not None else None,
                created_at=p.created_at,
                is_change_order=p.is_change_order,
                change_order_number=p.change_order_number,
                parent_proposal_id=parent_new,
                approved_report_id=appr_rep,
                approval_status=None,
                deleted_at=None,
                deleted_by_id=None,
            )
        )

    # --- ClientFile + FileObject (same storage key; new rows) ---
    # Insert all FileObject rows before ClientFile: batched INSERT order is not FK-safe
    # (PostgreSQL may emit client_files before file_objects), so flush between phases.
    cfiles = (
        db.query(ClientFile)
        .join(FileObject, FileObject.id == ClientFile.file_object_id)
        .filter(FileObject.project_id == src_id, ClientFile.deleted_at.is_(None))
        .all()
    )
    cf_new_fo: List[Tuple[ClientFile, uuid.UUID]] = []
    for cf in cfiles:
        fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
        if not fo:
            continue
        new_fo_id = uuid.uuid4()
        db.add(
            FileObject(
                id=new_fo_id,
                provider=fo.provider,
                container=fo.container,
                key=fo.key,
                size_bytes=fo.size_bytes,
                content_type=fo.content_type,
                checksum_sha256=fo.checksum_sha256,
                version=fo.version,
                project_id=new_id,
                client_id=fo.client_id,
                employee_id=fo.employee_id,
                category_id=fo.category_id,
                source_ref=fo.source_ref,
                created_by=fo.created_by,
                created_at=fo.created_at,
                tags=copy.deepcopy(fo.tags) if fo.tags is not None else None,
            )
        )
        cf_new_fo.append((cf, new_fo_id))
    db.flush()
    for cf, new_fo_id in cf_new_fo:
        folder_new = folder_map.get(cf.folder_id) if cf.folder_id else None
        if cf.folder_id and cf.folder_id not in folder_map:
            folder_new = None
        db.add(
            ClientFile(
                client_id=cf.client_id,
                site_id=cf.site_id,
                file_object_id=new_fo_id,
                category=cf.category,
                folder_id=folder_new,
                key=cf.key,
                original_name=cf.original_name,
                uploaded_at=cf.uploaded_at,
                uploaded_by=cf.uploaded_by,
                deleted_at=None,
                deleted_by_id=None,
            )
        )

    db.commit()
    db.refresh(new_proj)

    try:
        from ..services.audit import create_audit_log

        create_audit_log(
            db=db,
            entity_type="project",
            entity_id=str(new_id),
            action="DUPLICATE",
            actor_id=str(user.id) if user else None,
            actor_role="user",
            source="api",
            changes_json={
                "duplicated_from": str(src_id),
                "source_code": getattr(src, "code", None),
                "new_code": new_proj.code,
                "name": new_proj.name,
            },
            context={
                "project_id": str(new_id),
                "source_project_id": str(src_id),
            },
        )
    except Exception:
        pass

    ensure_client_folder_for_project(db, new_proj)
    return new_id
