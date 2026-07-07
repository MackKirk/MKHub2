"""
Aggregate customer overview metrics for GET /clients/{id}/insights.
Mirrors frontend business rules in customer overview components.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple, Union

from sqlalchemy.orm import Session

from ..models.models import Project, Proposal
from ..routes.projects import calculate_proposal_grand_total, _business_line_filter_for_user
from ..services.project_customer_participation import build_participation_payload
from ..services.project_visibility import project_visibility_clause_for_user


def parse_insights_range(date_from: str, date_to: str) -> Tuple[datetime, datetime, int]:
    df_raw = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
    dt_raw = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
    df = datetime(df_raw.year, df_raw.month, df_raw.day, 0, 0, 0, tzinfo=timezone.utc)
    dt = datetime(dt_raw.year, dt_raw.month, dt_raw.day, 23, 59, 59, 999999, tzinfo=timezone.utc)
    if dt < df:
        raise ValueError("`to` must be on or after `from`")
    span_days = max(1, (dt.date() - df.date()).days + 1)
    return df, dt, span_days


def previous_range(df: datetime, dt: datetime, span_days: int) -> Tuple[datetime, datetime]:
    prev_dt = df - timedelta(microseconds=1)
    prev_df = datetime(
        (df - timedelta(days=span_days)).year,
        (df - timedelta(days=span_days)).month,
        (df - timedelta(days=span_days)).day,
        0, 0, 0, tzinfo=timezone.utc,
    )
    return prev_df, prev_dt


def _status_norm(label: Optional[str]) -> str:
    return (label or "").strip().lower()


def _iso_date(d: Union[str, datetime, date, None]) -> Optional[str]:
    """Normalize rollup timestamps (ISO strings or datetime) to YYYY-MM-DD."""
    if d is None:
        return None
    if isinstance(d, str):
        s = d.strip()
        if not s:
            return None
        return s[:10]
    if isinstance(d, datetime):
        return d.date().isoformat()
    if isinstance(d, date):
        return d.isoformat()
    return None


def _in_range(date_str: Optional[str], d_from: Optional[str], d_to: Optional[str]) -> bool:
    if not date_str:
        return False
    if d_from and date_str < d_from:
        return False
    if d_to and date_str > d_to:
        return False
    return True


def _proposal_row_total(pr: Proposal) -> float:
    data = pr.data or {}
    if isinstance(data, dict):
        stored = data.get("total")
        if isinstance(stored, (int, float)) and stored > 0:
            return float(stored)
        computed = calculate_proposal_grand_total(data)
        if computed > 0:
            return computed
    return 0.0


def _project_fallback_value(p: Dict[str, Any]) -> float:
    for key in ("cost_estimated", "service_value", "cost_actual"):
        v = p.get(key)
        if v is not None and float(v) > 0:
            return float(v)
    return 0.0


def build_proposal_value_maps(
    db: Session, rollup: List[Dict[str, Any]]
) -> Tuple[Dict[str, float], int]:
    """Returns (project_id -> value, count without proposal total)."""
    ids = [uuid.UUID(str(r["id"])) for r in rollup]
    if not ids:
        return {}, 0

    rows = (
        db.query(Proposal)
        .filter(Proposal.project_id.in_(ids), Proposal.deleted_at.is_(None))
        .all()
    )
    by_project: Dict[uuid.UUID, List[Proposal]] = {}
    for pr in rows:
        if pr.project_id:
            by_project.setdefault(pr.project_id, []).append(pr)

    values: Dict[str, float] = {}
    missing = 0
    rollup_by_id = {str(r["id"]): r for r in rollup}

    for pid, proposals in by_project.items():
        pid_str = str(pid)
        row = rollup_by_id.get(pid_str, {})
        is_bidding = row.get("is_bidding") is True
        total = 0.0
        if is_bidding:
            originals = [p for p in proposals if not p.is_change_order]
            candidates = originals if originals else proposals
            picked = max(candidates, key=lambda p: p.created_at or datetime.min.replace(tzinfo=timezone.utc))
            total = _proposal_row_total(picked)
        else:
            total = sum(_proposal_row_total(p) for p in proposals)
        if total <= 0:
            total = _project_fallback_value(row)
            if total <= 0:
                missing += 1
        values[pid_str] = total

    for r in rollup:
        pid_str = str(r["id"])
        if pid_str not in values:
            total = _project_fallback_value(r)
            values[pid_str] = total
            if total <= 0:
                missing += 1

    return values, missing


def _finished_date(p: Dict[str, Any]) -> Optional[str]:
    return _iso_date(p.get("date_end")) or _iso_date(p.get("status_changed_at")) or _iso_date(p.get("created_at"))


def _open_opportunities(rollup: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for r in rollup:
        if r.get("is_bidding") is not True:
            continue
        s = _status_norm(r.get("status_label"))
        if s in ("prospecting", "sent to customer"):
            out.append(r)
    return out


def _compute_kpis(
    rollup: List[Dict[str, Any]],
    values: Dict[str, float],
    d_from: str,
    d_to: str,
) -> Dict[str, Any]:
    projects = [r for r in rollup if r.get("is_bidding") is not True]
    opps = [r for r in rollup if r.get("is_bidding") is True]

    finished_in_period = [
        p for p in projects if _status_norm(p.get("status_label")) == "finished" and _in_range(_finished_date(p), d_from, d_to)
    ]
    open_opps = _open_opportunities(rollup)
    wip = [p for p in projects if _status_norm(p.get("status_label")) == "in progress"]
    on_hold = [p for p in projects if _status_norm(p.get("status_label")) == "on hold"]

    def _sum(ids: List[Dict[str, Any]]) -> float:
        return sum(values.get(str(x["id"]), 0) for x in ids)

    refused = [
        o
        for o in opps
        if _status_norm(o.get("status_label")) == "refused"
        and _in_range(_iso_date(o.get("status_changed_at")) or _iso_date(o.get("created_at")), d_from, d_to)
    ]
    converted_in_period = [
        p
        for p in projects
        if _status_norm(p.get("status_label")) in ("in progress", "on hold", "finished")
        and _in_range(_iso_date(p.get("date_awarded")) or _iso_date(p.get("created_at")), d_from, d_to)
    ]
    win_denom = len(converted_in_period) + len(refused)
    win_rate = (len(converted_in_period) / win_denom * 100.0) if win_denom > 0 else 0.0

    ages = []
    for o in open_opps:
        created = _iso_date(o.get("created_at"))
        if created:
            days = (datetime.now(timezone.utc).date() - datetime.fromisoformat(created).date()).days
            ages.append(max(0, days))
    avg_age = round(sum(ages) / len(ages)) if ages else 0

    return {
        "delivered_value": _sum(finished_in_period),
        "delivered_count": len(finished_in_period),
        "pipeline_value": _sum(open_opps),
        "pipeline_count": len(open_opps),
        "wip_value": _sum(wip),
        "wip_count": len(wip),
        "on_hold_count": len(on_hold),
        "win_rate_pct": round(win_rate, 1),
        "avg_pipeline_age_days": avg_age,
    }


def _month_key(d: str) -> str:
    return d[:7]


def _daily_series(
    rollup: List[Dict[str, Any]], values: Dict[str, float], d_from: str, d_to: str, use_daily: bool
) -> Dict[str, List[Dict[str, Any]]]:
    start = datetime.fromisoformat(d_from).date()
    end = datetime.fromisoformat(d_to).date()
    bucket_keys: List[str] = []
    if use_daily:
        cur = start
        while cur <= end:
            bucket_keys.append(cur.isoformat())
            cur += timedelta(days=1)
    else:
        cur = datetime(start.year, start.month, 1).date()
        while cur <= end:
            bucket_keys.append(f"{cur.year}-{cur.month:02d}")
            if cur.month == 12:
                cur = datetime(cur.year + 1, 1, 1).date()
            else:
                cur = datetime(cur.year, cur.month + 1, 1).date()

    delivered = {k: 0.0 for k in bucket_keys}
    pipeline = {k: 0.0 for k in bucket_keys}
    awarded = {k: 0.0 for k in bucket_keys}

    def _bucket(date_str: Optional[str]) -> Optional[str]:
        if not date_str:
            return None
        if use_daily:
            return date_str if date_str in delivered else None
        mk = _month_key(date_str)
        return mk if mk in delivered else None

    for r in rollup:
        if r.get("is_bidding") is not True:
            if _status_norm(r.get("status_label")) == "finished":
                fd = _finished_date(r)
                bk = _bucket(fd)
                if bk:
                    delivered[bk] += values.get(str(r["id"]), 0)
            ad = _iso_date(r.get("date_awarded"))
            bk = _bucket(ad)
            if bk:
                awarded[bk] += values.get(str(r["id"]), 0)
        else:
            created = _iso_date(r.get("created_at"))
            bk = _bucket(created)
            if bk:
                pipeline[bk] += values.get(str(r["id"]), 0)

    def _series(m: Dict[str, float]) -> List[Dict[str, Any]]:
        return [{"date": d, "count": m[d]} for d in bucket_keys]

    return {"delivered": _series(delivered), "pipeline": _series(pipeline), "awarded": _series(awarded)}


def _funnel(rollup: List[Dict[str, Any]], values: Dict[str, float], d_from: str, d_to: str) -> Dict[str, Any]:
    opps = [r for r in rollup if r.get("is_bidding") is True]
    projects = [r for r in rollup if r.get("is_bidding") is not True]

    prospecting = [o for o in opps if _status_norm(o.get("status_label")) == "prospecting"]
    sent = [
        o
        for o in opps
        if _status_norm(o.get("status_label")) == "sent to customer"
        and _in_range(_iso_date(o.get("status_changed_at")) or _iso_date(o.get("created_at")), d_from, d_to)
    ]
    refused = [
        o
        for o in opps
        if _status_norm(o.get("status_label")) == "refused"
        and _in_range(_iso_date(o.get("status_changed_at")) or _iso_date(o.get("created_at")), d_from, d_to)
    ]
    converted = [
        p
        for p in projects
        if _status_norm(p.get("status_label")) in ("in progress", "on hold", "finished")
        and _in_range(_iso_date(p.get("date_awarded")) or _iso_date(p.get("created_at")), d_from, d_to)
    ]

    def _v(lst: List[Dict[str, Any]], is_opp: bool) -> float:
        return sum(values.get(str(x["id"]), 0) for x in lst)

    prospecting_v = _v(prospecting, True)
    sent_v = _v(sent, True)
    refused_v = _v(refused, True)
    converted_v = _v(converted, False)
    total = prospecting_v + sent_v + refused_v + converted_v

    def _pct(v: float) -> Optional[float]:
        return round(v / total * 100, 1) if total > 0 else None

    return {
        "prospecting": {"count": len(prospecting), "value": prospecting_v, "pct": _pct(prospecting_v)},
        "sent": {"count": len(sent), "value": sent_v, "pct": _pct(sent_v)},
        "refused": {"count": len(refused), "value": refused_v, "pct": _pct(refused_v)},
        "converted": {"count": len(converted), "value": converted_v, "pct": _pct(converted_v)},
    }


def _portfolio(rollup: List[Dict[str, Any]], values: Dict[str, float]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    status_map: Dict[str, Dict[str, float]] = {}
    division_map: Dict[str, Dict[str, float]] = {}
    label_map = {"in progress": "In Progress", "on hold": "On Hold", "finished": "Finished", "cancelled": "Cancelled", "canceled": "Cancelled"}

    for r in rollup:
        if r.get("is_bidding") is True:
            continue
        s = label_map.get(_status_norm(r.get("status_label")), (r.get("status_label") or "Unknown").strip())
        if s not in status_map:
            status_map[s] = {"count": 0, "value": 0}
        status_map[s]["count"] += 1
        status_map[s]["value"] += values.get(str(r["id"]), 0)

        div_ids = r.get("project_division_ids") or r.get("division_ids") or []
        if not isinstance(div_ids, list) or not div_ids:
            div_ids = ["Unassigned"]
        for did in div_ids:
            key = str(did)
            if key not in division_map:
                division_map[key] = {"count": 0, "value": 0}
            division_map[key]["count"] += 1
            division_map[key]["value"] += values.get(str(r["id"]), 0)

    by_status = [{"id": k, "label": k, "count": int(v["count"]), "value": v["value"]} for k, v in status_map.items()]
    by_division = [
        {"id": k, "label": k if k != "Unassigned" else "Unassigned", "count": int(v["count"]), "value": v["value"]}
        for k, v in division_map.items()
    ]
    return by_status, by_division


def _top_opportunities(rollup: List[Dict[str, Any]], values: Dict[str, float]) -> List[Dict[str, Any]]:
    rows = []
    for o in _open_opportunities(rollup):
        created = _iso_date(o.get("created_at"))
        age = 0
        if created:
            age = max(0, (datetime.now(timezone.utc).date() - datetime.fromisoformat(created).date()).days)
        rows.append(
            {
                "id": str(o["id"]),
                "name": o.get("name") or o.get("code") or "Untitled",
                "code": o.get("code"),
                "status": o.get("status_label") or "Open",
                "value": values.get(str(o["id"]), 0),
                "age_days": age,
            }
        )
    rows.sort(key=lambda x: x["value"], reverse=True)
    return rows[:5]


def _at_risk(rollup: List[Dict[str, Any]], values: Dict[str, float]) -> List[Dict[str, Any]]:
    items = []
    for p in rollup:
        if p.get("is_bidding") is True:
            continue
        s = _status_norm(p.get("status_label"))
        val = values.get(str(p["id"]), 0)
        if s == "on hold":
            changed = _iso_date(p.get("status_changed_at")) or _iso_date(p.get("created_at"))
            if changed:
                days = max(0, (datetime.now(timezone.utc).date() - datetime.fromisoformat(changed).date()).days)
                if days > 30:
                    items.append(
                        {
                            "id": str(p["id"]),
                            "name": p.get("name") or p.get("code"),
                            "code": p.get("code"),
                            "status": "On Hold",
                            "value": val,
                            "reason": f"On hold {days}d",
                        }
                    )
        if s == "in progress" and p.get("date_eta"):
            eta = p.get("date_eta")
            if isinstance(eta, str):
                eta_dt = datetime.fromisoformat(eta.replace("Z", "+00:00"))
            else:
                eta_dt = eta
            if eta_dt and eta_dt.date() < datetime.now(timezone.utc).date():
                items.append(
                    {
                        "id": str(p["id"]),
                        "name": p.get("name") or p.get("code"),
                        "code": p.get("code"),
                        "status": "In Progress",
                        "value": val,
                        "reason": "Past ETA",
                    }
                )
    items.sort(key=lambda x: x["value"], reverse=True)
    return items[:5]


def _activity(rollup: List[Dict[str, Any]], d_from: str, d_to: str) -> List[Dict[str, Any]]:
    events = []
    for p in rollup:
        pid = str(p["id"])
        name = p.get("name") or p.get("code") or "Untitled"
        is_opp = p.get("is_bidding") is True
        prefix = "Opportunity" if is_opp else "Project"
        created = _iso_date(p.get("created_at"))
        if created and _in_range(created, d_from, d_to):
            events.append({"type": f"{'opportunity' if is_opp else 'project'}_created", "label": f'{prefix} "{name}" created', "date": created, "id": pid})
        if not is_opp and _status_norm(p.get("status_label")) == "finished":
            fd = _finished_date(p)
            if fd and _in_range(fd, d_from, d_to):
                events.append({"type": "project_finished", "label": f'Project "{name}" finished', "date": fd, "id": pid})
        if is_opp:
            s = _status_norm(p.get("status_label"))
            sc = _iso_date(p.get("status_changed_at"))
            if sc and _in_range(sc, d_from, d_to):
                if s == "sent to customer":
                    events.append({"type": "opportunity_sent", "label": f'Opportunity "{name}" sent to customer', "date": sc, "id": pid})
                elif s == "refused":
                    events.append({"type": "opportunity_refused", "label": f'Opportunity "{name}" refused', "date": sc, "id": pid})
        ad = _iso_date(p.get("date_awarded"))
        if ad and _in_range(ad, d_from, d_to):
            events.append({"type": "project_awarded", "label": f'{prefix} "{name}" awarded', "date": ad, "id": pid})
    events.sort(key=lambda x: x["date"], reverse=True)
    return events[:20]


def _signals(
    rollup: List[Dict[str, Any]], values: Dict[str, float], d_from: str, d_to: str
) -> List[Dict[str, Any]]:
    signals: List[Dict[str, Any]] = []
    open_opps = _open_opportunities(rollup)
    stale = []
    for o in open_opps:
        created = _iso_date(o.get("created_at"))
        if created:
            days = max(0, (datetime.now(timezone.utc).date() - datetime.fromisoformat(created).date()).days)
            if days > 60:
                stale.append(o)
    if stale:
        at_risk = sum(values.get(str(o["id"]), 0) for o in stale)
        signals.append(
            {
                "id": "stale-pipeline",
                "severity": "critical" if len(stale) >= 3 else "watch",
                "title": "Pipeline stalled",
                "body": f"{len(stale)} open opportunities with no movement for 60+ days.",
                "meta": {"at_risk_value": at_risk},
            }
        )

    new_opps = [
        o
        for o in rollup
        if o.get("is_bidding") is True and _in_range(_iso_date(o.get("created_at")), d_from, d_to)
    ]
    if not new_opps and d_from and d_to:
        signals.append(
            {
                "id": "commercial-gap",
                "severity": "watch",
                "title": "Commercial gap",
                "body": "No new opportunities created in this period.",
            }
        )

    severity_order = {"critical": 0, "watch": 1, "info": 2}
    signals.sort(key=lambda s: severity_order.get(s["severity"], 9))
    return signals[:6]


def _modal_lists(rollup: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    projects = [r for r in rollup if r.get("is_bidding") is not True]
    opps = [r for r in rollup if r.get("is_bidding") is True]

    def _row(p: Dict[str, Any]) -> Dict[str, Any]:
        return {"id": str(p["id"]), "name": p.get("name"), "code": p.get("code")}

    return {
        "closed": [_row(p) for p in projects if _status_norm(p.get("status_label")) == "finished"],
        "inProgress": [_row(p) for p in projects if _status_norm(p.get("status_label")) == "in progress"],
        "onHold": [_row(p) for p in projects if _status_norm(p.get("status_label")) == "on hold"],
        "pipeline": [
            _row(o)
            for o in opps
            if _status_norm(o.get("status_label")) in ("prospecting", "sent to customer")
        ],
    }


def _client_since(rollup: List[Dict[str, Any]], client_created: Optional[str]) -> Optional[str]:
    dates = [d for d in (_iso_date(r.get("created_at")) for r in rollup) if d]
    if client_created:
        dates.append(client_created[:10] if len(client_created) >= 10 else client_created)
    if not dates:
        return client_created
    return min(dates)


def build_customer_insights_payload(
    db: Session,
    client_uuid: uuid.UUID,
    user: Any,
    date_from: str,
    date_to: str,
    client_created_at: Optional[str] = None,
) -> Dict[str, Any]:
    df, dt, span_days = parse_insights_range(date_from, date_to)
    prev_df, prev_dt = previous_range(df, dt, span_days)
    d_from = df.date().isoformat()
    d_to = dt.date().isoformat()
    prev_from = prev_df.date().isoformat()
    prev_to = prev_dt.date().isoformat()

    from sqlalchemy import and_

    bl_filter = _business_line_filter_for_user(user)
    if bl_filter is None:
        return {
            "range": {"from": d_from, "to": d_to, "days": span_days},
            "previous_range": {"from": prev_from, "to": prev_to, "days": span_days},
            "kpis": {},
            "previous": {},
            "daily": {"delivered": [], "pipeline": [], "awarded": []},
            "funnel": {},
            "portfolio_by_status": [],
            "portfolio_by_division": [],
            "top_opportunities": [],
            "at_risk_projects": [],
            "signals": [],
            "recent_activity": [],
            "related_summary": {},
            "rollup": [],
            "related_memberships": [],
            "modal_lists": _modal_lists([]),
            "client_since": client_created_at,
            "value_coverage": {"rollup_count": 0, "missing_proposal_total_count": 0},
            "project_values": {},
        }
    bl_filter = and_(bl_filter, project_visibility_clause_for_user(user))

    rollup, related = build_participation_payload(db, client_uuid, bl_filter, limit=400)
    values, missing_count = build_proposal_value_maps(db, rollup)

    use_daily = span_days <= 90
    kpis = _compute_kpis(rollup, values, d_from, d_to)
    prev_kpis = _compute_kpis(rollup, values, prev_from, prev_to)
    daily = _daily_series(rollup, values, d_from, d_to, use_daily)
    funnel = _funnel(rollup, values, d_from, d_to)
    by_status, by_division = _portfolio(rollup, values)

    return {
        "range": {"from": d_from, "to": d_to, "days": span_days},
        "previous_range": {"from": prev_from, "to": prev_to, "days": span_days},
        "kpis": kpis,
        "previous": prev_kpis,
        "daily": daily,
        "funnel": funnel,
        "portfolio_by_status": by_status,
        "portfolio_by_division": by_division,
        "top_opportunities": _top_opportunities(rollup, values),
        "at_risk_projects": _at_risk(rollup, values),
        "signals": _signals(rollup, values, d_from, d_to),
        "recent_activity": _activity(rollup, d_from, d_to),
        "related_summary": {
            "projects_total": len([m for m in related if not m.get("is_bidding")]),
            "projects_awarded": len([m for m in related if not m.get("is_bidding") and m.get("is_awarded_related")]),
            "opportunities_total": len([m for m in related if m.get("is_bidding")]),
            "opportunities_awarded": len([m for m in related if m.get("is_bidding") and m.get("is_awarded_related")]),
        },
        "value_coverage": {
            "rollup_count": len(rollup),
            "missing_proposal_total_count": missing_count,
        },
        "rollup": rollup,
        "related_memberships": related,
        "modal_lists": _modal_lists(rollup),
        "client_since": _client_since(rollup, client_created_at),
        "project_values": values,
    }
