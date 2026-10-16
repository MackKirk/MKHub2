"""Who must log hours (and receive hours reminders)."""
from __future__ import annotations

from typing import Any, Optional


_HOURLY = frozenset({"hourly", "hour", "hours"})
_SALARY = frozenset({"salary", "salaried", "annual", "yearly", "year", "exempt"})
_CONTRACT = frozenset({"contract", "contractor", "commission"})
CANONICAL_PAY_TYPES = frozenset({"hourly", "salary", "contract"})


def canonical_pay_type(pay_type: Optional[str]) -> Optional[str]:
    """Map free-text or Bamboo labels onto hourly | salary | contract."""
    text = str(pay_type or "").strip().lower()
    if not text:
        return None
    if text in _HOURLY:
        return "hourly"
    if text in _SALARY:
        return "salary"
    if text in _CONTRACT:
        return "contract"
    if "salary" in text or "annual" in text or "salaried" in text:
        return "salary"
    if "contract" in text:
        return "contract"
    if "hour" in text:
        return "hourly"
    return None


def is_salary_pay_type(pay_type: Optional[str]) -> bool:
    return canonical_pay_type(pay_type) == "salary"


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
