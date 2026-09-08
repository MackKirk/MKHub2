"""Canonical clock-time math for Attendance (Phase 1).

Order: round clock times to 15 minutes → elapsed → break deduction → payable minutes.
Overtime / PayrollCode classification is not computed here.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional, Union


CLOCK_ROUND_MINUTES = 15
# Remainder 0–7 stay in the current slot; 8–14 round up (7→00, 8→15, 52→45, 53→00).
CLOCK_ROUND_UP_FROM = 8


def round_clock_datetime(dt: datetime) -> datetime:
    """Round a datetime to the nearest 15-minute increment (VeriClock grid)."""
    minutes = dt.minute
    remainder = minutes % CLOCK_ROUND_MINUTES
    extra_hours = 0
    if remainder < CLOCK_ROUND_UP_FROM:
        rounded_minutes = minutes - remainder
    else:
        rounded_minutes = minutes + (CLOCK_ROUND_MINUTES - remainder)
        if rounded_minutes >= 60:
            rounded_minutes = 0
            extra_hours = 1
    out = dt.replace(minute=rounded_minutes, second=0, microsecond=0)
    if extra_hours:
        out = out + timedelta(hours=extra_hours)
    return out


def elapsed_minutes(
    clock_in: Optional[datetime],
    clock_out: Optional[datetime],
) -> Optional[int]:
    if clock_in is None or clock_out is None:
        return None
    delta = clock_out - clock_in
    return max(0, int(delta.total_seconds() // 60))


def payable_minutes(
    *,
    elapsed: Optional[int],
    break_minutes: Optional[int] = None,
    entry_kind: str = "clock",
    declared_hours: Optional[Union[float, int, str]] = None,
) -> Optional[int]:
    """Net minutes after break. Hours-only rows use declared hours, not elapsed."""
    if entry_kind == "hours_only" and declared_hours is not None and str(declared_hours).strip() != "":
        try:
            hours = float(declared_hours)
        except (TypeError, ValueError):
            hours = 0.0
        return max(0, int(round(hours * 60)))
    if elapsed is None:
        return None
    brk = int(break_minutes or 0)
    return max(0, elapsed - brk)
