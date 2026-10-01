"""
BambooHR → MKHub time-off sync (balances, requests, history).

Bamboo's GET /time_off/requests is company-wide. Every path here resolves the
employee by Hub email → Bamboo id, then fail-closes on employeeId filtering so
leave is never written to the wrong user (the old "tudo no user logado" bug).
"""
from __future__ import annotations

import logging
import uuid as uuid_lib
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from ..models.models import (
    SettingItem,
    SettingList,
    TimeOffBalance,
    TimeOffHistory,
    TimeOffRequest,
    User,
)
from .bamboohr_client import (
    BambooHRClient,
    extract_time_off_request_employee_id,
    filter_time_off_requests_for_employee,
    normalize_time_off_policy_name,
    normalize_time_off_status,
    parse_time_off_request_days,
    parse_time_off_request_notes,
)

logger = logging.getLogger(__name__)


def resolve_bamboohr_id_for_user(
    db: Session, client: BambooHRClient, user: User
) -> Optional[Tuple[str, Dict[str, Any]]]:
    """Match Hub user → Bamboo employee by email. Returns (bamboo_id, employee_data)."""
    hub_emails = {
        (user.email_personal or "").strip().lower(),
        (user.email_corporate or "").strip().lower(),
    }
    hub_emails.discard("")
    if not hub_emails:
        return None

    directory = client.get_employees_directory()
    employees = (
        directory
        if isinstance(directory, list)
        else (directory.get("employees", []) if isinstance(directory, dict) else [])
    )
    if not employees:
        return None

    def _email_matches(emp_dict: dict) -> bool:
        for key in ("workEmail", "email", "homeEmail", "personalEmail"):
            val = emp_dict.get(key)
            if isinstance(val, str) and val.strip().lower() in hub_emails:
                return True
        for _key, val in emp_dict.items():
            if isinstance(val, str) and "@" in val and val.strip().lower() in hub_emails:
                return True
        return False

    for emp in employees:
        emp_id = str(emp.get("id", "") or "").strip()
        if not emp_id or not _email_matches(emp):
            continue
        try:
            emp_data = client.get_employee(emp_id)
            bamboohr_employee = dict(emp_data) if isinstance(emp_data, dict) else {"id": emp_id}
            if "employee" in bamboohr_employee:
                bamboohr_employee = bamboohr_employee["employee"]
            bamboohr_employee["id"] = emp_id
            return (emp_id, bamboohr_employee)
        except Exception:
            continue

    for emp in employees:
        emp_id = str(emp.get("id", "") or "").strip()
        if not emp_id:
            continue
        try:
            emp_data = client.get_employee(emp_id)
            if _email_matches(emp_data if isinstance(emp_data, dict) else {}):
                bamboohr_employee = dict(emp_data) if isinstance(emp_data, dict) else {"id": emp_id}
                bamboohr_employee["id"] = emp_id
                return (emp_id, bamboohr_employee)
        except Exception:
            continue
    return None


def get_entitlement_days(db: Session, policy_name: str) -> Optional[float]:
    try:
        lst = db.query(SettingList).filter(SettingList.name == "time_off_entitlements").first()
        if not lst:
            return None
        items = db.query(SettingItem).filter(SettingItem.list_id == lst.id).all()
        for it in items:
            if (it.label or "").strip().lower() == (policy_name or "").strip().lower():
                try:
                    return float(it.value) if it.value is not None else None
                except Exception:
                    return None
        return None
    except Exception:
        return None


def ensure_default_entitlement(db: Session, policy_name: str) -> Optional[float]:
    default_map = {"sick leave": 5.0}
    pn = (policy_name or "").strip().lower()
    if pn not in default_map:
        return None
    try:
        lst = db.query(SettingList).filter(SettingList.name == "time_off_entitlements").first()
        if not lst:
            lst = SettingList(name="time_off_entitlements")
            db.add(lst)
            db.flush()
        existing = db.query(SettingItem).filter(
            SettingItem.list_id == lst.id,
            func.lower(SettingItem.label) == pn,
        ).first()
        if not existing:
            db.add(
                SettingItem(
                    list_id=lst.id,
                    label=policy_name,
                    value=str(default_map[pn]),
                    sort_index=0,
                    meta={"source": "default"},
                )
            )
            db.flush()
        return default_map[pn]
    except Exception:
        return None


def fetch_scoped_time_off_requests(
    client: BambooHRClient, bamboohr_id: str
) -> List[Dict[str, Any]]:
    """Company-wide Bamboo payload, always filtered to this employee (fail-closed)."""
    raw = client.get_time_off_requests(bamboohr_id) or []
    if not isinstance(raw, list):
        return []
    scoped = filter_time_off_requests_for_employee(raw, bamboohr_id)
    if raw and not scoped:
        sample = next((r for r in raw if isinstance(r, dict)), None)
        sample_eid = extract_time_off_request_employee_id(sample) if sample else ""
        logger.warning(
            "[BambooHR] time-off filter returned 0 of %s rows for employee %s "
            "(sample employeeId=%r). Refusing to attribute company-wide data.",
            len(raw),
            bamboohr_id,
            sample_eid,
        )
    return scoped


def upsert_time_off_requests_from_bamboo(
    db: Session,
    user: User,
    bamboohr_id: str,
    requests: List[Dict[str, Any]],
    *,
    dry_run: bool = False,
) -> int:
    """Write Bamboo time-off requests into TimeOffRequest for this Hub user only."""
    synced = 0
    for req in requests:
        if not isinstance(req, dict):
            continue
        if extract_time_off_request_employee_id(req) != str(bamboohr_id):
            continue

        req_id = req.get("id") or req.get("requestId") or req.get("request_id")
        if not req_id:
            continue

        status = normalize_time_off_status(req.get("status"))
        status_map = {
            "approved": "approved",
            "approvedpaid": "approved",
            "approvedunpaid": "approved",
            "used": "approved",
            "taken": "approved",
            "denied": "rejected",
            "rejected": "rejected",
            "cancelled": "cancelled",
            "canceled": "cancelled",
            "pending": "pending",
            "requested": "pending",
            "superceded": "cancelled",
            "superseded": "cancelled",
        }
        hub_status = status_map.get(status, "pending")

        start_raw = req.get("start") or req.get("startDate")
        end_raw = req.get("end") or req.get("endDate")
        if not start_raw or not end_raw:
            continue
        try:
            start_date = datetime.strptime(str(start_raw).split("T")[0], "%Y-%m-%d").date()
            end_date = datetime.strptime(str(end_raw).split("T")[0], "%Y-%m-%d").date()
        except Exception:
            continue

        days = parse_time_off_request_days(req)
        if days <= 0:
            days = float((end_date - start_date).days + 1)
        hours = days * 8.0
        policy_name = normalize_time_off_policy_name(
            req.get("policyType") or req.get("policyName") or req.get("policy") or req.get("type")
        )
        notes = parse_time_off_request_notes(req) or None

        existing = (
            db.query(TimeOffRequest)
            .filter(
                TimeOffRequest.user_id == user.id,
                TimeOffRequest.bamboohr_request_id == str(req_id),
            )
            .first()
        )
        if dry_run:
            synced += 1
            continue

        if existing:
            existing.policy_name = policy_name
            existing.start_date = start_date
            existing.end_date = end_date
            existing.hours = hours
            existing.notes = notes
            existing.status = hub_status
            existing.updated_at = datetime.now(timezone.utc)
        else:
            db.add(
                TimeOffRequest(
                    id=uuid_lib.uuid4(),
                    user_id=user.id,
                    policy_name=policy_name,
                    start_date=start_date,
                    end_date=end_date,
                    hours=hours,
                    notes=notes,
                    status=hub_status,
                    requested_at=datetime.now(timezone.utc),
                    reviewed_at=datetime.now(timezone.utc) if hub_status == "approved" else None,
                    bamboohr_request_id=str(req_id),
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc),
                )
            )
        synced += 1
    return synced


def _history_usage_from_requests(
    bamboohr_id: str,
    requests: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Approved Bamboo requests → 'Time off used' ledger rows (no synthetic accruals)."""
    history_entries: List[Dict[str, Any]] = []

    for req in requests:
        if not isinstance(req, dict):
            continue
        if extract_time_off_request_employee_id(req) != str(bamboohr_id):
            continue
        status = normalize_time_off_status(req.get("status"))
        if status not in {"approved", "used", "taken", "approvedpaid", "approvedunpaid"}:
            continue

        req_id = req.get("id") or req.get("requestId") or req.get("request_id")
        start_date = req.get("start") or req.get("startDate")
        end_date = req.get("end") or req.get("endDate")
        policy_name = normalize_time_off_policy_name(
            req.get("policyType") or req.get("policyName") or req.get("policy") or req.get("type")
        )
        notes = parse_time_off_request_notes(req)
        days = parse_time_off_request_days(req)

        if not start_date or not end_date or days <= 0:
            continue
        try:
            start = datetime.strptime(str(start_date).split("T")[0], "%Y-%m-%d").date()
            end = datetime.strptime(str(end_date).split("T")[0], "%Y-%m-%d").date()
            if start == end:
                description = f"Time off used for {start.strftime('%m/%d/%Y')}"
            else:
                description = (
                    f"Time off used for {start.strftime('%m/%d/%Y')} to {end.strftime('%m/%d/%Y')}"
                )
            if notes:
                description = f"{description}\n{notes}"

            balance_after = (
                req.get("balanceAfter")
                or req.get("balance_after")
                or req.get("balance")
                or req.get("balanceRemaining")
                or req.get("balance_remaining")
                or req.get("remainingBalance")
            )
            try:
                balance_after = float(balance_after) if balance_after is not None else None
            except Exception:
                balance_after = None

            history_entries.append(
                {
                    "date": str(start_date).split("T")[0],
                    "policyName": policy_name,
                    "description": description,
                    "used": -days,
                    "earned": None,
                    "balance": balance_after,
                    "id": f"req:{req_id}" if req_id else None,
                }
            )
        except Exception:
            continue

    return history_entries


def _history_entries_from_requests(
    db: Session,
    user: User,
    bamboohr_id: str,
    requests: List[Dict[str, Any]],
    *,
    include_entitlements: bool = True,
) -> List[Dict[str, Any]]:
    history_entries = _history_usage_from_requests(bamboohr_id, requests)
    if not include_entitlements:
        history_entries.sort(key=lambda x: x.get("date") or "1900-01-01")
        return history_entries

    seen_policy_years: set[tuple[str, int]] = set()
    used_by_policy_year: Dict[tuple[str, int], float] = {}
    for entry in history_entries:
        try:
            d = datetime.strptime(str(entry["date"]).split("T")[0], "%Y-%m-%d").date()
            pol = entry["policyName"]
            seen_policy_years.add((pol, d.year))
            used = abs(float(entry.get("used") or 0))
            if used:
                used_by_policy_year[(pol, d.year)] = (
                    used_by_policy_year.get((pol, d.year), 0.0) + used
                )
        except Exception:
            continue

    # Also cover balance-only policies (e.g. Sick Leave with no requests yet)
    bal_rows = db.query(TimeOffBalance).filter(TimeOffBalance.user_id == user.id).all()
    for bal in bal_rows:
        seen_policy_years.add((bal.policy_name, bal.year))

    def _entitlement_for(pol: str, y: int) -> Optional[float]:
        """
        Opening accrual for a policy/year.

        When we have a Bamboo calculator balance for that year, accrual must be
        closing_balance + days_used_in_requests so the history chain ends on the
        same number shown on the balance card (e.g. Vacation 2d remaining).
        """
        used_y = used_by_policy_year.get((pol, y), 0.0)
        try:
            bal_row = (
                db.query(TimeOffBalance)
                .filter(
                    TimeOffBalance.user_id == user.id,
                    TimeOffBalance.policy_name == pol,
                    TimeOffBalance.year == y,
                )
                .first()
            )
        except Exception:
            bal_row = None

        if bal_row is not None:
            balance_days = float(bal_row.balance_hours or 0) / 8.0
            return balance_days + used_y

        entitlement_days = get_entitlement_days(db, pol)
        if entitlement_days is None:
            entitlement_days = ensure_default_entitlement(db, pol)
        if entitlement_days is None:
            return used_y if used_y > 0 else None
        return max(float(entitlement_days), used_y) if used_y else float(entitlement_days)

    for pol, y in sorted(seen_policy_years, key=lambda x: (x[1], x[0].lower())):
        entitlement_days = _entitlement_for(pol, y)
        if entitlement_days and entitlement_days > 0:
            history_entries.append(
                {
                    "date": f"{y}-01-01",
                    "policyName": pol,
                    "description": f"Accrual for 01/01/{y} to 12/31/{y}",
                    "used": None,
                    "earned": float(entitlement_days),
                    "balance": float(entitlement_days),
                    "id": f"entitlement:{pol}:{y}",
                }
            )

    history_entries.sort(key=lambda x: x.get("date") or "1900-01-01")
    return history_entries


def _calculator_policy_snapshot(
    client: BambooHRClient, employee_id: str, as_of: date, cache: Dict[str, Dict[str, Tuple[float, float]]]
) -> Dict[str, Tuple[float, float]]:
    """Return {policy_name: (balance_days, used_ytd_days)} as of ``as_of``."""
    key = as_of.isoformat()
    if key in cache:
        return cache[key]

    raw = client.get_time_off_calculator(employee_id, end=key)
    out: Dict[str, Tuple[float, float]] = {}
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        name = normalize_time_off_policy_name(
            item.get("name") or item.get("policyName") or item.get("timeOffType")
        )
        try:
            bal = float(item.get("balance") if item.get("balance") is not None else 0)
        except (TypeError, ValueError):
            bal = 0.0
        try:
            used = float(
                item.get("usedYearToDate")
                if item.get("usedYearToDate") is not None
                else item.get("used") or 0
            )
        except (TypeError, ValueError):
            used = 0.0
        units = str(item.get("units") or item.get("unit") or "days").lower()
        if "hour" in units:
            bal /= 8.0
            used /= 8.0
        out[name] = (round(bal, 2), round(used, 2))
    cache[key] = out
    return out


def _calculator_delta_is_interesting(
    prev: Dict[str, Tuple[float, float]],
    cur: Dict[str, Tuple[float, float]],
    cur_date: date,
) -> bool:
    """True when balance moved for a reason other than time-off usage."""
    names = set(prev) | set(cur)
    for name in names:
        pb, pu = prev.get(name, (0.0, 0.0))
        cb, cu = cur.get(name, (0.0, 0.0))
        if abs(cb - pb) < 0.001 and abs(cu - pu) < 0.001:
            continue

        bal_d = cb - pb
        used_d = cu - pu

        # Year-boundary balance moves (carryover / new accrual)
        if cur_date.month == 1 and cur_date.day == 1 and abs(bal_d) > 0.001:
            return True
        # Unexpected YTD reset mid-year
        if cu + 0.001 < pu:
            return True
        # Bamboo deducts multi-day requests from balance up front while usedYTD
        # ticks one day at a time — treat any balance↓ + used↑ as usage.
        if bal_d < -0.001 and used_d > 0.001:
            continue
        if abs(bal_d) < 0.001 and used_d > 0.001:
            continue
        if abs(bal_d) > 0.001:
            return True
    return False


def _entries_for_calculator_day_change(
    prev: Dict[str, Tuple[float, float]],
    cur: Dict[str, Tuple[float, float]],
    cur_date: date,
    seen_opening: set,
) -> List[Dict[str, Any]]:
    """Turn a single-day calculator diff into Bamboo-like ledger rows."""
    entries: List[Dict[str, Any]] = []
    names = sorted(set(prev) | set(cur), key=lambda n: n.lower())
    ds = cur_date.isoformat()

    for name in names:
        pb, pu = prev.get(name, (0.0, 0.0))
        cb, cu = cur.get(name, (0.0, 0.0))
        if abs(cb - pb) < 0.001 and abs(cu - pu) < 0.001:
            continue

        bal_d = round(cb - pb, 2)
        used_d = round(cu - pu, 2)

        # Usage (incl. multi-day: balance drops up front, usedYTD daily) — requests cover these
        if not (cur_date.month == 1 and cur_date.day == 1):
            if bal_d < -0.001 and used_d > 0.001:
                continue
            if abs(bal_d) < 0.001 and used_d > 0.001:
                continue

        # Year start: expand net change into carryover loss + accrual when possible
        if cur_date.month == 1 and cur_date.day == 1 and abs(bal_d) > 0.001:
            if pb > 0.001 and cb + 0.001 < pb:
                entries.append(
                    {
                        "date": ds,
                        "policyName": name,
                        "description": "Lost days that exceeded the carryover allowance",
                        "used": -round(pb, 2),
                        "earned": None,
                        "balance": 0.0,
                        "id": f"calc:carryover:{name}:{ds}",
                    }
                )
                if cb > 0.001:
                    entries.append(
                        {
                            "date": ds,
                            "policyName": name,
                            "description": (
                                f"Accrual for 01/01/{cur_date.year} to 12/31/{cur_date.year}"
                            ),
                            "used": None,
                            "earned": round(cb, 2),
                            "balance": round(cb, 2),
                            "id": f"calc:accrual:{name}:{ds}",
                        }
                    )
                continue
            if bal_d > 0.001:
                entries.append(
                    {
                        "date": ds,
                        "policyName": name,
                        "description": (
                            f"Accrual for 01/01/{cur_date.year} to 12/31/{cur_date.year}"
                        ),
                        "used": None,
                        "earned": round(bal_d, 2),
                        "balance": round(cb, 2),
                        "id": f"calc:accrual:{name}:{ds}",
                    }
                )
                continue

        if bal_d > 0.001:
            if cur_date.month == 1 and pb < 0.001:
                desc = f"Accrual for 01/01/{cur_date.year} to 12/31/{cur_date.year}"
                tid = f"calc:accrual:{name}:{ds}"
            elif name not in seen_opening and pb < 0.001:
                desc = "Added opening balance"
                seen_opening.add(name)
                tid = f"calc:opening:{name}:{ds}"
            else:
                desc = "Balance adjusted"
                tid = f"calc:adjust:{name}:{ds}"
            entries.append(
                {
                    "date": ds,
                    "policyName": name,
                    "description": desc,
                    "used": None,
                    "earned": round(bal_d, 2),
                    "balance": round(cb, 2),
                    "id": tid,
                }
            )
        elif bal_d < -0.001:
            # Negative mid-year with no usedYTD bump (manual deduction / forfeit)
            entries.append(
                {
                    "date": ds,
                    "policyName": name,
                    "description": "Balance adjusted",
                    "used": round(bal_d, 2),
                    "earned": None,
                    "balance": round(cb, 2),
                    "id": f"calc:adjust:{name}:{ds}",
                }
            )

    # Same-day carryover must sort before accrual
    entries.sort(
        key=lambda x: (
            0 if "carryover" in (x.get("id") or "") else 1,
            x.get("id") or "",
        )
    )
    return entries


def _history_entries_from_calculator_deltas(
    client: BambooHRClient,
    employee_id: str,
    *,
    start: Optional[date] = None,
    end: Optional[date] = None,
) -> List[Dict[str, Any]]:
    """
    Reconstruct Balance History mutations by sampling calculator?end= dates.

    Bamboo UI Balance History is not readable via the public API. Point-in-time
    calculator snapshots are; we bisect for days where balance moved for a
    non-usage reason (accrual, adjustment, carryover).
    """
    end = end or date.today()
    start = start or date(end.year - 3, 1, 1)
    if start >= end:
        return []

    cache: Dict[str, Dict[str, Tuple[float, float]]] = {}
    change_days: List[date] = []

    def _bisect(lo: date, hi: date) -> None:
        if hi <= lo:
            return
        snap_lo = _calculator_policy_snapshot(client, employee_id, lo, cache)
        snap_hi = _calculator_policy_snapshot(client, employee_id, hi, cache)
        if not _calculator_delta_is_interesting(snap_lo, snap_hi, hi):
            return
        if (hi - lo).days == 1:
            # Leaf: only keep the day if THIS adjacent pair is interesting
            # (parent ranges can be interesting due to distant accruals).
            if _calculator_delta_is_interesting(snap_lo, snap_hi, hi):
                change_days.append(hi)
            return
        mid = lo + ((hi - lo) // 2)
        _bisect(lo, mid)
        _bisect(mid, hi)

    try:
        _bisect(start, end)
    except Exception as exc:
        logger.warning(
            "Calculator balance-history reconstruction failed for employee %s: %s",
            employee_id,
            exc,
        )
        return []

    if not change_days:
        return []

    change_days = sorted(set(change_days))
    entries: List[Dict[str, Any]] = []
    seen_opening: set = set()
    prev_day = start
    prev_snap = _calculator_policy_snapshot(client, employee_id, prev_day, cache)

    for day in change_days:
        # Snapshot the day before the change for a clean delta
        before = day.fromordinal(day.toordinal() - 1) if day > start else start
        prev_snap = _calculator_policy_snapshot(client, employee_id, before, cache)
        cur_snap = _calculator_policy_snapshot(client, employee_id, day, cache)
        entries.extend(
            _entries_for_calculator_day_change(prev_snap, cur_snap, day, seen_opening)
        )
        prev_day = day

    entries.sort(
        key=lambda x: (
            x.get("date") or "",
            0 if "carryover" in (x.get("id") or "") else 1,
            x.get("id") or "",
        )
    )
    return entries


def _apply_history_transactions(
    db: Session,
    user: User,
    transactions: List[Dict[str, Any]],
    policy_filter: Optional[str] = None,
    *,
    dry_run: bool = False,
) -> int:
    balances = db.query(TimeOffBalance).filter(TimeOffBalance.user_id == user.id).all()
    policy_map = {b.policy_name: b for b in balances}

    def get_trans_date(trans: Dict[str, Any]):
        date_str = (
            trans.get("date")
            or trans.get("transactionDate")
            or trans.get("transaction_date")
            or "1900-01-01"
        )
        try:
            if isinstance(date_str, str):
                d = datetime.strptime(date_str.split("T")[0], "%Y-%m-%d").date()
            else:
                d = date_str
        except Exception:
            d = date(1900, 1, 1)
        tid = str(trans.get("id") or trans.get("transactionId") or "")
        # Same-day carryover rows must precede accruals
        same_day_rank = 0 if "carryover" in tid else 1
        return (d, same_day_rank, tid)

    transactions_sorted = sorted(
        [t for t in transactions if isinstance(t, dict)], key=get_trans_date
    )

    incoming_sync_ids = set()
    for trans in transactions_sorted:
        tid = trans.get("id") or trans.get("transactionId") or trans.get("transaction_id")
        if tid:
            incoming_sync_ids.add(str(tid))

    if incoming_sync_ids and not dry_run:
        stale_rows = (
            db.query(TimeOffHistory)
            .filter(
                TimeOffHistory.user_id == user.id,
                TimeOffHistory.bamboohr_transaction_id.isnot(None),
            )
            .all()
        )
        for row in stale_rows:
            tid = row.bamboohr_transaction_id or ""
            if (
                tid.startswith(("req:", "entitlement:", "usedytd:", "calc:"))
                and tid not in incoming_sync_ids
            ):
                db.delete(row)

    # Forward-only running balance per policy. Year-start accrual rows reset the
    # chain via an explicit "balance" so multi-year history does not bleed.
    policy_balances: Dict[str, float] = {}
    synced_count = 0

    for trans_data in transactions_sorted:
        trans_policy_name = normalize_time_off_policy_name(
            trans_data.get("policyName")
            or trans_data.get("policy_name")
            or trans_data.get("name")
            or policy_filter
            or "Time Off"
        )
        if policy_filter and trans_policy_name != policy_filter:
            continue

        trans_date_str = (
            trans_data.get("date")
            or trans_data.get("transactionDate")
            or trans_data.get("transaction_date")
        )
        if not trans_date_str:
            continue
        try:
            if isinstance(trans_date_str, str):
                trans_date = datetime.strptime(trans_date_str.split("T")[0], "%Y-%m-%d").date()
            else:
                trans_date = trans_date_str
        except Exception:
            continue

        description = (
            trans_data.get("description")
            or trans_data.get("note")
            or trans_data.get("notes")
            or trans_data.get("comment")
            or "Time off transaction"
        )

        used_days = None
        earned_days = None
        for key in ("used", "usedDays", "used_days", "daysUsed"):
            if key in trans_data and trans_data[key] is not None:
                used_val = float(trans_data[key])
                used_days = -abs(used_val) if used_val != 0 else None
                break
        for key in ("earned", "earnedDays", "earned_days", "daysEarned"):
            if key in trans_data and trans_data[key] is not None:
                earned_days = float(trans_data[key]) if trans_data[key] else None
                break

        balance_after = None
        for key in ("balance", "balanceAfter", "balance_after"):
            if key in trans_data and trans_data[key] is not None:
                try:
                    balance_after = float(trans_data[key])
                except Exception:
                    balance_after = None
                break

        if balance_after is None:
            if trans_policy_name not in policy_balances:
                policy_balances[trans_policy_name] = 0.0
            current_balance = policy_balances[trans_policy_name]
            earned = earned_days if earned_days else 0.0
            used = abs(used_days) if used_days else 0.0
            balance_after = current_balance + earned - used
            policy_balances[trans_policy_name] = balance_after
        else:
            policy_balances[trans_policy_name] = balance_after

        bamboohr_trans_id = (
            trans_data.get("id") or trans_data.get("transactionId") or trans_data.get("transaction_id")
        )

        if dry_run:
            synced_count += 1
            continue

        existing = None
        if bamboohr_trans_id:
            existing = (
                db.query(TimeOffHistory)
                .filter(
                    TimeOffHistory.user_id == user.id,
                    TimeOffHistory.policy_name == trans_policy_name,
                    TimeOffHistory.bamboohr_transaction_id == str(bamboohr_trans_id),
                )
                .first()
            )
            if not existing:
                existing = (
                    db.query(TimeOffHistory)
                    .filter(
                        TimeOffHistory.user_id == user.id,
                        TimeOffHistory.policy_name == trans_policy_name,
                        TimeOffHistory.transaction_date == trans_date,
                        TimeOffHistory.bamboohr_transaction_id.is_(None),
                        or_(
                            and_(TimeOffHistory.used_days.is_(None), used_days is None),
                            TimeOffHistory.used_days == used_days,
                        ),
                        or_(
                            and_(TimeOffHistory.earned_days.is_(None), earned_days is None),
                            TimeOffHistory.earned_days == earned_days,
                        ),
                    )
                    .first()
                )
        else:
            existing = (
                db.query(TimeOffHistory)
                .filter(
                    TimeOffHistory.user_id == user.id,
                    TimeOffHistory.policy_name == trans_policy_name,
                    TimeOffHistory.transaction_date == trans_date,
                    or_(
                        and_(TimeOffHistory.used_days.is_(None), used_days is None),
                        TimeOffHistory.used_days == used_days,
                    ),
                    or_(
                        and_(TimeOffHistory.earned_days.is_(None), earned_days is None),
                        TimeOffHistory.earned_days == earned_days,
                    ),
                )
                .first()
            )

        if existing:
            existing.used_days = used_days
            existing.earned_days = earned_days
            existing.balance_after = balance_after
            existing.description = description
            existing.bamboohr_transaction_id = (
                str(bamboohr_trans_id) if bamboohr_trans_id else existing.bamboohr_transaction_id
            )
            existing.last_synced_at = datetime.now(timezone.utc)
        else:
            db.add(
                TimeOffHistory(
                    id=uuid_lib.uuid4(),
                    user_id=user.id,
                    policy_name=trans_policy_name,
                    transaction_date=trans_date,
                    description=description,
                    used_days=used_days,
                    earned_days=earned_days,
                    balance_after=balance_after,
                    bamboohr_transaction_id=str(bamboohr_trans_id) if bamboohr_trans_id else None,
                    created_at=datetime.now(timezone.utc),
                    last_synced_at=datetime.now(timezone.utc),
                )
            )
        synced_count += 1

    return synced_count


def sync_user_time_off_balance(
    db: Session,
    client: BambooHRClient,
    user: User,
    bamboohr_id: str,
    *,
    dry_run: bool = False,
) -> Dict[str, Any]:
    balance_data = client.get_time_off_balance(bamboohr_id)
    if not balance_data:
        return {"message": "No time off balance data found in BambooHR", "synced": 0}

    current_year = datetime.now().year
    synced_count = 0
    policies: List[Any] = []
    if isinstance(balance_data, dict):
        if "policies" in balance_data:
            policies = balance_data["policies"] if isinstance(balance_data["policies"], list) else [balance_data["policies"]]
        elif "data" in balance_data:
            policies = balance_data["data"] if isinstance(balance_data["data"], list) else [balance_data["data"]]
        else:
            policies = [balance_data]
    elif isinstance(balance_data, list):
        policies = balance_data

    source = balance_data.get("_source") if isinstance(balance_data, dict) else None
    for policy_data in policies:
        if not isinstance(policy_data, dict):
            continue
        policy_name = normalize_time_off_policy_name(
            policy_data.get("name") or policy_data.get("policyName") or policy_data.get("type")
        )
        balance_hours = None
        accrued_hours = None
        used_hours = 0.0

        # Prefer *Hours. Plain balance/accrued from the requests fallback are days;
        # native Bamboo balance endpoints typically already return hours.
        if policy_data.get("balanceHours") is not None:
            try:
                balance_hours = float(policy_data["balanceHours"])
            except (TypeError, ValueError):
                balance_hours = None
        elif policy_data.get("balance") is not None:
            try:
                raw = float(policy_data["balance"])
                balance_hours = raw * 8.0 if source == "requests" else raw
            except (TypeError, ValueError):
                balance_hours = None
        elif policy_data.get("available") is not None:
            try:
                raw = float(policy_data["available"])
                balance_hours = raw * 8.0 if source == "requests" else raw
            except (TypeError, ValueError):
                balance_hours = None

        if policy_data.get("accruedHours") is not None:
            try:
                accrued_hours = float(policy_data["accruedHours"])
            except (TypeError, ValueError):
                accrued_hours = None
        elif policy_data.get("accrued") is not None:
            try:
                raw = float(policy_data["accrued"])
                accrued_hours = raw * 8.0 if source in {"requests", "whos_out"} else raw
            except (TypeError, ValueError):
                accrued_hours = None

        if policy_data.get("usedHours") is not None:
            try:
                used_hours = float(policy_data["usedHours"])
            except (TypeError, ValueError):
                used_hours = 0.0
        elif policy_data.get("used") is not None:
            try:
                used_hours = float(policy_data["used"])
            except (TypeError, ValueError):
                used_hours = 0.0

        if (balance_hours is None or accrued_hours is None) and used_hours >= 0:
            entitlement_days = get_entitlement_days(db, policy_name)
            if entitlement_days is None:
                entitlement_days = ensure_default_entitlement(db, policy_name)
            if entitlement_days is not None:
                entitlement_hours = float(entitlement_days) * 8.0
                if accrued_hours is None:
                    accrued_hours = entitlement_hours
                if balance_hours is None:
                    balance_hours = entitlement_hours - used_hours

        if dry_run:
            synced_count += 1
            continue

        balance = (
            db.query(TimeOffBalance)
            .filter(
                TimeOffBalance.user_id == user.id,
                TimeOffBalance.policy_name == policy_name,
                TimeOffBalance.year == current_year,
            )
            .first()
        )
        if balance:
            if balance_hours is not None:
                balance.balance_hours = balance_hours
            if accrued_hours is not None:
                balance.accrued_hours = accrued_hours
            balance.used_hours = used_hours
            balance.last_synced_at = datetime.now(timezone.utc)
            balance.updated_at = datetime.now(timezone.utc)
        else:
            db.add(
                TimeOffBalance(
                    id=uuid_lib.uuid4(),
                    user_id=user.id,
                    policy_name=policy_name,
                    balance_hours=balance_hours if balance_hours is not None else 0.0,
                    accrued_hours=accrued_hours if accrued_hours is not None else 0.0,
                    used_hours=used_hours,
                    year=current_year,
                    last_synced_at=datetime.now(timezone.utc),
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc),
                )
            )
        synced_count += 1

    result = {"message": f"Synced {synced_count} time off balance(s)", "synced": synced_count}
    if source == "requests":
        result["message"] = (
            f"Synced {synced_count} time off balance(s) from requests "
            "(partial data - only used hours available)"
        )
        result["partial"] = True
    elif source == "calculator":
        result["message"] = f"Synced {synced_count} time off balance(s) from Bamboo calculator"
        result["source"] = "calculator"
    return result


def sync_user_time_off_history(
    db: Session,
    client: BambooHRClient,
    user: User,
    bamboohr_id: str,
    policy_filter: Optional[str] = None,
    *,
    dry_run: bool = False,
) -> Dict[str, Any]:
    history_data = client.get_time_off_balance_history(bamboohr_id)
    if not history_data:
        balance_data = client.get_time_off_balance(bamboohr_id)
        if balance_data and isinstance(balance_data, dict):
            history_data = balance_data.get("history") or balance_data.get("transactions")

    scoped_requests = fetch_scoped_time_off_requests(client, bamboohr_id)
    requests_synced = upsert_time_off_requests_from_bamboo(
        db, user, bamboohr_id, scoped_requests, dry_run=dry_run
    )

    # Public Bamboo API has no Balance History GET. Reconstruct accruals /
    # adjustments / carryover from calculator?end= snapshots, then merge with
    # approved request usage (Vacation etc.).
    if not history_data:
        calc_entries = _history_entries_from_calculator_deltas(client, bamboohr_id)
        usage_entries = _history_usage_from_requests(bamboohr_id, scoped_requests)
        if calc_entries:
            history_data = calc_entries + usage_entries
            history_data.sort(key=lambda x: x.get("date") or "1900-01-01")
            logger.info(
                "Reconstructed %s calculator ledger row(s) + %s usage row(s) for Bamboo %s",
                len(calc_entries),
                len(usage_entries),
                bamboohr_id,
            )
        else:
            history_data = _history_entries_from_requests(
                db, user, bamboohr_id, scoped_requests
            )

    if not history_data:
        approved_requests = (
            db.query(TimeOffRequest)
            .filter(TimeOffRequest.user_id == user.id, TimeOffRequest.status == "approved")
            .all()
        )
        if approved_requests:
            history_entries: List[Dict[str, Any]] = []
            seen_policy_years: set[tuple[str, int]] = set()
            for req in approved_requests:
                days = float(req.hours) / 8.0 if req.hours else 0.0
                try:
                    start_date_str = req.start_date.strftime("%m/%d/%Y")
                    if req.start_date == req.end_date:
                        description = f"Time off used for {start_date_str}"
                    else:
                        description = (
                            f"Time off used for {start_date_str} to {req.end_date.strftime('%m/%d/%Y')}"
                        )
                    if req.notes:
                        description += f" - {req.notes}"
                except Exception:
                    description = f"Time off: {req.start_date} to {req.end_date}"
                history_entries.append(
                    {
                        "date": req.start_date.isoformat(),
                        "policyName": normalize_time_off_policy_name(req.policy_name),
                        "description": description,
                        "used": -days,
                        "earned": None,
                        "balance": None,
                        "id": f"localreq:{req.id}",
                    }
                )
                seen_policy_years.add((normalize_time_off_policy_name(req.policy_name), req.start_date.year))
            for pol, y in sorted(seen_policy_years, key=lambda x: (x[1], x[0].lower())):
                entitlement_days = get_entitlement_days(db, pol) or ensure_default_entitlement(db, pol)
                if entitlement_days and entitlement_days > 0:
                    history_entries.append(
                        {
                            "date": f"{y}-01-01",
                            "policyName": pol,
                            "description": f"Accrual for 01/01/{y} to 12/31/{y}",
                            "used": None,
                            "earned": float(entitlement_days),
                            "balance": float(entitlement_days),
                            "id": f"entitlement:{pol}:{y}",
                        }
                    )
            history_data = history_entries

    if not history_data:
        # No Bamboo request history — still seed accrual rows from synced balances
        # (this tenant often has calculator balances with zero request history).
        bal_rows = db.query(TimeOffBalance).filter(TimeOffBalance.user_id == user.id).all()
        if not bal_rows and not dry_run:
            # History-only sync: pull calculator balances now so we can seed.
            try:
                sync_user_time_off_balance(db, client, user, bamboohr_id, dry_run=False)
                db.flush()
                bal_rows = (
                    db.query(TimeOffBalance).filter(TimeOffBalance.user_id == user.id).all()
                )
            except Exception:
                bal_rows = []
        if bal_rows:
            history_entries = []
            for bal in bal_rows:
                if policy_filter and bal.policy_name != policy_filter:
                    continue
                accrued_days = float(bal.accrued_hours or 0) / 8.0
                used_days = abs(float(bal.used_hours or 0) / 8.0)
                if accrued_days <= 0 and used_days <= 0:
                    continue
                y = bal.year
                if accrued_days > 0:
                    history_entries.append(
                        {
                            "date": f"{y}-01-01",
                            "policyName": bal.policy_name,
                            "description": f"Accrual for 01/01/{y} to 12/31/{y}",
                            "used": None,
                            "earned": accrued_days,
                            "balance": accrued_days,
                            "id": f"entitlement:{bal.policy_name}:{y}",
                        }
                    )
                if used_days > 0:
                    history_entries.append(
                        {
                            "date": f"{y}-12-31",
                            "policyName": bal.policy_name,
                            "description": f"Time off used (Bamboo YTD) for {y}",
                            "used": -used_days,
                            "earned": None,
                            "balance": accrued_days - used_days,
                            "id": f"usedytd:{bal.policy_name}:{y}",
                        }
                    )
            if history_entries:
                history_data = history_entries

    if not history_data:
        return {
            "message": "No time off history data found. History may not be available via BambooHR API.",
            "synced": 0,
            "requests_synced": requests_synced,
        }

    transactions: List[Any] = []
    if isinstance(history_data, list):
        transactions = history_data
    elif isinstance(history_data, dict):
        for key in ("transactions", "history", "data"):
            if key in history_data:
                val = history_data[key]
                transactions = val if isinstance(val, list) else [val]
                break
        if not transactions:
            transactions = [history_data]

    synced_count = _apply_history_transactions(
        db, user, transactions, policy_filter=policy_filter, dry_run=dry_run
    )
    return {
        "message": f"Synced {synced_count} time off history transaction(s)",
        "synced": synced_count,
        "requests_synced": requests_synced,
    }


def sync_user_time_off(
    db: Session,
    client: BambooHRClient,
    user: User,
    *,
    dry_run: bool = False,
    skip_balance: bool = False,
    skip_history: bool = False,
) -> Dict[str, Any]:
    """Full time-off sync for one Hub user (email → Bamboo id → scoped data)."""
    email = user.email_personal or user.email_corporate
    if not email:
        return {"ok": False, "error": "User has no email address to match with BambooHR"}

    resolved = resolve_bamboohr_id_for_user(db, client, user)
    if not resolved:
        return {"ok": False, "error": f"Employee not found in BambooHR for email: {email}"}
    bamboohr_id, _ = resolved

    result: Dict[str, Any] = {
        "ok": True,
        "user_id": str(user.id),
        "email": email,
        "bamboohr_id": bamboohr_id,
        "balance": None,
        "history": None,
    }
    if not skip_balance:
        result["balance"] = sync_user_time_off_balance(
            db, client, user, bamboohr_id, dry_run=dry_run
        )
        if not dry_run:
            db.flush()  # so history seed can read balances just written
    if not skip_history:
        result["history"] = sync_user_time_off_history(
            db, client, user, bamboohr_id, dry_run=dry_run
        )
    if not dry_run:
        db.commit()
    return result


def _is_manual_history_row(row: TimeOffHistory) -> bool:
    """HR balance adjustments created in the Hub UI — keep unless --clean-all."""
    if row.bamboohr_transaction_id:
        return False
    desc = (row.description or "").lower()
    return "adjusted by" in desc


def _is_bamboo_sourced_history(row: TimeOffHistory) -> bool:
    """Rows that came from Bamboo sync (including older malformed imports)."""
    if _is_manual_history_row(row):
        return False
    if row.bamboohr_transaction_id:
        return True
    if row.last_synced_at is not None:
        return True
    desc = (row.description or "").strip()
    if desc.startswith("Time off used for"):
        return True
    if desc.startswith("Accrual for 01/01/"):
        return True
    if desc.startswith("Time off:"):
        return True
    return False


def clean_user_time_off(
    db: Session,
    user: User,
    *,
    dry_run: bool = False,
    clean_all: bool = False,
) -> Dict[str, Any]:
    """
    Remove corrupted / Bamboo-imported time-off data for one Hub user.

    Default (clean_all=False):
      - history: Bamboo-synced rows (ids, last_synced_at, or known sync descriptions)
      - requests: rows with bamboohr_request_id
      - balances: rows with last_synced_at (Bamboo sync)
      - keeps manual "Adjusted by …" history entries

    clean_all=True:
      - deletes ALL history, Bamboo+Hub requests, and balances for the user
    """
    history_q = db.query(TimeOffHistory).filter(TimeOffHistory.user_id == user.id)
    request_q = db.query(TimeOffRequest).filter(TimeOffRequest.user_id == user.id)
    balance_q = db.query(TimeOffBalance).filter(TimeOffBalance.user_id == user.id)

    history_rows = history_q.all()
    if clean_all:
        hist_to_delete = history_rows
        req_to_delete = request_q.all()
        bal_to_delete = balance_q.all()
    else:
        hist_to_delete = [r for r in history_rows if _is_bamboo_sourced_history(r)]
        req_to_delete = (
            request_q.filter(TimeOffRequest.bamboohr_request_id.isnot(None)).all()
        )
        bal_to_delete = balance_q.filter(TimeOffBalance.last_synced_at.isnot(None)).all()
        # Balances with no sync stamp but only bamboo history behind them are
        # usually wrong too — drop any balance that has zero remaining Hub-only history.
        remaining_manual = [r for r in history_rows if r not in hist_to_delete]
        if not remaining_manual:
            # Also clear unsynced balances that were likely rebuilt from bad history
            unsynced = balance_q.filter(TimeOffBalance.last_synced_at.is_(None)).all()
            # Avoid double-count
            seen = {b.id for b in bal_to_delete}
            for b in unsynced:
                if b.id not in seen:
                    bal_to_delete.append(b)

    counts = {
        "history_deleted": len(hist_to_delete),
        "requests_deleted": len(req_to_delete),
        "balances_deleted": len(bal_to_delete),
        "history_kept": len(history_rows) - len(hist_to_delete),
    }

    if dry_run:
        return {"ok": True, "dry_run": True, **counts}

    for row in hist_to_delete:
        db.delete(row)
    for row in req_to_delete:
        db.delete(row)
    for row in bal_to_delete:
        db.delete(row)
    db.commit()
    return {"ok": True, "dry_run": False, **counts}
