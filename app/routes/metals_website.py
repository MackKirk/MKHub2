"""Staff APIs for MK Metals website inbox (Hub Metals product)."""
from __future__ import annotations

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.security import get_current_user, require_permissions
from ..db import get_db
from ..models.models import MetalsClient, MetalsWebsiteSubmission, Quote, User
from ..services.metals_website import (
    ALLOWED_STATUSES,
    STATUS_CONFIRMED,
    STATUS_IN_REVIEW,
    STATUS_LABELS,
    convert_estimate_to_quote,
    serialize_submission,
    submission_query,
    utcnow,
)

router = APIRouter(prefix="/metals/website", tags=["metals-website"])


class PatchSubmissionBody(BaseModel):
    status: Optional[str] = None
    internal_notes: Optional[str] = None
    metals_client_id: Optional[str] = None


class ConvertQuoteBody(BaseModel):
    confirm: bool = Field(default=True)


@router.get("/submissions")
def list_submissions(
    kind: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("metals:website:read")),
):
    query = submission_query(db)
    if kind:
        query = query.filter(MetalsWebsiteSubmission.kind == kind)
    if status:
        if status not in ALLOWED_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status filter")
        query = query.filter(MetalsWebsiteSubmission.status == status)
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            (MetalsWebsiteSubmission.submission_code.ilike(term))
            | (MetalsWebsiteSubmission.contact_name.ilike(term))
            | (MetalsWebsiteSubmission.contact_email.ilike(term))
            | (MetalsWebsiteSubmission.company_name.ilike(term))
        )
    rows = query.order_by(MetalsWebsiteSubmission.created_at.desc()).limit(500).all()
    new_count = (
        db.query(func.count(MetalsWebsiteSubmission.id))
        .filter(MetalsWebsiteSubmission.status == "new")
        .scalar()
        or 0
    )
    return {
        "items": [serialize_submission(r, include_internal=True) for r in rows],
        "total": len(rows),
        "new_count": int(new_count),
    }


@router.get("/submissions/{submission_id}")
def get_submission(
    submission_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("metals:website:read")),
):
    try:
        sid = uuid.UUID(submission_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    row = submission_query(db).filter(MetalsWebsiteSubmission.id == sid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    data = serialize_submission(row, include_internal=True)
    if row.metals_client_id:
        client = db.query(MetalsClient).filter(MetalsClient.id == row.metals_client_id).first()
        if client:
            data["metals_client"] = {
                "id": str(client.id),
                "name": client.display_name or client.name,
                "code": client.code,
            }
    if row.converted_quote_id:
        quote = db.query(Quote).filter(Quote.id == row.converted_quote_id).first()
        if quote:
            data["converted_quote"] = {
                "id": str(quote.id),
                "code": quote.code,
                "title": quote.title,
            }
    return data


@router.patch("/submissions/{submission_id}")
def patch_submission(
    submission_id: str,
    body: PatchSubmissionBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("metals:website:write")),
):
    try:
        sid = uuid.UUID(submission_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    row = submission_query(db).filter(MetalsWebsiteSubmission.id == sid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")

    if body.status is not None:
        if body.status not in ALLOWED_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        row.status = body.status
        row.status_updated_at = utcnow()
    if body.internal_notes is not None:
        row.internal_notes = body.internal_notes.strip() or None
    if body.metals_client_id is not None:
        if body.metals_client_id == "":
            row.metals_client_id = None
        else:
            try:
                cid = uuid.UUID(body.metals_client_id)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid metals_client_id")
            client = (
                db.query(MetalsClient)
                .filter(MetalsClient.id == cid, MetalsClient.deleted_at.is_(None))
                .first()
            )
            if not client:
                raise HTTPException(status_code=404, detail="Metals client not found")
            row.metals_client_id = cid

    row.updated_at = utcnow()
    db.commit()
    row = submission_query(db).filter(MetalsWebsiteSubmission.id == sid).first()
    return serialize_submission(row, include_internal=True)


@router.post("/submissions/{submission_id}/convert-to-quote")
def convert_to_quote(
    submission_id: str,
    body: ConvertQuoteBody = ConvertQuoteBody(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("metals:website:write")),
):
    try:
        sid = uuid.UUID(submission_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    row = submission_query(db).filter(MetalsWebsiteSubmission.id == sid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    if row.status == "new":
        row.status = STATUS_IN_REVIEW
        row.status_updated_at = utcnow()
    quote = convert_estimate_to_quote(db, row, estimator_id=user.id)
    db.commit()
    return {
        "submission": serialize_submission(row, include_internal=True),
        "quote_id": str(quote.id),
        "quote_code": quote.code,
        "message": "Estimate converted to quote",
    }


@router.post("/submissions/{submission_id}/confirm-order")
def confirm_order(
    submission_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("metals:website:write")),
):
    try:
        sid = uuid.UUID(submission_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    row = submission_query(db).filter(MetalsWebsiteSubmission.id == sid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    if row.kind != "order":
        raise HTTPException(status_code=400, detail="Only orders can be confirmed")
    row.status = STATUS_CONFIRMED
    row.status_updated_at = utcnow()
    row.updated_at = utcnow()
    db.commit()
    row = submission_query(db).filter(MetalsWebsiteSubmission.id == sid).first()
    return serialize_submission(row, include_internal=True)


@router.get("/meta")
def staff_meta(
    _user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("metals:website:read")),
):
    return {
        "statuses": [{"value": k, "label": v} for k, v in STATUS_LABELS.items()],
        "kinds": [
            {"value": "estimate", "label": "Estimate"},
            {"value": "order", "label": "Order"},
        ],
    }
