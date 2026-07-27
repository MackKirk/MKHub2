"""Warranty domain logic: validation, dates, status, summary, serialization."""

from __future__ import annotations

import uuid
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import (
    ClientFile,
    FileObject,
    Project,
    ProjectWarranty,
    WarrantyClaim,
    WarrantyMaintenance,
)

# --- Constants ---
EXPIRING_SOON_DAYS = 90
EXPIRATION_ALERT_DAYS = (90, 60, 30, 0)
MAINTENANCE_ALERT_DAYS = (60, 30, 7, 0)
CLAIM_ASSESSMENT_PENDING_DAYS = 7
CLAIM_OPEN_TOO_LONG_DAYS = 90
CLAIM_FOLLOW_UP_WARNING_DAYS = 7

TERMINAL_WARRANTY_STATUSES = frozenset({"voided", "cancelled"})
ACTIVE_WARRANTY_STATUSES = frozenset({"active", "expiring_soon"})
PENDING_WARRANTY_STATUSES = frozenset({"draft", "pending_documents", "pending_registration"})

WARRANTY_FILE_CATEGORY = "warranty"


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _as_date(val: Any) -> Optional[date]:
    if val is None:
        return None
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, str):
        s = val.strip()
        if not s:
            return None
        try:
            return date.fromisoformat(s[:10])
        except ValueError:
            return None
    return None


def _decimal_or_none(val: Any) -> Optional[float]:
    if val is None or val == "":
        return None
    try:
        n = float(val)
        if n < 0:
            raise HTTPException(status_code=400, detail="Cost values cannot be negative")
        return n
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid numeric value")


def compute_total_internal_cost(
    labour: Optional[float] = None,
    material: Optional[float] = None,
    subcontractor: Optional[float] = None,
    other: Optional[float] = None,
) -> float:
    total = 0.0
    for v in (labour, material, subcontractor, other):
        if v is not None:
            total += float(v)
    return round(total, 2)


def _add_months(d: date, months: int) -> date:
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, monthrange(year, month)[1])
    return date(year, month, day)


def _add_years(d: date, years: int) -> date:
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        return d.replace(year=d.year + years, day=28)


def calculate_end_date(
    start: date,
    duration_value: int,
    duration_unit: str,
) -> date:
    if duration_value <= 0:
        raise HTTPException(status_code=400, detail="Duration must be positive")
    unit = (duration_unit or "").strip().lower()
    if unit == "days":
        return start + timedelta(days=duration_value)
    if unit == "months":
        return _add_months(start, duration_value)
    if unit == "years":
        return _add_years(start, duration_value)
    raise HTTPException(status_code=400, detail="Invalid duration unit")


def resolve_start_date_from_basis(project: Project, basis: Optional[str]) -> Optional[date]:
    b = (basis or "").strip().lower()
    if b in ("", "custom_date"):
        return None
    if b == "project_completion":
        de = getattr(project, "date_end", None)
        if de:
            return de.date() if isinstance(de, datetime) else de
        return None
    if b == "substantial_completion":
        de = getattr(project, "date_end", None)
        if de:
            return de.date() if isinstance(de, datetime) else de
        return None
    return None


def calculate_next_maintenance_date(
    from_date: date,
    frequency: Optional[str],
    interval_value: Optional[int],
    interval_unit: Optional[str],
) -> Optional[date]:
    freq = (frequency or "").strip().lower()
    if freq == "every_6_months":
        return _add_months(from_date, 6)
    if freq == "annually":
        return _add_years(from_date, 1)
    if freq == "every_2_years":
        return _add_years(from_date, 2)
    if freq == "custom" and interval_value and interval_unit:
        unit = interval_unit.strip().lower()
        if unit == "days":
            return from_date + timedelta(days=interval_value)
        if unit == "months":
            return _add_months(from_date, interval_value)
        if unit == "years":
            return _add_years(from_date, interval_value)
    return None


def apply_warranty_status_transitions(warranty: ProjectWarranty, today: Optional[date] = None) -> bool:
    """Auto-update expiring_soon / expired. Returns True if status changed."""
    today = today or _today()
    status = (warranty.status or "").strip().lower()
    if status in TERMINAL_WARRANTY_STATUSES:
        return False
    end = warranty.end_date
    if not end:
        return False
    old = status
    if end < today:
        warranty.status = "expired"
    elif end <= today + timedelta(days=EXPIRING_SOON_DAYS):
        if status not in TERMINAL_WARRANTY_STATUSES and status != "expired":
            warranty.status = "expiring_soon"
    if warranty.status != old:
        return True
    return False


def compute_overall_warranty_status(warranties: List[ProjectWarranty]) -> str:
    if not warranties:
        return "no_warranty"
    non_cancelled = [w for w in warranties if (w.status or "").lower() != "cancelled"]
    if not non_cancelled:
        return "no_warranty"
    statuses = {(w.status or "").lower() for w in non_cancelled}
    if all(s == "expired" for s in statuses):
        return "expired"
    has_active = bool(statuses & ACTIVE_WARRANTY_STATUSES)
    has_pending = bool(statuses & PENDING_WARRANTY_STATUSES)
    has_expired = "expired" in statuses
    if has_active and not has_pending and not has_expired:
        return "active"
    if has_active:
        return "partial_coverage"
    if has_pending:
        return "draft" if not has_active else "partial_coverage"
    return "draft"


def _project_division_id_set(project: Project) -> set:
    raw = getattr(project, "project_division_ids", None) or []
    return {str(x) for x in raw}


def validate_coverage(
    project: Project,
    coverage_type: str,
    covered_division_ids: Optional[List],
    covered_scope_ids: Optional[List],
) -> Tuple[Optional[list], Optional[list]]:
    ct = (coverage_type or "entire_project").strip().lower()
    allowed = _project_division_id_set(project)
    div_ids = [str(x) for x in (covered_division_ids or []) if x]
    scope_ids = [str(x) for x in (covered_scope_ids or []) if x]
    if ct == "entire_project":
        return None, None
    if ct == "selected_divisions":
        if not div_ids:
            raise HTTPException(status_code=400, detail="At least one division is required")
        bad = [d for d in div_ids if d not in allowed]
        if bad:
            raise HTTPException(status_code=400, detail="Division does not belong to this project")
        return div_ids, None
    if ct == "selected_scopes":
        if not scope_ids:
            raise HTTPException(status_code=400, detail="At least one scope is required")
        bad = [s for s in scope_ids if s not in allowed]
        if bad:
            raise HTTPException(status_code=400, detail="Scope does not belong to this project")
        return None, scope_ids
    if ct == "custom":
        return div_ids or None, scope_ids or None
    raise HTTPException(status_code=400, detail="Invalid coverage type")


def validate_warranty_payload(
    db: Session,
    project: Project,
    payload: dict,
    existing: Optional[ProjectWarranty] = None,
) -> dict:
    out: dict = {}
    status = payload.get("status", getattr(existing, "status", None) or "draft")
    status = (status or "draft").strip().lower()

    if "name" in payload:
        name = (payload.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Warranty name is required")
        out["name"] = name

    for field in (
        "warranty_type",
        "provider_type",
        "provider_name",
        "certificate_or_registration_number",
        "provider_contact_name",
        "provider_contact_email",
        "provider_contact_phone",
        "notes",
        "coverage_description",
        "exclusions",
        "special_conditions",
        "maintenance_instructions",
        "consequence_if_missed",
        "maintenance_frequency",
        "maintenance_interval_unit",
        "duration_unit",
        "start_date_basis",
    ):
        if field in payload:
            val = payload.get(field)
            out[field] = (val.strip() if isinstance(val, str) else val) or None

    if "status" in payload:
        out["status"] = status

    if status == "voided":
        voided_at = payload.get("voided_at") or getattr(existing, "voided_at", None)
        voided_reason = payload.get("voided_reason") or getattr(existing, "voided_reason", None)
        if not voided_at:
            raise HTTPException(status_code=400, detail="Voided date is required")
        if not (voided_reason or "").strip():
            raise HTTPException(status_code=400, detail="Void reason is required")
        out["voided_at"] = voided_at
        out["voided_reason"] = voided_reason.strip()
        if "voided_notes" in payload:
            out["voided_notes"] = payload.get("voided_notes")

    if status == "cancelled":
        reason = payload.get("cancelled_reason") or getattr(existing, "cancelled_reason", None)
        if not (reason or "").strip():
            raise HTTPException(status_code=400, detail="Cancellation reason is required")
        out["cancelled_reason"] = reason.strip()
        out["cancelled_at"] = datetime.now(timezone.utc)

    for uid_field in (
        "internal_responsible_user_id",
        "maintenance_responsible_user_id",
        "supplier_id",
        "subcontractor_company_id",
    ):
        if uid_field in payload:
            val = payload.get(uid_field)
            if val in (None, ""):
                out[uid_field] = None
            else:
                try:
                    out[uid_field] = uuid.UUID(str(val))
                except ValueError:
                    raise HTTPException(status_code=400, detail=f"Invalid {uid_field}")

    for bool_field in ("maintenance_required", "document_required", "registration_required"):
        if bool_field in payload:
            out[bool_field] = bool(payload.get(bool_field))

    if "maximum_coverage_amount" in payload:
        out["maximum_coverage_amount"] = _decimal_or_none(payload.get("maximum_coverage_amount"))

    for int_field in ("duration_value", "maintenance_interval_value"):
        if int_field in payload:
            v = payload.get(int_field)
            if v is None or v == "":
                out[int_field] = None
            else:
                iv = int(v)
                if iv <= 0:
                    raise HTTPException(status_code=400, detail=f"{int_field} must be positive")
                out[int_field] = iv

    for date_field in (
        "start_date",
        "end_date",
        "issue_date",
        "activation_date",
        "first_maintenance_due_date",
        "next_maintenance_due_date",
    ):
        if date_field in payload:
            out[date_field] = _as_date(payload.get(date_field))

    if "coverage_type" in payload or "covered_division_ids" in payload or "covered_scope_ids" in payload:
        ct = payload.get("coverage_type", getattr(existing, "coverage_type", None) or "entire_project")
        divs, scopes = validate_coverage(
            project,
            ct,
            payload.get("covered_division_ids", getattr(existing, "covered_division_ids", None)),
            payload.get("covered_scope_ids", getattr(existing, "covered_scope_ids", None)),
        )
        out["coverage_type"] = ct
        out["covered_division_ids"] = divs
        out["covered_scope_ids"] = scopes

    start = out.get("start_date", getattr(existing, "start_date", None))
    if "start_date_basis" in payload and payload.get("start_date_basis"):
        resolved = resolve_start_date_from_basis(project, payload.get("start_date_basis"))
        if resolved:
            out["start_date"] = resolved
            start = resolved

    duration_value = out.get("duration_value", getattr(existing, "duration_value", None))
    duration_unit = out.get("duration_unit", getattr(existing, "duration_unit", None))
    if start and duration_value and duration_unit and not out.get("end_date"):
        out["end_date"] = calculate_end_date(start, duration_value, duration_unit)

    start = out.get("start_date", getattr(existing, "start_date", None))
    end = out.get("end_date", getattr(existing, "end_date", None))
    if start and end and end < start:
        raise HTTPException(status_code=400, detail="End date cannot be before start date")

    eff_status = out.get("status", getattr(existing, "status", None) or "draft")
    if eff_status == "active":
        if not (out.get("start_date") or getattr(existing, "start_date", None)):
            raise HTTPException(status_code=400, detail="Active warranty requires start date")
        if not (out.get("end_date") or getattr(existing, "end_date", None)):
            raise HTTPException(status_code=400, detail="Active warranty requires end date")

    maintenance_required = out.get("maintenance_required", getattr(existing, "maintenance_required", False))
    if maintenance_required:
        next_due = out.get("next_maintenance_due_date", getattr(existing, "next_maintenance_due_date", None))
        first_due = out.get("first_maintenance_due_date", getattr(existing, "first_maintenance_due_date", None))
        last_done = getattr(existing, "last_maintenance_completed_at", None) if existing else None
        if next_due and not first_due and not last_done:
            out["first_maintenance_due_date"] = next_due

    return out


def validate_claim_payload(payload: dict, existing: Optional[WarrantyClaim] = None) -> dict:
    out: dict = {}
    if "description" in payload:
        desc = (payload.get("description") or "").strip()
        if not desc:
            raise HTTPException(status_code=400, detail="Description is required")
        out["description"] = desc

    for field in (
        "reported_by_name",
        "customer_contact_name",
        "customer_contact_email",
        "customer_contact_phone",
        "issue_location",
        "severity",
        "status",
        "coverage_decision",
        "assessment_notes",
        "denial_reason",
        "root_cause",
        "work_performed",
        "resolution_notes",
        "cost_responsibility",
        "cancelled_reason",
    ):
        if field in payload:
            val = payload.get(field)
            out[field] = (val.strip() if isinstance(val, str) else val) or None

    for uid_field in (
        "warranty_id",
        "reported_by_user_id",
        "assigned_user_id",
        "decision_made_by_user_id",
        "resolved_by_user_id",
    ):
        if uid_field in payload:
            val = payload.get(uid_field)
            if val in (None, ""):
                out[uid_field] = None
            else:
                try:
                    out[uid_field] = uuid.UUID(str(val))
                except ValueError:
                    raise HTTPException(status_code=400, detail=f"Invalid {uid_field}")

    for date_field in (
        "reported_date",
        "decision_date",
        "customer_notified_date",
        "follow_up_date",
        "completion_date",
    ):
        if date_field in payload:
            out[date_field] = _as_date(payload.get(date_field))

    if "follow_up_required" in payload:
        out["follow_up_required"] = bool(payload.get("follow_up_required"))
    if "customer_confirmation" in payload:
        v = payload.get("customer_confirmation")
        out["customer_confirmation"] = bool(v) if v is not None else None

    coverage = out.get("coverage_decision", getattr(existing, "coverage_decision", None) or "pending_assessment")
    if coverage == "not_covered":
        reason = out.get("denial_reason", getattr(existing, "denial_reason", None))
        if not (reason or "").strip():
            raise HTTPException(status_code=400, detail="Denial reason is required for Not Covered")
    if coverage == "partially_covered":
        notes = out.get("assessment_notes", getattr(existing, "assessment_notes", None))
        if not (notes or "").strip():
            raise HTTPException(status_code=400, detail="Assessment notes are required for Partially Covered")

    if coverage and coverage != "pending_assessment":
        if not out.get("decision_date") and not getattr(existing, "decision_date", None):
            out["decision_date"] = _today()

    status = out.get("status", getattr(existing, "status", None) or "reported")
    if status == "resolved":
        if not (out.get("completion_date") or getattr(existing, "completion_date", None)):
            raise HTTPException(status_code=400, detail="Completion date is required to resolve claim")
        if not (out.get("resolved_by_user_id") or getattr(existing, "resolved_by_user_id", None)):
            raise HTTPException(status_code=400, detail="Resolved by is required to resolve claim")
        notes = out.get("resolution_notes", getattr(existing, "resolution_notes", None))
        if not (notes or "").strip():
            raise HTTPException(status_code=400, detail="Resolution notes are required to resolve claim")

    follow_up = out.get("follow_up_required", getattr(existing, "follow_up_required", False))
    if follow_up:
        if not (out.get("follow_up_date") or getattr(existing, "follow_up_date", None)):
            raise HTTPException(status_code=400, detail="Follow-up date is required when follow-up is required")

    cost_fields = ("labour_cost", "material_cost", "subcontractor_cost", "other_cost", "amount_charged_to_customer", "recoverable_amount")
    for cf in cost_fields:
        if cf in payload:
            out[cf] = _decimal_or_none(payload.get(cf))

    if any(k in out for k in ("labour_cost", "material_cost", "subcontractor_cost", "other_cost")):
        labour = out.get("labour_cost", getattr(existing, "labour_cost", None))
        material = out.get("material_cost", getattr(existing, "material_cost", None))
        sub = out.get("subcontractor_cost", getattr(existing, "subcontractor_cost", None))
        other = out.get("other_cost", getattr(existing, "other_cost", None))
        out["total_internal_cost"] = compute_total_internal_cost(labour, material, sub, other)

    return out


def generate_claim_number(db: Session, project_id: uuid.UUID) -> str:
    pattern = "WC-%"
    last = (
        db.query(WarrantyClaim.claim_number)
        .filter(WarrantyClaim.project_id == project_id, WarrantyClaim.claim_number.like(pattern))
        .order_by(WarrantyClaim.claim_number.desc())
        .first()
    )
    n = 0
    if last and last[0]:
        try:
            n = int(str(last[0]).replace("WC-", ""))
        except ValueError:
            n = 0
    for attempt in range(1, 100):
        candidate = f"WC-{n + attempt:04d}"
        exists = (
            db.query(WarrantyClaim.id)
            .filter(WarrantyClaim.project_id == project_id, WarrantyClaim.claim_number == candidate)
            .first()
        )
        if not exists:
            return candidate
    raise HTTPException(status_code=500, detail="Could not allocate claim number")


def _open_claim_statuses() -> List[str]:
    return [
        "reported",
        "under_review",
        "site_visit_required",
        "scheduled",
        "in_progress",
    ]


def warranty_to_dict(w: ProjectWarranty, open_claims_count: int = 0) -> dict:
    return {
        "id": str(w.id),
        "project_id": str(w.project_id),
        "name": w.name,
        "warranty_type": w.warranty_type,
        "provider_type": w.provider_type,
        "provider_name": w.provider_name,
        "status": w.status,
        "certificate_or_registration_number": w.certificate_or_registration_number,
        "internal_responsible_user_id": str(w.internal_responsible_user_id) if w.internal_responsible_user_id else None,
        "provider_contact_name": w.provider_contact_name,
        "provider_contact_email": w.provider_contact_email,
        "provider_contact_phone": w.provider_contact_phone,
        "notes": w.notes,
        "supplier_id": str(w.supplier_id) if w.supplier_id else None,
        "subcontractor_company_id": str(w.subcontractor_company_id) if w.subcontractor_company_id else None,
        "coverage_type": w.coverage_type,
        "covered_division_ids": w.covered_division_ids,
        "covered_scope_ids": w.covered_scope_ids,
        "coverage_description": w.coverage_description,
        "exclusions": w.exclusions,
        "special_conditions": w.special_conditions,
        "maximum_coverage_amount": float(w.maximum_coverage_amount) if w.maximum_coverage_amount is not None else None,
        "start_date": w.start_date.isoformat() if w.start_date else None,
        "duration_value": w.duration_value,
        "duration_unit": w.duration_unit,
        "end_date": w.end_date.isoformat() if w.end_date else None,
        "start_date_basis": w.start_date_basis,
        "issue_date": w.issue_date.isoformat() if w.issue_date else None,
        "activation_date": w.activation_date.isoformat() if w.activation_date else None,
        "maintenance_required": w.maintenance_required,
        "maintenance_frequency": w.maintenance_frequency,
        "maintenance_interval_value": w.maintenance_interval_value,
        "maintenance_interval_unit": w.maintenance_interval_unit,
        "first_maintenance_due_date": w.first_maintenance_due_date.isoformat() if w.first_maintenance_due_date else None,
        "next_maintenance_due_date": w.next_maintenance_due_date.isoformat() if w.next_maintenance_due_date else None,
        "maintenance_instructions": w.maintenance_instructions,
        "maintenance_responsible_user_id": str(w.maintenance_responsible_user_id) if w.maintenance_responsible_user_id else None,
        "consequence_if_missed": w.consequence_if_missed,
        "last_maintenance_completed_at": w.last_maintenance_completed_at.isoformat() if w.last_maintenance_completed_at else None,
        "last_maintenance_completed_by": str(w.last_maintenance_completed_by) if w.last_maintenance_completed_by else None,
        "document_required": w.document_required,
        "registration_required": w.registration_required,
        "voided_at": w.voided_at.isoformat() if w.voided_at else None,
        "voided_reason": w.voided_reason,
        "voided_notes": w.voided_notes,
        "cancelled_at": w.cancelled_at.isoformat() if w.cancelled_at else None,
        "cancelled_reason": w.cancelled_reason,
        "open_claims_count": open_claims_count,
        "created_at": w.created_at.isoformat() if w.created_at else None,
        "updated_at": w.updated_at.isoformat() if w.updated_at else None,
    }


def claim_to_dict(c: WarrantyClaim, include_costs: bool = True) -> dict:
    d = {
        "id": str(c.id),
        "project_id": str(c.project_id),
        "warranty_id": str(c.warranty_id) if c.warranty_id else None,
        "claim_number": c.claim_number,
        "reported_date": c.reported_date.isoformat() if c.reported_date else None,
        "reported_by_name": c.reported_by_name,
        "reported_by_user_id": str(c.reported_by_user_id) if c.reported_by_user_id else None,
        "customer_contact_name": c.customer_contact_name,
        "customer_contact_email": c.customer_contact_email,
        "customer_contact_phone": c.customer_contact_phone,
        "issue_location": c.issue_location,
        "description": c.description,
        "severity": c.severity,
        "assigned_user_id": str(c.assigned_user_id) if c.assigned_user_id else None,
        "status": c.status,
        "coverage_decision": c.coverage_decision,
        "assessment_notes": c.assessment_notes,
        "decision_date": c.decision_date.isoformat() if c.decision_date else None,
        "decision_made_by_user_id": str(c.decision_made_by_user_id) if c.decision_made_by_user_id else None,
        "customer_notified_date": c.customer_notified_date.isoformat() if c.customer_notified_date else None,
        "denial_reason": c.denial_reason,
        "follow_up_required": c.follow_up_required,
        "follow_up_date": c.follow_up_date.isoformat() if c.follow_up_date else None,
        "root_cause": c.root_cause,
        "work_performed": c.work_performed,
        "resolution_notes": c.resolution_notes,
        "completion_date": c.completion_date.isoformat() if c.completion_date else None,
        "resolved_by_user_id": str(c.resolved_by_user_id) if c.resolved_by_user_id else None,
        "customer_confirmation": c.customer_confirmation,
        "cancelled_at": c.cancelled_at.isoformat() if c.cancelled_at else None,
        "cancelled_reason": c.cancelled_reason,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }
    if include_costs:
        d.update({
            "labour_cost": float(c.labour_cost) if c.labour_cost is not None else None,
            "material_cost": float(c.material_cost) if c.material_cost is not None else None,
            "subcontractor_cost": float(c.subcontractor_cost) if c.subcontractor_cost is not None else None,
            "other_cost": float(c.other_cost) if c.other_cost is not None else None,
            "total_internal_cost": float(c.total_internal_cost) if c.total_internal_cost is not None else None,
            "amount_charged_to_customer": float(c.amount_charged_to_customer) if c.amount_charged_to_customer is not None else None,
            "recoverable_amount": float(c.recoverable_amount) if c.recoverable_amount is not None else None,
            "cost_responsibility": c.cost_responsibility,
        })
    return d


def count_open_claims_for_warranty(db: Session, warranty_id: uuid.UUID) -> int:
    return (
        db.query(WarrantyClaim)
        .filter(
            WarrantyClaim.warranty_id == warranty_id,
            WarrantyClaim.cancelled_at.is_(None),
            WarrantyClaim.status.in_(_open_claim_statuses()),
        )
        .count()
    )


def build_warranty_summary(db: Session, project_id: uuid.UUID) -> dict:
    today = _today()
    warranties = (
        db.query(ProjectWarranty)
        .filter(ProjectWarranty.project_id == project_id, ProjectWarranty.cancelled_at.is_(None))
        .all()
    )
    for w in warranties:
        if apply_warranty_status_transitions(w, today):
            w.updated_at = datetime.now(timezone.utc)
    db.flush()

    active_count = sum(1 for w in warranties if (w.status or "").lower() in ACTIVE_WARRANTY_STATUSES)
    pending_count = sum(1 for w in warranties if (w.status or "").lower() in PENDING_WARRANTY_STATUSES)

    open_claims = (
        db.query(WarrantyClaim)
        .filter(
            WarrantyClaim.project_id == project_id,
            WarrantyClaim.cancelled_at.is_(None),
            WarrantyClaim.status.in_(_open_claim_statuses()),
        )
        .count()
    )

    next_exp = None
    next_exp_warranty_id = None
    for w in warranties:
        if w.end_date and (w.status or "").lower() not in TERMINAL_WARRANTY_STATUSES:
            if next_exp is None or w.end_date < next_exp:
                next_exp = w.end_date
                next_exp_warranty_id = w.id

    next_maint = None
    next_maint_warranty_id = None
    for w in warranties:
        if w.maintenance_required and w.next_maintenance_due_date:
            if (w.status or "").lower() not in TERMINAL_WARRANTY_STATUSES:
                if next_maint is None or w.next_maintenance_due_date < next_maint:
                    next_maint = w.next_maintenance_due_date
                    next_maint_warranty_id = w.id

    overdue_actions = 0
    for w in warranties:
        if w.maintenance_required and w.next_maintenance_due_date and w.next_maintenance_due_date < today:
            if (w.status or "").lower() not in TERMINAL_WARRANTY_STATUSES:
                overdue_actions += 1
        if w.document_required and (w.status or "").lower() == "pending_documents":
            overdue_actions += 1
        if w.registration_required and not (w.certificate_or_registration_number or "").strip():
            if (w.status or "").lower() in PENDING_WARRANTY_STATUSES | {"active", "expiring_soon"}:
                overdue_actions += 1

    unassigned_claims = (
        db.query(WarrantyClaim)
        .filter(
            WarrantyClaim.project_id == project_id,
            WarrantyClaim.cancelled_at.is_(None),
            WarrantyClaim.assigned_user_id.is_(None),
            WarrantyClaim.status.in_(_open_claim_statuses()),
        )
        .count()
    )
    overdue_actions += unassigned_claims

    return {
        "overall_status": compute_overall_warranty_status(warranties),
        "active_warranties_count": active_count,
        "pending_warranties_count": pending_count,
        "open_claims_count": open_claims,
        "next_expiration_date": next_exp.isoformat() if next_exp else None,
        "next_expiration_warranty_id": str(next_exp_warranty_id) if next_exp_warranty_id else None,
        "next_maintenance_date": next_maint.isoformat() if next_maint else None,
        "next_maintenance_warranty_id": str(next_maint_warranty_id) if next_maint_warranty_id else None,
        "overdue_actions_count": overdue_actions,
    }


def warranty_document_to_dict(db: Session, cf: ClientFile) -> dict:
    fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
    size = getattr(fo, "size_bytes", None) if fo else None
    return {
        "id": str(cf.id),
        "file_object_id": str(cf.file_object_id),
        "original_name": cf.original_name,
        "category": cf.category,
        "uploaded_at": cf.uploaded_at.isoformat() if cf.uploaded_at else None,
        "uploaded_by": str(cf.uploaded_by) if cf.uploaded_by else None,
        "size_bytes": size,
        "related_warranty_id": str(cf.related_warranty_id) if getattr(cf, "related_warranty_id", None) else None,
        "related_warranty_claim_id": str(cf.related_warranty_claim_id) if getattr(cf, "related_warranty_claim_id", None) else None,
    }
