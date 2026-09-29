"""Who must log hours (and receive hours reminders)."""
from __future__ import annotations

from typing import Any, Optional


def is_salary_pay_type(pay_type: Optional[str]) -> bool:
    return "salary" in (pay_type or "").strip().lower()


def employee_should_register_hours(
    *,
    pay_type: Optional[str] = None,
    needs_register_hours: Optional[bool] = None,
    profile: Any = None,
) -> bool:
    """
    Hourly/contract (and unknown) must register hours.
    Salary skips by default unless needs_register_hours is enabled.
    """
    if profile is not None:
        pay_type = getattr(profile, "pay_type", None) if pay_type is None else pay_type
        if needs_register_hours is None:
            needs_register_hours = getattr(profile, "needs_register_hours", None)
    if not is_salary_pay_type(pay_type):
        return True
    return bool(needs_register_hours)
