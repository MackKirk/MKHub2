"""Document Builder send-for-signature (multi-signer Employee → Company → Other)."""
from __future__ import annotations

import io
import json
import re
from datetime import datetime, timezone
from typing import List, Optional, Tuple
from uuid import UUID

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..auth.security import get_current_user, require_permissions, _has_permission
from ..db import get_db
from ..models.models import (
    DocumentSignatureParticipant,
    DocumentSignatureRequest,
    EmployeeDocument,
    EmployeeProfile,
    FileObject,
    Notification,
    User,
    UserDocument,
)
from ..routes.files import canonical_key, get_storage
from ..services.onboarding_sign import (
    apply_template_field_overlays,
    build_signed_pdf_with_certificate_from_merged,
)
from ..services.onboarding_signature_template import (
    filter_fields_for_document_role,
    get_pdf_page_sizes,
    normalize_document_assignee,
    roles_present_in_template,
    template_is_active,
    validate_and_normalize_template,
    validate_field_values_for_signing,
)
from ..services.document_signer_roles import (
    employee_token_user_from_assignments,
    ensure_document_signer_roles,
    hr_documents_owner_user_id,
    order_role_ids_present,
    role_label_map,
)
from ..services.onboarding_assign import get_or_create_hr_documents_folder
from ..services.onboarding_storage import read_file_object_bytes
from ..services.signature_compliance import set_participant_turn_deadline
from ..services.task_service import get_user_display
from ..services.audit import create_audit_log
from ..storage.local_provider import LocalStorageProvider
from ..utils.pdf_hash import sha256_bytes

router = APIRouter(prefix="/document-creator", tags=["document-signature-requests"])
me_router = APIRouter(prefix="/auth/me/document-signature-requests", tags=["document-signature-requests-me"])

ROLE_LABEL = {"employee": "Employee", "company": "Company", "other": "Other"}


def _participant_role_label(p: DocumentSignatureParticipant) -> str:
    if getattr(p, "role_label", None):
        return str(p.role_label)
    return ROLE_LABEL.get(p.role, p.role)


def _parse_signing_settings(payload: dict, user: User) -> tuple[Optional[int], bool, Optional[str]]:
    raw_days = payload.get("signing_deadline_days")
    signing_deadline_days: Optional[int] = None
    if raw_days is not None and str(raw_days).strip() != "":
        signing_deadline_days = int(raw_days)
        if signing_deadline_days < 1:
            raise HTTPException(400, "signing_deadline_days must be >= 1")
    block_hub_access = bool(payload.get("block_hub_access", False))
    if block_hub_access:
        if not _has_permission(user, "documents:signatures:block_access"):
            raise HTTPException(403, "Forbidden: missing permission (documents:signatures:block_access)")
        if signing_deadline_days is None:
            raise HTTPException(400, "signing_deadline_days required when block_hub_access is enabled")
    message = payload.get("message_to_signers")
    if message is not None:
        message = str(message).strip()[:4000] or None
    return signing_deadline_days, block_hub_access, message


def _signature_notification_link() -> str:
    return "/personal/signatures"


def _client_ip(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if forwarded:
        return forwarded[:64]
    if request.client and request.client.host:
        return str(request.client.host)[:64]
    return ""


def save_document_signature_pdf(
    db: Session,
    pdf_bytes: bytes,
    *,
    original_name: str,
    category: str,
    owner_user_id: UUID,
    created_by_id: Optional[UUID] = None,
) -> FileObject:
    storage = get_storage()
    key = canonical_key(
        project_code="documents",
        slug=str(owner_user_id)[:8],
        category=category,
        original_name=original_name or "document.pdf",
    )
    bio = io.BytesIO(pdf_bytes)
    bio.seek(0)
    storage.copy_in(bio, key)
    if isinstance(storage, LocalStorageProvider):
        provider, container = "local", "local"
    else:
        from ..config import settings

        provider, container = "blob", settings.azure_blob_container or ""
    fo = FileObject(
        provider=provider,
        container=container,
        key=key,
        size_bytes=len(pdf_bytes),
        checksum_sha256=sha256_bytes(pdf_bytes),
        content_type="application/pdf",
        employee_id=owner_user_id,
        created_by=created_by_id,
    )
    db.add(fo)
    db.flush()
    return fo


def _participants_for(db: Session, request_id: UUID) -> List[DocumentSignatureParticipant]:
    return (
        db.query(DocumentSignatureParticipant)
        .filter(DocumentSignatureParticipant.request_id == request_id)
        .order_by(DocumentSignatureParticipant.sort_order.asc())
        .all()
    )


def _request_dict(
    row: DocumentSignatureRequest,
    db: Session,
    *,
    my_participant: Optional[DocumentSignatureParticipant] = None,
) -> dict:
    requester = get_user_display(db, row.requested_by_id) if row.requested_by_id else None
    signer = get_user_display(db, row.signer_user_id)
    parts = _participants_for(db, row.id)
    participants = [
        {
            "id": str(p.id),
            "role": p.role,
            "role_label": _participant_role_label(p),
            "signer_user_id": str(p.signer_user_id),
            "signer_name": get_user_display(db, p.signer_user_id),
            "sort_order": p.sort_order,
            "status": p.status,
            "signed_at": p.signed_at.isoformat() if p.signed_at else None,
            "available_at": p.available_at.isoformat() if getattr(p, "available_at", None) and p.available_at else None,
            "deadline_at": p.deadline_at.isoformat() if getattr(p, "deadline_at", None) and p.deadline_at else None,
        }
        for p in parts
    ]
    out = {
        "id": str(row.id),
        "user_document_id": str(row.user_document_id),
        "display_name": row.display_name,
        "status": row.status,
        "signing_deadline_days": getattr(row, "signing_deadline_days", None),
        "block_hub_access": bool(getattr(row, "block_hub_access", False)),
        "message_to_signers": getattr(row, "message_to_signers", None),
        "cancelled_at": row.cancelled_at.isoformat() if getattr(row, "cancelled_at", None) and row.cancelled_at else None,
        "signer_user_id": str(row.signer_user_id),
        "signer_name": signer,
        "requested_by_id": str(row.requested_by_id) if row.requested_by_id else None,
        "requested_by_name": requester,
        "signed_file_id": str(row.signed_file_id) if row.signed_file_id else None,
        "signed_at": row.signed_at.isoformat() if row.signed_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "participants": participants,
    }
    if my_participant is not None:
        out["my_role"] = my_participant.role
        out["my_role_label"] = _participant_role_label(my_participant)
        out["my_status"] = my_participant.status
        out["my_signed_at"] = (
            my_participant.signed_at.isoformat() if my_participant.signed_at else None
        )
    return out


def _fields_for_signer(template: Optional[dict], role: Optional[str] = None) -> list:
    """Fields for one role; if role is None, return all (tests / admin)."""
    if role is None:
        if not template or not isinstance(template.get("fields"), list):
            return []
        return [f for f in template["fields"] if isinstance(f, dict)]
    return filter_fields_for_document_role(template, role)


def _can_access_doc_write(user: User, doc: UserDocument, db: Session) -> bool:
    from ..auth.security import _has_project_feature_permission, _user_is_admin
    from ..models.models import Project

    if _user_is_admin(user):
        return True
    if doc.created_by == user.id:
        return True
    if not doc.project_id:
        return False
    proj = db.query(Project).filter(Project.id == doc.project_id).first()
    if not proj:
        return False
    line = getattr(proj, "business_line", None)
    return _has_project_feature_permission(user, line, "documents", "write")


def link_standalone_doc_to_employee_subject(doc: UserDocument, employee_user_id: Optional[UUID]) -> bool:
    """
    When sending from the hub Document Builder, attach the doc to the Employee assignee's
    user profile Document Builder (subject_user_id). Skip project-scoped docs.
    Returns True if subject_user_id was set/updated.
    """
    if not employee_user_id:
        return False
    if getattr(doc, "project_id", None):
        return False
    doc.subject_user_id = employee_user_id
    return True


def _parse_assignments(payload: dict, required_roles: List[str]) -> dict:
    """Return role id → UUID for each required role."""
    raw = payload.get("assignments")
    if not isinstance(raw, dict):
        # Legacy single-signer: one role only
        if payload.get("signer_user_id") and len(required_roles) == 1:
            try:
                return {required_roles[0]: UUID(str(payload.get("signer_user_id")))}
            except Exception:
                raise HTTPException(400, "signer_user_id invalid")
        raise HTTPException(400, "assignments object required (map role ids to user ids)")

    out = {}
    for role in required_roles:
        val = raw.get(role)
        if not val:
            raise HTTPException(400, f"assignments.{role} required")
        try:
            out[role] = UUID(str(val))
        except Exception:
            raise HTTPException(400, f"assignments.{role} must be a user id")
    return out


def _parse_signing_order(payload: dict, required_roles: List[str]) -> List[str]:
    """
    Optional signing_order: permutation of required_roles.
    If omitted/empty, return required_roles unchanged (catalog order).
    """
    raw = payload.get("signing_order")
    if raw is None or raw == []:
        return list(required_roles)
    if not isinstance(raw, list):
        raise HTTPException(400, "signing_order must be a list of signer ids")
    ordered = [str(x).strip() for x in raw if str(x).strip()]
    if not ordered:
        return list(required_roles)
    required_set = set(required_roles)
    ordered_set = set(ordered)
    if len(ordered) != len(ordered_set):
        raise HTTPException(400, "signing_order must not contain duplicates")
    if ordered_set != required_set:
        missing = required_set - ordered_set
        extra = ordered_set - required_set
        parts = []
        if missing:
            parts.append(f"missing {sorted(missing)}")
        if extra:
            parts.append(f"unknown {sorted(extra)}")
        raise HTTPException(400, "signing_order must list each required signer exactly once (" + "; ".join(parts) + ")")
    return ordered


def _participant_for_user(
    db: Session, request_id: UUID, user_id: UUID
) -> Optional[DocumentSignatureParticipant]:
    """Prefer the ready turn for this user; else earliest by sort_order."""
    ready = (
        db.query(DocumentSignatureParticipant)
        .filter(
            DocumentSignatureParticipant.request_id == request_id,
            DocumentSignatureParticipant.signer_user_id == user_id,
            DocumentSignatureParticipant.status == "ready",
        )
        .first()
    )
    if ready:
        return ready
    return (
        db.query(DocumentSignatureParticipant)
        .filter(
            DocumentSignatureParticipant.request_id == request_id,
            DocumentSignatureParticipant.signer_user_id == user_id,
        )
        .order_by(DocumentSignatureParticipant.sort_order.asc())
        .first()
    )


def _ready_participant(
    db: Session, request_id: UUID, user_id: UUID
) -> Optional[DocumentSignatureParticipant]:
    return (
        db.query(DocumentSignatureParticipant)
        .filter(
            DocumentSignatureParticipant.request_id == request_id,
            DocumentSignatureParticipant.signer_user_id == user_id,
            DocumentSignatureParticipant.status == "ready",
        )
        .first()
    )


def _current_pdf_id(row: DocumentSignatureRequest) -> UUID:
    return row.current_pdf_file_id or row.source_pdf_file_id


@router.post("/documents/{document_id}/send-for-signature")
def send_for_signature(
    document_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:write", "business:projects:documents:write")),
):
    try:
        did = UUID(document_id)
    except Exception:
        raise HTTPException(400, "Invalid document id")
    doc = db.query(UserDocument).filter(UserDocument.id == did).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    if not _can_access_doc_write(user, doc, db):
        raise HTTPException(403, "Forbidden")

    from ..document_creator.pdf_builder import build_pdf_bytes
    from ..document_creator.signature_fields import build_signature_template_payload
    from .document_creator import _pages_with_project_tokens

    roles_catalog = ensure_document_signer_roles(getattr(doc, "signer_roles", None), doc.pages)
    labels = role_label_map(roles_catalog)

    peek = build_signature_template_payload(doc.pages or [])
    peek_fields = peek.get("fields") or []
    if not peek_fields:
        raise HTTPException(
            400,
            "Document has no signature, initials, or date fields. Add Signature, Initials, or Date in the builder first.",
        )
    present = set(roles_present_in_template(peek))
    required_roles = order_role_ids_present(roles_catalog, present)
    if not required_roles:
        raise HTTPException(400, "No signer roles found on signature fields")

    required_roles = _parse_signing_order(payload or {}, required_roles)
    assignments = _parse_assignments(payload or {}, required_roles)
    for role, uid in assignments.items():
        lbl = labels.get(role, role)
        if not db.query(User).filter(User.id == uid).first():
            raise HTTPException(400, f"User for {lbl} not found")

    emp_uid = employee_token_user_from_assignments(roles_catalog, assignments)
    employee_user_id = emp_uid  # may be None → no employee token fill

    # Link standalone hub docs to the Employee assignee's profile Document Builder.
    link_standalone_doc_to_employee_subject(doc, employee_user_id)

    original_pages = doc.pages
    tokenized = _pages_with_project_tokens(
        original_pages,
        doc.project_id,
        db,
        when=doc.created_at,
        employee_user_id=employee_user_id,
    )
    doc.pages = tokenized
    try:
        try:
            pdf_bytes = build_pdf_bytes(db, doc, canvas_width_px=910)
        except Exception as e:
            raise HTTPException(500, f"PDF generation failed: {e}")
        raw = build_signature_template_payload(tokenized)
        fields = raw.get("fields") or []
        if not fields:
            raise HTTPException(
                400,
                "Document has no signature, initials, or date fields. Add Signature, Initials, or Date in the builder first.",
            )
        for f in fields:
            if isinstance(f, dict):
                f["assignee"] = normalize_document_assignee(f.get("assignee"))
        try:
            normalized = validate_and_normalize_template(raw, pdf_bytes)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(400, f"Invalid signature template: {e}")
        for f in normalized.get("fields") or []:
            if isinstance(f, dict):
                f["assignee"] = normalize_document_assignee(f.get("assignee"))
        present = set(roles_present_in_template(normalized))
        catalog_order = order_role_ids_present(roles_catalog, present)
        # Re-apply client signing_order against fields still present after normalize
        required_roles = _parse_signing_order(payload or {}, catalog_order)
        for role in required_roles:
            if role not in assignments:
                raise HTTPException(400, f"assignments.{role} required")
    finally:
        doc.pages = original_pages

    # Persist synthesized catalog if document had none
    if not getattr(doc, "signer_roles", None):
        doc.signer_roles = roles_catalog

    first_role = required_roles[0]
    first_signer_id = assignments[first_role]

    signing_deadline_days, block_hub_access, message_to_signers = _parse_signing_settings(payload or {}, user)

    safe_title = re.sub(r"[^\w\s.-]", "", (doc.title or "document"))[:80] or "document"
    fname = f"{safe_title}_for_signature.pdf"
    source_fo = save_document_signature_pdf(
        db,
        pdf_bytes,
        original_name=fname,
        category="document-signature-request",
        owner_user_id=first_signer_id,
        created_by_id=user.id,
    )
    now = datetime.now(timezone.utc)
    row = DocumentSignatureRequest(
        user_document_id=doc.id,
        source_pdf_file_id=source_fo.id,
        current_pdf_file_id=source_fo.id,
        signature_template=normalized,
        signer_user_id=first_signer_id,
        requested_by_id=user.id,
        status="pending",
        display_name=(doc.title or "Document").strip() or "Document",
        signing_deadline_days=signing_deadline_days,
        block_hub_access=block_hub_access,
        message_to_signers=message_to_signers,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.flush()

    first_part: Optional[DocumentSignatureParticipant] = None
    for idx, role in enumerate(required_roles):
        status = "ready" if idx == 0 else "pending"
        part = DocumentSignatureParticipant(
            request_id=row.id,
            role=role,
            role_label=(labels.get(role) or role)[:120],
            signer_user_id=assignments[role],
            sort_order=idx,
            status=status,
            created_at=now,
        )
        if idx == 0:
            set_participant_turn_deadline(part, row, now=now)
            first_part = part
        db.add(part)

    disp = (doc.title or "Document").strip() or "Document"
    role_lbl = labels.get(first_role) or first_role
    db.add(
        Notification(
            user_id=first_signer_id,
            channel="push",
            template_key="document_signature_pending",
            payload_json={
                "title": "Document to sign",
                "message": f'"{disp}" is waiting for your signature ({role_lbl}).',
                "type": "default",
                "link": _signature_notification_link(),
                "read": False,
                "metadata": {
                    "request_id": str(row.id),
                    "user_document_id": str(doc.id),
                    "role": first_role,
                },
            },
            status="pending",
            created_at=now,
        )
    )
    db.commit()
    db.refresh(row)
    try:
        create_audit_log(
            db,
            entity_type="document_signature_request",
            entity_id=str(row.id),
            action="signature_request.created",
            actor_id=str(user.id),
            changes_json={
                "signing_deadline_days": signing_deadline_days,
                "block_hub_access": block_hub_access,
            },
        )
        db.commit()
    except Exception:
        db.rollback()
    return _request_dict(row, db)


@router.get("/documents/{document_id}/signature-requests")
def list_document_signature_requests(
    document_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:read", "business:projects:documents:read")),
):
    try:
        did = UUID(document_id)
    except Exception:
        raise HTTPException(400, "Invalid document id")
    doc = db.query(UserDocument).filter(UserDocument.id == did).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    from .document_creator import _can_access_document

    if not _can_access_document(user, doc, db, require_write=False):
        raise HTTPException(403, "Forbidden")
    rows = (
        db.query(DocumentSignatureRequest)
        .filter(DocumentSignatureRequest.user_document_id == did)
        .order_by(DocumentSignatureRequest.created_at.desc())
        .all()
    )
    return [_request_dict(r, db) for r in rows]


@router.get("/signature-requests")
def list_all_signature_requests(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:read", "business:projects:documents:read")),
):
    q = db.query(DocumentSignatureRequest).order_by(DocumentSignatureRequest.created_at.desc())
    if status:
        q = q.filter(DocumentSignatureRequest.status == status)
    rows = q.limit(500).all()
    return [_request_dict(r, db) for r in rows]


def _get_request_or_404(db: Session, request_id: UUID) -> DocumentSignatureRequest:
    row = db.query(DocumentSignatureRequest).filter(DocumentSignatureRequest.id == request_id).first()
    if not row:
        raise HTTPException(404, "Signature request not found")
    return row


@router.post("/signature-requests/{request_id}/cancel")
def cancel_signature_request(
    request_id: UUID,
    payload: Optional[dict] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:signatures:manage")),
):
    row = _get_request_or_404(db, request_id)
    if row.status in ("completed", "cancelled"):
        raise HTTPException(400, "Request cannot be cancelled")
    now = datetime.now(timezone.utc)
    prev_status = row.status
    row.status = "cancelled"
    row.cancelled_at = now
    row.cancelled_by_id = user.id
    row.updated_at = now
    create_audit_log(
        db,
        entity_type="document_signature_request",
        entity_id=str(row.id),
        action="signature_request.cancelled",
        actor_id=str(user.id),
        context={"reason": (payload or {}).get("reason")},
        changes_json={"status": {"before": prev_status, "after": "cancelled"}},
    )
    db.commit()
    return _request_dict(row, db)


@router.post("/signature-requests/{request_id}/extend-deadline")
def extend_signature_deadline(
    request_id: UUID,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:signatures:manage")),
):
    from datetime import timedelta

    row = _get_request_or_404(db, request_id)
    if row.status in ("completed", "cancelled"):
        raise HTTPException(400, "Request is not active")
    extra_days = payload.get("extend_days")
    new_deadline_str = payload.get("deadline_at")
    ready_part = (
        db.query(DocumentSignatureParticipant)
        .filter(
            DocumentSignatureParticipant.request_id == row.id,
            DocumentSignatureParticipant.status == "ready",
        )
        .first()
    )
    if not ready_part:
        raise HTTPException(400, "No signer is currently ready")
    before = ready_part.deadline_at.isoformat() if ready_part.deadline_at else None
    now = datetime.now(timezone.utc)
    if new_deadline_str:
        try:
            parsed = datetime.fromisoformat(str(new_deadline_str).replace("Z", "+00:00"))
            ready_part.deadline_at = parsed
        except Exception:
            raise HTTPException(400, "Invalid deadline_at")
    elif extra_days is not None:
        base = ready_part.deadline_at or now
        if base.tzinfo is None:
            base = base.replace(tzinfo=timezone.utc)
        ready_part.deadline_at = base + timedelta(days=int(extra_days))
    else:
        raise HTTPException(400, "extend_days or deadline_at required")
    row.updated_at = now
    create_audit_log(
        db,
        entity_type="document_signature_request",
        entity_id=str(row.id),
        action="signature_request.deadline_extended",
        actor_id=str(user.id),
        changes_json={"participant_deadline_at": {"before": before, "after": ready_part.deadline_at.isoformat()}},
    )
    db.commit()
    return _request_dict(row, db)


@router.post("/signature-requests/{request_id}/disable-blocking")
def disable_signature_blocking(
    request_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:signatures:manage")),
):
    row = _get_request_or_404(db, request_id)
    before = bool(row.block_hub_access)
    row.block_hub_access = False
    row.updated_at = datetime.now(timezone.utc)
    create_audit_log(
        db,
        entity_type="document_signature_request",
        entity_id=str(row.id),
        action="signature_request.blocking_disabled",
        actor_id=str(user.id),
        changes_json={"block_hub_access": {"before": before, "after": False}},
    )
    db.commit()
    return _request_dict(row, db)


@me_router.get("")
def me_list_signature_requests(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    parts = (
        db.query(DocumentSignatureParticipant)
        .filter(DocumentSignatureParticipant.signer_user_id == user.id)
        .order_by(DocumentSignatureParticipant.created_at.desc())
        .limit(200)
        .all()
    )
    # Deduplicate by request; prefer ready over other statuses for this user
    by_req: dict = {}
    for p in parts:
        prev = by_req.get(p.request_id)
        if prev is None:
            by_req[p.request_id] = p
            continue
        if p.status == "ready" and prev.status != "ready":
            by_req[p.request_id] = p
    out = []
    for p in by_req.values():
        row = db.query(DocumentSignatureRequest).filter(DocumentSignatureRequest.id == p.request_id).first()
        if not row:
            continue
        out.append(_request_dict(row, db, my_participant=p))
    out.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return out[:100]


def _row_for_participant_user(
    db: Session, request_id: UUID, user_id: UUID
) -> Tuple[DocumentSignatureRequest, DocumentSignatureParticipant]:
    part = _participant_for_user(db, request_id, user_id)
    if not part:
        raise HTTPException(404, "Not found")
    row = db.query(DocumentSignatureRequest).filter(DocumentSignatureRequest.id == request_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    return row, part


@me_router.get("/{request_id}/preview")
def me_preview(
    request_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row, _part = _row_for_participant_user(db, request_id, user.id)
    fo = db.query(FileObject).filter(FileObject.id == _current_pdf_id(row)).first()
    if not fo:
        raise HTTPException(404, "File not found")
    data = read_file_object_bytes(db, fo)
    disp = (row.display_name or "document").strip() or "document"
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{disp}.pdf"'},
    )


@me_router.get("/{request_id}/signing-context")
def me_signing_context(
    request_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row, part = _row_for_participant_user(db, request_id, user.id)
    if part.status != "ready":
        raise HTTPException(400, "It is not your turn to sign this document")
    if row.status not in ("pending", "in_progress"):
        raise HTTPException(400, "Document is not pending signature")
    fo = db.query(FileObject).filter(FileObject.id == _current_pdf_id(row)).first()
    if not fo:
        raise HTTPException(404, "File not found")
    pdf_bytes = read_file_object_bytes(db, fo)
    tmpl = row.signature_template
    fields = _fields_for_signer(tmpl, part.role)
    page_sizes = get_pdf_page_sizes(pdf_bytes)
    use_tpl = template_is_active(tmpl) and len(fields) > 0
    return {
        "request_id": str(row.id),
        "document_name": row.display_name,
        "signer_role": part.role,
        "signer_role_label": _participant_role_label(part),
        "uses_template": use_tpl,
        "signature_template": {"version": (tmpl or {}).get("version", 1), "fields": fields} if use_tpl else None,
        "page_sizes": [{"width": w, "height": h} for w, h in page_sizes],
    }


@me_router.get("/{request_id}/signed-preview")
def me_signed_preview(
    request_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row, _part = _row_for_participant_user(db, request_id, user.id)
    if not row.signed_file_id:
        raise HTTPException(404, "Signed file not found")
    fo = db.query(FileObject).filter(FileObject.id == row.signed_file_id).first()
    if not fo:
        raise HTTPException(404, "File not found")
    data = read_file_object_bytes(db, fo)
    disp = (row.display_name or "document").strip() or "document"
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{disp}_signed.pdf"'},
    )


@me_router.post("/{request_id}/sign")
async def me_sign(
    request_id: UUID,
    request: Request,
    agreement: str = Form(""),
    field_values_json: str = Form(""),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if agreement.lower() not in ("true", "1", "yes", "on"):
        raise HTTPException(400, "You must agree to sign")
    row, part = _row_for_participant_user(db, request_id, user.id)
    if row.status == "cancelled":
        raise HTTPException(400, "This signature request was cancelled")
    if part.status != "ready" or row.status not in ("pending", "in_progress"):
        raise HTTPException(400, "Invalid or already signed")

    part = (
        db.query(DocumentSignatureParticipant)
        .filter(
            DocumentSignatureParticipant.request_id == request_id,
            DocumentSignatureParticipant.id == part.id,
            DocumentSignatureParticipant.status == "ready",
        )
        .with_for_update()
        .first()
    )
    if not part:
        raise HTTPException(400, "Invalid or already signed")
    row = (
        db.query(DocumentSignatureRequest)
        .filter(DocumentSignatureRequest.id == request_id)
        .with_for_update()
        .first()
    )
    if not row or row.status not in ("pending", "in_progress"):
        raise HTTPException(400, "Invalid or already signed")

    fo = db.query(FileObject).filter(FileObject.id == _current_pdf_id(row)).first()
    if not fo:
        raise HTTPException(404, "File missing")
    base_pdf = read_file_object_bytes(db, fo)
    base_hash = fo.checksum_sha256 or sha256_bytes(base_pdf)
    tmpl = row.signature_template
    my_fields = _fields_for_signer(tmpl, part.role)
    if not template_is_active(tmpl) or not my_fields:
        raise HTTPException(400, "Document has no active signature fields for your role")

    allowed_ids = {str(f.get("id")) for f in my_fields if f.get("id")}
    try:
        fv = json.loads(field_values_json) if (field_values_json or "").strip() else {}
    except Exception:
        raise HTTPException(400, "field_values_json must be valid JSON")
    if not isinstance(fv, dict):
        raise HTTPException(400, "field_values must be a JSON object")
    # Reject values for other roles' fields
    for kid in list(fv.keys()):
        if str(kid) not in allowed_ids:
            raise HTTPException(400, f"Field {kid} is not assigned to your role")

    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user.id).first()
    resolved = validate_field_values_for_signing(my_fields, fv, ep, user)
    merged = apply_template_field_overlays(base_pdf, my_fields, resolved)

    now = datetime.now(timezone.utc)
    parts = _participants_for(db, row.id)
    remaining = [p for p in parts if p.status in ("pending", "ready") and p.id != part.id]
    is_last = len(remaining) == 0

    client_ip = _client_ip(request)
    client_ua = (request.headers.get("user-agent") or "")[:512]

    safe_name = re.sub(r"[^\w\s.-]", "", row.display_name)[:80] or "document"

    if is_last:
        # Record this turn before building the certificate so all participants are included.
        part.status = "signed"
        part.signed_at = now
        part.ip_address = client_ip or None
        part.user_agent = client_ua or None

        requested_by = (get_user_display(db, row.requested_by_id) or "").strip() or "Document sender"
        acceptance = "I have read and agree to this document."

        cert_signers = []
        for p in sorted(parts, key=lambda x: x.sort_order):
            if p.status != "signed":
                continue
            su = db.query(User).filter(User.id == p.signer_user_id).first()
            pep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == p.signer_user_id).first()
            pname = (
                f"{(pep.first_name or '')} {(pep.last_name or '')}".strip()
                if pep
                else ((su.username if su else "") or "")
            )
            if not pname:
                pname = (get_user_display(db, p.signer_user_id) or "").strip() or "Signer"
            pemail = (su.email_personal if su else None) or ""
            sat = p.signed_at or now
            cert_signers.append(
                {
                    "name": pname,
                    "email": pemail,
                    "role_label": _participant_role_label(p),
                    "signed_at": sat,
                    "ip_address": (p.ip_address or client_ip or "unknown"),
                    "user_agent": (p.user_agent or client_ua or ""),
                }
            )

        final_pdf, _cert_hash = build_signed_pdf_with_certificate_from_merged(
            merged,
            document_name=row.display_name,
            document_id=str(row.id),
            base_doc_hash=base_hash,
            requested_by=requested_by,
            requested_at=row.created_at or now,
            acceptance_statement=acceptance,
            signers=cert_signers,
        )
        fname = f"{safe_name}_signed_{now.strftime('%Y%m%d')}.pdf"
        doc = db.query(UserDocument).filter(UserDocument.id == row.user_document_id).first()
        roles_catalog = ensure_document_signer_roles(
            getattr(doc, "signer_roles", None) if doc else None,
            getattr(doc, "pages", None) if doc else None,
        )
        hr_owner_id = hr_documents_owner_user_id(parts, roles_catalog) or user.id
        signed_fo = save_document_signature_pdf(
            db,
            final_pdf,
            original_name=fname,
            category="document-signature-signed",
            owner_user_id=hr_owner_id,
            created_by_id=user.id,
        )
        folder = get_or_create_hr_documents_folder(db, hr_owner_id, user.id)
        db.add(
            EmployeeDocument(
                user_id=hr_owner_id,
                doc_type=f"folder:{folder.id}",
                title=f"{row.display_name} (signed {now.strftime('%Y-%m-%d')}).pdf",
                file_id=signed_fo.id,
                created_by=user.id,
            )
        )
        row.signed_file_id = signed_fo.id
        row.current_pdf_file_id = signed_fo.id
        row.signed_at = now
        row.status = "completed"
        row.updated_at = now
        db.commit()
        db.refresh(row)
        return _request_dict(row, db, my_participant=part)

    # Intermediate turn: save overlays only, advance next participant
    fname = f"{safe_name}_partial_{part.role}_{now.strftime('%Y%m%d%H%M%S')}.pdf"
    current_fo = save_document_signature_pdf(
        db,
        merged,
        original_name=fname,
        category="document-signature-partial",
        owner_user_id=user.id,
        created_by_id=user.id,
    )
    part.status = "signed"
    part.signed_at = now
    part.ip_address = client_ip or None
    part.user_agent = client_ua or None
    row.current_pdf_file_id = current_fo.id
    row.status = "in_progress"
    row.updated_at = now

    next_parts = sorted(
        [p for p in parts if p.status == "pending"],
        key=lambda p: p.sort_order,
    )
    if next_parts:
        nxt = next_parts[0]
        nxt.status = "ready"
        set_participant_turn_deadline(nxt, row, now=now)
        row.signer_user_id = nxt.signer_user_id
        disp = (row.display_name or "Document").strip() or "Document"
        role_lbl = _participant_role_label(nxt)
        db.add(
            Notification(
                user_id=nxt.signer_user_id,
                channel="push",
                template_key="document_signature_pending",
                payload_json={
                    "title": "Document to sign",
                    "message": f'"{disp}" is waiting for your signature ({role_lbl}).',
                    "type": "default",
                    "link": _signature_notification_link(),
                    "read": False,
                    "metadata": {
                        "request_id": str(row.id),
                        "user_document_id": str(row.user_document_id),
                        "role": nxt.role,
                    },
                },
                status="pending",
                created_at=now,
            )
        )

    db.commit()
    db.refresh(row)
    return _request_dict(row, db, my_participant=part)
