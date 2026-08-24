"""Admin Signature Requests — unified Builder + Onboarding list with permission gating."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.security import get_current_user
from ..db import get_db
from ..models.models import User
from ..services.signature_admin import (
    can_view_builder_signature_admin,
    can_view_onboarding_signature_admin,
    list_admin_signature_requests,
)

router = APIRouter(prefix="/admin", tags=["signature-admin"])


@router.get("/signature-requests")
def admin_list_signature_requests(
    status: Optional[str] = Query(None),
    source: Optional[str] = Query(None, description="document_builder | onboarding"),
    overdue: Optional[bool] = Query(None),
    blocks_access: Optional[bool] = Query(None),
    requested_by: Optional[str] = Query(None),
    signer: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Search document name, requester, or signer"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not can_view_builder_signature_admin(user) and not can_view_onboarding_signature_admin(user):
        raise HTTPException(403, "Forbidden")
    if source and source not in ("document_builder", "onboarding"):
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
    )
