import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..auth.security import get_current_user, require_permissions
from ..db import get_db
from ..models.models import CompanyCreditCard, CompanyCreditCardAssignment
from ..schemas.company_credit_cards import (
    CompanyCreditCardAssignmentCreate,
    CompanyCreditCardAssignmentReturn,
    CompanyCreditCardAssignmentResponse,
    CompanyCreditCardCreate,
    CompanyCreditCardListItemResponse,
    CompanyCreditCardListResponse,
    CompanyCreditCardResponse,
    CompanyCreditCardUpdate,
)
from ..services.audit import compute_diff
from ..services.fleet_audit import audit_fleet, snapshot_company_credit_card
from ..services.task_service import get_user_display

router = APIRouter(prefix="/company-credit-cards", tags=["company-credit-cards"])


def _card_order(sort: Optional[str], direction: str):
    is_asc = (direction or "asc").lower() == "asc"
    if sort == "label":
        return CompanyCreditCard.label.asc() if is_asc else CompanyCreditCard.label.desc()
    if sort == "status":
        return CompanyCreditCard.status.asc() if is_asc else CompanyCreditCard.status.desc()
    if sort == "expiry":
        ey = CompanyCreditCard.expiry_year.asc() if is_asc else CompanyCreditCard.expiry_year.desc()
        em = CompanyCreditCard.expiry_month.asc() if is_asc else CompanyCreditCard.expiry_month.desc()
        return (ey, em)
    return CompanyCreditCard.created_at.desc()


@router.get("", response_model=CompanyCreditCardListResponse)
def list_company_credit_cards(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    assigned: Optional[bool] = Query(None),
    sort: Optional[str] = Query(None),
    dir: Optional[str] = Query("asc"),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("company_cards:read")),
):
    offset = (page - 1) * limit
    q = db.query(CompanyCreditCard)

    if status:
        q = q.filter(CompanyCreditCard.status == status.strip().lower())
    if search:
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                CompanyCreditCard.label.ilike(term),
                CompanyCreditCard.last_four.ilike(term),
                CompanyCreditCard.cardholder_name.ilike(term),
                CompanyCreditCard.issuer.ilike(term),
                CompanyCreditCard.billing_entity.ilike(term),
                CompanyCreditCard.notes.ilike(term),
            )
        )
    if assigned is not None:
        active_ids = (
            db.query(CompanyCreditCardAssignment.company_credit_card_id)
            .filter(CompanyCreditCardAssignment.is_active == True)  # noqa: E712
            .distinct()
        )
        if assigned:
            q = q.filter(CompanyCreditCard.id.in_(active_ids))
        else:
            q = q.filter(~CompanyCreditCard.id.in_(active_ids))

    order_clause = _card_order(sort, dir or "asc")
    if isinstance(order_clause, tuple):
        q = q.order_by(*order_clause)
    else:
        q = q.order_by(order_clause)

    total = q.count()
    cards = q.offset(offset).limit(limit).all()
    total_pages = (total + limit - 1) // limit if total > 0 else 1

    items: List[CompanyCreditCardListItemResponse] = []
    for card in cards:
        active = (
            db.query(CompanyCreditCardAssignment)
            .filter(
                CompanyCreditCardAssignment.company_credit_card_id == card.id,
                CompanyCreditCardAssignment.is_active == True,  # noqa: E712
            )
            .order_by(CompanyCreditCardAssignment.assigned_at.desc())
            .first()
        )
        assigned_name = get_user_display(db, active.assigned_to_user_id) if active else None
        base = CompanyCreditCardResponse.model_validate(card).model_dump(mode="json")
        items.append(
            CompanyCreditCardListItemResponse.model_validate({**base, "assigned_to_name": assigned_name})
        )

    return CompanyCreditCardListResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


@router.post("", response_model=CompanyCreditCardResponse)
def create_company_credit_card(
    payload: CompanyCreditCardCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("company_cards:write")),
):
    data = payload.model_dump()
    card = CompanyCreditCard(**data, created_by=user.id)
    db.add(card)
    db.commit()
    db.refresh(card)
    audit_fleet(
        db,
        user,
        entity_type="company_credit_card",
        entity_id=card.id,
        action="CREATE",
        changes_json={"after": snapshot_company_credit_card(card)},
        context={"company_credit_card_id": str(card.id)},
    )
    return card


@router.get("/{card_id}", response_model=CompanyCreditCardResponse)
def get_company_credit_card(
    card_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("company_cards:read")),
):
    card = db.query(CompanyCreditCard).filter(CompanyCreditCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Credit card record not found")
    return card


@router.patch("/{card_id}", response_model=CompanyCreditCardResponse)
def update_company_credit_card(
    card_id: uuid.UUID,
    payload: CompanyCreditCardUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("company_cards:write")),
):
    card = db.query(CompanyCreditCard).filter(CompanyCreditCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Credit card record not found")

    before = snapshot_company_credit_card(card)
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(card, key, value)
    card.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(card)
    after = snapshot_company_credit_card(card)
    diff = compute_diff(before, after)
    if diff:
        audit_fleet(
            db,
            user,
            entity_type="company_credit_card",
            entity_id=card.id,
            action="UPDATE",
            changes_json={"before": before, "after": after},
            context={"company_credit_card_id": str(card.id)},
        )
    return card


@router.delete("/{card_id}")
def cancel_company_credit_card(
    card_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("company_cards:write")),
):
    card = db.query(CompanyCreditCard).filter(CompanyCreditCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Credit card record not found")

    before = snapshot_company_credit_card(card)
    card.status = "cancelled"
    card.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(card)
    audit_fleet(
        db,
        user,
        entity_type="company_credit_card",
        entity_id=card.id,
        action="UPDATE",
        changes_json={"before": before, "after": snapshot_company_credit_card(card), "soft_cancel": True},
        context={"company_credit_card_id": str(card.id)},
    )
    return {"message": "Card marked as cancelled"}


@router.get("/{card_id}/assignments", response_model=List[CompanyCreditCardAssignmentResponse])
def list_card_assignments(
    card_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("company_cards:read")),
):
    card = db.query(CompanyCreditCard).filter(CompanyCreditCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Credit card record not found")

    rows = (
        db.query(CompanyCreditCardAssignment)
        .filter(CompanyCreditCardAssignment.company_credit_card_id == card_id)
        .order_by(CompanyCreditCardAssignment.assigned_at.desc())
        .all()
    )
    out: List[CompanyCreditCardAssignmentResponse] = []
    for a in rows:
        out.append(
            CompanyCreditCardAssignmentResponse(
                id=a.id,
                company_credit_card_id=a.company_credit_card_id,
                assigned_to_user_id=a.assigned_to_user_id,
                assigned_at=a.assigned_at,
                returned_at=a.returned_at,
                returned_to_user_id=a.returned_to_user_id,
                notes=a.notes,
                is_active=a.is_active,
                created_by=a.created_by,
                created_at=a.created_at,
                assigned_to_name=get_user_display(db, a.assigned_to_user_id),
            )
        )
    return out


@router.post("/{card_id}/assign", response_model=CompanyCreditCardAssignmentResponse)
def assign_company_credit_card(
    card_id: uuid.UUID,
    payload: CompanyCreditCardAssignmentCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("company_cards:write")),
):
    card = db.query(CompanyCreditCard).filter(CompanyCreditCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Credit card record not found")
    if card.status != "active":
        raise HTTPException(status_code=400, detail="Cannot assign a card that is not active")

    now = datetime.now(timezone.utc)
    open_assignments = (
        db.query(CompanyCreditCardAssignment)
        .filter(
            CompanyCreditCardAssignment.company_credit_card_id == card_id,
            CompanyCreditCardAssignment.is_active == True,  # noqa: E712
        )
        .all()
    )
    for o in open_assignments:
        o.is_active = False
        o.returned_at = now
        o.returned_to_user_id = user.id

    new_a = CompanyCreditCardAssignment(
        company_credit_card_id=card_id,
        assigned_to_user_id=payload.assigned_to_user_id,
        assigned_at=now,
        notes=payload.notes,
        is_active=True,
        created_by=user.id,
    )
    db.add(new_a)
    db.commit()
    db.refresh(new_a)

    audit_fleet(
        db,
        user,
        entity_type="company_credit_card_assignment",
        entity_id=new_a.id,
        action="CREATE",
        changes_json={
            "company_credit_card_id": str(card_id),
            "assigned_to_user_id": str(payload.assigned_to_user_id),
        },
        context={"company_credit_card_id": str(card_id)},
    )

    return CompanyCreditCardAssignmentResponse(
        id=new_a.id,
        company_credit_card_id=new_a.company_credit_card_id,
        assigned_to_user_id=new_a.assigned_to_user_id,
        assigned_at=new_a.assigned_at,
        returned_at=new_a.returned_at,
        returned_to_user_id=new_a.returned_to_user_id,
        notes=new_a.notes,
        is_active=new_a.is_active,
        created_by=new_a.created_by,
        created_at=new_a.created_at,
        assigned_to_name=get_user_display(db, new_a.assigned_to_user_id),
    )


@router.post("/{card_id}/return", response_model=CompanyCreditCardAssignmentResponse)
def return_company_credit_card(
    card_id: uuid.UUID,
    payload: CompanyCreditCardAssignmentReturn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("company_cards:write")),
):
    card = db.query(CompanyCreditCard).filter(CompanyCreditCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Credit card record not found")

    active = (
        db.query(CompanyCreditCardAssignment)
        .filter(
            CompanyCreditCardAssignment.company_credit_card_id == card_id,
            CompanyCreditCardAssignment.is_active == True,  # noqa: E712
        )
        .order_by(CompanyCreditCardAssignment.assigned_at.desc())
        .first()
    )
    if not active:
        raise HTTPException(status_code=400, detail="No active assignment for this card")

    now = datetime.now(timezone.utc)
    active.is_active = False
    active.returned_at = now
    active.returned_to_user_id = user.id
    if payload.notes:
        prefix = "\n" if active.notes else ""
        active.notes = (active.notes or "") + prefix + "Return: " + payload.notes.strip()

    db.commit()
    db.refresh(active)

    audit_fleet(
        db,
        user,
        entity_type="company_credit_card_assignment",
        entity_id=active.id,
        action="UPDATE",
        changes_json={"company_credit_card_id": str(card_id), "returned": True},
        context={"company_credit_card_id": str(card_id)},
    )

    return CompanyCreditCardAssignmentResponse(
        id=active.id,
        company_credit_card_id=active.company_credit_card_id,
        assigned_to_user_id=active.assigned_to_user_id,
        assigned_at=active.assigned_at,
        returned_at=active.returned_at,
        returned_to_user_id=active.returned_to_user_id,
        notes=active.notes,
        is_active=active.is_active,
        created_by=active.created_by,
        created_at=active.created_at,
        assigned_to_name=get_user_display(db, active.assigned_to_user_id),
    )
