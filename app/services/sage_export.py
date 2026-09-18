"""Sage Time Slip export state on Attendance (queue / sent / paid).

The Windows companion pulls queued rows and acks sent/paid. MKHub never talks to Sage.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

from ..models.models import Attendance
from .attendance_period import ENTRY_KIND_HOURS_ONLY, effective_declared_hours, effective_entry_kind

SAGE_NONE = "none"
SAGE_QUEUED = "queued"
SAGE_SENT = "sent"
SAGE_PAID = "paid"
SAGE_ERROR = "error"
SOURCE_VERICLOCK = "vericlock"

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
    hexid = str(getattr(att, "id", "") or "").replace("-", "")
    if not hexid or hexid.lower() == "none":
        raise ValueError("attendance id is required for Sage source key")
    return ("MKH" + hexid)[:20]


def _has_persisted_id(att: Attendance) -> bool:
    hexid = str(getattr(att, "id", "") or "").replace("-", "")
    return bool(hexid) and hexid.lower() != "none"


def _ensure_source_key(att: Attendance) -> None:
    if not _has_persisted_id(att):
        return
    key = (getattr(att, "sage_source_key", None) or "").strip()
    if not key or key.startswith("MKHNone") or len(key) < 8:
        att.sage_source_key = sage_source_key_for(att)


def hours_for_export(att: Attendance) -> Optional[float]:
    declared = effective_declared_hours(att)
    if declared is not None and declared > 0:
        return declared
    clock_in = getattr(att, "clock_in_time", None)
    clock_out = getattr(att, "clock_out_time", None)
    if not clock_in or not clock_out:
        return None
    try:
        seconds = (clock_out - clock_in).total_seconds()
    except TypeError:
        return None
    hours = seconds / 3600.0
    break_min = getattr(att, "break_minutes", None) or 0
    try:
        hours -= float(break_min) / 60.0
    except (TypeError, ValueError):
        pass
    return max(0.0, hours)


def hours_hhmmss(hours: Optional[float]) -> Optional[str]:
    if hours is None:
        return None
    total = int(round(float(hours) * 3600))
    if total < 0:
        total = 0
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def work_date_mmddyyyy(att: Attendance, tz_name: str = "America/Vancouver") -> Optional[str]:
    raw = getattr(att, "clock_in_time", None) or getattr(att, "clock_out_time", None)
    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            raw = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None
    if raw.tzinfo is None:
        raw = raw.replace(tzinfo=timezone.utc)
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = timezone.utc
    local = raw.astimezone(tz)
    return local.strftime("%m-%d-%Y")


def worker_display_name(profile: Any, user: Any) -> str:
    if profile is not None:
        preferred = (getattr(profile, "preferred_name", None) or "").strip()
        if preferred:
            return preferred
        first = (getattr(profile, "first_name", None) or "").strip()
        last = (getattr(profile, "last_name", None) or "").strip()
        name = " ".join(p for p in (first, last) if p)
        if name:
            return name
    if user is not None:
        return (getattr(user, "name", None) or getattr(user, "username", None) or "Unknown").strip() or "Unknown"
    return "Unknown"


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
    source = (getattr(att, "source", None) or "").strip().lower()
    if source == SOURCE_VERICLOCK:
        # Already in Sage via VeriClock — never queue for the companion.
        att.sage_state = SAGE_SENT
        att.sage_urgent = False
        att.sage_error = None
        return
    if not is_sage_eligible(att):
        if current == SAGE_SENT:
            return
        att.sage_state = SAGE_NONE
        return
    _ensure_source_key(att)
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


def sage_queue_payload(
    att: Attendance,
    *,
    worker_name: Optional[str] = None,
    sage_item: Optional[str] = None,
    sage_customer: str = "0 Customer",
    tz_name: str = "America/Vancouver",
) -> Dict[str, Any]:
    clock_in = getattr(att, "clock_in_time", None)
    clock_out = getattr(att, "clock_out_time", None)
    _ensure_source_key(att)
    fields = sage_response_fields(att)
    hours = hours_for_export(att)
    name = (worker_name or "").strip() or "Unknown"
    return {
        "attendance_id": str(att.id),
        "worker_id": str(att.worker_id),
        "worker_name": name,
        "sage_employee_name": name,
        "clock_in_time": clock_in.isoformat() if hasattr(clock_in, "isoformat") else clock_in,
        "clock_out_time": clock_out.isoformat() if hasattr(clock_out, "isoformat") else clock_out,
        "work_date": work_date_mmddyyyy(att, tz_name),
        "hours": hours,
        "hours_hhmmss": hours_hhmmss(hours),
        "entry_kind": effective_entry_kind(att),
        "declared_hours": effective_declared_hours(att),
        "sage_item": sage_item,
        "sage_customer": sage_customer,
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
    _ensure_source_key(att)
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
