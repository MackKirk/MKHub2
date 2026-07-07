"""HR Offboarding orchestration service."""
from __future__ import annotations

import math
import uuid
from datetime import date, datetime, time, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Session

from ..config import settings
from ..models.models import (
    AssetAssignment,
    Attendance,
    CompanyCreditCard,
    CompanyCreditCardAssignment,
    EmployeeEquipment,
    EmployeeProfile,
    Equipment,
    EquipmentCheckout,
    FleetAsset,
    OffboardingActivityLog,
    OffboardingAssetLink,
    OffboardingCase,
    OffboardingChecklistItem,
    Project,
    ProjectSafetyInspection,
    ProjectSafetyInspectionSignRequest,
    Shift,
    TaskItem,
    User,
)
from ..services.task_service import get_user_display
from ..services.time_rules import local_to_utc, utc_to_local

OFFBOARDING_STATUSES = ("draft", "in_progress", "completed", "cancelled")
TERMINATION_TYPES = ("resignation", "termination", "layoff", "end_of_contract", "other")
ACCESS_REVOCATION_TIMINGS = ("immediately", "scheduled", "manually_later")

CHECKLIST_ITEMS: List[Tuple[str, str, bool]] = [
    ("termination_date_recorded", "Termination date recorded", True),
    ("hub_access_deactivated", "Hub access deactivated", True),
    ("assets_returned", "All assigned assets returned or resolved", True),
    ("future_shifts_reviewed", "Future shifts reviewed", False),
    ("pending_timesheets_reviewed", "Pending timesheets reviewed", False),
    ("project_responsibilities_reviewed", "Project responsibilities reviewed", False),
    ("final_notes_completed", "Final notes completed", False),
]
AUTO_CHECKLIST_KEYS = {k for k, _, auto in CHECKLIST_ITEMS if auto}
MANUAL_CHECKLIST_KEYS = {k for k, _, auto in CHECKLIST_ITEMS if not auto}

ACTION_LABELS = {
    "offboarding_created": "Offboarding created",
    "offboarding_draft_saved": "Offboarding draft saved",
    "offboarding_started": "Offboarding started",
    "offboarding_edited": "Offboarding edited",
    "termination_date_updated": "Termination date updated",
    "access_revocation_timing_changed": "Access revocation timing changed",
    "hub_access_deactivated": "Hub access deactivated",
    "scheduled_access_revocation_executed": "Scheduled access revocation executed",
    "asset_return_status_updated": "Asset return status updated",
    "checklist_item_completed": "Checklist item completed",
    "checklist_item_reopened": "Checklist item reopened",
    "offboarding_completed": "Offboarding completed",
    "offboarding_cancelled": "Offboarding cancelled",
    "notes_added": "Notes added",
    "hub_access_reactivated": "Hub access reactivated",
    "termination_date_cleared": "Termination date cleared",
}


def _parse_date_str(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        if "T" in s:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        return datetime.strptime(s[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _parse_calendar_date_str(value: Optional[str]) -> Optional[datetime]:
    """Parse YYYY-MM-DD as a calendar date in company local time (stored as UTC)."""
    if not value:
        return None
    s = str(value).strip()[:10]
    if not s:
        return None
    try:
        raw = datetime.strptime(s, "%Y-%m-%d")
        return local_to_utc(raw, settings.tz_default)
    except Exception:
        return None


def _parse_local_datetime(value: Optional[str], tz: Optional[str] = None) -> Optional[datetime]:
    if not value:
        return None
    s = str(value).strip()
    if not s:
        return None
    tz_str = tz or settings.tz_default
    try:
        if "T" in s:
            raw = datetime.fromisoformat(s.replace("Z", ""))
            if raw.tzinfo is not None:
                return raw.astimezone(timezone.utc)
            return local_to_utc(raw, tz_str)
        if len(s) == 10:
            raw = datetime.strptime(s, "%Y-%m-%d")
            return local_to_utc(raw, tz_str)
        raw = datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S")
        return local_to_utc(raw, tz_str)
    except Exception:
        return None


def _format_date_iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")


def _format_dt_iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def _employee_display_name(db: Session, user: User, ep: Optional[EmployeeProfile] = None) -> str:
    if ep is None:
        ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user.id).first()
    if ep:
        parts = []
        if ep.preferred_name:
            parts.append(ep.preferred_name)
        elif ep.first_name:
            parts.append(ep.first_name)
        if ep.last_name:
            parts.append(ep.last_name)
        name = " ".join(p for p in parts if p).strip()
        if name:
            return name
    return user.username or user.email_corporate or user.email_personal or str(user.id)


def _manager_name(db: Session, manager_id: Optional[uuid.UUID]) -> Optional[str]:
    if not manager_id:
        return None
    mgr = db.query(User).filter(User.id == manager_id).first()
    if not mgr:
        return None
    return _employee_display_name(db, mgr)


def _default_revoke_at_utc(last_working_day: datetime) -> datetime:
    day = last_working_day
    if day.tzinfo is None:
        day = day.replace(tzinfo=timezone.utc)
    local = utc_to_local(day, settings.tz_default)
    end_local = datetime.combine(local.date(), time(23, 59, 59))
    return local_to_utc(end_local, settings.tz_default)


def _log_activity(
    db: Session,
    case_id: uuid.UUID,
    action: str,
    actor_id: Optional[uuid.UUID],
    details: Optional[dict] = None,
) -> None:
    db.add(
        OffboardingActivityLog(
            offboarding_case_id=case_id,
            action=action,
            details=details or {},
            created_by=actor_id,
        )
    )


def _active_case_for_user(db: Session, user_id: uuid.UUID, exclude_id: Optional[uuid.UUID] = None) -> Optional[OffboardingCase]:
    q = db.query(OffboardingCase).filter(
        OffboardingCase.user_id == user_id,
        OffboardingCase.status.in_(("draft", "in_progress")),
    )
    if exclude_id:
        q = q.filter(OffboardingCase.id != exclude_id)
    return q.first()


def _snapshot_employee_context(db: Session, user: User, ep: Optional[EmployeeProfile]) -> dict:
    if ep is None:
        ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user.id).first()
    return {
        "snapshot_employee_name": _employee_display_name(db, user, ep),
        "snapshot_position": (ep.job_title if ep else None) or None,
        "snapshot_division": (ep.division if ep else None) or None,
        "snapshot_manager_user_id": ep.manager_user_id if ep else None,
        "snapshot_manager_name": _manager_name(db, ep.manager_user_id if ep else None),
        "snapshot_termination_date_at_create": ep.termination_date if ep else None,
    }


def _apply_case_fields(
    case: OffboardingCase,
    *,
    termination_type: Optional[str],
    last_working_day: Optional[datetime],
    internal_notes: Optional[str],
    access_revocation_timing: Optional[str],
    access_revoke_at: Optional[datetime],
) -> None:
    if termination_type is not None:
        if termination_type and termination_type not in TERMINATION_TYPES:
            raise HTTPException(status_code=400, detail="Invalid termination type")
        case.termination_type = termination_type or None
    if last_working_day is not None:
        case.last_working_day = last_working_day
    if internal_notes is not None:
        case.internal_notes = internal_notes
    if access_revocation_timing is not None:
        if access_revocation_timing and access_revocation_timing not in ACCESS_REVOCATION_TIMINGS:
            raise HTTPException(status_code=400, detail="Invalid access revocation timing")
        case.access_revocation_timing = access_revocation_timing or None
    if access_revoke_at is not None:
        case.access_revoke_at = access_revoke_at


def _sync_termination_date_to_profile(
    db: Session,
    user_id: uuid.UUID,
    termination_date: Optional[datetime],
    actor_id: uuid.UUID,
) -> None:
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first()
    if not ep:
        ep = EmployeeProfile(user_id=user_id)
        db.add(ep)
    ep.termination_date = termination_date
    ep.updated_at = datetime.now(timezone.utc)
    ep.updated_by = actor_id


def _seed_checklist(db: Session, case_id: uuid.UUID) -> None:
    existing = {
        row.item_key
        for row in db.query(OffboardingChecklistItem).filter(OffboardingChecklistItem.offboarding_case_id == case_id).all()
    }
    for key, _, _ in CHECKLIST_ITEMS:
        if key in existing:
            continue
        db.add(OffboardingChecklistItem(offboarding_case_id=case_id, item_key=key))


def _fleet_asset_type_label(asset_type: Optional[str]) -> str:
    t = (asset_type or "").lower()
    if t == "vehicle":
        return "Vehicle"
    if t == "heavy_machinery":
        return "Heavy machinery"
    if t == "other":
        return "Other asset"
    return "Equipment"


def _employee_equipment_type_label(eq_type: str) -> str:
    mapping = {
        "phone": "Device",
        "notebook": "Device",
        "tool": "Tool",
        "vehicle": "Vehicle",
        "other": "Other",
    }
    return mapping.get((eq_type or "").lower(), "Other")


def _collect_asset_link_candidates(db: Session, user_id: uuid.UUID) -> List[dict]:
    out: List[dict] = []

    assignments = (
        db.query(AssetAssignment)
        .filter(AssetAssignment.assigned_to_user_id == user_id, AssetAssignment.returned_at.is_(None))
        .all()
    )
    for a in assignments:
        asset_name = ""
        asset_type = "Equipment"
        fleet_asset_id = None
        equipment_id = None
        if a.fleet_asset_id:
            fa = db.query(FleetAsset).filter(FleetAsset.id == a.fleet_asset_id).first()
            asset_name = fa.name if fa else ""
            asset_type = _fleet_asset_type_label(fa.asset_type if fa else None)
            fleet_asset_id = a.fleet_asset_id
        elif a.equipment_id:
            eq = db.query(Equipment).filter(Equipment.id == a.equipment_id).first()
            asset_name = eq.name if eq else ""
            asset_type = (eq.category if eq and eq.category else "Equipment") or "Equipment"
            equipment_id = a.equipment_id
        out.append(
            {
                "source_type": "asset_assignment",
                "source_id": a.id,
                "asset_name_snapshot": asset_name or "Asset",
                "asset_type_snapshot": asset_type,
                "assigned_at_snapshot": a.assigned_at,
                "status_at_case_creation": "assigned",
                "fleet_asset_id": fleet_asset_id,
                "equipment_id": equipment_id,
            }
        )

    checkouts = (
        db.query(EquipmentCheckout, Equipment)
        .join(Equipment, EquipmentCheckout.equipment_id == Equipment.id)
        .filter(
            EquipmentCheckout.checked_out_by_user_id == user_id,
            EquipmentCheckout.status == "checked_out",
        )
        .all()
    )
    for co, eq in checkouts:
        out.append(
            {
                "source_type": "equipment_checkout",
                "source_id": co.id,
                "asset_name_snapshot": eq.name or "Equipment",
                "asset_type_snapshot": (eq.category or "Tool") or "Tool",
                "assigned_at_snapshot": co.checked_out_at,
                "status_at_case_creation": "checked_out",
                "fleet_asset_id": None,
                "equipment_id": co.equipment_id,
            }
        )

    hr_equipment = (
        db.query(EmployeeEquipment)
        .filter(EmployeeEquipment.user_id == user_id, EmployeeEquipment.status == "assigned")
        .all()
    )
    for eq in hr_equipment:
        out.append(
            {
                "source_type": "employee_equipment",
                "source_id": eq.id,
                "asset_name_snapshot": eq.name,
                "asset_type_snapshot": _employee_equipment_type_label(eq.equipment_type),
                "assigned_at_snapshot": eq.assigned_date,
                "status_at_case_creation": "assigned",
                "fleet_asset_id": None,
                "equipment_id": None,
            }
        )

    card_assignments = (
        db.query(CompanyCreditCardAssignment, CompanyCreditCard)
        .join(CompanyCreditCard, CompanyCreditCardAssignment.company_credit_card_id == CompanyCreditCard.id)
        .filter(
            CompanyCreditCardAssignment.assigned_to_user_id == user_id,
            CompanyCreditCardAssignment.is_active.is_(True),
        )
        .all()
    )
    for ca, card in card_assignments:
        label = card.label or f"Card •••• {card.last_four}" if card else "Corporate card"
        out.append(
            {
                "source_type": "credit_card_assignment",
                "source_id": ca.id,
                "asset_name_snapshot": label,
                "asset_type_snapshot": "Access card",
                "assigned_at_snapshot": ca.assigned_at,
                "status_at_case_creation": "assigned",
                "fleet_asset_id": None,
                "equipment_id": None,
            }
        )

    return out


def _seed_asset_links(db: Session, case: OffboardingCase) -> int:
    existing = db.query(OffboardingAssetLink).filter(OffboardingAssetLink.offboarding_case_id == case.id).count()
    if existing:
        return existing
    candidates = _collect_asset_link_candidates(db, case.user_id)
    for c in candidates:
        db.add(
            OffboardingAssetLink(
                offboarding_case_id=case.id,
                source_type=c["source_type"],
                source_id=c["source_id"],
                asset_name_snapshot=c["asset_name_snapshot"],
                asset_type_snapshot=c["asset_type_snapshot"],
                assigned_at_snapshot=c["assigned_at_snapshot"],
                status_at_case_creation=c["status_at_case_creation"],
                fleet_asset_id=c["fleet_asset_id"],
                equipment_id=c["equipment_id"],
            )
        )
    return len(candidates)


def resolve_asset_link_live_status(db: Session, link: OffboardingAssetLink) -> Tuple[str, str]:
    """Return (current_status, return_status). return_status: pending_return|returned|damaged|missing|not_applicable."""
    st = link.source_type
    sid = link.source_id

    if st == "asset_assignment":
        a = db.query(AssetAssignment).filter(AssetAssignment.id == sid).first()
        if not a:
            return "Unknown", "returned"
        if a.returned_at is None:
            return "Assigned", "pending_return"
        return "Returned", "returned"

    if st == "equipment_checkout":
        co = db.query(EquipmentCheckout).filter(EquipmentCheckout.id == sid).first()
        if not co:
            return "Unknown", "returned"
        status = (co.status or "").lower()
        if status == "checked_out":
            return "Assigned", "pending_return"
        if status == "overdue":
            return "Overdue", "pending_return"
        return "Returned", "returned"

    if st == "employee_equipment":
        eq = db.query(EmployeeEquipment).filter(EmployeeEquipment.id == sid).first()
        if not eq:
            return "Unknown", "returned"
        status = (eq.status or "").lower()
        if status == "assigned":
            return "Assigned", "pending_return"
        if status == "damaged":
            return "Damaged", "damaged"
        if status == "lost":
            return "Missing", "missing"
        return "Returned", "returned"

    if st == "credit_card_assignment":
        ca = db.query(CompanyCreditCardAssignment).filter(CompanyCreditCardAssignment.id == sid).first()
        if not ca:
            return "Unknown", "returned"
        if ca.is_active and ca.returned_at is None:
            return "Assigned", "pending_return"
        return "Returned", "returned"

    return "Unknown", "not_applicable"


def count_pending_asset_returns(db: Session, case_id: uuid.UUID) -> int:
    links = db.query(OffboardingAssetLink).filter(OffboardingAssetLink.offboarding_case_id == case_id).all()
    count = 0
    for link in links:
        _, return_status = resolve_asset_link_live_status(db, link)
        if return_status == "pending_return":
            count += 1
    return count


def asset_rows_for_case(db: Session, case_id: uuid.UUID) -> List[dict]:
    links = (
        db.query(OffboardingAssetLink)
        .filter(OffboardingAssetLink.offboarding_case_id == case_id)
        .order_by(OffboardingAssetLink.created_at.asc())
        .all()
    )
    rows = []
    for link in links:
        current_status, return_status = resolve_asset_link_live_status(db, link)
        can_start = return_status == "pending_return" and link.source_type in (
            "asset_assignment",
            "equipment_checkout",
        )
        rows.append(
            {
                "id": str(link.id),
                "source_type": link.source_type,
                "source_id": str(link.source_id),
                "asset_name": link.asset_name_snapshot,
                "asset_type": link.asset_type_snapshot,
                "assigned_since": _format_dt_iso(link.assigned_at_snapshot),
                "current_status": current_status,
                "return_status": return_status,
                "fleet_asset_id": str(link.fleet_asset_id) if link.fleet_asset_id else None,
                "equipment_id": str(link.equipment_id) if link.equipment_id else None,
                "can_start_return": can_start,
            }
        )
    return rows


def operational_summary_for_user(db: Session, user_id: uuid.UUID, case_id: Optional[uuid.UUID] = None) -> dict:
    today = date.today()
    future_shifts = (
        db.query(Shift)
        .filter(Shift.worker_id == user_id, Shift.status == "scheduled", Shift.date >= today)
        .count()
    )
    shift_items = (
        db.query(Shift)
        .filter(Shift.worker_id == user_id, Shift.status == "scheduled", Shift.date >= today)
        .order_by(Shift.date.asc())
        .limit(20)
        .all()
    )
    pending_timesheets = (
        db.query(Attendance)
        .filter(Attendance.worker_id == user_id, Attendance.status == "pending")
        .count()
    )
    user_id_str = str(user_id)
    admin_projects = (
        db.query(Project)
        .filter(Project.project_admin_id == user_id, Project.deleted_at.is_(None))
        .all()
    )
    lead_projects = (
        db.query(Project)
        .filter(
            or_(
                Project.onsite_lead_id == user_id,
                cast(Project.division_onsite_leads, String).like(f"%{user_id_str}%"),
            ),
            Project.deleted_at.is_(None),
        )
        .all()
    )
    project_roles: List[dict] = []
    for p in admin_projects:
        project_roles.append({"project_id": str(p.id), "project_name": p.name or p.code or str(p.id), "role": "Project Admin"})
    for p in lead_projects:
        if any(r["project_id"] == str(p.id) and r["role"] == "On-site Lead" for r in project_roles):
            continue
        project_roles.append({"project_id": str(p.id), "project_name": p.name or p.code or str(p.id), "role": "On-site Lead"})

    safety_assigned = (
        db.query(ProjectSafetyInspection)
        .filter(
            ProjectSafetyInspection.assigned_user_id == user_id,
            ProjectSafetyInspection.status.in_(("draft", "pending_signatures")),
        )
        .count()
    )
    safety_pending_sign = (
        db.query(ProjectSafetyInspectionSignRequest)
        .filter(
            ProjectSafetyInspectionSignRequest.signer_user_id == user_id,
            ProjectSafetyInspectionSignRequest.status == "pending",
        )
        .count()
    )
    safety_count = safety_assigned + safety_pending_sign

    open_tasks = (
        db.query(TaskItem)
        .filter(
            TaskItem.assigned_to_id == user_id,
            TaskItem.archived_at.is_(None),
            TaskItem.status.in_(("accepted", "in_progress", "blocked")),
        )
        .count()
    )

    user = db.query(User).filter(User.id == user_id).first()
    assets_pending = count_pending_asset_returns(db, case_id) if case_id else 0

    return {
        "assets_pending_return": assets_pending,
        "future_shifts": future_shifts,
        "pending_timesheets": pending_timesheets,
        "project_admin_roles": len(admin_projects),
        "onsite_lead_roles": len(lead_projects),
        "safety_items": safety_count,
        "open_tasks": open_tasks,
        "hub_access_active": bool(user.is_active) if user else False,
        "project_roles": project_roles,
        "future_shift_items": [
            {
                "id": str(s.id),
                "date": s.date.isoformat() if s.date else None,
                "project_id": str(s.project_id) if s.project_id else None,
            }
            for s in shift_items
        ],
        "safety_items_list": [],
    }


def compute_action_required(db: Session, case: OffboardingCase, user: User, summary: Optional[dict] = None) -> bool:
    if case.status not in ("draft", "in_progress"):
        return False
    if summary is None:
        summary = operational_summary_for_user(db, case.user_id, case.id)

    if (
        case.access_revocation_timing == "scheduled"
        and case.access_revoke_at
        and user.is_active
    ):
        revoke_at = case.access_revoke_at
        if revoke_at.tzinfo is None:
            revoke_at = revoke_at.replace(tzinfo=timezone.utc)
        if revoke_at <= datetime.now(timezone.utc):
            return True

    if summary.get("assets_pending_return", 0) > 0:
        return True
    if summary.get("future_shifts", 0) > 0:
        return True
    if summary.get("pending_timesheets", 0) > 0:
        return True
    if summary.get("project_admin_roles", 0) > 0 or summary.get("onsite_lead_roles", 0) > 0:
        return True
    if summary.get("safety_items", 0) > 0:
        return True
    return False


def _hub_access_allows_complete_with_active(case: OffboardingCase) -> bool:
    return case.access_revocation_timing in ("scheduled", "manually_later")


def _format_scheduled_revocation_display(case: OffboardingCase) -> Optional[str]:
    if not case.access_revoke_at:
        return None
    local = utc_to_local(case.access_revoke_at, settings.tz_default)
    when = local.strftime("%Y-%m-%d %H:%M")
    return f"{when} ({settings.tz_default})"


def _hub_access_completion_messages(case: OffboardingCase, user: User) -> Tuple[List[str], List[str]]:
    """Return (blockers, warnings) for active hub access at completion time."""
    blockers: List[str] = []
    warnings: List[str] = []
    if not user or not user.is_active:
        return blockers, warnings
    if _hub_access_allows_complete_with_active(case):
        if case.access_revocation_timing == "scheduled":
            when = _format_scheduled_revocation_display(case)
            if when:
                warnings.append(
                    f"Hub access is still Active. It is scheduled to be revoked on {when}."
                )
            else:
                warnings.append(
                    "Hub access is still Active. A scheduled revocation date is not set."
                )
        else:
            warnings.append(
                "Hub access is still Active. Revocation is set to manual — access will remain until deactivated."
            )
    else:
        blockers.append(
            "Hub access is still Active — immediate revocation was selected but access has not been deactivated."
        )
    return blockers, warnings


def deactivate_hub_access(
    db: Session,
    case: OffboardingCase,
    actor_id: Optional[uuid.UUID],
    reason: str,
    action: str = "hub_access_deactivated",
) -> None:
    user = db.query(User).filter(User.id == case.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_active:
        user.is_active = False
        from ..services.refresh_tokens import clear_refresh_tokens_for_user

        clear_refresh_tokens_for_user(db, user.id)
    now = datetime.now(timezone.utc)
    case.access_revoked_at = now
    case.access_revoked_by = actor_id
    case.access_revocation_reason = reason
    case.updated_at = now
    if actor_id:
        case.updated_by = actor_id
    _log_activity(
        db,
        case.id,
        action,
        actor_id,
        {"reason": reason, "user_id": str(case.user_id)},
    )


def enforce_due_revocation_for_user(db: Session, user_id: uuid.UUID) -> bool:
    """If scheduled revocation is due, deactivate user. Returns True if user was deactivated."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        return False
    now = datetime.now(timezone.utc)
    cases = (
        db.query(OffboardingCase)
        .filter(
            OffboardingCase.user_id == user_id,
            OffboardingCase.status.in_(("in_progress", "completed")),
            OffboardingCase.access_revocation_timing == "scheduled",
            OffboardingCase.access_revoke_at.isnot(None),
            OffboardingCase.access_revoke_at <= now,
        )
        .all()
    )
    if not cases:
        return False
    for case in cases:
        deactivate_hub_access(
            db,
            case,
            None,
            "Scheduled offboarding access revocation",
            action="scheduled_access_revocation_executed",
        )
    db.commit()
    return True


def process_due_scheduled_revocations(db: Session) -> int:
    now = datetime.now(timezone.utc)
    cases = (
        db.query(OffboardingCase)
        .filter(
            OffboardingCase.status.in_(("in_progress", "completed")),
            OffboardingCase.access_revocation_timing == "scheduled",
            OffboardingCase.access_revoke_at.isnot(None),
            OffboardingCase.access_revoke_at <= now,
        )
        .all()
    )
    count = 0
    for case in cases:
        user = db.query(User).filter(User.id == case.user_id).first()
        if user and user.is_active:
            deactivate_hub_access(
                db,
                case,
                None,
                "Scheduled offboarding access revocation",
                action="scheduled_access_revocation_executed",
            )
            count += 1
    if count:
        db.commit()
    return count


def _validate_start_fields(data: dict) -> None:
    missing = []
    for field in ("termination_type", "termination_date", "last_working_day", "access_revocation_timing"):
        if not data.get(field):
            missing.append(field)
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required fields: {', '.join(missing)}")
    if data["termination_type"] not in TERMINATION_TYPES:
        raise HTTPException(status_code=400, detail="Invalid termination type")
    if data["access_revocation_timing"] not in ACCESS_REVOCATION_TIMINGS:
        raise HTTPException(status_code=400, detail="Invalid access revocation timing")
    if data["access_revocation_timing"] == "scheduled":
        last_day = _parse_calendar_date_str(data.get("last_working_day"))
        revoke_at = _resolve_access_revoke_at(
            data["access_revocation_timing"],
            last_day,
            data.get("access_revoke_at_local"),
        )
        if not revoke_at:
            raise HTTPException(
                status_code=400,
                detail="Scheduled revocation date and time required",
            )


def _resolve_access_revoke_at(
    access_revocation_timing: Optional[str],
    last_working_day: Optional[datetime],
    access_revoke_at_local: Optional[str],
) -> Optional[datetime]:
    if access_revocation_timing != "scheduled":
        return None
    parsed = _parse_local_datetime(access_revoke_at_local)
    if parsed:
        return parsed
    if last_working_day:
        return _default_revoke_at_utc(last_working_day)
    return None


def save_draft(
    db: Session,
    actor: User,
    payload: dict,
) -> OffboardingCase:
    user_id = uuid.UUID(str(payload["user_id"]))
    if _active_case_for_user(db, user_id):
        raise HTTPException(status_code=400, detail="An active offboarding case already exists for this employee")

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Employee not found")

    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first()
    snap = _snapshot_employee_context(db, target, ep)
    last_day = _parse_calendar_date_str(payload.get("last_working_day"))
    revoke_at = _resolve_access_revoke_at(
        payload.get("access_revocation_timing"),
        last_day,
        payload.get("access_revoke_at_local"),
    )

    case = OffboardingCase(
        user_id=user_id,
        status="draft",
        created_by=actor.id,
        updated_by=actor.id,
        last_working_day=last_day,
        internal_notes=payload.get("internal_notes"),
        access_revoke_at=revoke_at,
        **snap,
    )
    _apply_case_fields(
        case,
        termination_type=payload.get("termination_type"),
        last_working_day=last_day,
        internal_notes=payload.get("internal_notes"),
        access_revocation_timing=payload.get("access_revocation_timing"),
        access_revoke_at=revoke_at,
    )
    db.add(case)
    db.flush()
    _log_activity(db, case.id, "offboarding_draft_saved", actor.id, {"user_id": str(user_id)})
    db.commit()
    db.refresh(case)
    return case


def start_offboarding(
    db: Session,
    actor: User,
    payload: dict,
    case_id: Optional[uuid.UUID] = None,
) -> OffboardingCase:
    _validate_start_fields(payload)
    user_id = uuid.UUID(str(payload["user_id"]))
    termination_date = _parse_calendar_date_str(payload.get("termination_date"))
    last_day = _parse_calendar_date_str(payload.get("last_working_day"))
    if not termination_date or not last_day:
        raise HTTPException(status_code=400, detail="Invalid termination or last working day date")

    revoke_at = _resolve_access_revoke_at(
        payload.get("access_revocation_timing"),
        last_day,
        payload.get("access_revoke_at_local"),
    )

    if case_id:
        case = db.query(OffboardingCase).filter(OffboardingCase.id == case_id).first()
        if not case:
            raise HTTPException(status_code=404, detail="Offboarding case not found")
        if case.status != "draft":
            raise HTTPException(status_code=400, detail="Only draft cases can be started")
        if case.user_id != user_id:
            raise HTTPException(status_code=400, detail="Cannot change employee when starting draft")
    else:
        if _active_case_for_user(db, user_id):
            raise HTTPException(status_code=400, detail="An active offboarding case already exists for this employee")
        target = db.query(User).filter(User.id == user_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="Employee not found")
        ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first()
        snap = _snapshot_employee_context(db, target, ep)
        case = OffboardingCase(user_id=user_id, status="in_progress", created_by=actor.id, **snap)
        db.add(case)
        db.flush()

    _apply_case_fields(
        case,
        termination_type=payload.get("termination_type"),
        last_working_day=last_day,
        internal_notes=payload.get("internal_notes"),
        access_revocation_timing=payload.get("access_revocation_timing"),
        access_revoke_at=revoke_at,
    )
    case.status = "in_progress"
    case.updated_at = datetime.now(timezone.utc)
    case.updated_by = actor.id

    _sync_termination_date_to_profile(db, user_id, termination_date, actor.id)
    _seed_checklist(db, case.id)
    asset_count = _seed_asset_links(db, case)

    action = "offboarding_started" if case_id else "offboarding_created"
    _log_activity(
        db,
        case.id,
        action,
        actor.id,
        {
            "user_id": str(user_id),
            "termination_date": _format_date_iso(termination_date),
            "assets_linked": asset_count,
        },
    )

    if payload.get("access_revocation_timing") == "immediately":
        deactivate_hub_access(db, case, actor.id, "Immediate offboarding access revocation")

    db.commit()
    db.refresh(case)
    return case


def update_case(db: Session, actor: User, case_id: uuid.UUID, payload: dict) -> OffboardingCase:
    case = db.query(OffboardingCase).filter(OffboardingCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Offboarding case not found")
    if case.status in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Cannot edit a completed or cancelled case")

    changes: dict = {}
    last_day = _parse_calendar_date_str(payload.get("last_working_day")) if "last_working_day" in payload else None
    if "termination_date" in payload and case.status == "in_progress":
        td = _parse_calendar_date_str(payload.get("termination_date"))
        _sync_termination_date_to_profile(db, case.user_id, td, actor.id)
        changes["termination_date"] = _format_date_iso(td)

    timing = payload.get("access_revocation_timing") if "access_revocation_timing" in payload else None
    revoke_at = None
    if timing == "scheduled" or (timing is None and case.access_revocation_timing == "scheduled"):
        lwd = last_day if last_day is not None else case.last_working_day
        revoke_local = payload.get("access_revoke_at_local") if "access_revoke_at_local" in payload else None
        revoke_at = _resolve_access_revoke_at(
            timing or case.access_revocation_timing,
            lwd,
            revoke_local,
        )

    _apply_case_fields(
        case,
        termination_type=payload.get("termination_type") if "termination_type" in payload else None,
        last_working_day=last_day,
        internal_notes=payload.get("internal_notes") if "internal_notes" in payload else None,
        access_revocation_timing=timing,
        access_revoke_at=revoke_at if revoke_at is not None or timing == "scheduled" else None,
    )
    case.updated_at = datetime.now(timezone.utc)
    case.updated_by = actor.id
    _log_activity(db, case.id, "offboarding_edited", actor.id, changes or payload)
    db.commit()
    db.refresh(case)
    return case


def complete_case(db: Session, actor: User, case_id: uuid.UUID) -> OffboardingCase:
    case = db.query(OffboardingCase).filter(OffboardingCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Offboarding case not found")
    if case.status != "in_progress":
        raise HTTPException(status_code=400, detail="Only in-progress cases can be completed")

    user = db.query(User).filter(User.id == case.user_id).first()
    if user and user.is_active and not _hub_access_allows_complete_with_active(case):
        raise HTTPException(
            status_code=400,
            detail="Cannot complete while Hub access is still Active",
        )

    pending = count_pending_asset_returns(db, case.id)
    if pending > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot complete while {pending} asset(s) are still pending return",
        )

    case.status = "completed"
    case.updated_at = datetime.now(timezone.utc)
    case.updated_by = actor.id
    _log_activity(db, case.id, "offboarding_completed", actor.id, {})
    db.commit()
    db.refresh(case)
    return case


def cancel_case(
    db: Session,
    actor: User,
    case_id: uuid.UUID,
    *,
    clear_termination_date: bool = False,
    reactivate_hub_access: bool = False,
    reason: Optional[str] = None,
) -> OffboardingCase:
    case = db.query(OffboardingCase).filter(OffboardingCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Offboarding case not found")
    if case.status in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Case is already completed or cancelled")

    case.status = "cancelled"
    case.updated_at = datetime.now(timezone.utc)
    case.updated_by = actor.id

    if clear_termination_date:
        _sync_termination_date_to_profile(db, case.user_id, None, actor.id)
        _log_activity(db, case.id, "termination_date_cleared", actor.id, {})

    if reactivate_hub_access:
        user = db.query(User).filter(User.id == case.user_id).first()
        if user and not user.is_active:
            user.is_active = True
            _log_activity(db, case.id, "hub_access_reactivated", actor.id, {})

    _log_activity(
        db,
        case.id,
        "offboarding_cancelled",
        actor.id,
        {
            "clear_termination_date": clear_termination_date,
            "reactivate_hub_access": reactivate_hub_access,
            "reason": reason,
        },
    )
    db.commit()
    db.refresh(case)
    return case


def delete_case(db: Session, case_id: uuid.UUID) -> None:
    case = db.query(OffboardingCase).filter(OffboardingCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Offboarding case not found")
    db.delete(case)
    db.commit()


def toggle_checklist_item(
    db: Session,
    actor: User,
    case_id: uuid.UUID,
    item_key: str,
    completed: bool,
) -> OffboardingChecklistItem:
    if item_key not in MANUAL_CHECKLIST_KEYS:
        raise HTTPException(status_code=400, detail="This checklist item cannot be toggled manually")
    case = db.query(OffboardingCase).filter(OffboardingCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Offboarding case not found")
    if case.status not in ("in_progress",):
        raise HTTPException(status_code=400, detail="Checklist can only be edited for in-progress cases")

    row = (
        db.query(OffboardingChecklistItem)
        .filter(
            OffboardingChecklistItem.offboarding_case_id == case_id,
            OffboardingChecklistItem.item_key == item_key,
        )
        .first()
    )
    if not row:
        row = OffboardingChecklistItem(offboarding_case_id=case_id, item_key=item_key)
        db.add(row)
        db.flush()

    row.is_completed = completed
    row.is_not_applicable = False
    row.completed_at = datetime.now(timezone.utc) if completed else None
    row.completed_by = actor.id if completed else None
    _log_activity(
        db,
        case_id,
        "checklist_item_completed" if completed else "checklist_item_reopened",
        actor.id,
        {"item_key": item_key},
    )
    db.commit()
    db.refresh(row)
    return row


def merged_checklist(db: Session, case: OffboardingCase) -> List[dict]:
    stored = {
        row.item_key: row
        for row in db.query(OffboardingChecklistItem).filter(OffboardingChecklistItem.offboarding_case_id == case.id).all()
    }
    user = db.query(User).filter(User.id == case.user_id).first()
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == case.user_id).first()
    links = db.query(OffboardingAssetLink).filter(OffboardingAssetLink.offboarding_case_id == case.id).count()
    pending_assets = count_pending_asset_returns(db, case.id) if links else 0

    rows = []
    for key, label, is_auto in CHECKLIST_ITEMS:
        stored_row = stored.get(key)
        is_na = bool(stored_row.is_not_applicable) if stored_row else False
        is_completed = bool(stored_row.is_completed) if stored_row else False
        completed_at = stored_row.completed_at if stored_row else None
        completed_by = stored_row.completed_by if stored_row else None

        if is_auto:
            if key == "termination_date_recorded":
                is_completed = ep is not None and ep.termination_date is not None
            elif key == "hub_access_deactivated":
                is_completed = user is not None and not user.is_active
            elif key == "assets_returned":
                if links == 0:
                    is_na = True
                    is_completed = True
                else:
                    is_completed = pending_assets == 0

        rows.append(
            {
                "item_key": key,
                "label": label,
                "is_auto": is_auto,
                "is_completed": is_completed,
                "is_not_applicable": is_na,
                "completed_at": _format_dt_iso(completed_at),
                "completed_by_name": get_user_display(db, completed_by) if completed_by else None,
            }
        )
    return rows


def case_to_detail(db: Session, case: OffboardingCase, include_notes: bool = False) -> dict:
    user = db.query(User).filter(User.id == case.user_id).first()
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == case.user_id).first()
    summary = operational_summary_for_user(db, case.user_id, case.id)
    action_required = compute_action_required(db, case, user, summary) if user else False

    blockers: List[str] = []
    warnings: List[str] = []
    hub_blockers, hub_warnings = _hub_access_completion_messages(case, user) if user else ([], [])
    blockers.extend(hub_blockers)
    warnings.extend(hub_warnings)
    if summary["assets_pending_return"] > 0:
        blockers.append(f"{summary['assets_pending_return']} asset(s) pending return")
    if summary["future_shifts"] > 0:
        warnings.append(f"{summary['future_shifts']} future shift(s)")
    if summary["pending_timesheets"] > 0:
        warnings.append(f"{summary['pending_timesheets']} pending timesheet(s)")
    pr = summary["project_admin_roles"] + summary["onsite_lead_roles"]
    if pr > 0:
        warnings.append(f"{pr} project role(s) to review")
    if summary["safety_items"] > 0:
        warnings.append(f"{summary['safety_items']} safety item(s)")
    if summary["open_tasks"] > 0:
        warnings.append(f"{summary['open_tasks']} open task(s)")

    revoke_local = None
    if case.access_revoke_at:
        local = utc_to_local(case.access_revoke_at, settings.tz_default)
        revoke_local = local.strftime("%Y-%m-%dT%H:%M:%S")

    return {
        "id": str(case.id),
        "user_id": str(case.user_id),
        "status": case.status,
        "termination_type": case.termination_type,
        "termination_date": _format_date_iso(ep.termination_date if ep else None),
        "last_working_day": _format_date_iso(case.last_working_day),
        "internal_notes": case.internal_notes if include_notes else None,
        "access_revocation_timing": case.access_revocation_timing,
        "access_revoke_at": _format_dt_iso(case.access_revoke_at),
        "access_revoke_at_local": revoke_local,
        "company_timezone": settings.tz_default,
        "access_revoked_at": _format_dt_iso(case.access_revoked_at),
        "hub_access_active": bool(user.is_active) if user else False,
        "action_required": action_required,
        "employee_name": case.snapshot_employee_name or _employee_display_name(db, user, ep),
        "position": case.snapshot_position or (ep.job_title if ep else None),
        "division": case.snapshot_division or (ep.division if ep else None),
        "manager_user_id": str(case.snapshot_manager_user_id) if case.snapshot_manager_user_id else None,
        "manager_name": case.snapshot_manager_name,
        "created_at": _format_dt_iso(case.created_at),
        "created_by_name": get_user_display(db, case.created_by),
        "operational_summary": summary,
        "completion_blockers": blockers,
        "completion_warnings": warnings,
    }


def list_cases(
    db: Session,
    *,
    q: Optional[str] = None,
    status: Optional[str] = None,
    termination_type: Optional[str] = None,
    division: Optional[str] = None,
    termination_date_from: Optional[str] = None,
    termination_date_to: Optional[str] = None,
    hub_access: Optional[str] = None,
    assets_pending: Optional[bool] = None,
    page: int = 1,
    limit: int = 24,
    sort: str = "created_at",
    sort_dir: str = "desc",
) -> dict:
    query = db.query(OffboardingCase, User, EmployeeProfile).join(
        User, OffboardingCase.user_id == User.id
    ).outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)

    if status and status != "all":
        query = query.filter(OffboardingCase.status == status)
    if termination_type and termination_type != "all":
        query = query.filter(OffboardingCase.termination_type == termination_type)
    if division and division != "all":
        query = query.filter(
            or_(
                OffboardingCase.snapshot_division == division,
                EmployeeProfile.division == division,
            )
        )
    if q:
        like = f"%{q.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(OffboardingCase.snapshot_employee_name).like(like),
                func.lower(User.username).like(like),
                func.lower(EmployeeProfile.job_title).like(like),
            )
        )
    if termination_date_from:
        dt_from = _parse_date_str(termination_date_from)
        if dt_from:
            query = query.filter(EmployeeProfile.termination_date >= dt_from)
    if termination_date_to:
        dt_to = _parse_date_str(termination_date_to)
        if dt_to:
            query = query.filter(EmployeeProfile.termination_date <= dt_to)
    if hub_access == "active":
        query = query.filter(User.is_active.is_(True))
    elif hub_access == "inactive":
        query = query.filter(User.is_active.is_(False))

    total = query.count()
    order_col = OffboardingCase.created_at
    if sort == "employee":
        order_col = OffboardingCase.snapshot_employee_name
    elif sort == "status":
        order_col = OffboardingCase.status
    if sort_dir == "asc":
        query = query.order_by(order_col.asc())
    else:
        query = query.order_by(order_col.desc())

    offset = max(0, (page - 1) * limit)
    rows = query.offset(offset).limit(limit).all()

    items = []
    for case, user, ep in rows:
        summary = operational_summary_for_user(db, case.user_id, case.id)
        if assets_pending is True and summary["assets_pending_return"] == 0:
            continue
        if assets_pending is False and summary["assets_pending_return"] > 0:
            continue
        items.append(
            {
                "id": str(case.id),
                "user_id": str(case.user_id),
                "employee_name": case.snapshot_employee_name or _employee_display_name(db, user, ep),
                "position": case.snapshot_position or (ep.job_title if ep else None),
                "division": case.snapshot_division or (ep.division if ep else None),
                "termination_date": _format_date_iso(ep.termination_date if ep else None),
                "last_working_day": _format_date_iso(case.last_working_day),
                "hub_access_active": bool(user.is_active),
                "status": case.status,
                "action_required": compute_action_required(db, case, user, summary),
                "assets_pending_return": summary["assets_pending_return"],
                "created_at": _format_dt_iso(case.created_at),
            }
        )

    total_pages = max(1, math.ceil(total / limit)) if limit else 1
    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
    }


def eligible_employees(db: Session) -> List[dict]:
    active_case_user_ids = {
        str(r[0])
        for r in db.query(OffboardingCase.user_id).filter(
            OffboardingCase.status.in_(("draft", "in_progress"))
        ).all()
    }
    users = db.query(User, EmployeeProfile).outerjoin(
        EmployeeProfile, EmployeeProfile.user_id == User.id
    ).filter(User.is_active.is_(True)).order_by(User.username.asc()).all()

    out = []
    for user, ep in users:
        if str(user.id) in active_case_user_ids:
            continue
        out.append(
            {
                "id": str(user.id),
                "name": _employee_display_name(db, user, ep),
                "username": user.username,
                "job_title": ep.job_title if ep else None,
            }
        )
    return out


def activity_log_rows(db: Session, case_id: uuid.UUID, page: int = 1, limit: int = 50) -> dict:
    q = (
        db.query(OffboardingActivityLog)
        .filter(OffboardingActivityLog.offboarding_case_id == case_id)
        .order_by(OffboardingActivityLog.created_at.desc())
    )
    total = q.count()
    rows = q.offset((page - 1) * limit).limit(limit).all()
    items = []
    for row in rows:
        items.append(
            {
                "id": str(row.id),
                "action": row.action,
                "action_label": ACTION_LABELS.get(row.action, row.action.replace("_", " ").title()),
                "created_at": _format_dt_iso(row.created_at),
                "performed_by_name": get_user_display(db, row.created_by) if row.created_by else "System",
                "details": row.details or {},
            }
        )
    return {"items": items, "total": total, "page": page, "limit": limit}
