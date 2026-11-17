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


def is_salary_employment_label(employment_type: Optional[str]) -> bool:
    """True when Employment Type was used as a pay label (Salary), not a schedule."""
    text = str(employment_type or "").strip().lower()
    if not text:
        return False
    if text in {"salary", "salaried"}:
        return True
    return "salary" in text or "salaried" in text


def pay_type_for_storage(pay_type: Optional[str]) -> Optional[str]:
    """Store hourly or salary. Legacy contract pay clocks in, so it is saved as hourly."""
    canonical = canonical_pay_type(pay_type)
    if canonical == "contract":
        return "hourly"
    return canonical


def employee_should_register_hours(
    *,
    pay_type: Optional[str] = None,
    employment_type: Optional[str] = None,
    needs_register_hours: Optional[bool] = None,
    profile: Any = None,
) -> bool:
    """
    Hourly (and unknown) must register hours.
    Salary skips by default unless needs_register_hours is enabled.
    An Employment Type of Salary counts as salary even when pay type was never set.
    """
    if profile is not None:
        pay_type = getattr(profile, "pay_type", None) if pay_type is None else pay_type
        if employment_type is None:
            employment_type = getattr(profile, "employment_type", None)
        if needs_register_hours is None:
            needs_register_hours = getattr(profile, "needs_register_hours", None)
    if not is_salary_pay_type(pay_type) and not is_salary_employment_label(employment_type):
        return True
    return bool(needs_register_hours)
