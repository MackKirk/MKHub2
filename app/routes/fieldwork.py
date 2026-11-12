"""R&M Fieldwork records API (PR1: domain + workflow; no UI / upload orchestration)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth.security import get_current_user
from ..db import get_db
from ..models.models import (
    ClientFile,
    FieldworkPhotoObservation,
    FieldworkRecord,
    FieldworkRecordEvent,
    FileObject,
    FormTemplate,
    Project,
    User,
)
from ..services.fieldwork_access import assert_rm_fieldwork_project
from ..services.fieldwork_phrases import resolve_phrase_snapshots
from ..services.form_engine import (
    FIELDWORK_PHOTO_ENTRY_OBSERVATION,
    FIELDWORK_PHOTO_ENTRY_WORK_PERFORMED,
    SITE_ASSESSMENT_CATEGORY,
    WORK_REPORT_CATEGORY,
    is_fieldwork_template_category,
    normalized_template_category,
)

router = APIRouter(tags=["fieldwork"])

EDITABLE_STATUSES = frozenset({"draft", "changes_requested"})
TERMINAL_APPROVED = "approved"
STATUS_SUBMITTED = "submitted"
STATUS_CHANGES_REQUESTED = "changes_requested"
STATUS_SUPERSEDED = "superseded"
ENTRY_TYPES = frozenset({FIELDWORK_PHOTO_ENTRY_OBSERVATION, FIELDWORK_PHOTO_ENTRY_WORK_PERFORMED})
KINDS = frozenset({SITE_ASSESSMENT_CATEGORY, WORK_REPORT_CATEGORY})


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _load_project(db: Session, project_id: str) -> Project:
    try:
        pid = uuid.UUID(str(project_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project_id")
    proj = db.query(Project).filter(Project.id == pid, Project.deleted_at.is_(None)).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    return proj


def _load_record(
    db: Session, project_id: str, record_id: str, *, for_update: bool = False
) -> FieldworkRecord:
    try:
        rid = uuid.UUID(str(record_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid record_id")
    q = db.query(FieldworkRecord).filter(
        FieldworkRecord.id == rid, FieldworkRecord.project_id == project_id
    )
    if for_update:
        q = q.with_for_update()
    row = q.first()
    if not row:
        raise HTTPException(status_code=404, detail="Fieldwork record not found")
    return row


def _add_event(
    db: Session,
    record: FieldworkRecord,
    *,
    event_type: str,
    user: Optional[User],
    from_status: Optional[str] = None,
    to_status: Optional[str] = None,
    message: Optional[str] = None,
    meta: Optional[dict] = None,
) -> None:
    db.add(
        FieldworkRecordEvent(
            record_id=record.id,
            event_type=event_type,
            from_status=from_status,
            to_status=to_status,
            message=(message or "").strip() or None,
            meta=meta,
            created_by=user.id if user else None,
        )
    )


def _default_settings_for_kind(kind: str) -> dict:
    folder = "Proposal Photos" if kind == SITE_ASSESSMENT_CATEGORY else "Invoice Photos"
    # Additional Comments required on Work Report close-out only — not globally for all Fieldwork kinds.
    return {
        "require_final_comments": kind == WORK_REPORT_CATEGORY,
        "require_min_photos": 0,
        "default_pictures_folder": folder,
    }


def _normalize_pictures_folder(raw: Optional[str], *, kind: str) -> str:
    """Map legacy slugs / validate against R&M technical folders; fall back to kind default."""
    from ..services.form_engine import FIELDWORK_TECHNICAL_PHOTO_FOLDER_NAMES

    default = _default_settings_for_kind(kind)["default_pictures_folder"]
    if not isinstance(raw, str) or not raw.strip():
        return default
    name = raw.strip()
    slug_map = {
        "proposal_photos": "Proposal Photos",
        "invoice_photos": "Invoice Photos",
    }
    name = slug_map.get(name.lower(), name)
    if name not in FIELDWORK_TECHNICAL_PHOTO_FOLDER_NAMES:
        return default
    return name


def _settings_from_template(tpl: FormTemplate, kind: str) -> dict:
    base = _default_settings_for_kind(kind)
    definition = tpl.definition if isinstance(tpl.definition, dict) else {}
    fw = definition.get("fieldwork_settings") if isinstance(definition.get("fieldwork_settings"), dict) else {}
    if "require_final_comments" in fw:
        base["require_final_comments"] = bool(fw["require_final_comments"])
    if "require_min_photos" in fw:
        try:
            base["require_min_photos"] = max(0, int(fw["require_min_photos"]))
        except Exception:
            pass
    base["default_pictures_folder"] = _normalize_pictures_folder(
        fw.get("default_pictures_folder") if isinstance(fw.get("default_pictures_folder"), str) else None,
        kind=kind,
    )
    return base


def _photo_to_dict(p: FieldworkPhotoObservation) -> dict:
    return {
        "id": str(p.id),
        "record_id": str(p.record_id),
        "file_object_id": str(p.file_object_id),
        "client_file_id": str(p.client_file_id) if p.client_file_id else None,
        "sort_order": int(p.sort_order or 0),
        "entry_type": p.entry_type,
        "classification_item_id": str(p.classification_item_id) if p.classification_item_id else None,
        "phrase_item_id": str(p.phrase_item_id) if p.phrase_item_id else None,
        "classification_snapshot": p.classification_snapshot,
        "phrase_text_snapshot": p.phrase_text_snapshot,
        "extra_notes": p.extra_notes,
        "client_mutation_id": p.client_mutation_id,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _resolve_user_label(db: Session, user_id) -> Optional[str]:
    if not user_id:
        return None
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        return None
    return (getattr(u, "username", None) or "").strip() or None


def _photo_count_for_record(db: Session, record_id) -> int:
    return (
        db.query(FieldworkPhotoObservation)
        .filter(FieldworkPhotoObservation.record_id == record_id)
        .count()
    )


def _record_to_dict(
    db: Session,
    row: FieldworkRecord,
    *,
    include_photos: bool = False,
    include_events: bool = False,
) -> dict:
    status = (row.status or "").strip().lower()
    out = {
        "id": str(row.id),
        "project_id": str(row.project_id),
        "kind": row.kind,
        "form_template_id": str(row.form_template_id) if row.form_template_id else None,
        "form_definition_snapshot": row.form_definition_snapshot,
        "form_payload": row.form_payload if isinstance(row.form_payload, dict) else {},
        "settings_snapshot": row.settings_snapshot if isinstance(row.settings_snapshot, dict) else {},
        "status": row.status,
        "final_comments": row.final_comments,
        "review_note": row.review_note,
        "version": int(row.version or 1),
        "row_version": int(row.row_version or 1),
        "revision_of_id": str(row.revision_of_id) if row.revision_of_id else None,
        "superseded_by_id": str(row.superseded_by_id) if row.superseded_by_id else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "created_by": str(row.created_by) if row.created_by else None,
        "created_by_name": _resolve_user_label(db, row.created_by),
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "updated_by": str(row.updated_by) if row.updated_by else None,
        "updated_by_name": _resolve_user_label(db, row.updated_by),
        "submitted_at": row.submitted_at.isoformat() if row.submitted_at else None,
        "submitted_by": str(row.submitted_by) if row.submitted_by else None,
        "submitted_by_name": _resolve_user_label(db, row.submitted_by),
        "reviewed_at": row.reviewed_at.isoformat() if row.reviewed_at else None,
        "reviewed_by": str(row.reviewed_by) if row.reviewed_by else None,
        "reviewed_by_name": _resolve_user_label(db, row.reviewed_by),
        "approved_at": row.approved_at.isoformat() if row.approved_at else None,
        "approved_by": str(row.approved_by) if row.approved_by else None,
        "approved_by_name": _resolve_user_label(db, row.approved_by),
        "photo_count": _photo_count_for_record(db, row.id),
        "pending_review": status == STATUS_SUBMITTED,
    }
    if include_photos:
        photos = (
            db.query(FieldworkPhotoObservation)
            .filter(FieldworkPhotoObservation.record_id == row.id)
            .order_by(FieldworkPhotoObservation.sort_order.asc(), FieldworkPhotoObservation.created_at.asc())
            .all()
        )
        out["photos"] = [_photo_to_dict(p) for p in photos]
        out["photo_count"] = len(out["photos"])
    if include_events:
        events = (
            db.query(FieldworkRecordEvent)
            .filter(FieldworkRecordEvent.record_id == row.id)
            .order_by(FieldworkRecordEvent.created_at.asc())
            .all()
        )
        out["events"] = [
            {
                "id": str(e.id),
                "event_type": e.event_type,
                "from_status": e.from_status,
                "to_status": e.to_status,
                "message": e.message,
                "meta": e.meta,
                "created_at": e.created_at.isoformat() if e.created_at else None,
                "created_by": str(e.created_by) if e.created_by else None,
                "created_by_name": _resolve_user_label(db, e.created_by),
            }
            for e in events
        ]
    return out


def _assert_editable(row: FieldworkRecord) -> None:
    if row.status not in EDITABLE_STATUSES:
        raise HTTPException(status_code=409, detail=f"Record status '{row.status}' is not editable")


def _bump_row_version(row: FieldworkRecord, expected: Optional[int]) -> None:
    current = int(row.row_version or 1)
    if expected is not None and int(expected) != current:
        raise HTTPException(
            status_code=409,
            detail={"message": "Record was modified elsewhere", "row_version": current},
        )
    row.row_version = current + 1


def _assert_file_belongs_to_project(db: Session, project: Project, file_object_id: uuid.UUID) -> FileObject:
    fo = db.query(FileObject).filter(FileObject.id == file_object_id).first()
    if not fo:
        raise HTTPException(status_code=404, detail="File object not found")
    if fo.project_id and str(fo.project_id) != str(project.id):
        raise HTTPException(status_code=400, detail="File object belongs to another project")
    return fo


def _assert_client_file_link(
    db: Session, project: Project, client_file_id: uuid.UUID, file_object_id: uuid.UUID
) -> ClientFile:
    cf = db.query(ClientFile).filter(ClientFile.id == client_file_id, ClientFile.deleted_at.is_(None)).first()
    if not cf:
        raise HTTPException(status_code=404, detail="Client file not found")
    if str(cf.client_id) != str(project.client_id):
        raise HTTPException(status_code=400, detail="Client file does not belong to this project's customer")
    if str(cf.file_object_id) != str(file_object_id):
        raise HTTPException(status_code=400, detail="client_file_id does not match file_object_id")
    fo = db.query(FileObject).filter(FileObject.id == file_object_id).first()
    if fo and fo.project_id and str(fo.project_id) != str(project.id):
        raise HTTPException(status_code=400, detail="Client file project mismatch")
    return cf


def _validate_photos_for_submit(db: Session, record: FieldworkRecord) -> None:
    """Submit gate: require frozen snapshots (historical), not live library membership."""
    photos = (
        db.query(FieldworkPhotoObservation)
        .filter(FieldworkPhotoObservation.record_id == record.id)
        .all()
    )
    settings = record.settings_snapshot if isinstance(record.settings_snapshot, dict) else {}
    min_photos = int(settings.get("require_min_photos") or 0)
    if len(photos) < min_photos:
        raise HTTPException(
            status_code=400,
            detail=f"At least {min_photos} classified photo(s) required for this template",
        )
    for p in photos:
        if (p.entry_type or "") not in ENTRY_TYPES:
            raise HTTPException(status_code=400, detail="Each photo requires a valid entry_type")
        phrase = (p.phrase_text_snapshot or "").strip()
        if not phrase:
            raise HTTPException(
                status_code=400,
                detail="Every technical photo must have a server-derived phrase snapshot before submit",
            )


# ----- schemas -----


class FieldworkCreateBody(BaseModel):
    kind: str = Field(..., description="site_assessment | work_report")
    form_template_id: str
    form_payload: Optional[dict] = None


class FieldworkPatchBody(BaseModel):
    form_payload: Optional[dict] = None
    final_comments: Optional[str] = None
    expected_row_version: Optional[int] = None


class FieldworkSubmitBody(BaseModel):
    final_comments: Optional[str] = None
    expected_row_version: Optional[int] = None
    idempotency_key: Optional[str] = None


class FieldworkReviewBody(BaseModel):
    review_note: Optional[str] = None
    expected_row_version: Optional[int] = None
    idempotency_key: Optional[str] = None


class FieldworkPhotoCreateBody(BaseModel):
    file_object_id: str
    client_file_id: Optional[str] = None
    entry_type: str
    phrase_item_id: str = Field(..., description="Required leaf phrase from the Fieldwork catalog")
    classification_item_id: Optional[str] = None
    # Client-supplied snapshot strings are ignored; server derives from the catalog.
    extra_notes: Optional[str] = None
    sort_order: Optional[int] = None
    client_mutation_id: Optional[str] = Field(
        None, max_length=100, description="Idempotent create key from mobile client"
    )
    expected_row_version: Optional[int] = None


class FieldworkPhotoPatchBody(BaseModel):
    entry_type: Optional[str] = None
    phrase_item_id: Optional[str] = None
    classification_item_id: Optional[str] = None
    extra_notes: Optional[str] = None
    sort_order: Optional[int] = None
    client_file_id: Optional[str] = None
    expected_row_version: Optional[int] = None


# ----- endpoints -----


@router.get("/fieldwork/phrase-catalogs")
def get_fieldwork_phrase_catalogs(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return the two Fieldwork phrase list IDs (creates empty catalogs if missing)."""
    from ..auth.security import user_has_any_rm_fieldwork_permission
    from ..services.fieldwork_phrases import (
        ENTRY_TYPE_TO_LIST_NAME,
        OBSERVED_CONDITIONS_LIST_NAME,
        WORK_PERFORMED_LIST_NAME,
        ensure_fieldwork_phrase_lists,
    )

    if not user_has_any_rm_fieldwork_permission(user, "read"):
        raise HTTPException(status_code=403, detail="Forbidden")
    ids = ensure_fieldwork_phrase_lists(db, commit=True)
    return {
        "observation": {
            "entry_type": FIELDWORK_PHOTO_ENTRY_OBSERVATION,
            "list_name": OBSERVED_CONDITIONS_LIST_NAME,
            "list_id": ids.get(FIELDWORK_PHOTO_ENTRY_OBSERVATION),
        },
        "work_performed": {
            "entry_type": FIELDWORK_PHOTO_ENTRY_WORK_PERFORMED,
            "list_name": WORK_PERFORMED_LIST_NAME,
            "list_id": ids.get(FIELDWORK_PHOTO_ENTRY_WORK_PERFORMED),
        },
        "lists": ENTRY_TYPE_TO_LIST_NAME,
    }


def _list_records_for_project(
    db: Session,
    proj: Project,
    *,
    kind: Optional[str] = None,
    status: Optional[str] = None,
) -> list:
    q = db.query(FieldworkRecord).filter(FieldworkRecord.project_id == proj.id)
    if kind:
        k = kind.strip().lower()
        if k not in KINDS:
            raise HTTPException(status_code=400, detail="Invalid kind")
        q = q.filter(FieldworkRecord.kind == k)
    if status:
        q = q.filter(FieldworkRecord.status == status.strip().lower())
    rows = q.order_by(FieldworkRecord.created_at.desc()).all()
    return [_record_to_dict(db, r) for r in rows]


@router.get("/fieldwork/records")
def list_fieldwork_records(
    project_id: Optional[str] = Query(None),
    kind: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not project_id:
        raise HTTPException(status_code=400, detail="project_id is required")
    proj = _load_project(db, project_id)
    assert_rm_fieldwork_project(db, user, proj, "read")
    return _list_records_for_project(db, proj, kind=kind, status=status)


@router.get("/projects/{project_id}/fieldwork-records")
def list_project_fieldwork_records(
    project_id: str,
    kind: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Project-scoped list (same payload as GET /fieldwork/records). Prefer this from web/Vite."""
    proj = _load_project(db, project_id)
    assert_rm_fieldwork_project(db, user, proj, "read")
    return _list_records_for_project(db, proj, kind=kind, status=status)


@router.post("/projects/{project_id}/fieldwork-records")
def create_fieldwork_record(
    project_id: str,
    body: FieldworkCreateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    proj = _load_project(db, project_id)
    assert_rm_fieldwork_project(db, user, proj, "write")
    kind = (body.kind or "").strip().lower()
    if kind not in KINDS:
        raise HTTPException(status_code=400, detail="kind must be site_assessment or work_report")
    try:
        tid = uuid.UUID(str(body.form_template_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid form_template_id")
    tpl = db.query(FormTemplate).filter(FormTemplate.id == tid).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Form template not found")
    cat = normalized_template_category(tpl.category)
    if not is_fieldwork_template_category(cat):
        raise HTTPException(status_code=400, detail="Template is not a Fieldwork template")
    if cat != kind:
        raise HTTPException(status_code=400, detail="Template category must match record kind")
    if (tpl.status or "").lower() != "active":
        raise HTTPException(status_code=400, detail="Template is not active")
    definition = tpl.definition if isinstance(tpl.definition, dict) else {"sections": []}
    settings = _settings_from_template(tpl, kind)
    now = _utcnow()
    row = FieldworkRecord(
        project_id=proj.id,
        kind=kind,
        form_template_id=tpl.id,
        form_definition_snapshot=definition,
        form_payload=body.form_payload if isinstance(body.form_payload, dict) else {},
        settings_snapshot=settings,
        status="draft",
        version=1,
        row_version=1,
        created_by=user.id,
        updated_at=now,
        updated_by=user.id,
    )
    db.add(row)
    db.flush()
    _add_event(db, row, event_type="created", user=user, to_status="draft")
    db.commit()
    db.refresh(row)
    return _record_to_dict(db, row, include_photos=True, include_events=True)


@router.get("/projects/{project_id}/fieldwork-records/{record_id}")
def get_fieldwork_record(
    project_id: str,
    record_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    proj = _load_project(db, project_id)
    assert_rm_fieldwork_project(db, user, proj, "read")
    row = _load_record(db, proj.id, record_id)
    return _record_to_dict(db, row, include_photos=True, include_events=True)


@router.patch("/projects/{project_id}/fieldwork-records/{record_id}")
def patch_fieldwork_record(
    project_id: str,
    record_id: str,
    body: FieldworkPatchBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    proj = _load_project(db, project_id)
    assert_rm_fieldwork_project(db, user, proj, "write")
    row = _load_record(db, proj.id, record_id, for_update=True)
    _assert_editable(row)
    _bump_row_version(row, body.expected_row_version)
    if body.form_payload is not None:
        if not isinstance(body.form_payload, dict):
            raise HTTPException(status_code=400, detail="form_payload must be an object")
        row.form_payload = body.form_payload
    if body.final_comments is not None:
        row.final_comments = body.final_comments
    row.updated_at = _utcnow()
    row.updated_by = user.id
    _add_event(db, row, event_type="updated", user=user, from_status=row.status, to_status=row.status)
    db.commit()
    db.refresh(row)
    return _record_to_dict(db, row, include_photos=True, include_events=True)


@router.post("/projects/{project_id}/fieldwork-records/{record_id}/submit")
def submit_fieldwork_record(
    project_id: str,
    record_id: str,
    body: FieldworkSubmitBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    proj = _load_project(db, project_id)
    assert_rm_fieldwork_project(db, user, proj, "write")
    row = _load_record(db, proj.id, record_id, for_update=True)
    key = (body.idempotency_key or idempotency_key or "").strip() or None
    if row.status == STATUS_SUBMITTED:
        return _record_to_dict(db, row, include_photos=True, include_events=True)
    _assert_editable(row)
    _bump_row_version(row, body.expected_row_version)
    if body.final_comments is not None:
        row.final_comments = body.final_comments
    settings = row.settings_snapshot if isinstance(row.settings_snapshot, dict) else {}
    if settings.get("require_final_comments", False) and not (row.final_comments or "").strip():
        raise HTTPException(status_code=400, detail="final_comments are required before submit")
    _validate_photos_for_submit(db, row)
    prev = row.status
    row.status = STATUS_SUBMITTED
    row.submitted_at = _utcnow()
    row.submitted_by = user.id
    row.updated_at = row.submitted_at
    row.updated_by = user.id
    _add_event(
        db,
        row,
        event_type="submitted",
        user=user,
        from_status=prev,
        to_status=STATUS_SUBMITTED,
        meta={"idempotency_key": key} if key else None,
    )
    db.commit()
    db.refresh(row)
    return _record_to_dict(db, row, include_photos=True, include_events=True)


@router.post("/projects/{project_id}/fieldwork-records/{record_id}/request-changes")
def request_fieldwork_changes(
    project_id: str,
    record_id: str,
    body: FieldworkReviewBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    proj = _load_project(db, project_id)
    assert_rm_fieldwork_project(db, user, proj, "review")
    row = _load_record(db, proj.id, record_id, for_update=True)
    if row.status == STATUS_CHANGES_REQUESTED:
        return _record_to_dict(db, row, include_photos=True, include_events=True)
    if row.status != STATUS_SUBMITTED:
        raise HTTPException(status_code=409, detail="Only submitted records can request changes")
    if row.status == TERMINAL_APPROVED:
        raise HTTPException(status_code=409, detail="Approved records are immutable; create a revision")
    _bump_row_version(row, body.expected_row_version)
    note = (body.review_note or "").strip()
    if not note:
        raise HTTPException(status_code=400, detail="review_note is required")
    prev = row.status
    row.status = STATUS_CHANGES_REQUESTED
    row.review_note = note
    row.reviewed_at = _utcnow()
    row.reviewed_by = user.id
    row.updated_at = row.reviewed_at
    row.updated_by = user.id
    _add_event(
        db,
        row,
        event_type="changes_requested",
        user=user,
        from_status=prev,
        to_status=STATUS_CHANGES_REQUESTED,
        message=note,
    )
    db.commit()
    db.refresh(row)
    return _record_to_dict(db, row, include_photos=True, include_events=True)


@router.post("/projects/{project_id}/fieldwork-records/{record_id}/approve")
def approve_fieldwork_record(
    project_id: str,
    record_id: str,
    body: FieldworkReviewBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    proj = _load_project(db, project_id)
    assert_rm_fieldwork_project(db, user, proj, "review")
    row = _load_record(db, proj.id, record_id, for_update=True)
    if row.status == TERMINAL_APPROVED:
        return _record_to_dict(db, row, include_photos=True, include_events=True)
    if row.status != STATUS_SUBMITTED:
        raise HTTPException(status_code=409, detail="Only submitted records can be approved")
    _bump_row_version(row, body.expected_row_version)
    prev = row.status
    row.status = TERMINAL_APPROVED
    row.approved_at = _utcnow()
    row.approved_by = user.id
    row.reviewed_at = row.approved_at
    row.reviewed_by = user.id
    row.updated_at = row.approved_at
    row.updated_by = user.id
    if body.review_note:
        row.review_note = body.review_note.strip() or row.review_note
    _add_event(
        db,
        row,
        event_type="approved",
        user=user,
        from_status=prev,
        to_status=TERMINAL_APPROVED,
        message=(body.review_note or "").strip() or None,
    )
    db.commit()
    db.refresh(row)
    return _record_to_dict(db, row, include_photos=True, include_events=True)


@router.post("/projects/{project_id}/fieldwork-records/{record_id}/revisions")
def create_fieldwork_revision(
    project_id: str,
    record_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create an editable revision of an approved record (post-approval immutability)."""
    proj = _load_project(db, project_id)
    assert_rm_fieldwork_project(db, user, proj, "write")
    src = _load_record(db, proj.id, record_id)
    if src.status != TERMINAL_APPROVED:
        raise HTTPException(status_code=409, detail="Only approved records can be revised")
    if src.superseded_by_id:
        existing = db.query(FieldworkRecord).filter(FieldworkRecord.id == src.superseded_by_id).first()
        if existing:
            return _record_to_dict(db, existing, include_photos=True, include_events=True)

    now = _utcnow()
    rev = FieldworkRecord(
        project_id=src.project_id,
        kind=src.kind,
        form_template_id=src.form_template_id,
        form_definition_snapshot=src.form_definition_snapshot,
        form_payload=dict(src.form_payload or {}),
        settings_snapshot=dict(src.settings_snapshot or {}),
        status="draft",
        final_comments=src.final_comments,
        version=int(src.version or 1) + 1,
        revision_of_id=src.id,
        row_version=1,
        created_by=user.id,
        updated_at=now,
        updated_by=user.id,
    )
    db.add(rev)
    db.flush()
    photos = (
        db.query(FieldworkPhotoObservation)
        .filter(FieldworkPhotoObservation.record_id == src.id)
        .order_by(FieldworkPhotoObservation.sort_order.asc())
        .all()
    )
    for p in photos:
        db.add(
            FieldworkPhotoObservation(
                record_id=rev.id,
                file_object_id=p.file_object_id,
                client_file_id=p.client_file_id,
                sort_order=p.sort_order,
                entry_type=p.entry_type,
                classification_item_id=p.classification_item_id,
                phrase_item_id=p.phrase_item_id,
                classification_snapshot=p.classification_snapshot,
                phrase_text_snapshot=p.phrase_text_snapshot,
                extra_notes=p.extra_notes,
                created_by=user.id,
            )
        )
    src.status = STATUS_SUPERSEDED
    src.superseded_by_id = rev.id
    src.updated_at = now
    src.updated_by = user.id
    _add_event(
        db,
        src,
        event_type="superseded",
        user=user,
        from_status=TERMINAL_APPROVED,
        to_status=STATUS_SUPERSEDED,
        meta={"revision_id": str(rev.id)},
    )
    _add_event(
        db,
        rev,
        event_type="revision_created",
        user=user,
        to_status="draft",
        meta={"revision_of_id": str(src.id)},
    )
    db.commit()
    db.refresh(rev)
    return _record_to_dict(db, rev, include_photos=True, include_events=True)


@router.get("/projects/{project_id}/fieldwork-records/{record_id}/photos")
def list_fieldwork_photos(
    project_id: str,
    record_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    proj = _load_project(db, project_id)
    assert_rm_fieldwork_project(db, user, proj, "read")
    row = _load_record(db, proj.id, record_id)
    photos = (
        db.query(FieldworkPhotoObservation)
        .filter(FieldworkPhotoObservation.record_id == row.id)
        .order_by(FieldworkPhotoObservation.sort_order.asc())
        .all()
    )
    return [_photo_to_dict(p) for p in photos]


@router.post("/projects/{project_id}/fieldwork-records/{record_id}/photos")
def create_fieldwork_photo(
    project_id: str,
    record_id: str,
    body: FieldworkPhotoCreateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    proj = _load_project(db, project_id)
    assert_rm_fieldwork_project(db, user, proj, "write")
    row = _load_record(db, proj.id, record_id, for_update=True)
    _assert_editable(row)
    _bump_row_version(row, body.expected_row_version)

    mutation = (body.client_mutation_id or "").strip() or None
    if mutation:
        existing = (
            db.query(FieldworkPhotoObservation)
            .filter(
                FieldworkPhotoObservation.record_id == row.id,
                FieldworkPhotoObservation.client_mutation_id == mutation,
            )
            .first()
        )
        if existing:
            return _photo_to_dict(existing)

    try:
        fo_id = uuid.UUID(str(body.file_object_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file_object_id")
    _assert_file_belongs_to_project(db, proj, fo_id)

    dup = (
        db.query(FieldworkPhotoObservation)
        .filter(
            FieldworkPhotoObservation.record_id == row.id,
            FieldworkPhotoObservation.file_object_id == fo_id,
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="This file is already linked on the record")

    cf_id = None
    if body.client_file_id:
        try:
            cf_id = uuid.UUID(str(body.client_file_id))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid client_file_id")
        _assert_client_file_link(db, proj, cf_id, fo_id)

    entry = (body.entry_type or "").strip().lower()
    if entry not in ENTRY_TYPES:
        raise HTTPException(status_code=400, detail="entry_type must be observation or work_performed")
    try:
        phrase_uuid = uuid.UUID(str(body.phrase_item_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid phrase_item_id")
    class_uuid = None
    if body.classification_item_id:
        try:
            class_uuid = uuid.UUID(str(body.classification_item_id))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid classification_item_id")

    class_snap, phrase_snap, class_id, phrase_id = resolve_phrase_snapshots(
        db,
        entry_type=entry,
        phrase_item_id=phrase_uuid,
        classification_item_id=class_uuid,
        require_active=True,
    )

    sort_order = body.sort_order
    if sort_order is None:
        max_so = (
            db.query(FieldworkPhotoObservation.sort_order)
            .filter(FieldworkPhotoObservation.record_id == row.id)
            .order_by(FieldworkPhotoObservation.sort_order.desc())
            .first()
        )
        sort_order = (max_so[0] + 1) if max_so and max_so[0] is not None else 0

    fo = db.query(FileObject).filter(FileObject.id == fo_id).first()
    if fo and not fo.project_id:
        fo.project_id = proj.id

    # Ensure a single ClientFile exists in the template's pictures folder (no disconnected store).
    if cf_id is None:
        from ..services.fieldwork_files import ensure_client_file_attached

        settings = row.settings_snapshot if isinstance(row.settings_snapshot, dict) else {}
        folder = _normalize_pictures_folder(
            settings.get("default_pictures_folder") if isinstance(settings.get("default_pictures_folder"), str) else None,
            kind=row.kind,
        )
        cf_row = ensure_client_file_attached(
            db,
            project=proj,
            file_object_id=fo_id,
            category=folder,
            original_name=getattr(fo, "original_name", None) if fo else None,
        )
        cf_id = cf_row.id

    photo = FieldworkPhotoObservation(
        record_id=row.id,
        file_object_id=fo_id,
        client_file_id=cf_id,
        sort_order=int(sort_order),
        entry_type=entry,
        classification_item_id=class_id,
        phrase_item_id=phrase_id,
        classification_snapshot=class_snap,
        phrase_text_snapshot=phrase_snap,
        extra_notes=(body.extra_notes or "").strip() or None,
        client_mutation_id=mutation,
        created_by=user.id,
    )
    db.add(photo)
    row.updated_at = _utcnow()
    row.updated_by = user.id
    _add_event(db, row, event_type="photo_added", user=user, meta={"file_object_id": str(fo_id)})
    try:
        db.commit()
    except Exception:
        db.rollback()
        if mutation:
            existing = (
                db.query(FieldworkPhotoObservation)
                .filter(
                    FieldworkPhotoObservation.record_id == row.id,
                    FieldworkPhotoObservation.client_mutation_id == mutation,
                )
                .first()
            )
            if existing:
                return _photo_to_dict(existing)
        raise
    db.refresh(photo)
    return _photo_to_dict(photo)


@router.patch("/projects/{project_id}/fieldwork-records/{record_id}/photos/{photo_id}")
def patch_fieldwork_photo(
    project_id: str,
    record_id: str,
    photo_id: str,
    body: FieldworkPhotoPatchBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    proj = _load_project(db, project_id)
    assert_rm_fieldwork_project(db, user, proj, "write")
    row = _load_record(db, proj.id, record_id, for_update=True)
    _assert_editable(row)
    _bump_row_version(row, body.expected_row_version)
    try:
        pid = uuid.UUID(str(photo_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid photo_id")
    photo = (
        db.query(FieldworkPhotoObservation)
        .filter(FieldworkPhotoObservation.id == pid, FieldworkPhotoObservation.record_id == row.id)
        .first()
    )
    if not photo:
        raise HTTPException(status_code=404, detail="Photo observation not found")

    entry = (body.entry_type or photo.entry_type or "").strip().lower()
    if entry not in ENTRY_TYPES:
        raise HTTPException(status_code=400, detail="Invalid entry_type")

    # Re-resolve snapshots whenever phrase / entry / classification changes
    phrase_changed = body.phrase_item_id is not None or body.entry_type is not None or body.classification_item_id is not None
    if phrase_changed:
        raw_phrase = body.phrase_item_id if body.phrase_item_id is not None else str(photo.phrase_item_id or "")
        if not raw_phrase:
            raise HTTPException(status_code=400, detail="phrase_item_id is required")
        try:
            phrase_uuid = uuid.UUID(str(raw_phrase))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid phrase_item_id")
        class_uuid = None
        if body.classification_item_id is not None:
            if body.classification_item_id != "":
                class_uuid = uuid.UUID(str(body.classification_item_id))
        elif photo.classification_item_id:
            class_uuid = photo.classification_item_id
        class_snap, phrase_snap, class_id, phrase_id = resolve_phrase_snapshots(
            db,
            entry_type=entry,
            phrase_item_id=phrase_uuid,
            classification_item_id=class_uuid,
            require_active=True,
        )
        photo.entry_type = entry
        photo.phrase_item_id = phrase_id
        photo.classification_item_id = class_id
        photo.classification_snapshot = class_snap
        photo.phrase_text_snapshot = phrase_snap

    if body.extra_notes is not None:
        photo.extra_notes = body.extra_notes.strip() or None
    if body.sort_order is not None:
        photo.sort_order = int(body.sort_order)
    if body.client_file_id is not None:
        if body.client_file_id == "":
            photo.client_file_id = None
        else:
            cf_id = uuid.UUID(str(body.client_file_id))
            _assert_client_file_link(db, proj, cf_id, photo.file_object_id)
            photo.client_file_id = cf_id
    photo.updated_at = _utcnow()
    photo.updated_by = user.id
    row.updated_at = photo.updated_at
    row.updated_by = user.id
    db.commit()
    db.refresh(photo)
    return _photo_to_dict(photo)


@router.delete("/projects/{project_id}/fieldwork-records/{record_id}/photos/{photo_id}")
def delete_fieldwork_photo(
    project_id: str,
    record_id: str,
    photo_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    proj = _load_project(db, project_id)
    assert_rm_fieldwork_project(db, user, proj, "write")
    row = _load_record(db, proj.id, record_id, for_update=True)
    _assert_editable(row)
    # Bump parent version so concurrent submit sees a conflict if expected_row_version is used
    _bump_row_version(row, None)
    try:
        pid = uuid.UUID(str(photo_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid photo_id")
    photo = (
        db.query(FieldworkPhotoObservation)
        .filter(FieldworkPhotoObservation.id == pid, FieldworkPhotoObservation.record_id == row.id)
        .first()
    )
    if not photo:
        raise HTTPException(status_code=404, detail="Photo observation not found")
    db.delete(photo)
    row.updated_at = _utcnow()
    row.updated_by = user.id
    _add_event(db, row, event_type="photo_removed", user=user, meta={"photo_id": str(pid)})
    db.commit()
    return {"ok": True}
