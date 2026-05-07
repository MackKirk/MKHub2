from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
import copy
import uuid
from typing import Optional, List, Dict, Any, Set
from datetime import datetime, timezone, timedelta

from ..db import get_db
from ..models.models import (
    ReviewCycle,
    ReviewAssignment,
    ReviewAnswer,
    User,
    EmployeeProfile,
    FormTemplate,
    user_divisions,
    SettingItem,
    Notification,
)
from ..auth.security import get_current_user, require_permissions, _has_permission
from ..services.hierarchy import get_direct_reports
from ..routes.form_templates import _normalize_definition, EMPLOYEE_REVIEW_CATEGORY


router = APIRouter(prefix="/reviews", tags=["reviews"])


def _parse_iso_dt(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        d = datetime.fromisoformat(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d.astimezone(timezone.utc)
    except Exception:
        return None


def _iso_utc_z(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _clamp_duration_minutes(raw: Any) -> int:
    try:
        d = int(raw or 30)
        return max(15, min(480, d))
    except Exception:
        return 30


def _get_cycle_slot_duration(c: ReviewCycle) -> int:
    cfg = getattr(c, "director_1on1_slot_config", None) or {}
    if isinstance(cfg, dict):
        return _clamp_duration_minutes(cfg.get("duration_minutes"))
    return 30


def _derive_slots_from_windows(duration_minutes: int, windows: Any) -> List[Dict[str, str]]:
    dur = timedelta(minutes=max(1, duration_minutes))
    slots: List[Dict[str, str]] = []
    if not isinstance(windows, list):
        return slots
    for w in windows:
        if not isinstance(w, dict):
            continue
        ws = _parse_iso_dt(w.get("starts_at"))
        we = _parse_iso_dt(w.get("ends_at"))
        if ws is None or we is None or ws >= we:
            continue
        cur = ws
        while cur + dur <= we:
            slot_end = cur + dur
            slots.append({"starts_at": _iso_utc_z(cur), "ends_at": _iso_utc_z(slot_end)})
            cur = slot_end
    slots.sort(key=lambda x: x["starts_at"])
    return slots


def _booking_blocks_slot(
    entry: Dict[str, Any],
    slot_start: datetime,
    slot_end: datetime,
    duration_minutes: int,
) -> bool:
    bs = _parse_iso_dt(entry.get("scheduled_at"))
    if bs is None:
        return False
    be = _parse_iso_dt(entry.get("scheduled_until"))
    if be is None:
        be = bs + timedelta(minutes=duration_minutes)
    return bs < slot_end and be > slot_start


def _sched_reviewee_entries(sched_map: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for k, v in sched_map.items():
        if not isinstance(k, str):
            continue
        if not isinstance(v, dict):
            continue
        out[k] = v
    return out


# Parallel form_payload keys for supervisor evaluation of a direct report (not used on self-review)
SUPERVISOR_COMMENT_SUFFIX = "__supervisor_comment"


def _display_name_from_user_profile(user: Optional[User], ep: Optional[EmployeeProfile]) -> Optional[str]:
    """Preferred name, else first + last from profile, else username (matches /employees list)."""
    if ep:
        pn = (getattr(ep, "preferred_name", None) or "").strip()
        if pn:
            return pn
        first = (getattr(ep, "first_name", None) or "").strip()
        last = (getattr(ep, "last_name", None) or "").strip()
        full = " ".join(x for x in [first, last] if x)
        if full:
            return full
    if user and getattr(user, "username", None):
        return str(user.username)
    return None


def _uuid_or_none(value):
    if value is None:
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


def _department_keys_for_reviewee(reviewee_user_id, db: Session) -> List[str]:
    """Strings that can match template_by_department keys: User department labels (Settings) then profile division."""
    keys: List[str] = []
    div_rows = (
        db.query(SettingItem.label)
        .join(user_divisions, SettingItem.id == user_divisions.c.division_id)
        .filter(user_divisions.c.user_id == reviewee_user_id)
        .all()
    )
    for (lab,) in div_rows:
        if lab and str(lab).strip():
            keys.append(str(lab).strip())
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == reviewee_user_id).first()
    if profile and getattr(profile, "division", None):
        d = str(profile.division).strip()
        if d:
            keys.append(d)
    seen = set()
    out: List[str] = []
    for k in keys:
        if k not in seen:
            seen.add(k)
            out.append(k)
    return out


def _form_template_id_for_reviewee(cycle: ReviewCycle, reviewee_user_id, db: Session) -> uuid.UUID:
    """Resolve FormTemplate id for a reviewee: template_by_department[division label] if set, else cycle.form_template_id."""
    raw = getattr(cycle, "template_by_department", None)
    if raw and isinstance(raw, dict):
        keys = _department_keys_for_reviewee(reviewee_user_id, db)
        for division in keys:
            tid = raw.get(division) or raw.get(str(division).strip())
            if tid:
                try:
                    return uuid.UUID(str(tid))
                except (ValueError, TypeError):
                    pass
        if not keys:
            for nd_key in ("(no department)", "(No department)"):
                tid = raw.get(nd_key)
                if tid:
                    try:
                        return uuid.UUID(str(tid))
                    except (ValueError, TypeError):
                        pass
    return cycle.form_template_id


def _definition_for_reviewee(cycle: ReviewCycle, reviewee_user_id, db: Session) -> dict:
    tid = _form_template_id_for_reviewee(cycle, reviewee_user_id, db)
    tpl = db.query(FormTemplate).filter(FormTemplate.id == tid).first()
    return _normalize_definition(tpl.definition if tpl else {})


def _definition_for_assignment(a: ReviewAssignment, cycle: ReviewCycle, db: Session) -> dict:
    if a.form_definition_snapshot and isinstance(a.form_definition_snapshot, dict):
        return _normalize_definition(a.form_definition_snapshot)
    return _definition_for_reviewee(cycle, a.reviewee_user_id, db)


def _field_key_labels_from_definition(definition: dict) -> Dict[str, str]:
    key_to_label: Dict[str, str] = {}
    for sec in definition.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        for f in sec.get("fields") or []:
            if not isinstance(f, dict):
                continue
            k = f.get("key")
            if isinstance(k, str) and k.strip():
                key_to_label[k.strip()] = ((f.get("label") or k) or "").strip() or k.strip()
    return key_to_label


def _collect_compare_rows(definition: dict) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    for sec in definition.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        for f in sec.get("fields") or []:
            if not isinstance(f, dict):
                continue
            k = f.get("key")
            if isinstance(k, str) and k.strip():
                rows.append({"key": k.strip(), "label": ((f.get("label") or k) or "").strip() or k.strip()})
    return rows


def _collect_compare_fields(definition: dict) -> List[Dict[str, Any]]:
    """Field metadata for compare UI (scale grouping, section headings)."""
    rows: List[Dict[str, Any]] = []
    for sec in definition.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        sec_title = ((sec.get("title") or sec.get("section_title") or "") or "").strip() or "General"
        for f in sec.get("fields") or []:
            if not isinstance(f, dict):
                continue
            k = f.get("key")
            if isinstance(k, str) and k.strip():
                ft = f.get("type")
                rows.append(
                    {
                        "key": k.strip(),
                        "label": ((f.get("label") or k) or "").strip() or k.strip(),
                        "field_type": (ft or "").strip() if isinstance(ft, str) else "",
                        "section_title": sec_title,
                    }
                )
    return rows


def _extract_numeric_score(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        s = value.strip()
        if s in ("1", "2", "3", "4", "5"):
            return int(s)
    return None


def _validate_employee_review_template(db: Session, tid: uuid.UUID) -> FormTemplate:
    tpl = db.query(FormTemplate).filter(FormTemplate.id == tid).first()
    if not tpl:
        raise HTTPException(status_code=400, detail="Form template not found")
    if (tpl.category or "").strip().lower() != EMPLOYEE_REVIEW_CATEGORY:
        raise HTTPException(status_code=400, detail="Template must be an employee review form template")
    if (tpl.status or "").lower() != "active":
        raise HTTPException(status_code=400, detail="Template must be active")
    return tpl


def _normalize_participant_scope(raw: Any) -> Optional[dict]:
    """Persist None for 'entire company'. explicit stores union criteria (OR)."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        return None
    mode = str(raw.get("mode") or "all").strip().lower()
    if mode != "explicit":
        return None

    def _uuid_str_list(key: str) -> List[str]:
        out: List[str] = []
        for x in raw.get(key) or []:
            u = _uuid_or_none(x)
            if u:
                out.append(str(u))
        return out

    return {
        "mode": "explicit",
        "user_ids": _uuid_str_list("user_ids"),
        "department_ids": _uuid_str_list("department_ids"),
        "project_division_ids": _uuid_str_list("project_division_ids"),
    }


def _eligible_reviewee_ids(cycle: ReviewCycle, db: Session) -> Optional[Set[uuid.UUID]]:
    """None = all users. Empty set = nobody. Non-empty = filter reviewees to this set."""
    raw = getattr(cycle, "participant_scope", None)
    if not raw or not isinstance(raw, dict):
        return None
    if str(raw.get("mode") or "").strip().lower() != "explicit":
        return None

    eligible: Set[uuid.UUID] = set()
    for x in raw.get("user_ids") or []:
        u = _uuid_or_none(x)
        if u:
            eligible.add(u)

    dept_ids: List[uuid.UUID] = []
    for x in raw.get("department_ids") or []:
        u = _uuid_or_none(x)
        if u:
            dept_ids.append(u)
    if dept_ids:
        for (uid,) in db.query(user_divisions.c.user_id).filter(user_divisions.c.division_id.in_(dept_ids)).all():
            eligible.add(uid)

    proj_id_strs: Set[str] = set()
    for x in raw.get("project_division_ids") or []:
        u = _uuid_or_none(x)
        if u:
            proj_id_strs.add(str(u))
    if proj_id_strs:
        profiles = db.query(EmployeeProfile.user_id, EmployeeProfile.project_division_ids).filter(
            EmployeeProfile.project_division_ids.isnot(None)
        ).all()
        for uid, pdivs in profiles:
            if not pdivs or not isinstance(pdivs, list):
                continue
            pset = {str(p) for p in pdivs if p is not None}
            if proj_id_strs.intersection(pset):
                eligible.add(uid)

    return eligible


# ----- Cycles -----
@router.post("/cycles")
def create_cycle(
    payload: dict,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("reviews:admin", "hr:reviews:admin")),
):
    tid = _uuid_or_none(payload.get("form_template_id"))
    tbd = payload.get("template_by_department")
    if not tid and isinstance(tbd, dict) and tbd:
        for _div, raw_ft in sorted(tbd.items(), key=lambda kv: str(kv[0])):
            ft_id = _uuid_or_none(raw_ft)
            if ft_id:
                tid = ft_id
                break
    if not tid:
        raise HTTPException(
            status_code=400,
            detail="form_template_id is required, or template_by_department must include at least one template UUID",
        )
    _validate_employee_review_template(db, tid)

    if tbd is not None and isinstance(tbd, dict):
        for _div, raw_ft in tbd.items():
            if not raw_ft:
                continue
            ft_id = _uuid_or_none(raw_ft)
            if ft_id:
                _validate_employee_review_template(db, ft_id)

    c = ReviewCycle(
        name=payload.get("name", "Review Cycle"),
        period_start=_parse_dt(payload.get("period_start")),
        period_end=_parse_dt(payload.get("period_end")),
        form_template_id=tid,
        template_by_department=tbd if isinstance(tbd, dict) else None,
        participant_scope=_normalize_participant_scope(payload.get("participant_scope")),
        status="active" if payload.get("activate") else "draft",
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": str(c.id)}


@router.get("/cycles")
def list_cycles(db: Session = Depends(get_db), _=Depends(require_permissions("reviews:read"))):
    rows = db.query(ReviewCycle).order_by(ReviewCycle.period_start.desc().nullslast()).all()
    return [
        {
            "id": str(c.id),
            "name": c.name,
            "period_start": c.period_start.isoformat() if c.period_start else None,
            "period_end": c.period_end.isoformat() if c.period_end else None,
            "form_template_id": str(c.form_template_id) if getattr(c, "form_template_id", None) else None,
            "template_by_department": getattr(c, "template_by_department", None),
            "participant_scope": getattr(c, "participant_scope", None),
            "status": c.status,
        }
        for c in rows
    ]


@router.get("/cycles/{cycle_id}")
def get_cycle(cycle_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("reviews:read"))):
    cid = _uuid_or_none(cycle_id)
    if not cid:
        raise HTTPException(status_code=400, detail="Invalid cycle_id")
    c = db.query(ReviewCycle).filter(ReviewCycle.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cycle not found")
    assigns = db.query(ReviewAssignment).filter(ReviewAssignment.cycle_id == cid).all()
    from collections import Counter

    status_ct = Counter((a.status or "unknown") for a in assigns)
    self_rows = sum(1 for a in assigns if str(a.reviewee_user_id) == str(a.reviewer_user_id))
    return {
        "id": str(c.id),
        "name": c.name,
        "period_start": c.period_start.isoformat() if c.period_start else None,
        "period_end": c.period_end.isoformat() if c.period_end else None,
        "form_template_id": str(c.form_template_id) if getattr(c, "form_template_id", None) else None,
        "template_by_department": getattr(c, "template_by_department", None),
        "participant_scope": getattr(c, "participant_scope", None),
        "status": c.status,
        "assignment_count": len(assigns),
        "assignments_by_status": dict(status_ct),
        "assignment_self_rows": self_rows,
        "assignment_supervisor_rows": len(assigns) - self_rows,
        "director_1on1_schedule": getattr(c, "director_1on1_schedule", None),
        "director_1on1_slot_config": getattr(c, "director_1on1_slot_config", None),
    }


@router.delete("/cycles/{cycle_id}")
def delete_cycle(
    cycle_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("reviews:admin", "hr:reviews:admin")),
):
    cid = _uuid_or_none(cycle_id)
    if not cid:
        raise HTTPException(status_code=400, detail="Invalid cycle_id")
    c = db.query(ReviewCycle).filter(ReviewCycle.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cycle not found")
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.post("/cycles/{cycle_id}/assign")
def assign_cycle(
    cycle_id: str,
    include_self: bool = True,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("reviews:admin", "hr:reviews:admin")),
):
    cid = _uuid_or_none(cycle_id)
    if not cid:
        raise HTTPException(status_code=400, detail="Invalid cycle_id")
    c = db.query(ReviewCycle).filter(ReviewCycle.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cycle not found")
    users = db.query(User).all()
    eligible = _eligible_reviewee_ids(c, db)
    now = datetime.now(timezone.utc)
    created = 0

    def make_assignment(rid: uuid.UUID, reviewer_id: uuid.UUID) -> None:
        nonlocal created
        exists = (
            db.query(ReviewAssignment)
            .filter(
                ReviewAssignment.cycle_id == c.id,
                ReviewAssignment.reviewee_user_id == rid,
                ReviewAssignment.reviewer_user_id == reviewer_id,
            )
            .first()
        )
        if exists:
            return
        snap = _definition_for_reviewee(c, rid, db)
        a = ReviewAssignment(
            cycle_id=c.id,
            reviewee_user_id=rid,
            reviewer_user_id=reviewer_id,
            status="pending",
            due_date=c.period_end or now,
            form_definition_snapshot=snap,
        )
        db.add(a)
        created += 1

    for u in users:
        reports = get_direct_reports(str(u.id), db)
        for rid in reports:
            rid_uuid = uuid.UUID(str(rid))
            if eligible is not None and rid_uuid not in eligible:
                continue
            make_assignment(rid_uuid, u.id)
    if include_self:
        for u in users:
            if eligible is not None and u.id not in eligible:
                continue
            make_assignment(u.id, u.id)
    db.commit()
    return {"status": "ok", "created": created}


@router.get("/cycles/{cycle_id}/assignments")
def list_assignments(
    cycle_id: str,
    reviewer: Optional[str] = None,
    reviewee: Optional[str] = None,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("reviews:read")),
):
    cid = _uuid_or_none(cycle_id)
    if not cid:
        raise HTTPException(status_code=400, detail="Invalid cycle_id")
    q = db.query(ReviewAssignment).filter(ReviewAssignment.cycle_id == cid)
    if reviewer:
        q = q.filter(ReviewAssignment.reviewer_user_id == reviewer)
    if reviewee:
        q = q.filter(ReviewAssignment.reviewee_user_id == reviewee)
    rows = q.all()
    return [
        {
            "id": str(a.id),
            "cycle_id": str(a.cycle_id),
            "reviewee_user_id": str(a.reviewee_user_id),
            "reviewer_user_id": str(a.reviewer_user_id),
            "status": a.status,
            "due_date": a.due_date.isoformat() if a.due_date else None,
        }
        for a in rows
    ]


@router.get("/cycles/{cycle_id}/hr-status")
def cycle_hr_status(cycle_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("reviews:read"))):
    cid = _uuid_or_none(cycle_id)
    if not cid:
        raise HTTPException(status_code=400, detail="Invalid cycle_id")
    c = db.query(ReviewCycle).filter(ReviewCycle.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cycle not found")
    assigns = db.query(ReviewAssignment).filter(ReviewAssignment.cycle_id == cid).all()
    from collections import defaultdict

    by_reviewee = defaultdict(list)
    for a in assigns:
        by_reviewee[str(a.reviewee_user_id)].append(a)

    all_uids: Set[uuid.UUID] = set()
    for rid, arr in by_reviewee.items():
        u = _uuid_or_none(rid)
        if u:
            all_uids.add(u)
        for a in arr:
            all_uids.add(a.reviewee_user_id)
            all_uids.add(a.reviewer_user_id)

    users_by_id: Dict[uuid.UUID, User] = {}
    if all_uids:
        for urow in db.query(User).filter(User.id.in_(list(all_uids))).all():
            users_by_id[urow.id] = urow
    ep_by_uid: Dict[uuid.UUID, EmployeeProfile] = {}
    if all_uids:
        for ep in db.query(EmployeeProfile).filter(EmployeeProfile.user_id.in_(list(all_uids))).all():
            ep_by_uid[ep.user_id] = ep

    sched_raw = getattr(c, "director_1on1_schedule", None) or {}
    sched_map: Dict[str, Any] = sched_raw if isinstance(sched_raw, dict) else {}

    def _label(uid: Optional[uuid.UUID]) -> Optional[str]:
        if not uid:
            return None
        u = users_by_id.get(uid)
        ep = ep_by_uid.get(uid)
        return _display_name_from_user_profile(u, ep) or (getattr(u, "username", None) if u else None)

    out = []
    for reviewee_id, arr in by_reviewee.items():
        rid = _uuid_or_none(reviewee_id)
        if not rid:
            continue
        self_a = next((a for a in arr if str(a.reviewee_user_id) == str(a.reviewer_user_id)), None)
        mgr_a = next((a for a in arr if str(a.reviewee_user_id) != str(a.reviewer_user_id)), None)
        st_self = (self_a.status or "").lower() if self_a else ""
        st_mgr = (mgr_a.status or "").lower() if mgr_a else ""
        employee_self_done = self_a is not None and st_self == "submitted"
        supervisor_done = mgr_a is not None and st_mgr == "submitted"
        both_done = employee_self_done and supervisor_done
        missing_employee = not employee_self_done
        missing_supervisor = not supervisor_done
        disp = _label(rid) or str(rid)
        sup_uid = mgr_a.reviewer_user_id if mgr_a else None
        meet = sched_map.get(str(rid))
        if not isinstance(meet, dict):
            meet = {}
        until_out = meet.get("scheduled_until")
        if not until_out and meet.get("scheduled_at"):
            st = _parse_iso_dt(meet.get("scheduled_at"))
            if st:
                until_out = _iso_utc_z(st + timedelta(minutes=_get_cycle_slot_duration(c)))
        out.append(
            {
                "user_id": str(rid),
                "name": disp,
                "display_name": disp,
                "supervisor_user_id": str(sup_uid) if sup_uid else None,
                "supervisor_display_name": _label(sup_uid) if sup_uid else None,
                "employee_self_done": employee_self_done,
                "supervisor_done": supervisor_done,
                "both_done": both_done,
                "missing_employee": missing_employee,
                "missing_supervisor": missing_supervisor,
                "self_assignment_id": str(self_a.id) if self_a else None,
                "supervisor_assignment_id": str(mgr_a.id) if mgr_a else None,
                "self_status": self_a.status if self_a else None,
                "supervisor_status": mgr_a.status if mgr_a else None,
                "self_due_date": self_a.due_date.isoformat() if self_a and self_a.due_date else None,
                "supervisor_due_date": mgr_a.due_date.isoformat() if mgr_a and mgr_a.due_date else None,
                "has_self_assignment": self_a is not None,
                "has_supervisor_assignment": mgr_a is not None,
                "director_meeting_scheduled_at": meet.get("scheduled_at"),
                "director_meeting_scheduled_until": until_out,
                "director_meeting_notes": meet.get("notes"),
            }
        )
    out.sort(key=lambda r: (r.get("display_name") or "").lower())
    return out


@router.put("/cycles/{cycle_id}/director-meetings/{reviewee_user_id}")
def upsert_director_meeting(
    cycle_id: str,
    reviewee_user_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("reviews:admin", "hr:reviews:admin")),
):
    """Schedule or update the closing director–employee 1:1 for this cycle/reviewee (after self + supervisor reviews)."""
    cid = _uuid_or_none(cycle_id)
    rid = _uuid_or_none(reviewee_user_id)
    if not cid or not rid:
        raise HTTPException(status_code=400, detail="Invalid cycle_id or reviewee_user_id")
    c = db.query(ReviewCycle).filter(ReviewCycle.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cycle not found")
    assigns = db.query(ReviewAssignment).filter(
        ReviewAssignment.cycle_id == cid, ReviewAssignment.reviewee_user_id == rid
    ).all()
    if not assigns:
        raise HTTPException(status_code=404, detail="No assignments for this employee in this cycle")

    sat_raw = payload.get("scheduled_at")
    if sat_raw is None or sat_raw == "":
        sat = None
    else:
        sat = str(sat_raw).strip() or None

    prev = getattr(c, "director_1on1_schedule", None)
    sched: Dict[str, Any] = dict(prev) if isinstance(prev, dict) else {}
    key = str(rid)
    prev_entry = sched.get(key)
    prev_notes = prev_entry.get("notes") if isinstance(prev_entry, dict) else None

    if "notes" in payload:
        notes_val = payload.get("notes")
        if notes_val is not None:
            notes_val = str(notes_val).strip() or None
    else:
        notes_val = prev_notes

    sun_raw = payload.get("scheduled_until")
    suntil: Optional[str] = None
    if sun_raw is not None and sun_raw != "":
        suntil = str(sun_raw).strip() or None

    if sat is None and not notes_val:
        sched.pop(key, None)
    else:
        row: Dict[str, Any] = {
            "scheduled_at": sat,
            "notes": notes_val,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by_user_id": str(user.id),
        }
        if suntil:
            row["scheduled_until"] = suntil
        elif sat:
            st = _parse_iso_dt(sat)
            if st:
                row["scheduled_until"] = _iso_utc_z(st + timedelta(minutes=_get_cycle_slot_duration(c)))
        sched[key] = row

    c.director_1on1_schedule = sched
    db.add(c)
    db.commit()
    db.refresh(c)
    entry = sched.get(key) or {}
    return {
        "ok": True,
        "reviewee_user_id": key,
        "director_meeting_scheduled_at": entry.get("scheduled_at"),
        "director_meeting_scheduled_until": entry.get("scheduled_until"),
        "director_meeting_notes": entry.get("notes"),
    }


def _build_director_meeting_board(c: ReviewCycle, db: Session) -> Dict[str, Any]:
    cfg = getattr(c, "director_1on1_slot_config", None) or {}
    duration = _clamp_duration_minutes(cfg.get("duration_minutes") if isinstance(cfg, dict) else 30)
    windows: Any = cfg.get("windows") if isinstance(cfg, dict) else []
    if not isinstance(windows, list):
        windows = []
    slots_raw = _derive_slots_from_windows(duration, windows)
    sched_src = getattr(c, "director_1on1_schedule", None) or {}
    sched_map = sched_src if isinstance(sched_src, dict) else {}
    sched_rev = _sched_reviewee_entries(sched_map)

    uids: Set[uuid.UUID] = set()
    for uid_s in sched_rev.keys():
        u = _uuid_or_none(uid_s)
        if u:
            uids.add(u)
    users_by_id: Dict[uuid.UUID, User] = {}
    ep_by_uid: Dict[uuid.UUID, EmployeeProfile] = {}
    if uids:
        for urow in db.query(User).filter(User.id.in_(list(uids))).all():
            users_by_id[urow.id] = urow
        for ep in db.query(EmployeeProfile).filter(EmployeeProfile.user_id.in_(list(uids))).all():
            ep_by_uid[ep.user_id] = ep

    def _disp(uid: uuid.UUID) -> str:
        u = users_by_id.get(uid)
        ep = ep_by_uid.get(uid)
        return (
            _display_name_from_user_profile(u, ep)
            or (getattr(u, "username", None) if u else None)
            or str(uid)
        )

    slots_out: List[Dict[str, Any]] = []
    for s in slots_raw:
        ss = _parse_iso_dt(s["starts_at"])
        se = _parse_iso_dt(s["ends_at"])
        if ss is None or se is None:
            continue
        booked_for: Optional[str] = None
        booked_name: Optional[str] = None
        for uid_str, entry in sched_rev.items():
            if not isinstance(entry, dict):
                continue
            if _booking_blocks_slot(entry, ss, se, duration):
                booked_for = uid_str
                bu = _uuid_or_none(uid_str)
                booked_name = _disp(bu) if bu else uid_str
                break
        slots_out.append(
            {
                "starts_at": s["starts_at"],
                "ends_at": s["ends_at"],
                "booked_reviewee_user_id": booked_for,
                "booked_reviewee_name": booked_name,
            }
        )

    return {
        "duration_minutes": duration,
        "windows": windows,
        "slots": slots_out,
    }


@router.get("/cycles/{cycle_id}/director-meeting-board")
def get_director_meeting_board(
    cycle_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    cid = _uuid_or_none(cycle_id)
    if not cid:
        raise HTTPException(status_code=400, detail="Invalid cycle_id")
    c = db.query(ReviewCycle).filter(ReviewCycle.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cycle not found")
    return _build_director_meeting_board(c, db)


@router.put("/cycles/{cycle_id}/director-meeting-config")
def put_director_meeting_config(
    cycle_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("reviews:admin", "hr:reviews:admin")),
):
    cid = _uuid_or_none(cycle_id)
    if not cid:
        raise HTTPException(status_code=400, detail="Invalid cycle_id")
    c = db.query(ReviewCycle).filter(ReviewCycle.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cycle not found")
    duration = _clamp_duration_minutes(payload.get("duration_minutes"))
    windows_in = payload.get("windows")
    windows_out: List[Dict[str, Any]] = []
    if isinstance(windows_in, list):
        for w in windows_in:
            if not isinstance(w, dict):
                continue
            ws = w.get("starts_at")
            we = w.get("ends_at")
            if not ws or not we:
                continue
            wid = w.get("id")
            if not wid or not isinstance(wid, str):
                wid = str(uuid.uuid4())
            windows_out.append({"id": wid, "starts_at": str(ws).strip(), "ends_at": str(we).strip()})
    c.director_1on1_slot_config = {
        "duration_minutes": duration,
        "windows": windows_out,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by_user_id": str(user.id),
    }
    db.add(c)
    db.commit()
    db.refresh(c)
    return _build_director_meeting_board(c, db)


@router.put("/director-meeting-config-all-cycles")
def put_director_meeting_config_all_cycles(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("reviews:admin", "hr:reviews:admin")),
):
    """
    Same slot windows + duration as PUT /cycles/{id}/director-meeting-config, but applied to every review cycle
    so published availability is shared across all cycles.
    """
    duration = _clamp_duration_minutes(payload.get("duration_minutes"))
    windows_in = payload.get("windows")
    windows_out: List[Dict[str, Any]] = []
    if isinstance(windows_in, list):
        for w in windows_in:
            if not isinstance(w, dict):
                continue
            ws = w.get("starts_at")
            we = w.get("ends_at")
            if not ws or not we:
                continue
            wid = w.get("id")
            if not wid or not isinstance(wid, str):
                wid = str(uuid.uuid4())
            windows_out.append({"id": wid, "starts_at": str(ws).strip(), "ends_at": str(we).strip()})
    now_iso = datetime.now(timezone.utc).isoformat()
    updater = str(user.id)
    cfg_base = {
        "duration_minutes": duration,
        "windows": windows_out,
        "updated_at": now_iso,
        "updated_by_user_id": updater,
    }
    cycles = db.query(ReviewCycle).order_by(ReviewCycle.name.asc()).all()
    if not cycles:
        raise HTTPException(status_code=404, detail="No review cycles found")
    for c in cycles:
        c.director_1on1_slot_config = copy.deepcopy(cfg_base)
        db.add(c)
    db.commit()
    db.refresh(cycles[0])
    return _build_director_meeting_board(cycles[0], db)


@router.post("/cycles/{cycle_id}/director-meeting-notify-affected")
def notify_director_meeting_affected_reviewees(
    cycle_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("reviews:admin", "hr:reviews:admin")),
):
    """
    When HR removes or changes published availability that overlapped booked slots, notify affected employees.
    Creates in-app notifications (same pipeline as /notifications).
    """
    cid = _uuid_or_none(cycle_id)
    if not cid:
        raise HTTPException(status_code=400, detail="Invalid cycle_id")
    c = db.query(ReviewCycle).filter(ReviewCycle.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cycle not found")

    raw_ids = payload.get("reviewee_user_ids")
    if not isinstance(raw_ids, list) or not raw_ids:
        raise HTTPException(status_code=400, detail="reviewee_user_ids is required")

    message = (payload.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")
    if len(message) > 4000:
        raise HTTPException(status_code=400, detail="message is too long")

    title = "Director 1:1 meeting — schedule change"
    body = (
        "The published availability for your director 1:1 meeting was updated (shared across review cycles). "
        "Your previous time slot may no longer apply.\n\n"
        f"Message from HR:\n{message}"
    )
    link = "/reviews/my"

    seen: Set[str] = set()
    created = 0
    now = datetime.now(timezone.utc)
    for uid_raw in raw_ids:
        uid = _uuid_or_none(uid_raw)
        if not uid:
            continue
        key = str(uid)
        if key in seen:
            continue
        seen.add(key)
        target = db.query(User).filter(User.id == uid).first()
        if not target:
            continue
        n = Notification(
            user_id=uid,
            channel="push",
            template_key="director_meeting_schedule_change",
            payload_json={
                "title": title,
                "message": body,
                "type": "director_meeting_schedule_change",
                "link": link,
                "metadata": {"cycle_id": str(cid), "kind": "availability_changed"},
                "read": False,
            },
            status="pending",
            created_at=now,
        )
        db.add(n)
        created += 1
    if created == 0:
        raise HTTPException(status_code=400, detail="No valid recipients to notify")
    db.commit()
    return {"ok": True, "notified_count": created}


@router.post("/cycles/{cycle_id}/director-meetings/book")
def book_director_meeting_slot(
    cycle_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cid = _uuid_or_none(cycle_id)
    rid = _uuid_or_none(payload.get("reviewee_user_id"))
    if not cid or not rid:
        raise HTTPException(status_code=400, detail="Invalid cycle_id or reviewee_user_id")
    c = db.query(ReviewCycle).filter(ReviewCycle.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cycle not found")

    is_self = str(user.id) == str(rid)
    is_hr = _has_permission(user, "reviews:admin") or _has_permission(user, "hr:reviews:admin")
    if not is_self and not is_hr:
        raise HTTPException(status_code=403, detail="Only the employee or HR/review admin can book this meeting")

    assigns = db.query(ReviewAssignment).filter(
        ReviewAssignment.cycle_id == cid, ReviewAssignment.reviewee_user_id == rid
    ).all()
    if not assigns:
        raise HTTPException(status_code=404, detail="No assignments for this employee in this cycle")

    slot_raw = payload.get("slot_starts_at")
    if slot_raw is None or slot_raw == "":
        prev = getattr(c, "director_1on1_schedule", None)
        sched_m: Dict[str, Any] = dict(prev) if isinstance(prev, dict) else {}
        key = str(rid)
        ent = sched_m.get(key)
        if isinstance(ent, dict):
            ent = dict(ent)
            ent.pop("scheduled_at", None)
            ent.pop("scheduled_until", None)
            ent.pop("booked_by_user_id", None)
            ent["updated_at"] = datetime.now(timezone.utc).isoformat()
            ent["updated_by_user_id"] = str(user.id)
            notes_kept = (ent.get("notes") or "").strip()
            if notes_kept:
                sched_m[key] = ent
            else:
                sched_m.pop(key, None)
        else:
            sched_m.pop(key, None)
        c.director_1on1_schedule = sched_m
        db.add(c)
        db.commit()
        return {"ok": True, "cancelled": True, "reviewee_user_id": key}

    duration = _get_cycle_slot_duration(c)
    cfg = getattr(c, "director_1on1_slot_config", None) or {}
    wind = cfg.get("windows") if isinstance(cfg, dict) else []
    slots = _derive_slots_from_windows(duration, wind)
    want = _parse_iso_dt(str(slot_raw).strip())
    if want is None:
        raise HTTPException(status_code=400, detail="Invalid slot_starts_at")
    want_norm = _iso_utc_z(want)

    matched: Optional[Dict[str, str]] = None
    for s in slots:
        sdt = _parse_iso_dt(s["starts_at"])
        if sdt is not None and _iso_utc_z(sdt) == want_norm:
            matched = s
            break

    if matched is None:
        raise HTTPException(status_code=400, detail="That time slot is not available")

    ss = _parse_iso_dt(matched["starts_at"])
    se = _parse_iso_dt(matched["ends_at"])
    if ss is None or se is None:
        raise HTTPException(status_code=400, detail="Invalid slot configuration")

    prev = getattr(c, "director_1on1_schedule", None)
    sched = dict(prev) if isinstance(prev, dict) else {}
    sched_rev = _sched_reviewee_entries(sched)
    key = str(rid)

    for uid_str, entry in sched_rev.items():
        if uid_str == key:
            continue
        if isinstance(entry, dict) and _booking_blocks_slot(entry, ss, se, duration):
            raise HTTPException(status_code=409, detail="This slot is already booked")

    prev_ent = sched.get(key)
    prev_notes = prev_ent.get("notes") if isinstance(prev_ent, dict) else None

    sched[key] = {
        "scheduled_at": matched["starts_at"],
        "scheduled_until": matched["ends_at"],
        "notes": prev_notes,
        "booked_by_user_id": str(user.id),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by_user_id": str(user.id),
    }
    c.director_1on1_schedule = sched
    db.add(c)
    db.commit()
    db.refresh(c)
    ent = sched.get(key) or {}
    return {
        "ok": True,
        "reviewee_user_id": key,
        "director_meeting_scheduled_at": ent.get("scheduled_at"),
        "director_meeting_scheduled_until": ent.get("scheduled_until"),
        "director_meeting_notes": ent.get("notes"),
    }


@router.get("/users/{user_id}/reviewee-assignments")
def user_reviewee_assignments(
    user_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("reviews:read", "reviews:admin", "hr:reviews:admin")),
):
    """Assignments where this user is the reviewee (self-review and supervisor review rows)."""
    uid = _uuid_or_none(user_id)
    if not uid:
        raise HTTPException(status_code=400, detail="Invalid user_id")
    rows = (
        db.query(ReviewAssignment, ReviewCycle)
        .join(ReviewCycle, ReviewCycle.id == ReviewAssignment.cycle_id)
        .filter(ReviewAssignment.reviewee_user_id == uid)
        .order_by(ReviewCycle.period_start.desc().nullslast(), ReviewAssignment.created_at.desc())
        .all()
    )
    out = []
    for a, c in rows:
        rev = db.query(User).filter(User.id == a.reviewer_user_id).first()
        reviewer_username = getattr(rev, "username", None) if rev else None
        is_self = str(a.reviewer_user_id) == str(a.reviewee_user_id)
        out.append(
            {
                "assignment_id": str(a.id),
                "cycle_id": str(c.id),
                "cycle_name": c.name,
                "cycle_status": c.status,
                "period_start": c.period_start.isoformat() if c.period_start else None,
                "period_end": c.period_end.isoformat() if c.period_end else None,
                "reviewer_user_id": str(a.reviewer_user_id),
                "reviewer_username": reviewer_username,
                "is_self_review": is_self,
                "assignment_kind": "self" if is_self else "supervisor",
                "status": a.status,
                "due_date": a.due_date.isoformat() if a.due_date else None,
            }
        )
    return out


# ----- Answers -----
@router.get("/assignments/{assignment_id}/submission")
def assignment_submission(
    assignment_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("reviews:read", "reviews:admin", "hr:reviews:admin")),
):
    """Read-only form definition and saved answers (for HR / compare-style views)."""
    aid = _uuid_or_none(assignment_id)
    if not aid:
        raise HTTPException(status_code=400, detail="Invalid assignment_id")
    a = db.query(ReviewAssignment).filter(ReviewAssignment.id == aid).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    cycle = db.query(ReviewCycle).filter(ReviewCycle.id == a.cycle_id).first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle not found")
    definition = _definition_for_assignment(a, cycle, db)
    tid = _form_template_id_for_reviewee(cycle, a.reviewee_user_id, db)
    ans_rows = db.query(ReviewAnswer).filter(ReviewAnswer.assignment_id == a.id).all()
    form_payload: Dict[str, Any] = {}
    for r in ans_rows:
        if r.question_key:
            form_payload[r.question_key] = (r.answer_json or {}).get("value")
    return {
        "definition": definition,
        "form_template_id": str(tid),
        "assignment_id": str(a.id),
        "status": a.status,
        "form_payload": form_payload,
        "cycle_id": str(cycle.id),
        "cycle_name": cycle.name,
    }


@router.get("/assignments/{assignment_id}/questions")
def assignment_questions(assignment_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    aid = _uuid_or_none(assignment_id)
    if not aid:
        raise HTTPException(status_code=400, detail="Invalid assignment_id")
    a = db.query(ReviewAssignment).filter(ReviewAssignment.id == aid).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    is_reviewer = str(a.reviewer_user_id) == str(user.id)
    is_hr = _has_permission(user, "reviews:read") or _has_permission(user, "reviews:admin") or _has_permission(
        user, "hr:reviews:admin"
    )
    if not is_reviewer and not is_hr:
        raise HTTPException(status_code=403, detail="Forbidden")
    cycle = db.query(ReviewCycle).filter(ReviewCycle.id == a.cycle_id).first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle not found")
    definition = _definition_for_assignment(a, cycle, db)
    tid = _form_template_id_for_reviewee(cycle, a.reviewee_user_id, db)
    return {
        "definition": definition,
        "form_template_id": str(tid),
        "assignment_id": str(a.id),
    }


@router.post("/assignments/{assignment_id}/answers")
def submit_answers(assignment_id: str, payload: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = db.query(ReviewAssignment).filter(ReviewAssignment.id == assignment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if str(a.reviewer_user_id) != str(user.id) and not _has_permission(user, "reviews:admin") and not _has_permission(user, "hr:reviews:admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    if a.status == "submitted":
        raise HTTPException(status_code=400, detail="Assignment already submitted")

    cycle = db.query(ReviewCycle).filter(ReviewCycle.id == a.cycle_id).first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle not found")

    definition = _definition_for_assignment(a, cycle, db)
    key_labels = _field_key_labels_from_definition(definition)
    is_supervisor_eval = str(a.reviewer_user_id) != str(a.reviewee_user_id)

    db.query(ReviewAnswer).filter(ReviewAnswer.assignment_id == a.id).delete()

    form_payload = payload.get("form_payload")
    if form_payload is not None and isinstance(form_payload, dict):
        for key, value in form_payload.items():
            if not isinstance(key, str) or not key.strip():
                continue
            if key.startswith("_"):
                continue
            if key.endswith(SUPERVISOR_COMMENT_SUFFIX):
                if not is_supervisor_eval:
                    continue
                base = key[: -len(SUPERVISOR_COMMENT_SUFFIX)].strip()
                if base not in key_labels:
                    continue
                label = f"Supervisor comment · {key_labels[base]}"
                row = ReviewAnswer(
                    assignment_id=a.id,
                    question_key=key,
                    question_label_snapshot=label,
                    answer_json={"value": value},
                    score=None,
                    commented_at=datetime.now(timezone.utc),
                )
                db.add(row)
                continue
            if key not in key_labels:
                continue
            label = key_labels[key]
            score = _extract_numeric_score(value)
            row = ReviewAnswer(
                assignment_id=a.id,
                question_key=key,
                question_label_snapshot=label,
                answer_json={"value": value},
                score=score,
                commented_at=datetime.now(timezone.utc),
            )
            db.add(row)
    else:
        for ans in payload.get("answers") or []:
            key = ans.get("key")
            value = ans.get("value")
            label = ans.get("label")
            score = ans.get("score")
            if not key:
                continue
            row = ReviewAnswer(
                assignment_id=a.id,
                question_key=key,
                question_label_snapshot=label or key_labels.get(key, key),
                answer_json={"value": value},
                score=score,
                commented_at=datetime.now(timezone.utc),
            )
            db.add(row)

    a.status = "submitted"
    db.commit()
    return {"status": "ok"}


# ----- Me (current user) -----
@router.get("/me/available")
def me_available(db: Session = Depends(get_db), user=Depends(get_current_user)):
    exists = (
        db.query(ReviewAssignment)
        .join(ReviewCycle, ReviewCycle.id == ReviewAssignment.cycle_id)
        .filter(ReviewCycle.status == "active")
        .filter(
            or_(
                ReviewAssignment.reviewee_user_id == user.id,
                ReviewAssignment.reviewer_user_id == user.id,
            )
        )
        .first()
    )
    reports = get_direct_reports(str(user.id), db)
    return {"available": exists is not None, "is_supervisor": len(reports) > 0}


@router.get("/my/assignments")
def my_assignments(status: Optional[str] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(ReviewAssignment).filter(ReviewAssignment.reviewer_user_id == user.id)
    if status:
        q = q.filter(ReviewAssignment.status == status)
    rows = q.all()
    direct_reports = set(get_direct_reports(str(user.id), db))
    cycle_by_id = {}
    if rows:
        cids = list({a.cycle_id for a in rows})
        for c in db.query(ReviewCycle).filter(ReviewCycle.id.in_(cids)).all():
            cycle_by_id[c.id] = c

    reviewee_ids = list({a.reviewee_user_id for a in rows}) if rows else []
    users_by_id: Dict[Any, User] = {}
    ep_by_uid: Dict[Any, EmployeeProfile] = {}
    if reviewee_ids:
        for u in db.query(User).filter(User.id.in_(reviewee_ids)).all():
            users_by_id[u.id] = u
        for ep in db.query(EmployeeProfile).filter(EmployeeProfile.user_id.in_(reviewee_ids)).all():
            ep_by_uid[ep.user_id] = ep

    out = []
    for a in rows:
        reviewee_id = str(a.reviewee_user_id)
        is_self = reviewee_id == str(user.id)
        cyc = cycle_by_id.get(a.cycle_id)
        rev = users_by_id.get(a.reviewee_user_id)
        ep = ep_by_uid.get(a.reviewee_user_id)
        display_name = _display_name_from_user_profile(rev, ep)
        rec = {
            "id": str(a.id),
            "cycle_id": str(a.cycle_id),
            "cycle_name": getattr(cyc, "name", None) if cyc else None,
            "cycle_status": getattr(cyc, "status", None) if cyc else None,
            "cycle_period_start": cyc.period_start.isoformat() if cyc and cyc.period_start else None,
            "cycle_period_end": cyc.period_end.isoformat() if cyc and cyc.period_end else None,
            "reviewee_user_id": reviewee_id,
            "reviewer_user_id": str(a.reviewer_user_id),
            "status": a.status,
            "due_date": a.due_date.isoformat() if a.due_date else None,
            "is_self": is_self,
            "is_subordinate": not is_self and reviewee_id in direct_reports,
        }
        if rev:
            rec["reviewee_username"] = getattr(rev, "username", None)
        rec["reviewee_display_name"] = display_name or rec.get("reviewee_username") or reviewee_id
        out.append(rec)
    return out


@router.get("/cycles/{cycle_id}/compare")
def compare_cycle(
    cycle_id: str,
    user_id: Optional[str] = None,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("reviews:read")),
):
    cyc = db.query(ReviewCycle).filter(ReviewCycle.id == cycle_id).first()
    if not cyc:
        raise HTTPException(status_code=404, detail="Cycle not found")
    q = db.query(ReviewAssignment).filter(ReviewAssignment.cycle_id == cycle_id)
    if user_id:
        q = q.filter(ReviewAssignment.reviewee_user_id == user_id)
    assigns = q.all()
    from collections import defaultdict

    by_user = defaultdict(list)
    for a in assigns:
        by_user[str(a.reviewee_user_id)].append(a)
    out = []
    for rid, arr in by_user.items():
        reviewee_uuid = _uuid_or_none(rid)
        definition = _normalize_definition({})
        if reviewee_uuid:
            first = arr[0] if arr else None
            if first and first.form_definition_snapshot:
                definition = _normalize_definition(first.form_definition_snapshot)
            else:
                definition = _definition_for_reviewee(cyc, reviewee_uuid, db)
        qs = _collect_compare_fields(definition)

        self_a = next((a for a in arr if str(a.reviewee_user_id) == str(a.reviewer_user_id)), None)
        mgr_a = next((a for a in arr if str(a.reviewee_user_id) != str(a.reviewer_user_id)), None)

        def answers_for(an):
            if not an:
                return {}
            rows_ans = db.query(ReviewAnswer).filter(ReviewAnswer.assignment_id == an.id).all()
            return {r.question_key: (r.answer_json or {}).get("value") for r in rows_ans}

        self_ans = answers_for(self_a)
        mgr_ans = answers_for(mgr_a)
        comp = []
        for qrow in qs:
            k = qrow["key"]
            comp.append(
                {
                    "key": k,
                    "label": qrow["label"],
                    "field_type": qrow.get("field_type") or "",
                    "section_title": qrow.get("section_title") or "",
                    "self": self_ans.get(k),
                    "manager": mgr_ans.get(k),
                }
            )
        display_name = None
        try:
            uid = _uuid_or_none(rid) or rid
            rev = db.query(User).filter(User.id == uid).first()
            ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == uid).first() if rev else None
            display_name = _display_name_from_user_profile(rev, ep)
            if not display_name and rev:
                display_name = getattr(rev, "username", None)
        except Exception:
            display_name = None
        out.append(
            {
                "reviewee_user_id": rid,
                "reviewee_name": display_name,
                "self_assignment_id": str(self_a.id) if self_a else None,
                "manager_assignment_id": str(mgr_a.id) if mgr_a else None,
                "self_status": getattr(self_a, "status", None) if self_a else None,
                "manager_status": getattr(mgr_a, "status", None) if mgr_a else None,
                "self_reviewer_id": str(getattr(self_a, "reviewer_user_id")) if self_a else None,
                "manager_reviewer_id": str(getattr(mgr_a, "reviewer_user_id")) if mgr_a else None,
                "comparison": comp,
            }
        )
    return out


def _parse_dt(value: Optional[str]):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except Exception:
        return None
