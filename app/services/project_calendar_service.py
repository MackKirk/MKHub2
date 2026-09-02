"""Calendar data for Projects list Calendar View (B1: active range ∪ shifts)."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..auth.security import _has_project_feature_permission
from ..models.models import Client, EmployeeProfile, Project, SettingItem, SettingList, Shift, User
from ..services.project_utils import sanitize_division_onsite_leads
from .project_list_filters import BusinessProjectListFilters, build_business_projects_query


def _parse_iso_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def _daterange(start: date, end: date) -> list[date]:
    days: list[date] = []
    current = start
    while current <= end:
        days.append(current)
        current += timedelta(days=1)
    return days


def _estimator_ids_for_project(project: Project) -> list[str]:
    ids = getattr(project, "estimator_ids", None) or []
    if isinstance(ids, list) and ids:
        return [str(eid) for eid in ids if eid]
    estimator_id = getattr(project, "estimator_id", None)
    return [str(estimator_id)] if estimator_id else []


def _user_payload(users_map: dict[str, dict[str, Any]], user_id: Optional[str]) -> Optional[dict[str, Any]]:
    if not user_id:
        return None
    row = users_map.get(str(user_id))
    if not row:
        return None
    avatar = row.get("profile_photo_file_id") or row.get("avatar_file_id")
    return {
        "id": str(user_id),
        "name": row.get("name"),
        "avatar_file_id": str(avatar) if avatar else None,
    }


def _load_users_map(db: Session, user_ids: list) -> dict[str, dict[str, Any]]:
    users_map: dict[str, dict[str, Any]] = {}
    if not user_ids:
        return users_map
    rows = (
        db.query(User, EmployeeProfile)
        .outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)
        .filter(User.id.in_(user_ids))
        .all()
    )
    for user_row, ep in rows:
        name = (getattr(ep, "preferred_name", None) or "").strip() if ep else ""
        if not name:
            first = (getattr(ep, "first_name", None) or "").strip() if ep else ""
            last = (getattr(ep, "last_name", None) or "").strip() if ep else ""
            name = " ".join([x for x in [first, last] if x])
        if not name:
            name = getattr(user_row, "name", None) or getattr(user_row, "email", None)
        avatar_file_id = (
            str(getattr(ep, "profile_photo_file_id", None))
            if ep and getattr(ep, "profile_photo_file_id", None)
            else None
        )
        users_map[str(user_row.id)] = {
            "name": name,
            "profile_photo_file_id": avatar_file_id,
        }
    return users_map


def _division_labels_map(db: Session) -> dict[str, str]:
    out: dict[str, str] = {}
    divisions_list = db.query(SettingList).filter(SettingList.name == "project_divisions").first()
    if not divisions_list:
        return out
    items = db.query(SettingItem).filter(SettingItem.list_id == divisions_list.id).all()
    for item in items:
        out[str(item.id)] = item.label or str(item.id)
    return out


def _project_active_bounds(project: Project) -> tuple[Optional[date], Optional[date]]:
    """Return (active_start, active_end) for B1 range visibility.

    Matches project detail UI: Start Date = date_start; End Date = date_eta.
    date_end is actual completion and is only used when date_eta is absent.
    """
    raw_start = getattr(project, "date_start", None)
    created = getattr(project, "created_at", None)
    active_start = raw_start.date() if raw_start else (created.date() if created else None)

    raw_eta = getattr(project, "date_eta", None)
    raw_end = getattr(project, "date_end", None)
    # Planned end (ETA) drives the calendar range; date_end is completion metadata.
    active_end = raw_eta.date() if raw_eta else (raw_end.date() if raw_end else None)

    if active_end is None:
        return None, None
    if active_start is None:
        active_start = created.date() if created else None
    if active_start is None:
        return None, None
    if active_start > active_end:
        active_end = active_start
    return active_start, active_end


def _day_in_active_range(day: date, active_start: Optional[date], active_end: Optional[date]) -> bool:
    if active_start is None or active_end is None:
        return False
    return active_start <= day <= active_end


def get_project_calendar_data(
    db: Session,
    user: User,
    business_line: Optional[str],
    filters: BusinessProjectListFilters,
    *,
    start: str,
    end: str,
    is_bidding: bool = False,
) -> dict[str, Any]:
    cal_start = _parse_iso_date(start)
    cal_end = _parse_iso_date(end)
    if cal_end < cal_start:
        raise ValueError("end must be on or after start")

    base_query = build_business_projects_query(
        db, user, business_line, filters, is_bidding=is_bidding,
    )
    if base_query is None:
        return {
            "days": {},
            "meta": {
                "start": start,
                "end": end,
                "project_count": 0,
                "days_with_activity": 0,
            },
        }

    projects = base_query.all()
    if not projects:
        return {
            "days": {},
            "meta": {
                "start": start,
                "end": end,
                "project_count": 0,
                "days_with_activity": 0,
            },
        }

    project_ids = [p.id for p in projects]
    projects_by_id = {str(p.id): p for p in projects}

    shifts = (
        db.query(Shift)
        .filter(
            Shift.project_id.in_(project_ids),
            Shift.status == "scheduled",
            Shift.date >= cal_start,
            Shift.date <= cal_end,
        )
        .join(Project)
        .filter(
            ~or_(
                Project.code == "SYSTEM_INTERNAL",
                Project.name.ilike("%system internal%"),
                Project.name.ilike("%internal system%"),
            )
        )
        .order_by(Shift.date.asc(), Shift.start_time.asc())
        .all()
    )

    shifts_by_project_day: dict[tuple[str, str], list[Shift]] = {}
    worker_ids: set[str] = set()
    for shift in shifts:
        pid = str(shift.project_id)
        day_key = shift.date.isoformat()
        shifts_by_project_day.setdefault((pid, day_key), []).append(shift)
        worker_ids.add(str(shift.worker_id))

    user_ids: set[str] = set(worker_ids)
    for p in projects:
        admin_id = getattr(p, "project_admin_id", None)
        if admin_id:
            user_ids.add(str(admin_id))
        for eid in _estimator_ids_for_project(p):
            user_ids.add(eid)
        dol = sanitize_division_onsite_leads(
            getattr(p, "division_onsite_leads", None) or {},
            getattr(p, "project_division_ids", None) or [],
        )
        for uid in dol.values():
            if uid:
                user_ids.add(str(uid))
        legacy_lead = getattr(p, "onsite_lead_id", None)
        if legacy_lead:
            user_ids.add(str(legacy_lead))

    users_map = _load_users_map(db, list(user_ids))
    div_labels = _division_labels_map(db)

    client_ids = list({getattr(p, "client_id", None) for p in projects if getattr(p, "client_id", None)})
    clients_map: dict[str, Client] = {}
    if client_ids:
        for client in db.query(Client).filter(Client.id.in_(client_ids)).all():
            clients_map[str(client.id)] = client

    def build_leadership(project: Project) -> dict[str, Any]:
        estimators = []
        for eid in _estimator_ids_for_project(project):
            payload = _user_payload(users_map, eid)
            if payload:
                estimators.append(payload)

        admin = _user_payload(users_map, getattr(project, "project_admin_id", None))

        onsite_leads: list[dict[str, Any]] = []
        dol = sanitize_division_onsite_leads(
            getattr(project, "division_onsite_leads", None) or {},
            getattr(project, "project_division_ids", None) or [],
        )
        seen_lead_ids: set[str] = set()
        for div_id, uid in dol.items():
            uid_str = str(uid)
            if uid_str in seen_lead_ids:
                continue
            payload = _user_payload(users_map, uid_str)
            if payload:
                seen_lead_ids.add(uid_str)
                onsite_leads.append({
                    **payload,
                    "division_label": div_labels.get(str(div_id)),
                })
        legacy_lead = getattr(project, "onsite_lead_id", None)
        if legacy_lead:
            uid_str = str(legacy_lead)
            if uid_str not in seen_lead_ids:
                payload = _user_payload(users_map, uid_str)
                if payload:
                    onsite_leads.append({**payload, "division_label": None})

        return {
            "estimators": estimators,
            "project_admin": admin,
            "onsite_leads": onsite_leads,
        }

    leadership_cache: dict[str, dict[str, Any]] = {
        str(p.id): build_leadership(p) for p in projects
    }

    workload_read_cache: dict[str, bool] = {}

    def can_read_workload(project: Project) -> bool:
        pid = str(project.id)
        if pid not in workload_read_cache:
            line = getattr(project, "business_line", None)
            workload_read_cache[pid] = _has_project_feature_permission(user, line, "workload", "read")
        return workload_read_cache[pid]

    def build_project_entry(
        project: Project,
        day: date,
        day_shifts: list[Shift],
        in_range: bool,
        has_date_range: bool,
    ) -> dict[str, Any]:
        has_shifts = len(day_shifts) > 0
        if in_range and has_shifts:
            appearance = "both"
        elif has_shifts and has_date_range and not in_range:
            appearance = "shift_only"
        elif has_shifts:
            appearance = "scheduled"
        else:
            appearance = "in_range"

        client = clients_map.get(str(project.client_id)) if getattr(project, "client_id", None) else None
        client_display = None
        if client:
            client_display = getattr(client, "display_name", None) or getattr(client, "name", None)

        leadership = leadership_cache[str(project.id)]
        shift_payloads: list[dict[str, Any]] = []
        show_workers = can_read_workload(project)

        if has_shifts and show_workers:
            for s in day_shifts:
                worker = _user_payload(users_map, str(s.worker_id))
                shift_payloads.append({
                    "id": str(s.id),
                    "worker_id": str(s.worker_id),
                    "worker_name": worker.get("name") if worker else None,
                    "start_time": s.start_time.isoformat() if s.start_time else None,
                    "end_time": s.end_time.isoformat() if s.end_time else None,
                })
        elif has_shifts:
            shift_payloads = [{"id": str(s.id)} for s in day_shifts]

        entry: dict[str, Any] = {
            "project_id": str(project.id),
            "code": project.code,
            "name": project.name,
            "status_label": getattr(project, "status_label", None),
            "client_display_name": client_display,
            "appearance": appearance,
            "estimators": leadership["estimators"],
            "project_admin": leadership["project_admin"],
            "onsite_leads": leadership["onsite_leads"],
            "shifts": shift_payloads,
            "shift_count": len(day_shifts),
            "workers_visible": show_workers,
        }
        return entry

    days_out: dict[str, list[dict[str, Any]]] = {}
    calendar_days = _daterange(cal_start, cal_end)

    for p in projects:
        pid = str(p.id)
        active_start, active_end = _project_active_bounds(p)
        has_date_range = active_start is not None and active_end is not None
        for day in calendar_days:
            day_key = day.isoformat()
            day_shifts = shifts_by_project_day.get((pid, day_key), [])
            in_range = _day_in_active_range(day, active_start, active_end)
            if not in_range and not day_shifts:
                continue
            entry = build_project_entry(p, day, day_shifts, in_range, has_date_range)
            days_out.setdefault(day_key, []).append(entry)

    for day_key in days_out:
        days_out[day_key].sort(key=lambda e: (e.get("code") or "", e.get("name") or ""))

    return {
        "days": days_out,
        "meta": {
            "start": start,
            "end": end,
            "project_count": len(projects),
            "days_with_activity": len(days_out),
        },
    }
