"""Documents Signature Editor: PDF library + overlay templates (parallel to onboarding base docs)."""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..auth.security import get_current_user, require_permissions
from ..db import get_db
from ..models.models import DocumentSignatureTemplate, FileObject, User
from ..services.onboarding_signature_template import validate_and_normalize_template
from ..services.onboarding_storage import read_file_object_bytes
from ..services.pdf_page_preview import inline_pdf_response, pdf_first_page_png
from ..utils.pdf_hash import sha256_bytes

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
