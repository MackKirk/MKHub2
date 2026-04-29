"""
Asset assignment service: create and return assignments for fleet assets and equipment.
Uses the unified asset_assignments table.
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from ..models.models import (
    AssetAssignment,
    FleetAsset,
    FleetLog,
    Equipment,
    EquipmentLog,
)
from ..schemas.fleet import (
    AssetAssignmentAssignRequest,
    AssetAssignmentReturnRequest,
    AssetAssignmentRead,
)


def _coerce_int_optional(v) -> Optional[int]:
    """Normalize odometer-like values from ORM/JSON (int, str, Decimal, bool)."""
    if v is None:
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, Decimal):
        return int(v)
    try:
        return int(float(str(v)))
    except (TypeError, ValueError):
        return None


def _coerce_float_optional(v) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, Decimal):
        return float(v)
    try:
        return float(str(v))
    except (TypeError, ValueError):
        return None


def _photo_ids_for_json(ids: Optional[list]) -> Optional[list[str]]:
    """JSON columns require native JSON types; Pydantic may pass UUID instances."""
    if not ids:
        return None
    out: list[str] = []
    for x in ids:
        if x is None:
            continue
        out.append(str(x) if isinstance(x, uuid.UUID) else str(x))
    return out if out else None


def _to_read(a: AssetAssignment) -> AssetAssignmentRead:
    return AssetAssignmentRead(
        id=a.id,
        target_type=a.target_type,
        fleet_asset_id=a.fleet_asset_id,
        equipment_id=a.equipment_id,
        assigned_to_user_id=a.assigned_to_user_id,
        assigned_to_name=a.assigned_to_name,
        phone_snapshot=a.phone_snapshot,
        address_snapshot=a.address_snapshot,
        department_snapshot=a.department_snapshot,
        assigned_at=a.assigned_at,
        expected_return_at=a.expected_return_at,
        returned_at=a.returned_at,
        odometer_out=a.odometer_out,
        odometer_in=a.odometer_in,
        hours_out=a.hours_out,
        hours_in=a.hours_in,
        notes_out=a.notes_out,
        notes_in=a.notes_in,
        photos_out=a.photos_out,
        photos_in=a.photos_in,
    )


def create_assignment_for_fleet_asset(
    asset_id: uuid.UUID,
    payload: AssetAssignmentAssignRequest,
    user_id: uuid.UUID,
    db: Session,
) -> AssetAssignmentRead:
    """Create an open assignment for a fleet asset. Fails if one already open."""
    asset = db.query(FleetAsset).filter(FleetAsset.id == asset_id).first()
    if not asset:
        raise ValueError("Fleet asset not found")
    open_assignment = (
        db.query(AssetAssignment)
        .filter(
            AssetAssignment.fleet_asset_id == asset_id,
            AssetAssignment.returned_at.is_(None),
        )
        .first()
    )
    if open_assignment:
        raise ValueError("Asset already has an open assignment")
    if (
        getattr(asset, "asset_type", None) == "vehicle"
        and payload.odometer_out is not None
        and getattr(asset, "odometer_current", None) is not None
        and int(payload.odometer_out) < int(asset.odometer_current)
    ):
        raise ValueError(
            "Odometer out cannot be less than the asset's current odometer reading"
        )
    assigned_at = payload.assigned_at or datetime.now(timezone.utc)
    assignment = AssetAssignment(
        target_type="fleet",
        fleet_asset_id=asset_id,
        equipment_id=None,
        assigned_to_user_id=payload.assigned_to_user_id,
        assigned_to_name=payload.assigned_to_name,
        phone_snapshot=payload.phone_snapshot,
        address_snapshot=payload.address_snapshot,
        department_snapshot=payload.department_snapshot,
        assigned_at=assigned_at,
        expected_return_at=payload.expected_return_at,
        odometer_out=payload.odometer_out,
        hours_out=payload.hours_out,
        notes_out=payload.notes_out,
        photos_out=_photo_ids_for_json(payload.photos_out),
    )
    db.add(assignment)
    db.flush()
    name = payload.assigned_to_name or (str(payload.assigned_to_user_id) if payload.assigned_to_user_id else "Unknown")
    log = FleetLog(
        fleet_asset_id=asset_id,
        log_type="assignment",
        log_date=assigned_at,
        user_id=user_id,
        description=f"Assigned to {name}",
        created_by=user_id,
    )
    db.add(log)
    if payload.assigned_to_user_id and asset:
        asset.driver_id = payload.assigned_to_user_id
        asset.updated_at = datetime.now(timezone.utc)
    if asset:
        if payload.phone_snapshot is not None:
            asset.driver_contact_phone = payload.phone_snapshot
        if payload.sleeps_snapshot is not None:
            asset.yard_location = payload.sleeps_snapshot
        if payload.phone_snapshot is not None or payload.sleeps_snapshot is not None:
            asset.updated_at = datetime.now(timezone.utc)
    db.flush()
    return _to_read(assignment)


def return_assignment_for_fleet_asset(
    asset_id: uuid.UUID,
    payload: AssetAssignmentReturnRequest,
    user_id: uuid.UUID,
    db: Session,
) -> AssetAssignmentRead:
    """Close the open assignment for a fleet asset. Validates odometer_in >= odometer_out."""
    assignment = (
        db.query(AssetAssignment)
        .filter(
            AssetAssignment.fleet_asset_id == asset_id,
            AssetAssignment.returned_at.is_(None),
        )
        .first()
    )
    if not assignment:
        raise ValueError("No open assignment found for this asset")
    asset = db.query(FleetAsset).filter(FleetAsset.id == asset_id).first()
    if not asset:
        raise ValueError("Fleet asset not found")

    odom_in = _coerce_int_optional(payload.odometer_in)
    odom_out = _coerce_int_optional(assignment.odometer_out)
    hrs_in = _coerce_float_optional(payload.hours_in)
    hrs_out = _coerce_float_optional(assignment.hours_out)

    atype = getattr(asset, "asset_type", None) or ""
    if atype == "vehicle":
        if odom_in is not None and odom_out is not None and odom_in < odom_out:
            raise ValueError(
                "Odometer in cannot be less than odometer out recorded at check-out"
            )
    elif atype in ("heavy_machinery", "other"):
        if hrs_in is not None and hrs_out is not None and hrs_in < hrs_out:
            raise ValueError(
                "Hours in cannot be less than hours out recorded at check-out"
            )

    now = datetime.now(timezone.utc)
    assignment.returned_at = now
    assignment.odometer_in = odom_in if odom_in is not None else payload.odometer_in
    assignment.hours_in = hrs_in if hrs_in is not None else payload.hours_in
    assignment.notes_in = payload.notes_in
    assignment.photos_in = _photo_ids_for_json(payload.photos_in)
    db.flush()
    name = assignment.assigned_to_name or (str(assignment.assigned_to_user_id) if assignment.assigned_to_user_id else "Unknown")
    log = FleetLog(
        fleet_asset_id=asset_id,
        log_type="return",
        log_date=now,
        user_id=user_id,
        description=f"Returned by {name}",
        created_by=user_id,
    )
    db.add(log)
    if asset:
        asset.driver_id = None
        asset.updated_at = now
    db.flush()
    return _to_read(assignment)


def create_assignment_for_equipment_item(
    equipment_id: uuid.UUID,
    payload: AssetAssignmentAssignRequest,
    user_id: uuid.UUID,
    db: Session,
) -> AssetAssignmentRead:
    """Create an open assignment for an equipment item."""
    equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not equipment:
        raise ValueError("Equipment not found")
    open_assignment = (
        db.query(AssetAssignment)
        .filter(
            AssetAssignment.equipment_id == equipment_id,
            AssetAssignment.returned_at.is_(None),
        )
        .first()
    )
    if open_assignment:
        raise ValueError("Equipment already has an open assignment")
    assigned_at = payload.assigned_at or datetime.now(timezone.utc)
    assignment = AssetAssignment(
        target_type="equipment",
        fleet_asset_id=None,
        equipment_id=equipment_id,
        assigned_to_user_id=payload.assigned_to_user_id,
        assigned_to_name=payload.assigned_to_name,
        phone_snapshot=payload.phone_snapshot,
        address_snapshot=payload.address_snapshot,
        department_snapshot=payload.department_snapshot,
        assigned_at=assigned_at,
        expected_return_at=payload.expected_return_at,
        odometer_out=payload.odometer_out,
        hours_out=payload.hours_out,
        notes_out=payload.notes_out,
        photos_out=_photo_ids_for_json(payload.photos_out),
    )
    db.add(assignment)
    db.flush()
    name = payload.assigned_to_name or (str(payload.assigned_to_user_id) if payload.assigned_to_user_id else "Unknown")
    log = EquipmentLog(
        equipment_id=equipment_id,
        log_type="checkout",
        log_date=assigned_at,
        user_id=user_id,
        description=f"Assigned to {name}",
        created_by=user_id,
    )
    db.add(log)
    db.flush()
    return _to_read(assignment)


def return_assignment_for_equipment_item(
    equipment_id: uuid.UUID,
    payload: AssetAssignmentReturnRequest,
    user_id: uuid.UUID,
    db: Session,
) -> AssetAssignmentRead:
    """Close the open assignment for an equipment item."""
    assignment = (
        db.query(AssetAssignment)
        .filter(
            AssetAssignment.equipment_id == equipment_id,
            AssetAssignment.returned_at.is_(None),
        )
        .first()
    )
    if not assignment:
        raise ValueError("No open assignment found for this equipment")
    hrs_in = _coerce_float_optional(payload.hours_in)
    hrs_out = _coerce_float_optional(assignment.hours_out)
    if hrs_in is not None and hrs_out is not None and hrs_in < hrs_out:
        raise ValueError(
            "Hours in cannot be less than hours out recorded at check-out"
        )
    odom_in = _coerce_int_optional(payload.odometer_in)
    now = datetime.now(timezone.utc)
    assignment.returned_at = now
    assignment.odometer_in = odom_in if odom_in is not None else payload.odometer_in
    assignment.hours_in = hrs_in if hrs_in is not None else payload.hours_in
    assignment.notes_in = payload.notes_in
    assignment.photos_in = _photo_ids_for_json(payload.photos_in)
    db.flush()
    name = assignment.assigned_to_name or (str(assignment.assigned_to_user_id) if assignment.assigned_to_user_id else "Unknown")
    log = EquipmentLog(
        equipment_id=equipment_id,
        log_type="checkin",
        log_date=now,
        user_id=user_id,
        description=f"Returned by {name}",
        created_by=user_id,
    )
    db.add(log)
    db.flush()
    return _to_read(assignment)
