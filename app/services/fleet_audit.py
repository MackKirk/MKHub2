"""
Append-only audit log entries for Fleet & Equipment API (admin audit log + user activity).
Matches the pattern used for projects (create_audit_log, compute_diff).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from ..models.models import (
        FleetAsset,
        Equipment,
        WorkOrder,
        InspectionSchedule,
        FleetInspection,
        FleetComplianceRecord,
    )


def _actor_id(user: Any) -> Optional[str]:
    return str(user.id) if user and getattr(user, "id", None) is not None else None


def _dt(v: Optional[datetime]) -> Optional[str]:
    if v is None:
        return None
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return str(v)


def audit_fleet(
    db: "Session",
    user: Any,
    *,
    entity_type: str,
    entity_id: Any,
    action: str,
    changes_json: Optional[Dict[str, Any]] = None,
    context: Optional[Dict[str, Any]] = None,
) -> None:
    try:
        from .audit import create_audit_log

        create_audit_log(
            db=db,
            entity_type=entity_type,
            entity_id=str(entity_id),
            action=action,
            actor_id=_actor_id(user),
            actor_role="user",
            source="api",
            changes_json=changes_json,
            context=context,
        )
    except Exception:
        pass


def snapshot_fleet_asset(a: "FleetAsset") -> Dict[str, Any]:
    """Full field snapshot for audit diffs (aligned with FleetAssetUpdate / UI)."""
    def sid(x: Any) -> Optional[str]:
        return str(x) if x is not None else None

    hna = getattr(a, "hours_next_due_at", None)
    hours_next = float(hna) if hna is not None else None

    return {
        "asset_type": getattr(a, "asset_type", None),
        "name": getattr(a, "name", None),
        "unit_number": getattr(a, "unit_number", None),
        "vin": getattr(a, "vin", None),
        "license_plate": getattr(a, "license_plate", None),
        "make": getattr(a, "make", None),
        "model": getattr(a, "model", None),
        "year": getattr(a, "year", None),
        "condition": getattr(a, "condition", None),
        "body_style": getattr(a, "body_style", None),
        "division_id": sid(getattr(a, "division_id", None)),
        "odometer_current": getattr(a, "odometer_current", None),
        "odometer_last_service": getattr(a, "odometer_last_service", None),
        "hours_current": getattr(a, "hours_current", None),
        "hours_last_service": getattr(a, "hours_last_service", None),
        "status": getattr(a, "status", None),
        "driver_id": sid(getattr(a, "driver_id", None)),
        "icbc_registration_no": getattr(a, "icbc_registration_no", None),
        "vancouver_decals": getattr(a, "vancouver_decals", None),
        "ferry_length": getattr(a, "ferry_length", None),
        "gvw_kg": getattr(a, "gvw_kg", None),
        "fuel_type": getattr(a, "fuel_type", None),
        "vehicle_type": getattr(a, "vehicle_type", None),
        "driver_contact_phone": getattr(a, "driver_contact_phone", None),
        "yard_location": getattr(a, "yard_location", None),
        "gvw_value": getattr(a, "gvw_value", None),
        "gvw_unit": getattr(a, "gvw_unit", None),
        "equipment_type_label": getattr(a, "equipment_type_label", None),
        "odometer_next_due_at": getattr(a, "odometer_next_due_at", None),
        "odometer_noted_issues": getattr(a, "odometer_noted_issues", None),
        "propane_sticker_cert": getattr(a, "propane_sticker_cert", None),
        "propane_sticker_date": _dt(getattr(a, "propane_sticker_date", None)),
        "hours_next_due_at": hours_next,
        "hours_noted_issues": getattr(a, "hours_noted_issues", None),
        "photos": getattr(a, "photos", None),
        "documents": getattr(a, "documents", None),
        "notes": (getattr(a, "notes", None) or "")[:2000] if getattr(a, "notes", None) else None,
    }


def snapshot_equipment(e: "Equipment") -> Dict[str, Any]:
    return {
        "name": getattr(e, "name", None),
        "unit_number": getattr(e, "unit_number", None),
        "category": getattr(e, "category", None),
        "status": getattr(e, "status", None),
        "serial_number": getattr(e, "serial_number", None),
        "brand": getattr(e, "brand", None),
        "model": getattr(e, "model", None),
    }


def snapshot_work_order(wo: "WorkOrder") -> Dict[str, Any]:
    return {
        "work_order_number": getattr(wo, "work_order_number", None),
        "entity_type": getattr(wo, "entity_type", None),
        "entity_id": str(wo.entity_id) if getattr(wo, "entity_id", None) else None,
        "description": (getattr(wo, "description", None) or "")[:500],
        "category": getattr(wo, "category", None),
        "urgency": getattr(wo, "urgency", None),
        "status": getattr(wo, "status", None),
        "assigned_to_user_id": str(wo.assigned_to_user_id) if getattr(wo, "assigned_to_user_id", None) else None,
        "scheduled_start_at": _dt(getattr(wo, "scheduled_start_at", None)),
        "check_in_at": _dt(getattr(wo, "check_in_at", None)),
        "check_out_at": _dt(getattr(wo, "check_out_at", None)),
        "closed_at": _dt(getattr(wo, "closed_at", None)),
        "odometer_reading": getattr(wo, "odometer_reading", None),
        "hours_reading": getattr(wo, "hours_reading", None),
        "costs": getattr(wo, "costs", None),
    }


def snapshot_work_order_flow(wo: "WorkOrder") -> Dict[str, Any]:
    """Smaller snapshot for check-in / check-out / status-only flows."""
    return {
        "status": getattr(wo, "status", None),
        "assigned_to_user_id": str(wo.assigned_to_user_id) if getattr(wo, "assigned_to_user_id", None) else None,
        "check_in_at": _dt(getattr(wo, "check_in_at", None)),
        "check_out_at": _dt(getattr(wo, "check_out_at", None)),
        "closed_at": _dt(getattr(wo, "closed_at", None)),
        "odometer_reading": getattr(wo, "odometer_reading", None),
        "hours_reading": getattr(wo, "hours_reading", None),
    }


def snapshot_inspection_schedule(s: "InspectionSchedule") -> Dict[str, Any]:
    return {
        "fleet_asset_id": str(s.fleet_asset_id) if getattr(s, "fleet_asset_id", None) else None,
        "scheduled_at": _dt(getattr(s, "scheduled_at", None)),
        "urgency": getattr(s, "urgency", None),
        "category": getattr(s, "category", None),
        "status": getattr(s, "status", None),
        "notes": (getattr(s, "notes", None) or "")[:1000] if getattr(s, "notes", None) else None,
    }


def snapshot_fleet_inspection(i: "FleetInspection") -> Dict[str, Any]:
    return {
        "fleet_asset_id": str(i.fleet_asset_id) if getattr(i, "fleet_asset_id", None) else None,
        "inspection_schedule_id": str(i.inspection_schedule_id) if getattr(i, "inspection_schedule_id", None) else None,
        "inspection_date": _dt(getattr(i, "inspection_date", None)),
        "inspection_type": getattr(i, "inspection_type", None),
        "result": getattr(i, "result", None),
        "odometer_reading": getattr(i, "odometer_reading", None),
        "hours_reading": getattr(i, "hours_reading", None),
        "inspector_user_id": str(i.inspector_user_id) if getattr(i, "inspector_user_id", None) else None,
    }


def snapshot_compliance(rec: "FleetComplianceRecord") -> Dict[str, Any]:
    return {
        "fleet_asset_id": str(rec.fleet_asset_id) if getattr(rec, "fleet_asset_id", None) else None,
        "record_type": getattr(rec, "record_type", None),
        "facility": getattr(rec, "facility", None),
        "expiry_date": _dt(getattr(rec, "expiry_date", None)),
        "file_reference_number": getattr(rec, "file_reference_number", None),
    }


def snapshot_company_credit_card(card: Any) -> Dict[str, Any]:
    """Minimal fields for audit (never log full PAN — not stored)."""
    return {
        "label": getattr(card, "label", None),
        "network": getattr(card, "network", None),
        "last_four": getattr(card, "last_four", None),
        "expiry_month": getattr(card, "expiry_month", None),
        "expiry_year": getattr(card, "expiry_year", None),
        "status": getattr(card, "status", None),
    }
