"""Documents Signature Editor: PDF library + overlay templates (parallel to onboarding base docs)."""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..auth.security import get_current_user, require_permissions
from ..db import get_db
from ..models.models import DocumentSignatureTemplate, FileObject, User, UserDocument
from ..services.document_signer_roles import (
    LEGACY_STABLE_IDS,
    employee_token_user_from_assignments,
    order_role_ids_present,
    role_label_map,
    synthesize_roles_from_assignees,
)
from ..services.onboarding_signature_template import (
    normalize_document_assignee,
    roles_present_in_signing_fields,
    signing_fields_in_template,
    validate_and_normalize_template,
)
from ..services.onboarding_storage import read_file_object_bytes
from ..services.pdf_page_preview import inline_pdf_response, pdf_first_page_png
from ..utils.pdf_hash import sha256_bytes
from .document_signature_requests import (
    _create_signature_request,
    _parse_assignments,
    _parse_signing_order,
    _parse_signing_settings,
    _request_dict,
    link_standalone_doc_to_employee_subject,
)

router = APIRouter(prefix="/document-signature-templates", tags=["document-signature-templates"])


def _row_dict(row: DocumentSignatureTemplate) -> dict:
    return {
        "id": str(row.id),
        "name": row.name,
        "file_id": str(row.file_id),
        "signature_template": row.signature_template,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("")
def list_templates(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("document_hub:signature_editor:read")),
):
    rows = (
        db.query(DocumentSignatureTemplate)
        .order_by(DocumentSignatureTemplate.name.asc())
        .all()
    )
    return [_row_dict(r) for r in rows]


@router.get("/{doc_id}/thumbnail")
def thumbnail(
    doc_id: UUID,
    w: int = 200,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("document_hub:signature_editor:read")),
):
    row = db.query(DocumentSignatureTemplate).filter(DocumentSignatureTemplate.id == doc_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    fo = db.query(FileObject).filter(FileObject.id == row.file_id).first()
    if not fo:
        raise HTTPException(404, "File not found")
    png = pdf_first_page_png(read_file_object_bytes(db, fo), w)
    return Response(content=png, media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})


@router.get("/{doc_id}/preview")
def preview(
    doc_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("document_hub:signature_editor:read")),
):
    row = db.query(DocumentSignatureTemplate).filter(DocumentSignatureTemplate.id == doc_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    fo = db.query(FileObject).filter(FileObject.id == row.file_id).first()
    if not fo:
        raise HTTPException(404, "File not found")
    return inline_pdf_response(read_file_object_bytes(db, fo), row.name)


@router.post("")
def create_template(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("document_hub:signature_editor:write")),
):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name required")
    try:
        fid = UUID(str(payload["file_id"]))
    except Exception:
        raise HTTPException(400, "file_id required")
    fo = db.query(FileObject).filter(FileObject.id == fid).first()
    if not fo:
        raise HTTPException(400, "file not found")
    pdf_bytes = read_file_object_bytes(db, fo)
    row = DocumentSignatureTemplate(
        name=name,
        file_id=fid,
        content_hash=sha256_bytes(pdf_bytes),
        created_by=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": str(row.id)}


@router.put("/{doc_id}")
def update_template(
    doc_id: UUID,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("document_hub:signature_editor:write")),
):
    row = db.query(DocumentSignatureTemplate).filter(DocumentSignatureTemplate.id == doc_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    if payload.get("name"):
        row.name = str(payload["name"]).strip()
    if "signature_template" in payload:
        st = payload.get("signature_template")
        if st is None:
            row.signature_template = None
        else:
            fo = db.query(FileObject).filter(FileObject.id == row.file_id).first()
            if not fo:
                raise HTTPException(400, "file not found")
            pdf_bytes = read_file_object_bytes(db, fo)
            row.signature_template = validate_and_normalize_template(st, pdf_bytes)
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "ok"}


@router.delete("/{doc_id}")
def delete_template(
    doc_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("document_hub:signature_editor:write")),
):
    row = db.query(DocumentSignatureTemplate).filter(DocumentSignatureTemplate.id == doc_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    db.delete(row)
    db.commit()
    return {"status": "ok"}


@router.post("/{doc_id}/send-for-signature")
def send_template_for_signature(
    doc_id: UUID,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(
        require_permissions(
            "document_hub:signature_editor:write",
            "document_hub:signature_requests:write",
        )
    ),
):
    """Send a Signature Editor PDF template for multi-signer signing."""
    row = db.query(DocumentSignatureTemplate).filter(DocumentSignatureTemplate.id == doc_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    if not row.signature_template:
        raise HTTPException(
            400,
            "Document has no signature, initials, or date fields. Add Signature, Initials, or Date in the template editor first.",
        )

    fo = db.query(FileObject).filter(FileObject.id == row.file_id).first()
    if not fo:
        raise HTTPException(400, "file not found")
    pdf_bytes = read_file_object_bytes(db, fo)

    raw = row.signature_template
    if not signing_fields_in_template(raw):
        raise HTTPException(
            400,
            "Document has no signature, initials, or date fields. Add Signature, Initials, or Date in the template editor first.",
        )

    try:
        normalized = validate_and_normalize_template(raw, pdf_bytes)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Invalid signature template: {e}")

    for f in normalized.get("fields") or []:
        if isinstance(f, dict):
            f["assignee"] = normalize_document_assignee(f.get("assignee"))

    present_list = roles_present_in_signing_fields(normalized)
    if not present_list:
        raise HTTPException(
            400,
            "Document has no signature, initials, or date fields. Add Signature, Initials, or Date in the template editor first.",
        )
    present = set(present_list)

    assignees_raw = [
        f.get("assignee")
        for f in normalized.get("fields") or []
        if isinstance(f, dict) and (f.get("type") or "").strip().lower() in ("signature", "initials", "date")
    ]
    roles_catalog = synthesize_roles_from_assignees(assignees_raw)
    labels = role_label_map(roles_catalog)

    company_id = LEGACY_STABLE_IDS["company"]
    if company_id in present and any(
        isinstance(f, dict) and str(f.get("assignee", "")).lower() == "user"
        for f in signing_fields_in_template(raw)
    ):
        labels[company_id] = "User"
        for r in roles_catalog:
            if r.get("id") == company_id:
                r["label"] = "User"

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
    employee_user_id = emp_uid

    now = datetime.now(timezone.utc)
    envelope = UserDocument(
        title=(row.name or "Document").strip() or "Document",
        pages=[],
        signer_roles=roles_catalog,
        signature_template_id=row.id,
        created_by=user.id,
        created_at=now,
        updated_at=now,
    )
    db.add(envelope)
    db.flush()

    link_standalone_doc_to_employee_subject(envelope, employee_user_id)

    signing_deadline_days, block_hub_access, message_to_signers = _parse_signing_settings(payload or {}, user)

    req_row = _create_signature_request(
        db,
        user,
        doc=envelope,
        pdf_bytes=pdf_bytes,
        normalized=normalized,
        required_roles=required_roles,
        assignments=assignments,
        labels=labels,
        signing_deadline_days=signing_deadline_days,
        block_hub_access=block_hub_access,
        message_to_signers=message_to_signers,
    )
    return _request_dict(req_row, db)
