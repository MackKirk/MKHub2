"""Map free-text employment types onto the profile select options.

Employment type is the working relationship: Full-time, Part-time, or Contract.
How the person is paid lives on pay type (hourly or salary).
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from .hours_registration import canonical_pay_type

# Must match the Employment Type options in the employee profile.
EMPLOYMENT_TYPE_OPTIONS = ("Full-time", "Part-time", "Contract")

_FULL = frozenset({"full-time", "full time", "fulltime"})
_PART = frozenset({"part-time", "part time", "parttime"})
_CONTRACT = frozenset({"contract", "contractor"})
_HOURLY = frozenset({"hourly", "hour", "hours"})
_SALARY = frozenset({"salary", "salaried"})

_ALIASES = {
    "full-time": "Full-time",
    "full time": "Full-time",
    "fulltime": "Full-time",
    "part-time": "Part-time",
    "part time": "Part-time",
    "parttime": "Part-time",
    "contract": "Contract",
    "contractor": "Contract",
}


def _alias_key(raw: str) -> str:
    return " ".join(raw.strip().lower().replace("_", " ").replace("/", " ").split())


def canonical_employment_type(raw: Optional[str]) -> Optional[str]:
    """Return the select option for a known label, or None when it does not match."""
    text_value = str(raw or "").strip()
    if not text_value:
        return None
    if text_value in EMPLOYMENT_TYPE_OPTIONS:
        return text_value
    key = _alias_key(text_value)
    return _ALIASES.get(key) or _ALIASES.get(key.replace(" ", "-"))


def employment_kind(raw: Optional[str]) -> str:
    """full-time | part-time | contract | salary | hourly | other | empty."""
    key = _alias_key(str(raw or ""))
    if not key:
        return "empty"
    hyphen = key.replace(" ", "-")
    if key in _FULL or hyphen in _FULL:
        return "full-time"
    if key in _PART or hyphen in _PART:
        return "part-time"
    if key in _CONTRACT or hyphen in _CONTRACT:
        return "contract"
    if key in _SALARY or hyphen in _SALARY or "salary" in key or "salaried" in key:
        return "salary"
    if key in _HOURLY or hyphen in _HOURLY:
        return "hourly"
    return "other"


def employment_type_for_storage(raw: Optional[str]) -> Optional[str]:
    """Store Full-time, Part-time, or Contract. Drop pay labels such as Salary and Hourly."""
    text_value = str(raw or "").strip()
    if not text_value:
        return None
    kind = employment_kind(text_value)
    if kind in {"salary", "hourly"}:
        return None
    return canonical_employment_type(text_value) or text_value


def reconcile_employment_and_pay(
    employment_type: Optional[str],
    pay_type: Optional[str],
) -> tuple[Optional[str], Optional[str], bool]:
    """Return (employment_type, pay_type, clear_hours_flag).

    Salary written on employment type becomes pay type salary and stops hour notices.
    Contract as a pay type becomes hourly, and becomes Employment Type Contract when
    the employment field was empty or was only a pay label.
    """
    kind = employment_kind(employment_type)
    original_pay = canonical_pay_type(pay_type)
    new_pay = original_pay
    clear_hours_flag = False

    if kind == "salary":
        new_pay = "salary"
        clear_hours_flag = True
    elif original_pay == "contract":
        new_pay = "hourly"
    elif kind == "hourly" and original_pay is None:
        new_pay = "hourly"

    if kind == "full-time":
        new_emp: Optional[str] = "Full-time"
    elif kind == "part-time":
        new_emp = "Part-time"
    elif kind == "contract":
        new_emp = "Contract"
    elif kind in {"salary", "hourly"}:
        new_emp = "Contract" if original_pay == "contract" else None
    elif kind == "empty" and original_pay == "contract":
        new_emp = "Contract"
    elif kind == "empty":
        new_emp = None
    else:
        new_emp = str(employment_type or "").strip() or None

    return new_emp, new_pay, clear_hours_flag


def _same(left: Optional[str], right: Optional[str]) -> bool:
    return str(left or "").strip() == str(right or "").strip()


def backfill_employment_pay_split(db: Session) -> int:
    """Move Salary/Hourly off employment type and onto pay type."""
    updated = 0
    profiles = db.execute(
        text(
            "SELECT user_id, employment_type, pay_type, needs_register_hours "
            "FROM employee_profiles"
        )
    ).fetchall()
    for row in profiles:
        new_emp, new_pay, clear_hours = reconcile_employment_and_pay(row.employment_type, row.pay_type)
        changes: dict = {}
        if not _same(new_emp, row.employment_type):
            changes["employment_type"] = new_emp
        if not _same(new_pay, row.pay_type):
            changes["pay_type"] = new_pay
        if clear_hours and bool(row.needs_register_hours):
            changes["needs_register_hours"] = False
        if not changes:
            continue
        assignments = ", ".join(f"{column} = :{column}" for column in changes)
        db.execute(
            text(f"UPDATE employee_profiles SET {assignments} WHERE user_id = :user_id"),
            {**changes, "user_id": row.user_id},
        )
        updated += 1

    invites = db.execute(text("SELECT id, employment_type, pay_type FROM invites")).fetchall()
    for row in invites:
        new_emp, new_pay, _clear = reconcile_employment_and_pay(row.employment_type, row.pay_type)
        changes = {}
        if not _same(new_emp, row.employment_type):
            changes["employment_type"] = new_emp
        if not _same(new_pay, row.pay_type):
            changes["pay_type"] = new_pay
        if not changes:
            continue
        assignments = ", ".join(f"{column} = :{column}" for column in changes)
        db.execute(
            text(f"UPDATE invites SET {assignments} WHERE id = :row_id"),
            {**changes, "row_id": row.id},
        )
        updated += 1
    return updated
