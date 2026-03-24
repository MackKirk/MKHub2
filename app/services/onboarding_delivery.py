"""Compute document availability relative to hire date for onboarding (base docs or legacy package items)."""
from calendar import monthrange
from datetime import datetime, time, timezone
from typing import Any, Optional


def _utc_start_of_day(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return datetime(dt.year, dt.month, dt.day, 0, 0, 0, tzinfo=timezone.utc)


def _add_calendar_months(d: datetime, n: int) -> datetime:
    y, m = d.year, d.month
    total_m = y * 12 + (m - 1) + n
    y = total_m // 12
    m = total_m % 12 + 1
    last = monthrange(y, m)[1]
    day = min(d.day, last)
    return datetime(y, m, day, d.hour, d.minute, d.second, d.microsecond, tzinfo=d.tzinfo)


def hire_anchor_start(
    hire_date: Optional[datetime],
    registration_now: datetime,
) -> datetime:
    """Start of hire date in UTC; if no hire_date, use start of registration day."""
    if hire_date:
        return _utc_start_of_day(hire_date)
    return _utc_start_of_day(registration_now)


def _apply_offset(
    hire_start: datetime,
    amount: int,
    unit: str,
    direction: str,
) -> datetime:
    u = (unit or "days").lower()
    d = (direction or "after").lower()
    sign = -1 if d == "before" else 1
    n = sign * max(amount, 0)
    if u == "days":
        from datetime import timedelta

        return hire_start + timedelta(days=n)
    if u == "weeks":
        from datetime import timedelta

        return hire_start + timedelta(weeks=n)
    if u == "months":
        return _add_calendar_months(hire_start, n)
    from datetime import timedelta

    return hire_start + timedelta(days=n)


def compute_available_at(
    item: Any,
    hire_start: datetime,
    registration_now: datetime,
) -> Optional[datetime]:
    """
    When the document becomes available for the assignee to sign.
    `item` is OnboardingBaseDocument or OnboardingPackageItem (duck-typed).
    Returns None if delivery_mode is 'none' (no auto assignment).
    """
    mode = (getattr(item, "delivery_mode", None) or "on_hire").lower()
    if mode == "none":
        return None
    if mode == "on_hire":
        target = hire_start
    elif mode == "custom":
        amt = getattr(item, "delivery_amount", None) or 0
        unit = getattr(item, "delivery_unit", None) or "days"
        direction = getattr(item, "delivery_direction", None) or "after"
        target = _apply_offset(hire_start, amt, unit, direction)
    else:
        target = hire_start

    if target > registration_now:
        return target
    return registration_now


def item_initial_status(available_at: datetime, registration_now: datetime) -> str:
    if available_at > registration_now:
        return "scheduled"
    return "pending"
