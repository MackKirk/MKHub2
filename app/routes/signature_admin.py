"""Admin Signature Requests — unified Builder + Onboarding list with permission gating."""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..auth.security import get_current_user
from ..db import get_db
from ..models.models import DocumentSignatureRequest, FileObject, User
from ..services.onboarding_storage import read_file_object_bytes
from ..services.signature_admin import (
    can_view_builder_signature_admin,
    can_view_onboarding_signature_admin,
    list_admin_signature_requests,
)

router = APIRouter(prefix="/admin", tags=["signature-admin"])

_VALID_SOURCES = frozenset({"document_builder", "signature_editor", "onboarding"})


@router.get("/signature-requests")
def admin_list_signature_requests(
    status: Optional[str] = Query(None),
    source: Optional[str] = Query(
        None, description="document_builder | signature_editor | onboarding"
    ),
    overdue: Optional[bool] = Query(None),
    blocks_access: Optional[bool] = Query(None),
    requested_by: Optional[str] = Query(None),
    signer: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Search document name, requester, or signer"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not can_view_builder_signature_admin(user) and not can_view_onboarding_signature_admin(user):
        raise HTTPException(403, "Forbidden")
    if source and source not in _VALID_SOURCES:
        raise HTTPException(400, "Invalid source")
    return list_admin_signature_requests(
        db,
        user,
        status=status,
        source=source,
        overdue=overdue,
        blocks_access=blocks_access,
        requested_by=requested_by,
        signer=signer,
        date_from=date_from,
        date_to=date_to,
        search=q,
        page=page,
        page_size=page_size,
    )


@router.get("/signature-requests/{request_id}/preview")
def admin_signature_request_preview(
    request_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Current PDF for a Document Builder / Signature Editor envelope (admin)."""
    if not can_view_builder_signature_admin(user):
        raise HTTPException(403, "Forbidden")
    row = db.query(DocumentSignatureRequest).filter(DocumentSignatureRequest.id == request_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    pdf_id = row.current_pdf_file_id or row.source_pdf_file_id
    fo = db.query(FileObject).filter(FileObject.id == pdf_id).first()
    if not fo:
        raise HTTPException(404, "File not found")
    data = read_file_object_bytes(db, fo)
    disp = (row.display_name or "document").strip() or "document"
    safe = "".join(c for c in disp if c.isalnum() or c in (" ", "-", "_")).strip() or "document"
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{safe}.pdf"'},
    )
