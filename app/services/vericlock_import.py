"""Parse VeriClock Activity Report CSV and import Attendance without Sage re-export."""
from __future__ import annotations

import csv
import io
import re
import unicodedata
import uuid
from datetime import datetime, time, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from ..models.models import Attendance, EmployeeProfile, Project, User, VeriClockEmployeeMap, VeriClockJobMap
from .attendance_job_labels import PREDEFINED_JOBS_DICT, compose_reason_text
from .sage_export import SOURCE_VERICLOCK, refresh_sage_export_state
from .work_types import get_default_work_type

TZ_NAME = "America/Vancouver"
_DATETIME_RE = re.compile(
    r"^(?P<y>\d{4})-(?P<m>\d{2})-(?P<d>\d{2})\s+(?P<h>\d{1,2}):(?P<min>\d{2})\s*(?P<ampm>am|pm)$",
    re.IGNORECASE,
)
_DURATION_H = re.compile(r"(\d+)\s*h", re.IGNORECASE)
_DURATION_M = re.compile(r"(\d+)\s*m", re.IGNORECASE)
_NON_ALNUM = re.compile(r"[^a-z0-9]+")
_JOB_SAGE_CODE = re.compile(r"\b([A-Za-z]{2}\d{4,5})\b")


def compact_job_code(value: Optional[str]) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def norm_token(value: Optional[str]) -> str:
    raw = unicodedata.normalize("NFKD", value or "")
    raw = "".join(ch for ch in raw if not unicodedata.combining(ch))
    return _NON_ALNUM.sub("", raw.lower())


def parse_person_name(raw: str) -> Tuple[str, str]:
    """Return (first, last). Handles `Last, First` and `First Last`."""
    name = " ".join((raw or "").split())
    if not name:
        return "", ""
    if "," in name:
        last, first = name.split(",", 1)
        return first.strip(), last.strip()
    parts = name.split()
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def name_key(first: str, last: str) -> Tuple[str, str]:
    return (norm_token(first), norm_token(last))


def parse_duration_hours(raw: str) -> Optional[float]:
    s = (raw or "").strip()
    if not s or s.upper() == "N/A":
        return None
    hours = 0
    minutes = 0
    hm = _DURATION_H.search(s)
    mm = _DURATION_M.search(s)
    if hm:
        hours = int(hm.group(1))
    if mm:
        minutes = int(mm.group(1))
    if not hm and not mm:
        try:
            return float(s)
        except ValueError:
            return None
    return hours + (minutes / 60.0)


def parse_local_datetime(raw: str, tz_name: str = TZ_NAME) -> Optional[datetime]:
    s = (raw or "").strip()
    if not s or s.upper() == "N/A":
        return None
    m = _DATETIME_RE.match(s)
    if not m:
        return None
    hour = int(m.group("h"))
    ampm = m.group("ampm").lower()
    if ampm == "pm" and hour != 12:
        hour += 12
    if ampm == "am" and hour == 12:
        hour = 0
    naive = datetime(
        int(m.group("y")),
        int(m.group("m")),
        int(m.group("d")),
        hour,
        int(m.group("min")),
    )
    return naive.replace(tzinfo=ZoneInfo(tz_name))


def parse_job_field(raw: str) -> Dict[str, Any]:
    s = (raw or "").strip()
    if not s:
        return {"code": "", "project_code": "", "sage_codes": [], "label": "", "raw": ""}
    parts = [p.strip() for p in s.split(" - ") if p.strip()]
    code = parts[0] if parts else ""
    project_code = parts[1] if len(parts) > 1 else ""
    if project_code.lower() in {"no project assigned", "stat holiday", "shop", "repairs", "electrical", "mechanical"}:
        project_code = ""
    sage_codes = []
    seen = set()
    for token in _JOB_SAGE_CODE.findall(s):
        key = compact_job_code(token)
        if key and key not in seen:
            seen.add(key)
            sage_codes.append(token.upper())
    return {
        "code": code,
        "project_code": project_code,
        "sage_codes": sage_codes,
        "label": s,
        "raw": s,
    }


def parse_activity_csv(csv_text: str) -> List[Dict[str, Any]]:
    text = (csv_text or "").lstrip("\ufeff")
    reader = csv.DictReader(io.StringIO(text))
    rows: List[Dict[str, Any]] = []
    for index, raw in enumerate(reader, start=2):
        eid = str(raw.get("Employee ID") or "").strip()
        if not eid:
            continue
        name = str(raw.get("Name") or "").strip()
        first, last = parse_person_name(name)
        inn = str(raw.get("In") or "").strip()
        out = str(raw.get("Clock Out Time") or "").strip()
        job = parse_job_field(str(raw.get("Job") or ""))
        duration = parse_duration_hours(str(raw.get("Duration") or ""))
        clock_in = parse_local_datetime(inn)
        clock_out = parse_local_datetime(out)
        rows.append(
            {
                "line": index,
                "vericlock_employee_id": eid,
                "vericlock_name": name,
                "first_name": first,
                "last_name": last,
                "group": str(raw.get("Group") or "").strip(),
                "clock_in": clock_in,
                "clock_out": clock_out,
                "duration_hours": duration,
                "job": job,
            }
        )
    return rows


def unique_people(rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_id: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        eid = row["vericlock_employee_id"]
        cur = by_id.get(eid)
        if cur is None:
            by_id[eid] = {
                "vericlock_employee_id": eid,
                "vericlock_name": row["vericlock_name"],
                "first_name": row["first_name"],
                "last_name": row["last_name"],
                "group": row.get("group") or "",
                "row_count": 1,
            }
        else:
            cur["row_count"] += 1
            if row["vericlock_name"]:
                cur["vericlock_name"] = row["vericlock_name"]
                cur["first_name"] = row["first_name"]
                cur["last_name"] = row["last_name"]
            if row.get("group"):
                cur["group"] = row["group"]
    people = list(by_id.values())
    people.sort(key=lambda p: (p["vericlock_name"] or "").lower())
    return people


def unique_jobs(rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_code: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        job = row.get("job") or {}
        code = str(job.get("code") or "").strip() or "0"
        cur = by_code.get(code)
        label = job.get("label") or code
        if cur is None:
            by_code[code] = {
                "vericlock_job_code": code,
                "vericlock_label": label,
                "project_code": job.get("project_code") or "",
                "sage_codes": list(job.get("sage_codes") or []),
                "row_count": 1,
                "job": job,
            }
        else:
            cur["row_count"] += 1
            if label and len(label) > len(cur.get("vericlock_label") or ""):
                cur["vericlock_label"] = label
                cur["job"] = job
                cur["project_code"] = job.get("project_code") or cur["project_code"]
                cur["sage_codes"] = list(job.get("sage_codes") or cur["sage_codes"])
    jobs = list(by_code.values())
    jobs.sort(key=lambda j: (-j["row_count"], (j["vericlock_label"] or "").lower()))
    return jobs


def _hub_name_keys(person: Dict[str, Any]) -> List[Tuple[str, str]]:
    first = person.get("first_name") or ""
    last = person.get("last_name") or ""
    keys = [name_key(first, last)]
    preferred = (person.get("preferred_name") or "").strip()
    if preferred:
        pref_first, pref_rest = parse_person_name(preferred) if "," in preferred else (
            preferred.split()[0],
            last,
        )
        if " " in preferred and "," not in preferred:
            parts = preferred.split()
            pref_first = parts[0]
            if len(parts) > 1:
                pref_rest = " ".join(parts[1:])
            else:
                pref_rest = last
        keys.append(name_key(pref_first, pref_rest))
    display = (person.get("name") or "").strip()
    if display:
        df, dl = parse_person_name(display)
        keys.append(name_key(df, dl))
    out: List[Tuple[str, str]] = []
    seen = set()
    for key in keys:
        if key == ("", "") or key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def suggest_hub_match(
    first: str,
    last: str,
    hub_people: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    wanted = name_key(first, last)
    if wanted == ("", ""):
        return None
    exact: List[Dict[str, Any]] = []
    swapped: List[Dict[str, Any]] = []
    swap_key = name_key(last, first) if last and first else ("", "")
    for person in hub_people:
        keys = _hub_name_keys(person)
        if wanted in keys:
            exact.append(person)
        elif swap_key != ("", "") and swap_key in keys:
            swapped.append(person)
    unique_exact = {p["id"]: p for p in exact}
    if len(unique_exact) == 1:
        person = next(iter(unique_exact.values()))
        return {"hub_user_id": person["id"], "hub_name": person.get("name") or "", "confidence": "exact"}
    if len(unique_exact) > 1:
        return None
    unique_swap = {p["id"]: p for p in swapped}
    if len(unique_swap) == 1:
        person = next(iter(unique_swap.values()))
        return {
            "hub_user_id": person["id"],
            "hub_name": person.get("name") or "",
            "confidence": "reversed",
        }
    return None


def load_hub_people(db: Session) -> List[Dict[str, Any]]:
    rows = (
        db.query(User, EmployeeProfile)
        .outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)
        .all()
    )
    out: List[Dict[str, Any]] = []
    for user, profile in rows:
        first = (getattr(profile, "first_name", None) or "").strip() if profile else ""
        last = (getattr(profile, "last_name", None) or "").strip() if profile else ""
        preferred = (getattr(profile, "preferred_name", None) or "").strip() if profile else ""
        name = preferred or " ".join(p for p in (first, last) if p) or user.username
        out.append(
            {
                "id": str(user.id),
                "name": name,
                "username": user.username,
                "first_name": first,
                "last_name": last,
                "preferred_name": preferred or None,
                "is_active": bool(getattr(user, "is_active", True)),
            }
        )
    return out


def load_saved_maps(db: Session) -> Dict[str, VeriClockEmployeeMap]:
    rows = db.query(VeriClockEmployeeMap).all()
    return {row.vericlock_employee_id: row for row in rows}


def people_preview(db: Session, csv_text: str) -> Dict[str, Any]:
    rows = parse_activity_csv(csv_text)
    people = unique_people(rows)
    hub_people = load_hub_people(db)
    saved = load_saved_maps(db)
    payload = []
    mapped = 0
    skipped = 0
    suggested = 0
    needs = 0
    for person in people:
        eid = person["vericlock_employee_id"]
        saved_row = saved.get(eid)
        suggestion = suggest_hub_match(person["first_name"], person["last_name"], hub_people)
        hub_user_id = None
        skip = False
        source = "none"
        if saved_row is not None:
            skip = bool(saved_row.skip)
            hub_user_id = str(saved_row.hub_user_id) if saved_row.hub_user_id else None
            source = "saved"
        elif suggestion:
            hub_user_id = suggestion["hub_user_id"]
            source = suggestion["confidence"]
        if skip:
            skipped += 1
        elif hub_user_id:
            if source == "saved":
                mapped += 1
            else:
                suggested += 1
        else:
            needs += 1
        hub_name = None
        if hub_user_id:
            for hub in hub_people:
                if hub["id"] == hub_user_id:
                    hub_name = hub["name"]
                    break
        payload.append(
            {
                **person,
                "hub_user_id": None if skip else hub_user_id,
                "hub_name": None if skip else hub_name,
                "skip": skip,
                "match_source": source,
                "suggestion": suggestion,
            }
        )
    return {
        "row_count": len(rows),
        "people": payload,
        "counts": {
            "people": len(payload),
            "mapped": mapped,
            "suggested": suggested,
            "skipped": skipped,
            "needs_match": needs,
        },
    }


def upsert_people_maps(db: Session, items: List[dict], user_id: Optional[uuid.UUID]) -> int:
    now = datetime.now(timezone.utc)
    count = 0
    for item in items:
        eid = str(item.get("vericlock_employee_id") or "").strip()
        if not eid:
            continue
        row = db.query(VeriClockEmployeeMap).filter(VeriClockEmployeeMap.vericlock_employee_id == eid).first()
        if row is None:
            row = VeriClockEmployeeMap(vericlock_employee_id=eid)
            db.add(row)
        skip = bool(item.get("skip"))
        hub_raw = item.get("hub_user_id")
        hub_id = None
        if hub_raw and not skip:
            try:
                hub_id = uuid.UUID(str(hub_raw))
            except (TypeError, ValueError):
                hub_id = None
        row.skip = skip
        row.hub_user_id = None if skip else hub_id
        if item.get("vericlock_name"):
            row.vericlock_name = str(item.get("vericlock_name"))
        if item.get("vericlock_group") is not None:
            row.vericlock_group = str(item.get("vericlock_group") or "") or None
        row.updated_at = now
        row.updated_by = user_id
        count += 1
    db.commit()
    return count


def load_saved_job_maps(db: Session) -> Dict[str, VeriClockJobMap]:
    rows = db.query(VeriClockJobMap).all()
    return {row.vericlock_job_code: row for row in rows}


def upsert_job_maps(db: Session, items: List[dict], user_id: Optional[uuid.UUID]) -> int:
    now = datetime.now(timezone.utc)
    count = 0
    for item in items:
        code = str(item.get("vericlock_job_code") or "").strip()
        if not code:
            continue
        row = db.query(VeriClockJobMap).filter(VeriClockJobMap.vericlock_job_code == code).first()
        if row is None:
            row = VeriClockJobMap(vericlock_job_code=code)
            db.add(row)
        skip = bool(item.get("skip"))
        project_id = None
        predefined = (item.get("predefined_job_code") or "").strip() or None
        raw_project = item.get("hub_project_id")
        if raw_project and not skip and not predefined:
            try:
                project_id = uuid.UUID(str(raw_project))
            except (TypeError, ValueError):
                project_id = None
        if skip:
            project_id = None
            predefined = None
        row.skip = skip
        row.hub_project_id = project_id
        row.predefined_job_code = None if skip else predefined
        if item.get("vericlock_label"):
            row.vericlock_label = str(item.get("vericlock_label"))[:255]
        row.updated_at = now
        row.updated_by = user_id
        count += 1
    db.commit()
    return count


def jobs_preview(db: Session, csv_text: str) -> Dict[str, Any]:
    rows = parse_activity_csv(csv_text)
    jobs = unique_jobs(rows)
    saved = load_saved_job_maps(db)
    by_code, by_number, by_id = _project_indexes(db)
    payload = []
    mapped = 0
    suggested = 0
    skipped = 0
    needs = 0
    for job in jobs:
        code = job["vericlock_job_code"]
        saved_row = saved.get(code)
        resolved = resolve_job(job.get("job") or {}, by_code, by_number, saved_row, by_id)
        project_id = resolved.get("project_id")
        project_label = ""
        if project_id:
            project_label = _project_label(by_id.get(project_id)) or (resolved.get("label") or "")
        skip = bool(resolved.get("skipped"))
        used_saved = saved_row is not None and (
            saved_row.skip
            or saved_row.hub_project_id
            or (saved_row.predefined_job_code or "").strip()
        )
        source = "none"
        if used_saved:
            source = "saved"
        elif resolved.get("ok"):
            source = "auto"
        if skip:
            skipped += 1
        elif resolved.get("ok"):
            if source == "saved":
                mapped += 1
            else:
                suggested += 1
        else:
            needs += 1
        payload.append(
            {
                "vericlock_job_code": code,
                "vericlock_label": job.get("vericlock_label") or code,
                "row_count": job.get("row_count") or 0,
                "skip": skip,
                "hub_project_id": str(project_id) if project_id and not skip else None,
                "hub_project_label": project_label or None,
                "predefined_job_code": resolved.get("predefined_job_code"),
                "match_source": source,
                "kind": resolved.get("kind"),
            }
        )
    return {
        "jobs": payload,
        "job_counts": {
            "jobs": len(payload),
            "mapped": mapped,
            "suggested": suggested,
            "skipped": skipped,
            "needs_match": needs,
        },
    }


def _project_indexes(db: Session) -> Tuple[Dict[str, Project], Dict[str, Project], Dict[uuid.UUID, Project]]:
    by_code: Dict[str, Project] = {}
    by_number: Dict[str, Project] = {}
    by_id: Dict[uuid.UUID, Project] = {}
    for project in db.query(Project).all():
        by_id[project.id] = project
        for raw in ((project.code or ""), (getattr(project, "project_number", None) or "")):
            key = compact_job_code(raw)
            if key and key not in by_code:
                by_code[key] = project
        number = compact_job_code(getattr(project, "project_number", None) or "")
        if number:
            by_number[number] = project
    return by_code, by_number, by_id


def _project_label(project: Optional[Project]) -> str:
    if project is None:
        return ""
    name = (project.name or "").strip()
    code = (project.code or "").strip()
    if name and code:
        return f"{name} ({code})"
    return name or code


def _lookup_tokens(job: Dict[str, Any]) -> List[str]:
    tokens: List[str] = []
    seen = set()
    for raw in (
        job.get("project_code"),
        *(job.get("sage_codes") or []),
        job.get("code"),
    ):
        key = compact_job_code(raw)
        if key and key not in seen:
            seen.add(key)
            tokens.append(key)
    return tokens


def resolve_job(
    job: Dict[str, Any],
    by_code: Dict[str, Project],
    by_number: Dict[str, Project],
    saved: Optional[VeriClockJobMap] = None,
    by_id: Optional[Dict[uuid.UUID, Project]] = None,
) -> Dict[str, Any]:
    if saved is not None and saved.skip:
        return {
            "ok": False,
            "skipped": True,
            "kind": "skip",
            "predefined_job_code": None,
            "project_id": None,
            "label": saved.vericlock_label or job.get("label") or "",
        }
    if saved is not None and saved.hub_project_id:
        if by_id is None or saved.hub_project_id in by_id:
            project = by_id.get(saved.hub_project_id) if by_id else None
            return {
                "ok": True,
                "skipped": False,
                "kind": "project",
                "predefined_job_code": None,
                "project_id": saved.hub_project_id,
                "label": _project_label(project) if project else (saved.vericlock_label or job.get("label") or ""),
                "from_map": True,
            }
    if saved is not None and (saved.predefined_job_code or "").strip():
        code = saved.predefined_job_code.strip()
        return {
            "ok": True,
            "skipped": False,
            "kind": "predefined",
            "predefined_job_code": code,
            "project_id": None,
            "label": PREDEFINED_JOBS_DICT.get(code, code),
            "from_map": True,
        }
    code = (job.get("code") or "").strip()
    if code in PREDEFINED_JOBS_DICT:
        return {
            "ok": True,
            "skipped": False,
            "kind": "predefined",
            "predefined_job_code": code,
            "project_id": None,
            "label": PREDEFINED_JOBS_DICT[code],
        }
    for token in _lookup_tokens(job):
        project = by_code.get(token) or by_number.get(token)
        if project is not None:
            return {
                "ok": True,
                "skipped": False,
                "kind": "project",
                "predefined_job_code": None,
                "project_id": project.id,
                "label": _project_label(project),
            }
    return {
        "ok": False,
        "skipped": False,
        "kind": "unmatched",
        "predefined_job_code": None,
        "project_id": None,
        "label": job.get("label") or code,
    }


def _hours_only_bounds(work_date: str, hours: float, tz_name: str = TZ_NAME) -> Tuple[datetime, datetime]:
    y, m, d = [int(p) for p in work_date.split("-")]
    start = datetime(y, m, d, 8, 0, tzinfo=ZoneInfo(tz_name))
    minutes = int(round(hours * 60))
    return start, start + timedelta(minutes=minutes)


def _external_ref(row: Dict[str, Any], clock_in: datetime, job_code: str) -> str:
    stamp = clock_in.astimezone(timezone.utc).strftime("%Y%m%dT%H%M")
    return f"vc:{row['vericlock_employee_id']}:{stamp}:{job_code or '0'}"[:80]


def import_action_for_ref(existing: Optional[Attendance], *, overwrite: bool) -> str:
    """create | update | skip. Overwrite only replaces previous VeriClock history rows."""
    if existing is None:
        return "create"
    source = (getattr(existing, "source", None) or "").strip().lower()
    if overwrite and source == SOURCE_VERICLOCK:
        return "update"
    return "skip"


def apply_vericlock_attendance(
    att: Attendance,
    *,
    worker_id: uuid.UUID,
    clock_in: datetime,
    clock_out: datetime,
    hours_only: bool,
    declared: Optional[float],
    break_min: Optional[int],
    project_id: Optional[uuid.UUID],
    predefined: Optional[str],
    job_type: str,
    hours_marker: Optional[str],
    work_type_id: Optional[uuid.UUID],
    user_id: Optional[uuid.UUID],
    now: datetime,
    ref: str,
    is_new: bool,
) -> None:
    att.worker_id = worker_id
    att.clock_in_time = clock_in
    att.clock_out_time = clock_out
    att.status = "approved"
    att.source = SOURCE_VERICLOCK
    att.entry_kind = "hours_only" if hours_only else "clock"
    att.declared_hours = declared if hours_only else None
    att.project_id = project_id
    att.predefined_job_code = predefined
    if work_type_id is not None and (is_new or not getattr(att, "work_type_id", None)):
        att.work_type_id = work_type_id
    att.reason_text = compose_reason_text(
        job_type=job_type,
        service_item="regular",
        hours_worked=hours_marker,
    )
    att.break_minutes = break_min
    att.external_ref = ref
    att.approved_at = getattr(att, "approved_at", None) or now
    if is_new:
        att.created_by = user_id
        att.created_at = now
        att.sage_synced_at = now
    else:
        att.updated_at = now
        att.updated_by = user_id
    refresh_sage_export_state(att, hours_changed=True)


def _break_minutes(clock_in: datetime, clock_out: datetime, duration_hours: Optional[float]) -> Optional[int]:
    if duration_hours is None:
        return None
    span = (clock_out - clock_in).total_seconds() / 3600.0
    extra = span - duration_hours
    if extra < (1 / 120):
        return 0
    return int(round(extra * 60))


def preview_or_import(
    db: Session,
    csv_text: str,
    *,
    commit: bool,
    user_id: Optional[uuid.UUID],
    hours_only_date: Optional[str] = None,
    allow_unmatched_jobs: bool = False,
    overwrite_existing: bool = False,
) -> Dict[str, Any]:
    rows = parse_activity_csv(csv_text)
    preview = people_preview(db, csv_text)
    by_person = {p["vericlock_employee_id"]: p for p in preview["people"]}
    if commit:
        upsert_people_maps(
            db,
            [
                {
                    "vericlock_employee_id": p["vericlock_employee_id"],
                    "hub_user_id": p.get("hub_user_id"),
                    "skip": p.get("skip"),
                    "vericlock_name": p.get("vericlock_name"),
                    "vericlock_group": p.get("group"),
                }
                for p in preview["people"]
                if p.get("hub_user_id") or p.get("skip")
            ],
            user_id,
        )
    by_code, by_number, by_id = _project_indexes(db)
    saved_jobs = load_saved_job_maps(db)
    if commit:
        job_items = []
        for job in unique_jobs(rows):
            code = job["vericlock_job_code"]
            res = resolve_job(job.get("job") or {}, by_code, by_number, saved_jobs.get(code), by_id)
            if res.get("skipped") or res.get("ok"):
                job_items.append(
                    {
                        "vericlock_job_code": code,
                        "hub_project_id": str(res["project_id"]) if res.get("project_id") else None,
                        "predefined_job_code": res.get("predefined_job_code"),
                        "skip": bool(res.get("skipped")),
                        "vericlock_label": job.get("vericlock_label"),
                    }
                )
        if job_items:
            upsert_job_maps(db, job_items, user_id)
            saved_jobs = load_saved_job_maps(db)
    work_type = get_default_work_type(db) if commit else None
    now = datetime.now(timezone.utc)

    will_import = 0
    will_update = 0
    already = 0
    skipped_person = 0
    skipped_job = 0
    needs_person = 0
    unmatched_job = 0
    missing_time = 0
    created = 0
    updated = 0
    unmatched_jobs: Dict[str, int] = {}
    sample_errors: List[str] = []

    existing_by_ref: Dict[str, Attendance] = {
        att.external_ref: att
        for att in db.query(Attendance).filter(Attendance.external_ref.isnot(None)).all()
        if att.external_ref
    }
    seen_refs: set = set()

    for row in rows:
        eid = row["vericlock_employee_id"]
        person = by_person.get(eid)
        if person is None or not person.get("hub_user_id"):
            if person and person.get("skip"):
                skipped_person += 1
            else:
                needs_person += 1
            continue
        if person.get("skip"):
            skipped_person += 1
            continue
        try:
            worker_id = uuid.UUID(str(person["hub_user_id"]))
        except (TypeError, ValueError):
            needs_person += 1
            continue

        job_code = (row["job"].get("code") or "").strip() or "0"
        job_res = resolve_job(row["job"], by_code, by_number, saved_jobs.get(job_code), by_id)
        if job_res.get("skipped"):
            skipped_job += 1
            continue
        if not job_res["ok"] and not allow_unmatched_jobs:
            unmatched_job += 1
            label = row["job"].get("label") or row["job"].get("code") or "unknown"
            unmatched_jobs[label] = unmatched_jobs.get(label, 0) + 1
            continue

        clock_in = row["clock_in"]
        clock_out = row["clock_out"]
        duration = row["duration_hours"]
        hours_only = False
        if clock_in is None or clock_out is None:
            if duration and hours_only_date:
                try:
                    clock_in, clock_out = _hours_only_bounds(hours_only_date, duration)
                    hours_only = True
                except Exception:
                    missing_time += 1
                    continue
            else:
                missing_time += 1
                continue
        if clock_out <= clock_in:
            missing_time += 1
            if len(sample_errors) < 8:
                sample_errors.append(f"line {row['line']}: clock-out is not after clock-in")
            continue

        ref = _external_ref(row, clock_in, job_code)
        if ref in seen_refs:
            already += 1
            continue
        existing = existing_by_ref.get(ref)
        action = import_action_for_ref(existing, overwrite=overwrite_existing)
        if action == "skip":
            already += 1
            seen_refs.add(ref)
            continue
        seen_refs.add(ref)

        declared = duration
        if hours_only and declared is None:
            declared = (clock_out - clock_in).total_seconds() / 3600.0
        break_min = None if hours_only else _break_minutes(clock_in, clock_out, duration)
        predefined = job_res.get("predefined_job_code")
        if not job_res["ok"]:
            predefined = predefined or "0"
        job_type = str(job_res["project_id"]) if job_res.get("project_id") else (predefined or "0")
        hours_marker = None
        if hours_only and declared is not None:
            hours_marker = str(int(declared)) if float(declared).is_integer() else str(round(declared, 2))
        work_type_id = work_type.id if work_type is not None else None
        apply_kwargs = dict(
            worker_id=worker_id,
            clock_in=clock_in,
            clock_out=clock_out,
            hours_only=hours_only,
            declared=declared,
            break_min=break_min,
            project_id=job_res.get("project_id"),
            predefined=predefined,
            job_type=job_type,
            hours_marker=hours_marker,
            work_type_id=work_type_id,
            user_id=user_id,
            now=now,
            ref=ref,
        )
        if action == "update":
            if not commit:
                will_update += 1
                continue
            apply_vericlock_attendance(existing, is_new=False, **apply_kwargs)
            updated += 1
            continue

        if not commit:
            will_import += 1
            continue

        att = Attendance()
        apply_vericlock_attendance(att, is_new=True, **apply_kwargs)
        db.add(att)
        existing_by_ref[ref] = att
        created += 1

    if commit:
        db.commit()

    return {
        "commit": commit,
        "row_count": len(rows),
        "will_import": created if commit else will_import,
        "will_update": updated if commit else will_update,
        "created": created,
        "updated": updated,
        "already_imported": already,
        "overwrite_existing": overwrite_existing,
        "skipped_person": skipped_person,
        "skipped_job": skipped_job,
        "needs_person": needs_person,
        "unmatched_job": unmatched_job,
        "missing_time": missing_time,
        "unmatched_jobs": [
            {"label": label, "count": count}
            for label, count in sorted(unmatched_jobs.items(), key=lambda kv: (-kv[1], kv[0]))
        ],
        "sample_errors": sample_errors,
        "hours_only_date": hours_only_date,
    }
