"""Fieldwork ↔ Project Files integration helpers (PR5).

PhotoObservation remains the source of truth for technical classification /
approved phrases. Files UI surfaces that data as derived read-only metadata.
"""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional, Sequence, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import ClientFile, FieldworkPhotoObservation, FieldworkRecord, FileObject, Project
from .form_engine import (
    FIELDWORK_CLASSIFICATION_CLASSIFIED,
    FIELDWORK_CLASSIFICATION_NEEDS,
    FIELDWORK_TECHNICAL_PHOTO_FOLDER_NAMES,
)

# Soft-delete / move blocked when evidence is locked into a non-editable report.
PROTECTED_FIELDWORK_STATUSES = frozenset({"submitted", "approved", "superseded"})


def is_rm_technical_photo_category(category: Optional[str]) -> bool:
    name = (category or "").strip()
    return name in FIELDWORK_TECHNICAL_PHOTO_FOLDER_NAMES


def _obs_to_meta(
    obs: FieldworkPhotoObservation,
    record: Optional[FieldworkRecord],
) -> Dict[str, Any]:
    phrase = (obs.phrase_text_snapshot or "").strip()
    status = (record.status if record else None) or None
    classified = bool(phrase)
    return {
        "photo_observation_id": str(obs.id),
        "record_id": str(obs.record_id),
        "record_status": status,
        "record_kind": record.kind if record else None,
        "entry_type": obs.entry_type,
        "classification_snapshot": obs.classification_snapshot,
        "phrase_text_snapshot": obs.phrase_text_snapshot,
        "extra_notes": obs.extra_notes,
        "classification_state": (
            FIELDWORK_CLASSIFICATION_CLASSIFIED if classified else FIELDWORK_CLASSIFICATION_NEEDS
        ),
        "protected": bool(status and status in PROTECTED_FIELDWORK_STATUSES),
    }


def batch_fieldwork_file_meta(
    db: Session,
    *,
    project_id: uuid.UUID,
    pairs: Sequence[Tuple[ClientFile, FileObject]],
) -> Dict[str, Dict[str, Any]]:
    """Map client_file_id → fieldwork meta for a project files list response."""
    if not pairs:
        return {}

    fo_ids = [fo.id for _, fo in pairs]
    cf_ids = [cf.id for cf, _ in pairs]

    # Observations linked by file_object or client_file for this project's records.
    obs_rows = (
        db.query(FieldworkPhotoObservation, FieldworkRecord)
        .join(FieldworkRecord, FieldworkRecord.id == FieldworkPhotoObservation.record_id)
        .filter(FieldworkRecord.project_id == project_id)
        .filter(
            (FieldworkPhotoObservation.file_object_id.in_(fo_ids))
            | (FieldworkPhotoObservation.client_file_id.in_(cf_ids))
        )
        .all()
    )

    by_fo: Dict[uuid.UUID, Tuple[FieldworkPhotoObservation, FieldworkRecord]] = {}
    by_cf: Dict[uuid.UUID, Tuple[FieldworkPhotoObservation, FieldworkRecord]] = {}
    for obs, rec in obs_rows:
        by_fo[obs.file_object_id] = (obs, rec)
        if obs.client_file_id:
            by_cf[obs.client_file_id] = (obs, rec)

    out: Dict[str, Dict[str, Any]] = {}
    for cf, fo in pairs:
        hit = by_cf.get(cf.id) or by_fo.get(fo.id)
        technical = is_rm_technical_photo_category(getattr(cf, "category", None))
        ct = getattr(fo, "content_type", None) or ""
        name = cf.original_name or cf.key or ""
        ext = (name.rsplit(".", 1)[-1] if "." in name else "").lower()
        is_img = ct.startswith("image/") or ext in {
            "png",
            "jpg",
            "jpeg",
            "webp",
            "gif",
            "bmp",
            "heic",
            "heif",
        }
        if hit:
            obs, rec = hit
            meta = _obs_to_meta(obs, rec)
            meta["needs_classification"] = meta["classification_state"] == FIELDWORK_CLASSIFICATION_NEEDS
            meta["is_technical_folder"] = technical
            out[str(cf.id)] = meta
        elif technical and is_img:
            out[str(cf.id)] = {
                "photo_observation_id": None,
                "record_id": None,
                "record_status": None,
                "record_kind": None,
                "entry_type": None,
                "classification_snapshot": None,
                "phrase_text_snapshot": None,
                "extra_notes": None,
                "classification_state": FIELDWORK_CLASSIFICATION_NEEDS,
                "needs_classification": True,
                "is_technical_folder": True,
                "protected": False,
            }
        # Non-technical / non-image files: omit fieldwork meta (no second caption system).
    return out


def find_fieldwork_links_for_client_file(
    db: Session, client_file_id: uuid.UUID
) -> List[Tuple[FieldworkPhotoObservation, FieldworkRecord]]:
    return (
        db.query(FieldworkPhotoObservation, FieldworkRecord)
        .join(FieldworkRecord, FieldworkRecord.id == FieldworkPhotoObservation.record_id)
        .filter(FieldworkPhotoObservation.client_file_id == client_file_id)
        .all()
    )


def find_fieldwork_links_for_file_object(
    db: Session, file_object_id: uuid.UUID
) -> List[Tuple[FieldworkPhotoObservation, FieldworkRecord]]:
    return (
        db.query(FieldworkPhotoObservation, FieldworkRecord)
        .join(FieldworkRecord, FieldworkRecord.id == FieldworkPhotoObservation.record_id)
        .filter(FieldworkPhotoObservation.file_object_id == file_object_id)
        .all()
    )


def assert_client_file_not_protected_fieldwork_evidence(
    db: Session,
    cf: ClientFile,
    *,
    action: str = "delete",
) -> None:
    """Block Files delete/move when the asset is evidence on a locked Fieldwork report."""
    links = find_fieldwork_links_for_client_file(db, cf.id)
    if not links and cf.file_object_id:
        links = find_fieldwork_links_for_file_object(db, cf.file_object_id)
    for obs, rec in links:
        if (rec.status or "") in PROTECTED_FIELDWORK_STATUSES:
            verb = "deleted" if action == "delete" else "moved or reclassified"
            raise HTTPException(
                status_code=409,
                detail=(
                    f"This file is evidence on a {rec.status.replace('_', ' ')} Fieldwork report "
                    f"and cannot be {verb} from Files. "
                    "Create a revision of the report if the evidence must change."
                ),
            )


def file_object_referenced_by_fieldwork(db: Session, file_object_id: uuid.UUID) -> bool:
    return (
        db.query(FieldworkPhotoObservation.id)
        .filter(FieldworkPhotoObservation.file_object_id == file_object_id)
        .first()
        is not None
    )


def find_existing_client_file_for_object(
    db: Session,
    *,
    project: Project,
    file_object_id: uuid.UUID,
) -> Optional[ClientFile]:
    """Reuse an active ClientFile for the same FileObject on this project (no physical duplicate)."""
    rows = (
        db.query(ClientFile)
        .filter(
            ClientFile.file_object_id == file_object_id,
            ClientFile.client_id == project.client_id,
            ClientFile.deleted_at.is_(None),
        )
        .all()
    )
    for cf in rows:
        fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
        if fo and fo.project_id and str(fo.project_id) == str(project.id):
            return cf
        if fo and not fo.project_id:
            return cf
    return rows[0] if rows else None


def ensure_client_file_attached(
    db: Session,
    *,
    project: Project,
    file_object_id: uuid.UUID,
    category: Optional[str],
    original_name: Optional[str] = None,
) -> ClientFile:
    """Idempotent FileObject → ClientFile attach used by Fieldwork uploads."""
    existing = find_existing_client_file_for_object(db, project=project, file_object_id=file_object_id)
    if existing:
        # Keep category aligned when still empty / mismatched and not protected.
        if category and (not existing.category or existing.category != category):
            links = find_fieldwork_links_for_client_file(db, existing.id)
            protected = any((rec.status or "") in PROTECTED_FIELDWORK_STATUSES for _, rec in links)
            if not protected and is_rm_technical_photo_category(category):
                existing.category = category
        return existing

    fo = db.query(FileObject).filter(FileObject.id == file_object_id).first()
    if not fo:
        raise HTTPException(status_code=404, detail="File object not found")
    if fo.project_id and str(fo.project_id) != str(project.id):
        raise HTTPException(status_code=400, detail="File object belongs to another project")
    fo.project_id = project.id
    row = ClientFile(
        client_id=project.client_id,
        site_id=None,
        file_object_id=fo.id,
        category=category,
        key=fo.key,
        original_name=original_name,
    )
    db.add(row)
    db.flush()
    return row
