"""Project start-date reminders: occurrence math + hourly send processor."""
from __future__ import annotations

import calendar
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Optional

import pytz
from sqlalchemy.orm import Session

from ..models.models import Project, ProjectStartReminder, ProjectStartReminderEvent
from ..services.business_line import BUSINESS_LINE_REPAIRS_MAINTENANCE
from ..services.notifications import create_notification

COMPANY_TZ = "America/Vancouver"
DEFAULT_SEND_TIME = "08:00"

VALID_OFFSET_UNITS = frozenset({"days", "weeks", "months"})
VALID_OFFSET_DIRECTIONS = frozenset({"before", "after"})
VALID_RECURRENCES = frozenset({"once", "daily", "weekly", "every_n_days"})
VALID_ENDS = frozenset({"on_anchor", "after_count", "on_date"})
VALID_START_MODES = frozenset({"relative", "absolute"})


def _as_uuid(value: Any) -> Optional[uuid.UUID]:
    if not value:
        return None
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


def _today(tz_name: str = COMPANY_TZ) -> date:
    return datetime.now(pytz.timezone(tz_name)).date()


def _now_local(tz_name: str = COMPANY_TZ) -> datetime:
    return datetime.now(pytz.timezone(tz_name))


def _parse_send_time(value: Optional[str]) -> time:
    raw = (value or DEFAULT_SEND_TIME).strip()
    try:
        parts = raw.split(":")
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        return time(hour=hour, minute=minute)
    except (ValueError, IndexError, TypeError):
        return time(8, 0)


def add_months(d: date, months: int) -> date:
    """Shift calendar months, clamping day to the last day of the target month."""
    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    last = calendar.monthrange(y, m)[1]
    return date(y, m, min(d.day, last))


def project_anchor_date(project: Project) -> Optional[date]:
    raw = getattr(project, "date_start", None)
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).date()
    except (ValueError, TypeError):
        return None


def apply_offset(
    anchor: date,
    *,
    offset_value: int,
    offset_unit: str,
    offset_direction: str,
) -> date:
    value = abs(int(offset_value or 0))
    unit = (offset_unit or "days").lower()
    direction = (offset_direction or "before").lower()
    sign = -1 if direction == "before" else 1
    if unit == "months":
        return add_months(anchor, sign * value)
    if unit == "weeks":
        return anchor + timedelta(days=sign * value * 7)
    return anchor + timedelta(days=sign * value)


def generate_occurrences(
    *,
    window_start: date,
    window_end: date,
    recurrence: str,
    recurrence_interval: Optional[int] = None,
    ends: str = "on_anchor",
    end_count: Optional[int] = None,
    end_date: Optional[date] = None,
) -> list[date]:
    """Return occurrence dates inclusive of window_start/window_end rules."""
    recurrence = (recurrence or "once").lower()
    ends = (ends or "on_anchor").lower()

    if recurrence == "once":
        return [window_start]

    hard_end = window_end
    if ends == "on_date" and end_date:
        hard_end = min(window_end, end_date) if window_end else end_date
    if hard_end < window_start:
        return []

    if recurrence == "daily":
        step = 1
    elif recurrence == "weekly":
        step = 7
    elif recurrence == "every_n_days":
        step = max(1, int(recurrence_interval or 1))
    else:
        return [window_start]

    out: list[date] = []
    current = window_start
    max_iters = 3660  # ~10 years daily
    while current <= hard_end and len(out) < max_iters:
        out.append(current)
        if ends == "after_count" and end_count and len(out) >= int(end_count):
            break
        current = current + timedelta(days=step)
    return out


def compute_window_and_occurrences(
    reminder: ProjectStartReminder,
    anchor: Optional[date],
) -> tuple[Optional[date], Optional[date], list[date]]:
    start_mode = str(getattr(reminder, "start_mode", "relative") or "relative").lower()
    ends = str(getattr(reminder, "ends", "on_anchor") or "on_anchor").lower()
    end_date = getattr(reminder, "end_date", None)

    if start_mode == "absolute":
        window_start = getattr(reminder, "absolute_start_date", None)
        if not isinstance(window_start, date):
            return None, None, []
    else:
        if not anchor:
            return None, None, []
        window_start = apply_offset(
            anchor,
            offset_value=int(getattr(reminder, "offset_value", 0) or 0),
            offset_unit=str(getattr(reminder, "offset_unit", "days") or "days"),
            offset_direction=str(getattr(reminder, "offset_direction", "before") or "before"),
        )

    if ends == "on_date" and end_date:
        window_end = end_date
    elif anchor:
        # on_anchor / after_count use project start as natural end when available
        window_end = anchor
    else:
        window_end = window_start

    # If offset is after start date, window_start may be after anchor —
    # still allow once-on-that-day; for recurring, extend end to at least window_start.
    if window_end < window_start and ends != "on_date":
        window_end = window_start

    occurrences = generate_occurrences(
        window_start=window_start,
        window_end=window_end,
        recurrence=str(getattr(reminder, "recurrence", "once") or "once"),
        recurrence_interval=getattr(reminder, "recurrence_interval", None),
        ends=ends,
        end_count=getattr(reminder, "end_count", None),
        end_date=end_date if isinstance(end_date, date) else None,
    )
    return window_start, window_end, occurrences


def next_occurrence_on_or_after(
    occurrences: list[date],
    on_or_after: date,
) -> Optional[date]:
    for d in occurrences:
        if d >= on_or_after:
            return d
    return None


def all_occurrences_past(occurrences: list[date], today: date) -> bool:
    if not occurrences:
        return True
    return all(d < today for d in occurrences)


def project_link(project: Project) -> str:
    line = getattr(project, "business_line", None) or ""
    prefix = "/rm-projects" if line == BUSINESS_LINE_REPAIRS_MAINTENANCE else "/projects"
    return f"{prefix}/{project.id}"


def _display_name(project: Project) -> str:
    name = (getattr(project, "name", None) or "").strip()
    if name:
        return name
    code = (getattr(project, "code", None) or "").strip()
    return code or "This project"


def default_message(project: Project, anchor: date) -> str:
    return f"{_display_name(project)} is scheduled to start on {anchor.isoformat()}."


def normalize_recipient_ids(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        uid = _as_uuid(item)
        if not uid:
            continue
        key = str(uid)
        if key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def validate_reminder_fields(payload: dict[str, Any], *, partial: bool = False) -> dict[str, Any]:
    """Normalize and validate create/patch fields. Raises ValueError with message."""
    out: dict[str, Any] = {}

    if "recipient_user_ids" in payload or not partial:
        recipients = normalize_recipient_ids(payload.get("recipient_user_ids"))
        if not recipients:
            raise ValueError("At least one recipient is required")
        out["recipient_user_ids"] = recipients

    if "start_mode" in payload or not partial:
        start_mode = str(payload.get("start_mode") or "relative").lower()
        if start_mode not in VALID_START_MODES:
            raise ValueError("Invalid start_mode")
        out["start_mode"] = start_mode

    start_mode = out.get("start_mode") or str(payload.get("start_mode") or "relative").lower()

    if "absolute_start_date" in payload or (not partial and start_mode == "absolute"):
        raw_abs = payload.get("absolute_start_date")
        if start_mode == "absolute":
            if not raw_abs:
                raise ValueError("absolute_start_date is required when start_mode=absolute")
            if isinstance(raw_abs, date) and not isinstance(raw_abs, datetime):
                out["absolute_start_date"] = raw_abs
            else:
                try:
                    out["absolute_start_date"] = date.fromisoformat(str(raw_abs)[:10])
                except ValueError as e:
                    raise ValueError("Invalid absolute_start_date") from e
        elif "absolute_start_date" in payload:
            if raw_abs in (None, ""):
                out["absolute_start_date"] = None
            else:
                try:
                    out["absolute_start_date"] = date.fromisoformat(str(raw_abs)[:10])
                except ValueError as e:
                    raise ValueError("Invalid absolute_start_date") from e

    if start_mode == "absolute" and not partial:
        out.setdefault("offset_direction", "before")
        out.setdefault("offset_unit", "days")
        out.setdefault("offset_value", 0)

    if "offset_direction" in payload or (not partial and start_mode != "absolute"):
        direction = str(payload.get("offset_direction") or "before").lower()
        if direction not in VALID_OFFSET_DIRECTIONS:
            raise ValueError("Invalid offset_direction")
        out["offset_direction"] = direction

    if "offset_unit" in payload or (not partial and start_mode != "absolute"):
        unit = str(payload.get("offset_unit") or "days").lower()
        if unit not in VALID_OFFSET_UNITS:
            raise ValueError("Invalid offset_unit")
        out["offset_unit"] = unit

    if "offset_value" in payload or (not partial and start_mode != "absolute"):
        try:
            value = int(payload.get("offset_value", 0))
        except (TypeError, ValueError):
            raise ValueError("Invalid offset_value") from None
        if value < 0:
            raise ValueError("offset_value must be >= 0")
        out["offset_value"] = value

    if "recurrence" in payload or not partial:
        recurrence = str(payload.get("recurrence") or "once").lower()
        if recurrence not in VALID_RECURRENCES:
            raise ValueError("Invalid recurrence")
        out["recurrence"] = recurrence

    if "recurrence_interval" in payload or (not partial and out.get("recurrence") == "every_n_days"):
        recurrence = out.get("recurrence") or str(payload.get("recurrence") or "once").lower()
        raw_interval = payload.get("recurrence_interval")
        if recurrence == "every_n_days":
            try:
                interval = int(raw_interval)
            except (TypeError, ValueError):
                raise ValueError("recurrence_interval is required for every_n_days") from None
            if interval < 1:
                raise ValueError("recurrence_interval must be >= 1")
            out["recurrence_interval"] = interval
        elif "recurrence_interval" in payload:
            out["recurrence_interval"] = int(raw_interval) if raw_interval is not None else None

    if "ends" in payload or not partial:
        ends = str(payload.get("ends") or "on_anchor").lower()
        if ends not in VALID_ENDS:
            raise ValueError("Invalid ends")
        out["ends"] = ends

    if "end_count" in payload or (not partial and out.get("ends") == "after_count"):
        ends = out.get("ends") or str(payload.get("ends") or "on_anchor").lower()
        raw_count = payload.get("end_count")
        if ends == "after_count":
            try:
                count = int(raw_count)
            except (TypeError, ValueError):
                raise ValueError("end_count is required when ends=after_count") from None
            if count < 1:
                raise ValueError("end_count must be >= 1")
            out["end_count"] = count
        elif "end_count" in payload:
            out["end_count"] = int(raw_count) if raw_count is not None else None

    if "end_date" in payload or (not partial and out.get("ends") == "on_date"):
        ends = out.get("ends") or str(payload.get("ends") or "on_anchor").lower()
        raw_end = payload.get("end_date")
        if ends == "on_date":
            if not raw_end:
                raise ValueError("end_date is required when ends=on_date")
            if isinstance(raw_end, date) and not isinstance(raw_end, datetime):
                out["end_date"] = raw_end
            else:
                try:
                    out["end_date"] = date.fromisoformat(str(raw_end)[:10])
                except ValueError as e:
                    raise ValueError("Invalid end_date") from e
        elif "end_date" in payload:
            if raw_end in (None, ""):
                out["end_date"] = None
            else:
                try:
                    out["end_date"] = date.fromisoformat(str(raw_end)[:10])
                except ValueError as e:
                    raise ValueError("Invalid end_date") from e

    if "message" in payload:
        msg = payload.get("message")
        out["message"] = (str(msg).strip() or None) if msg is not None else None

    if "is_active" in payload or not partial:
        if "is_active" in payload:
            out["is_active"] = bool(payload.get("is_active"))
        elif not partial:
            out["is_active"] = True

    if "send_time_local" in payload:
        out["send_time_local"] = str(payload.get("send_time_local") or DEFAULT_SEND_TIME).strip() or DEFAULT_SEND_TIME

    if "timezone" in payload:
        out["timezone"] = str(payload.get("timezone") or COMPANY_TZ).strip() or COMPANY_TZ

    out.setdefault("anchor", "date_start")
    return out


def serialize_reminder(
    reminder: ProjectStartReminder,
    project: Project,
    *,
    today: Optional[date] = None,
) -> dict[str, Any]:
    today = today or _today(getattr(reminder, "timezone", None) or COMPANY_TZ)
    anchor = project_anchor_date(project)
    window_start = window_end = next_occ = None
    occurrences: list[date] = []
    start_mode = str(getattr(reminder, "start_mode", "relative") or "relative").lower()
    if start_mode == "absolute" or anchor:
        window_start, window_end, occurrences = compute_window_and_occurrences(reminder, anchor)
        next_occ = next_occurrence_on_or_after(occurrences, today)

    return {
        "id": str(reminder.id),
        "project_id": str(reminder.project_id),
        "recipient_user_ids": list(reminder.recipient_user_ids or []),
        "anchor": reminder.anchor,
        "start_mode": start_mode,
        "absolute_start_date": (
            reminder.absolute_start_date.isoformat() if getattr(reminder, "absolute_start_date", None) else None
        ),
        "offset_direction": reminder.offset_direction,
        "offset_unit": reminder.offset_unit,
        "offset_value": reminder.offset_value,
        "recurrence": reminder.recurrence,
        "recurrence_interval": reminder.recurrence_interval,
        "ends": reminder.ends,
        "end_count": reminder.end_count,
        "end_date": reminder.end_date.isoformat() if reminder.end_date else None,
        "send_time_local": reminder.send_time_local,
        "timezone": reminder.timezone,
        "message": reminder.message,
        "is_active": bool(reminder.is_active),
        "created_by_user_id": str(reminder.created_by_user_id) if reminder.created_by_user_id else None,
        "created_at": reminder.created_at.isoformat() if reminder.created_at else None,
        "updated_at": reminder.updated_at.isoformat() if reminder.updated_at else None,
        "window_start": window_start.isoformat() if window_start else None,
        "window_end": window_end.isoformat() if window_end else None,
        "next_occurrence": next_occ.isoformat() if next_occ else None,
    }


def process_project_start_reminders(db: Session) -> int:
    """Send due project start reminders. Returns how many notifications were created."""
    reminders = (
        db.query(ProjectStartReminder)
        .filter(ProjectStartReminder.is_active.is_(True))
        .all()
    )
    if not reminders:
        return 0

    project_ids = list({r.project_id for r in reminders})
    projects = {
        p.id: p
        for p in db.query(Project)
        .filter(Project.id.in_(project_ids), Project.deleted_at.is_(None))
        .all()
    }

    created = 0
    for reminder in reminders:
        project = projects.get(reminder.project_id)
        if not project:
            continue
        anchor = project_anchor_date(project)
        start_mode = str(getattr(reminder, "start_mode", "relative") or "relative").lower()
        if start_mode != "absolute" and not anchor:
            continue

        tz_name = reminder.timezone or COMPANY_TZ
        try:
            now_local = _now_local(tz_name)
        except Exception:
            now_local = _now_local(COMPANY_TZ)
            tz_name = COMPANY_TZ
        today = now_local.date()
        send_t = _parse_send_time(reminder.send_time_local)
        if now_local.time() < send_t:
            continue

        _window_start, _window_end, occurrences = compute_window_and_occurrences(reminder, anchor)
        if today not in set(occurrences):
            continue

        recipients = normalize_recipient_ids(reminder.recipient_user_ids)
        if not recipients:
            continue

        already = {
            str(row.recipient_user_id)
            for row in db.query(ProjectStartReminderEvent)
            .filter(
                ProjectStartReminderEvent.reminder_id == reminder.id,
                ProjectStartReminderEvent.occurrence_date == today,
            )
            .all()
        }

        title = "Project start reminder"
        if (reminder.message or "").strip():
            message = (reminder.message or "").strip()
        elif anchor:
            message = default_message(project, anchor)
        else:
            message = f"{_display_name(project)} start reminder."
        link = project_link(project)
        payload = {
            "title": title,
            "message": message,
            "type": "project_start_reminder",
            "link": link,
            "metadata": {
                "project_id": str(project.id),
                "reminder_id": str(reminder.id),
                "occurrence_date": today.isoformat(),
            },
        }

        for recipient in recipients:
            if recipient in already:
                continue
            uid = _as_uuid(recipient)
            if not uid:
                continue
            try:
                notif = create_notification(
                    db,
                    str(uid),
                    "push",
                    template_key="project_start_reminder",
                    payload_json=payload,
                )
                if notif is None:
                    # Preferences blocked send — still record to avoid retry spam today
                    pass
                db.add(
                    ProjectStartReminderEvent(
                        reminder_id=reminder.id,
                        recipient_user_id=uid,
                        occurrence_date=today,
                        sent_at=datetime.now(timezone.utc),
                    )
                )
                already.add(recipient)
                if notif is not None:
                    created += 1
            except Exception:
                continue

    db.commit()
    return created
