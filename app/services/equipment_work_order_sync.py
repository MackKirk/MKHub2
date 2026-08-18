"""Sync equipment operational status from open work orders."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional, Set

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import Equipment, WorkOrder

OPEN_EQUIPMENT_WO_STATUSES: Set[str] = {
    "open",
    "in_progress",
    "pending_parts",
}

PROTECTED_EQUIPMENT_STATUSES: Set[str] = {
    "retired",
    "inactive",
}


def count_open_equipment_work_orders(db: Session, equipment_id: uuid.UUID) -> int:
    return (
        db.query(WorkOrder)
        .filter(
            WorkOrder.entity_type == "equipment",
            WorkOrder.entity_id == equipment_id,
            WorkOrder.status.in_(OPEN_EQUIPMENT_WO_STATUSES),
        )
        .count()
    )


def equipment_has_open_work_orders(db: Session, equipment_id: uuid.UUID) -> bool:
    return count_open_equipment_work_orders(db, equipment_id) > 0


def assert_equipment_status_change_allowed(
    db: Session,
    equipment_id: uuid.UUID,
    new_status: Optional[str],
    *,
    current_status: Optional[str] = None,
) -> None:
    """Block manual status edits that conflict with open work orders."""
    if new_status is None:
        return
    normalized_new = (new_status or "").strip().lower()
    normalized_current = (current_status or "").strip().lower()
    if not normalized_new or normalized_new == normalized_current:
        return
    if not equipment_has_open_work_orders(db, equipment_id):
        return
    if normalized_new != "maintenance":
        raise HTTPException(
            status_code=409,
            detail=(
                "Cannot change equipment status while open work orders exist. "
                "Close or cancel all open work orders first, or set status to Maintenance."
            ),
        )


def sync_equipment_status_from_work_orders(db: Session, equipment_id: uuid.UUID) -> bool:
    """
    Apply maintenance when open equipment WOs exist; revert maintenance -> active when none remain.

    Never overwrites retired or inactive. Returns True if equipment.status was updated.
    """
    equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not equipment:
        return False

    current = (equipment.status or "").strip().lower()
    if current in PROTECTED_EQUIPMENT_STATUSES:
        return False

    open_count = count_open_equipment_work_orders(db, equipment_id)

    if open_count > 0:
        if current in {"active", "maintenance"} and current != "maintenance":
            equipment.status = "maintenance"
            equipment.updated_at = datetime.now(timezone.utc)
            return True
        return False

    if current == "maintenance":
        equipment.status = "active"
        equipment.updated_at = datetime.now(timezone.utc)
        return True

    return False


def sync_equipment_for_work_order(db: Session, work_order: WorkOrder) -> bool:
    if (getattr(work_order, "entity_type", None) or "").lower() != "equipment":
        return False
    entity_id = getattr(work_order, "entity_id", None)
    if not entity_id:
        return False
    return sync_equipment_status_from_work_orders(db, entity_id)


def backfill_equipment_status_from_open_work_orders(db: Session) -> int:
    """Align legacy rows: equipment with open WOs should be maintenance when active."""
    updated = 0
    rows = (
        db.query(WorkOrder.entity_id)
        .filter(
            WorkOrder.entity_type == "equipment",
            WorkOrder.status.in_(OPEN_EQUIPMENT_WO_STATUSES),
            WorkOrder.entity_id.isnot(None),
        )
        .distinct()
        .all()
    )
    seen: set[uuid.UUID] = set()
    for (entity_id,) in rows:
        if entity_id in seen:
            continue
        seen.add(entity_id)
        if sync_equipment_status_from_work_orders(db, entity_id):
            updated += 1
    if updated:
        db.commit()
    return updated
