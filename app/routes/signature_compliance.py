"""Me endpoints for signature compliance and aggregated inbox."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth.security import get_current_user
from ..db import get_db
from ..models.models import User
from ..services.signature_compliance import (
    ComplianceCheckError,
    compliance_result_to_status_dict,
    get_signature_compliance,
    get_user_signature_inbox,
)

router = APIRouter(prefix="/auth/me", tags=["signature-compliance"])


@router.get("/signature-status")
def me_signature_status(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        result = get_signature_compliance(db, user.id)
        return compliance_result_to_status_dict(result)
    except ComplianceCheckError:
        return {
            "has_pending": False,
            "pending_count": 0,
            "action_required_count": 0,
            "overdue_count": 0,
            "blocked": False,
            "status_available": False,
            "error": "compliance_unavailable",
            "earliest_deadline": None,
            "sources": {
                "onboarding": {"pending_count": 0, "overdue_count": 0, "blocking_count": 0},
                "document_builder": {"pending_count": 0, "overdue_count": 0, "blocking_count": 0},
            },
        }


@router.get("/signatures")
def me_signatures(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        return get_user_signature_inbox(db, user.id)
    except ComplianceCheckError as exc:
        from fastapi import HTTPException

        raise HTTPException(503, "Signature inbox temporarily unavailable") from exc
