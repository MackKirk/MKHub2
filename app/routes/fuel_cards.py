import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, and_, func, cast, BigInteger, case
from sqlalchemy.orm import Session

from ..auth.security import (
    get_current_user,
    has_fuel_cards_list_permission,
    has_fuel_cards_write_permission,
)
from ..db import get_db
from ..models.models import AuditLog, FuelCard, FuelCardAssignment
from ..schemas.fuel_cards import (
    FuelCardAssignmentCreate,
    FuelCardAssignmentReturn,
    FuelCardAssignmentResponse,
    FuelCardCreate,
    FuelCardListItemResponse,
    FuelCardListResponse,
    FuelCardResponse,
    FuelCardUpdate,
)
from ..services.audit import compute_diff
from ..services.fleet_audit import audit_fleet, snapshot_fuel_card
from ..services.permissions import is_admin
from ..services.task_service import get_user_display

router = APIRouter(prefix="/fuel-cards", tags=["fuel-cards"])


def _attachment_ids_for_json(ids: Optional[list]) -> Optional[list[str]]:
    if not ids:
        return None
    out: list[str] = []
    for x in ids:
        if x is None:
            continue
        out.append(str(x) if isinstance(x, uuid.UUID) else str(x))
    return out if out else None


def _assignment_to_response(db: Session, a: FuelCardAssignment) -> FuelCardAssignmentResponse:
    return FuelCardAssignmentResponse(
        id=a.id,
        fuel_card_id=a.fuel_card_id,
        assigned_to_user_id=a.assigned_to_user_id,
        assigned_at=a.assigned_at,
        returned_at=a.returned_at,
        returned_to_user_id=a.returned_to_user_id,
        notes=a.notes,
        notes_in=getattr(a, "notes_in", None),
        reason_out=getattr(a, "reason_out", None),
        reason_in=getattr(a, "reason_in", None),
        attachments_out=getattr(a, "attachments_out", None),
        attachments_in=getattr(a, "attachments_in", None),
        is_active=a.is_active,
        created_by=a.created_by,
        created_at=a.created_at,
        assigned_to_name=get_user_display(db, a.assigned_to_user_id),
    )


def _card_number_numeric_expr():
    """Sort Card # by numeric value so 11 comes before 0100 (not lexicographic)."""
    # Strip non-digits then cast; non-numeric rows sort last.
    digits_only = func.nullif(func.regexp_replace(FuelCard.card_number, r"[^0-9]", "", "g"), "")
    return case((digits_only.isnot(None), cast(digits_only, BigInteger)), else_=None)


def _card_order(sort: Optional[str], direction: str):
    is_asc = (direction or "asc").lower() == "asc"
    if sort == "card_number" or not sort:
        num = _card_number_numeric_expr()
        primary = num.asc().nulls_last() if is_asc else num.desc().nulls_last()
        secondary = FuelCard.card_number.asc() if is_asc else FuelCard.card_number.desc()
        return (primary, secondary)
    if sort == "status":
        return FuelCard.status.asc() if is_asc else FuelCard.status.desc()
    if sort == "date_issued":
        return FuelCard.date_issued.asc() if is_asc else FuelCard.date_issued.desc()
    if sort == "crew":
        return FuelCard.crew.asc() if is_asc else FuelCard.crew.desc()
    return FuelCard.created_at.desc()


@router.get("", response_model=FuelCardListResponse)
def list_fuel_cards(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    assigned: Optional[bool] = Query(None),
    sort: Optional[str] = Query(None),
    dir: Optional[str] = Query("asc"),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if not has_fuel_cards_list_permission(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    offset = (page - 1) * limit
    q = db.query(FuelCard)

    if status:
        q = q.filter(FuelCard.status == status.strip().lower())
    if search:
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                FuelCard.card_number.ilike(term),
                FuelCard.crew.ilike(term),
                FuelCard.notes.ilike(term),
            )
        )
    if assigned is not None:
        active_ids = (
            db.query(FuelCardAssignment.fuel_card_id)
            .filter(FuelCardAssignment.is_active == True)  # noqa: E712
            .distinct()
        )
        if assigned:
            q = q.filter(FuelCard.id.in_(active_ids))
        else:
            q = q.filter(~FuelCard.id.in_(active_ids))

    order_clause = _card_order(sort, dir or "asc")
    if isinstance(order_clause, tuple):
        q = q.order_by(*order_clause)
    else:
        q = q.order_by(order_clause)

    total = q.count()
    cards = q.offset(offset).limit(limit).all()
    total_pages = (total + limit - 1) // limit if total > 0 else 1

    items: List[FuelCardListItemResponse] = []
    for card in cards:
        active = (
            db.query(FuelCardAssignment)
            .filter(
                FuelCardAssignment.fuel_card_id == card.id,
                FuelCardAssignment.is_active == True,  # noqa: E712
            )
            .order_by(FuelCardAssignment.assigned_at.desc())
            .first()
        )
        assigned_name = get_user_display(db, active.assigned_to_user_id) if active else None
        base = FuelCardResponse.model_validate(card).model_dump(mode="json")
        items.append(
            FuelCardListItemResponse.model_validate({**base, "assigned_to_name": assigned_name})
        )

    return FuelCardListResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


@router.post("", response_model=FuelCardResponse)
def create_fuel_card(
    payload: FuelCardCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if not has_fuel_cards_write_permission(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    data = payload.model_dump()
    card = FuelCard(**data, created_by=user.id)
    db.add(card)
    db.commit()
    db.refresh(card)
    audit_fleet(
        db,
        user,
        entity_type="fuel_card",
        entity_id=card.id,
        action="CREATE",
        changes_json={"after": snapshot_fuel_card(card)},
        context={"fuel_card_id": str(card.id)},
    )
    return card


@router.get("/{card_id}", response_model=FuelCardResponse)
def get_fuel_card(
    card_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if not has_fuel_cards_list_permission(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    card = db.query(FuelCard).filter(FuelCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Fuel card record not found")
    return card


@router.patch("/{card_id}", response_model=FuelCardResponse)
def update_fuel_card(
    card_id: uuid.UUID,
    payload: FuelCardUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if not has_fuel_cards_write_permission(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    card = db.query(FuelCard).filter(FuelCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Fuel card record not found")

    before = snapshot_fuel_card(card)
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(card, key, value)
    card.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(card)
    after = snapshot_fuel_card(card)
    diff = compute_diff(before, after)
    if diff:
        audit_fleet(
            db,
            user,
            entity_type="fuel_card",
            entity_id=card.id,
            action="UPDATE",
            changes_json={"before": before, "after": after},
            context={"fuel_card_id": str(card.id)},
        )
    return card


@router.delete("/{card_id}")
def delete_fuel_card(
    card_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if not has_fuel_cards_write_permission(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not is_admin(user, db):
        raise HTTPException(status_code=403, detail="Only administrators can delete a fuel card record")

    card = db.query(FuelCard).filter(FuelCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Fuel card record not found")

    before = snapshot_fuel_card(card)
    db.delete(card)
    db.commit()
    audit_fleet(
        db,
        user,
        entity_type="fuel_card",
        entity_id=card_id,
        action="DELETE",
        changes_json={"before": before},
        context={"fuel_card_id": str(card_id)},
    )
    return {"message": "Fuel card record deleted"}


@router.get("/{card_id}/assignments", response_model=List[FuelCardAssignmentResponse])
def list_card_assignments(
    card_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if not has_fuel_cards_list_permission(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    card = db.query(FuelCard).filter(FuelCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Fuel card record not found")

    rows = (
        db.query(FuelCardAssignment)
        .filter(FuelCardAssignment.fuel_card_id == card_id)
        .order_by(FuelCardAssignment.assigned_at.desc())
        .all()
    )
    return [_assignment_to_response(db, a) for a in rows]


@router.get("/{card_id}/history")
def get_fuel_card_history(
    card_id: uuid.UUID,
    limit: int = Query(300, ge=1, le=500),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if not has_fuel_cards_list_permission(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    card = db.query(FuelCard).filter(FuelCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Fuel card record not found")

    card_str = str(card_id)

    try:
        bind = db.get_bind()
        dialect = getattr(bind.dialect, "name", "") or ""
    except Exception:
        dialect = ""

    card_entity_match = and_(AuditLog.entity_type == "fuel_card", AuditLog.entity_id == card_id)
    audit_parts = [card_entity_match]
    if dialect == "postgresql":
        audit_parts.append(AuditLog.context.op("->>")("fuel_card_id") == card_str)
    else:
        card_ctx = func.json_extract(AuditLog.context, "$.fuel_card_id")
        audit_parts.append(card_ctx == card_str)

    audit_rows = (
        db.query(AuditLog)
        .filter(or_(*audit_parts))
        .order_by(AuditLog.timestamp_utc.desc())
        .limit(450)
        .all()
    )
    audit_assignment_ids = {
        str(row.entity_id) for row in audit_rows if (row.entity_type or "") == "fuel_card_assignment"
    }

    items: List[dict] = []

    assignments = (
        db.query(FuelCardAssignment)
        .filter(FuelCardAssignment.fuel_card_id == card_id)
        .order_by(FuelCardAssignment.assigned_at.desc())
        .all()
    )

    for a in assignments:
        if str(a.id) in audit_assignment_ids:
            continue
        assignee = get_user_display(db, a.assigned_to_user_id) if a.assigned_to_user_id else "Unknown"
        checkout_actor_id = str(a.created_by) if a.created_by else None
        checkout_actor_name = get_user_display(db, a.created_by) if a.created_by else None
        items.append(
            {
                "id": f"assign-out-{a.id}",
                "source": "assignment",
                "kind": "checkout",
                "title": "Checked out",
                "subtitle": f"Assigned to {assignee}",
                "detail": None,
                "occurred_at": a.assigned_at.isoformat() if a.assigned_at else "",
                "actor_id": checkout_actor_id,
                "actor_name": checkout_actor_name,
                "assignment_id": str(a.id),
                "log_subtype": "assign",
                "audit_action": None,
                "changes_json": None,
            }
        )
        if a.returned_at:
            return_actor_id = str(a.returned_to_user_id) if a.returned_to_user_id else None
            return_actor_name = get_user_display(db, a.returned_to_user_id) if a.returned_to_user_id else None
            items.append(
                {
                    "id": f"assign-in-{a.id}",
                    "source": "assignment",
                    "kind": "return",
                    "title": "Returned",
                    "subtitle": f"Previously with {assignee}",
                    "detail": None,
                    "occurred_at": a.returned_at.isoformat() if a.returned_at else "",
                    "actor_id": return_actor_id,
                    "actor_name": return_actor_name,
                    "assignment_id": str(a.id),
                    "log_subtype": "return",
                    "audit_action": None,
                    "changes_json": None,
                }
            )

    for row in audit_rows:
        changes_json = row.changes_json
        if (row.entity_type or "") == "fuel_card_assignment" and row.entity_id:
            cj = dict(changes_json or {})
            if not cj.get("assigned_to_name"):
                assignment = (
                    db.query(FuelCardAssignment)
                    .filter(FuelCardAssignment.id == row.entity_id)
                    .first()
                )
                if assignment and assignment.assigned_to_user_id:
                    assignee_name = get_user_display(db, assignment.assigned_to_user_id)
                    if assignee_name:
                        cj["assigned_to_name"] = assignee_name
            changes_json = cj

        items.append(
            {
                "id": f"audit-{row.id}",
                "source": "audit",
                "kind": (row.action or "audit").lower(),
                "title": (row.entity_type or "audit").replace("_", " "),
                "subtitle": None,
                "detail": None,
                "occurred_at": row.timestamp_utc.isoformat() if row.timestamp_utc else "",
                "actor_id": str(row.actor_id) if row.actor_id else None,
                "actor_name": get_user_display(db, row.actor_id) if row.actor_id else None,
                "assignment_id": None,
                "log_subtype": None,
                "audit_action": row.action,
                "changes_json": changes_json,
                "entity_type": row.entity_type,
                "entity_id": str(row.entity_id) if row.entity_id is not None else None,
                "audit_context": row.context,
            }
        )

    items.sort(key=lambda x: x.get("occurred_at") or "", reverse=True)
    return {"items": items[:limit]}


@router.post("/{card_id}/assign", response_model=FuelCardAssignmentResponse)
def assign_fuel_card(
    card_id: uuid.UUID,
    payload: FuelCardAssignmentCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if not has_fuel_cards_write_permission(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    card = db.query(FuelCard).filter(FuelCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Fuel card record not found")
    if card.status != "active":
        raise HTTPException(status_code=400, detail="Cannot assign a card that is not active")

    now = datetime.now(timezone.utc)
    open_assignments = (
        db.query(FuelCardAssignment)
        .filter(
            FuelCardAssignment.fuel_card_id == card_id,
            FuelCardAssignment.is_active == True,  # noqa: E712
        )
        .all()
    )
    for o in open_assignments:
        o.is_active = False
        o.returned_at = now
        o.returned_to_user_id = user.id

    reason = (payload.reason or "").strip() or None
    notes = (payload.notes or "").strip() or None
    new_a = FuelCardAssignment(
        fuel_card_id=card_id,
        assigned_to_user_id=payload.assigned_to_user_id,
        assigned_at=now,
        notes=notes,
        reason_out=reason,
        attachments_out=_attachment_ids_for_json(payload.attachment_ids),
        is_active=True,
        created_by=user.id,
    )
    db.add(new_a)
    db.commit()
    db.refresh(new_a)

    assignee_name = get_user_display(db, payload.assigned_to_user_id)

    audit_fleet(
        db,
        user,
        entity_type="fuel_card_assignment",
        entity_id=new_a.id,
        action="CREATE",
        changes_json={
            "fuel_card_id": str(card_id),
            "assigned_to_user_id": str(payload.assigned_to_user_id),
            "assigned_to_name": assignee_name,
            "reason_out": reason,
        },
        context={"fuel_card_id": str(card_id)},
    )

    return _assignment_to_response(db, new_a)


@router.post("/{card_id}/return", response_model=FuelCardAssignmentResponse)
def return_fuel_card(
    card_id: uuid.UUID,
    payload: FuelCardAssignmentReturn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if not has_fuel_cards_write_permission(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    card = db.query(FuelCard).filter(FuelCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Fuel card record not found")

    active = (
        db.query(FuelCardAssignment)
        .filter(
            FuelCardAssignment.fuel_card_id == card_id,
            FuelCardAssignment.is_active == True,  # noqa: E712
        )
        .order_by(FuelCardAssignment.assigned_at.desc())
        .first()
    )
    if not active:
        raise HTTPException(status_code=400, detail="No active assignment for this card")

    now = datetime.now(timezone.utc)
    active.is_active = False
    active.returned_at = now
    active.returned_to_user_id = user.id
    reason = (payload.reason or "").strip() or None
    notes_in = (payload.notes or "").strip() or None
    active.reason_in = reason
    active.notes_in = notes_in
    active.attachments_in = _attachment_ids_for_json(payload.attachment_ids)

    db.commit()
    db.refresh(active)

    assignee_name = get_user_display(db, active.assigned_to_user_id)

    audit_fleet(
        db,
        user,
        entity_type="fuel_card_assignment",
        entity_id=active.id,
        action="UPDATE",
        changes_json={
            "fuel_card_id": str(card_id),
            "returned": True,
            "assigned_to_name": assignee_name,
            "reason_in": reason,
        },
        context={"fuel_card_id": str(card_id)},
    )

    return _assignment_to_response(db, active)
