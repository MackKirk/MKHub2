"""
BambooHR → MKHub compensation / salary history sync.

Imports the full Bamboo compensation table into EmployeeSalaryHistory so
historical rates are not lost when we only keep the current pay_rate on
EmployeeProfile.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, time, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy.orm import Session

from ..models.models import EmployeeSalaryHistory, User
from .bamboohr_client import BambooHRClient
from .bamboohr_time_off_sync import resolve_bamboohr_id_for_user

logger = logging.getLogger(__name__)

BAMBOO_JUSTIFICATION_PREFIX = "Synced from BambooHR"
BAMBOO_ID_NOTE_RE = re.compile(r"bamboo_compensation_id:(\S+)")


def build_directory_email_index(
    client: BambooHRClient,
    *,
    enrich: bool = True,
    progress: Optional[Any] = None,
) -> Dict[str, str]:
    """
    One-shot Bamboo directory → email (lower) → employee id.

    Directory listings often omit homeEmail. When enrich=True, fetch each
    employee once to index workEmail + homeEmail (and any other @ fields).
    """
    directory = client.get_employees_directory()
    employees = (
        directory
        if isinstance(directory, list)
        else (directory.get("employees", []) if isinstance(directory, dict) else [])
    )
    index: Dict[str, str] = {}
    emp_ids: List[str] = []

    def _add_email(email: Any, emp_id: str) -> None:
        if not isinstance(email, str):
            return
        key = email.strip().lower()
        if key and "@" in key:
            index[key] = emp_id

    for emp in employees or []:
        if not isinstance(emp, dict):
            continue
        emp_id = str(emp.get("id", "") or "").strip()
        if not emp_id:
            continue
        emp_ids.append(emp_id)
        for key, val in emp.items():
            if isinstance(val, str) and "@" in val:
                _add_email(val, emp_id)

    if enrich and emp_ids:
        total = len(emp_ids)
        if progress:
            progress(f"Enriching Bamboo emails for {total} directory employee(s)...")
        for i, emp_id in enumerate(emp_ids, 1):
            try:
                detail = client.get_employee(emp_id)
            except Exception:
                continue
            if not isinstance(detail, dict):
                continue
            if "employee" in detail and isinstance(detail["employee"], dict):
                detail = detail["employee"]
            for key in ("workEmail", "homeEmail", "email", "personalEmail"):
                _add_email(detail.get(key), emp_id)
            for val in detail.values():
                if isinstance(val, str) and "@" in val:
                    _add_email(val, emp_id)
            if progress and (i % 25 == 0 or i == total):
                progress(f"  enriched {i}/{total} (emails indexed: {len(index)})")

    return index


def resolve_bamboohr_id_from_index(
    user: User,
    email_index: Dict[str, str],
    *,
    extra_emails: Optional[List[str]] = None,
) -> Optional[str]:
    candidates = [
        user.email_personal,
        user.email_corporate,
        *(extra_emails or []),
    ]
    for raw in candidates:
        email = (raw or "").strip().lower()
        if email and email in email_index:
            return email_index[email]
    return None



def _parse_effective_date(value: str) -> Optional[datetime]:
    raw = str(value or "").strip()
    if not raw:
        return None
    day = raw.split("T")[0]
    try:
        d = datetime.strptime(day, "%Y-%m-%d").date()
    except ValueError:
        return None
    return datetime.combine(d, time.min, tzinfo=timezone.utc)


def _bamboo_id_from_notes(notes: Optional[str]) -> Optional[str]:
    if not notes:
        return None
    m = BAMBOO_ID_NOTE_RE.search(notes)
    return m.group(1) if m else None


def _is_bamboo_salary_row(row: EmployeeSalaryHistory) -> bool:
    just = (row.justification or "").strip()
    if just.startswith(BAMBOO_JUSTIFICATION_PREFIX):
        return True
    return _bamboo_id_from_notes(row.notes) is not None


def _build_notes(row: Dict[str, Any]) -> str:
    parts: List[str] = []
    bamboo_id = row.get("id")
    if bamboo_id:
        parts.append(f"bamboo_compensation_id:{bamboo_id}")
    comment = (row.get("comment") or "").strip()
    if comment:
        parts.append(comment)
    currency = row.get("currency")
    if currency:
        parts.append(f"currency:{currency}")
    paid_per = row.get("paidPer")
    if paid_per:
        parts.append(f"paidPer:{paid_per}")
    return " | ".join(parts) if parts else None


def _build_justification(row: Dict[str, Any]) -> str:
    reason = (row.get("reason") or "").strip()
    if reason:
        return f"{BAMBOO_JUSTIFICATION_PREFIX}: {reason}"
    return BAMBOO_JUSTIFICATION_PREFIX


def resolve_sync_actor_id(db: Session, fallback_user_id: UUID) -> UUID:
    """Prefer a known Hub admin for requested_by; else the employee themselves."""
    for username in ("adminmk", "admin", "system"):
        actor = db.query(User).filter(User.username == username).first()
        if actor:
            return actor.id
    return fallback_user_id


def upsert_salary_history_from_bamboo(
    db: Session,
    user: User,
    rows: List[Dict[str, Any]],
    *,
    requested_by: UUID,
    dry_run: bool = False,
) -> Dict[str, int]:
    """
    Upsert Bamboo compensation rows into EmployeeSalaryHistory.

    Matching order:
      1. notes bamboo_compensation_id:{id}
      2. Bamboo-sourced row with same effective_date + new_salary
    Manual Hub rows are never overwritten.
    """
    stats = {"created": 0, "updated": 0, "skipped": 0, "rows": 0}
    if not rows:
        return stats

    existing = (
        db.query(EmployeeSalaryHistory)
        .filter(EmployeeSalaryHistory.user_id == user.id)
        .all()
    )
    by_bamboo_id: Dict[str, EmployeeSalaryHistory] = {}
    bamboo_by_key: Dict[Tuple[str, str], EmployeeSalaryHistory] = {}
    for row in existing:
        bid = _bamboo_id_from_notes(row.notes)
        if bid:
            by_bamboo_id[bid] = row
        if _is_bamboo_salary_row(row) and row.effective_date and row.new_salary:
            day = row.effective_date.astimezone(timezone.utc).date().isoformat()
            bamboo_by_key[(day, str(row.new_salary).strip())] = row

    previous_salary: Optional[str] = None
    for row in rows:
        stats["rows"] += 1
        effective = _parse_effective_date(row.get("startDate") or "")
        rate = str(row.get("rate") or "").strip()
        if not effective or not rate:
            stats["skipped"] += 1
            continue

        day = effective.date().isoformat()
        bamboo_id = str(row.get("id") or "").strip() or None
        pay_type = row.get("type")
        justification = _build_justification(row)
        notes = _build_notes(row)

        match: Optional[EmployeeSalaryHistory] = None
        if bamboo_id and bamboo_id in by_bamboo_id:
            match = by_bamboo_id[bamboo_id]
        elif (day, rate) in bamboo_by_key:
            match = bamboo_by_key[(day, rate)]

        if match is not None and not _is_bamboo_salary_row(match):
            # Never clobber a manual Hub entry
            stats["skipped"] += 1
            previous_salary = rate
            continue

        if match is None:
            if dry_run:
                stats["created"] += 1
            else:
                entry = EmployeeSalaryHistory(
                    user_id=user.id,
                    previous_salary=previous_salary,
                    new_salary=rate,
                    pay_type=pay_type,
                    effective_date=effective,
                    justification=justification,
                    requested_by=requested_by,
                    approved_by=requested_by,
                    approved_at=datetime.now(timezone.utc),
                    notes=notes,
                )
                db.add(entry)
                if bamboo_id:
                    by_bamboo_id[bamboo_id] = entry
                bamboo_by_key[(day, rate)] = entry
                stats["created"] += 1
        else:
            changed = False
            if match.previous_salary != previous_salary:
                match.previous_salary = previous_salary
                changed = True
            if match.new_salary != rate:
                match.new_salary = rate
                changed = True
            if match.pay_type != pay_type:
                match.pay_type = pay_type
                changed = True
            if match.effective_date != effective:
                match.effective_date = effective
                changed = True
            if match.justification != justification:
                match.justification = justification
                changed = True
            if match.notes != notes:
                match.notes = notes
                changed = True
            if changed:
                if not dry_run:
                    pass  # ORM dirty tracking
                stats["updated"] += 1
            else:
                stats["skipped"] += 1
            if bamboo_id:
                by_bamboo_id[bamboo_id] = match
            bamboo_by_key[(day, rate)] = match

        previous_salary = rate

    if not dry_run:
        db.flush()
    return stats


def sync_user_compensation_history(
    db: Session,
    client: BambooHRClient,
    user: User,
    *,
    dry_run: bool = False,
    bamboohr_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Resolve Bamboo employee → fetch compensation table → upsert salary history."""
    resolved_id = bamboohr_id
    if not resolved_id:
        matched = resolve_bamboohr_id_for_user(db, client, user)
        if not matched:
            return {"ok": False, "error": "no_bamboo_match"}
        resolved_id, _emp = matched

    try:
        rows = client.get_compensation_history(resolved_id)
    except Exception as exc:
        logger.exception("compensation history fetch failed for bamboo=%s", resolved_id)
        return {"ok": False, "error": f"fetch_failed: {exc}", "bamboohr_id": resolved_id}

    actor_id = resolve_sync_actor_id(db, user.id)
    stats = upsert_salary_history_from_bamboo(
        db, user, rows, requested_by=actor_id, dry_run=dry_run
    )
    if not dry_run:
        db.commit()

    return {
        "ok": True,
        "bamboohr_id": resolved_id,
        "bamboo_rows": len(rows),
        **stats,
    }
