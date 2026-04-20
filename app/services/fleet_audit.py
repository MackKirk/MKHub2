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
    return {
        "name": getattr(a, "name", None),
        "unit_number": getattr(a, "unit_number", None),
        "asset_type": getattr(a, "asset_type", None),
        "status": getattr(a, "status", None),
        "license_plate": getattr(a, "license_plate", None),
        "vin": getattr(a, "vin", None),
        "make": getattr(a, "make", None),
        "model": getattr(a, "model", None),
        "driver_id": str(a.driver_id) if getattr(a, "driver_id", None) else None,
        "division_id": str(a.division_id) if getattr(a, "division_id", None) else None,
        "odometer_current": getattr(a, "odometer_current", None),
        "hours_current": getattr(a, "hours_current", None),
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
        "scheduled_end_at": _dt(getattr(wo, "scheduled_end_at", None)),
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
