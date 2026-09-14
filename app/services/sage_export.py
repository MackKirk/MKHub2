"""Sage Time Slip export state on Attendance (queue / sent / paid).

The Windows companion pulls queued rows and acks sent/paid. MKHub never talks to Sage.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from ..models.models import Attendance
from .attendance_period import ENTRY_KIND_HOURS_ONLY, effective_declared_hours, effective_entry_kind

SAGE_NONE = "none"
SAGE_QUEUED = "queued"
SAGE_SENT = "sent"
SAGE_PAID = "paid"
SAGE_ERROR = "error"

SAGE_PAID_MESSAGE = (
    "These hours were already used in Sage payroll and cannot be changed."
)

def _stored_state(att: Attendance) -> str:
    return (getattr(att, "sage_state", None) or SAGE_NONE).strip().lower() or SAGE_NONE


def is_closed_attendance(att: Attendance) -> bool:
    hours = effective_declared_hours(att)
    if hours is not None and hours > 0:
        return True
    kind = effective_entry_kind(att)
    if kind == ENTRY_KIND_HOURS_ONLY:
        return bool(getattr(att, "clock_in_time", None) or getattr(att, "clock_out_time", None))
    return bool(getattr(att, "clock_in_time", None) and getattr(att, "clock_out_time", None))


def is_sage_eligible(att: Attendance) -> bool:
    status = (getattr(att, "status", None) or "").strip().lower()
    if status != "approved":
        return False
    return is_closed_attendance(att)


def is_sage_paid(att: Attendance) -> bool:
    return _stored_state(att) == SAGE_PAID


def sage_source_key_for(att: Attendance) -> str:
    hexid = str(att.id).replace("-", "")
    return ("MKH" + hexid)[:20]


def sage_display_state(att: Attendance) -> str:
    stored = _stored_state(att)
    if stored == SAGE_PAID:
        return SAGE_PAID
    if stored == SAGE_SENT:
        return SAGE_SENT
    if not is_sage_eligible(att):
        return SAGE_NONE
    if stored == SAGE_ERROR:
        return SAGE_ERROR
    return SAGE_QUEUED


def refresh_sage_export_state(att: Attendance, *, hours_changed: bool = False) -> None:
    """Update sage_* columns. Does not commit. Paid rows are never changed here."""
    current = _stored_state(att)
    if current == SAGE_PAID:
        return
    if not is_sage_eligible(att):
        if current == SAGE_SENT:
            return
        att.sage_state = SAGE_NONE
        return
    if not getattr(att, "sage_source_key", None):
        att.sage_source_key = sage_source_key_for(att)
    if current == SAGE_SENT and hours_changed:
        att.sage_state = SAGE_QUEUED
        att.sage_error = None
        att.sage_urgent = True
        return
    if current in (SAGE_NONE, SAGE_QUEUED, SAGE_ERROR, ""):
        att.sage_state = SAGE_QUEUED
        if current != SAGE_ERROR:
            att.sage_error = None


def sage_response_fields(att: Attendance) -> Dict[str, Any]:
    state = sage_display_state(att)
    synced = getattr(att, "sage_synced_at", None)
    paid = getattr(att, "sage_paid_at", None)
    return {
        "sage_state": state,
        "sage_source_key": getattr(att, "sage_source_key", None),
        "sage_synced_at": synced.isoformat() if synced else None,
        "sage_paid_at": paid.isoformat() if paid else None,
        "sage_error": getattr(att, "sage_error", None),
        "sage_urgent": bool(getattr(att, "sage_urgent", False)),
        "sage_locked": state == SAGE_PAID,
        "sage_rec_id": getattr(att, "sage_rec_id", None),
    }


def sage_queue_payload(att: Attendance) -> Dict[str, Any]:
    clock_in = getattr(att, "clock_in_time", None)
    clock_out = getattr(att, "clock_out_time", None)
    fields = sage_response_fields(att)
    if not fields.get("sage_source_key"):
        fields["sage_source_key"] = sage_source_key_for(att)
    return {
        "attendance_id": str(att.id),
        "worker_id": str(att.worker_id),
        "clock_in_time": clock_in.isoformat() if clock_in else None,
        "clock_out_time": clock_out.isoformat() if clock_out else None,
        "entry_kind": effective_entry_kind(att),
        "declared_hours": effective_declared_hours(att),
        "status": getattr(att, "status", None),
        **fields,
    }


def apply_sage_ack(
    att: Attendance,
    *,
    state: str,
    sage_rec_id: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    from datetime import datetime, timezone

    wanted = (state or "").strip().lower()
    if wanted not in (SAGE_SENT, SAGE_PAID, SAGE_ERROR, SAGE_QUEUED):
        raise ValueError("state must be queued, sent, paid, or error")
    if is_sage_paid(att) and wanted != SAGE_PAID:
        raise ValueError("paid rows cannot be moved back")
    now = datetime.now(timezone.utc)
    att.sage_state = wanted
    if sage_rec_id:
        att.sage_rec_id = str(sage_rec_id)[:40]
    if not getattr(att, "sage_source_key", None):
        att.sage_source_key = sage_source_key_for(att)
    if wanted == SAGE_SENT:
        att.sage_synced_at = now
        att.sage_error = None
        att.sage_urgent = False
    elif wanted == SAGE_PAID:
        att.sage_paid_at = now
        att.sage_error = None
        att.sage_urgent = False
    elif wanted == SAGE_ERROR:
        att.sage_error = (error or "Sage export failed")[:2000]
    elif wanted == SAGE_QUEUED:
        att.sage_error = None
