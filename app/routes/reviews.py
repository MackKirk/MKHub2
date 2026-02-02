from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
import uuid
from typing import Optional, List
from datetime import datetime, timezone

from ..db import get_db
from ..models.models import ReviewTemplate, ReviewTemplateQuestion, ReviewCycle, ReviewAssignment, ReviewAnswer, User, EmployeeProfile
from ..auth.security import get_current_user, require_permissions, _has_permission
from ..services.hierarchy import get_direct_reports


def _template_id_for_reviewee(cycle: ReviewCycle, reviewee_user_id, db: Session):
    """Resolve template_id (UUID) for a reviewee: use cycle.template_by_department[division] if set, else cycle.template_id."""
    if not getattr(cycle, "template_by_department", None) or not isinstance(cycle.template_by_department, dict):
        return cycle.template_id
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == reviewee_user_id).first()
    division = (profile and getattr(profile, "division", None)) or None
    if division:
        tid = cycle.template_by_department.get(division) or cycle.template_by_department.get(str(division).strip())
        if tid:
            try:
                return uuid.UUID(str(tid)) if isinstance(tid, str) else tid
            except (ValueError, TypeError):
                pass
    return cycle.template_id


router = APIRouter(prefix="/reviews", tags=["reviews"])


def _uuid_or_none(value):
    if value is None:
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


# ----- Templates -----
@router.get("/templates")
def list_templates(db: Session = Depends(get_db), _=Depends(require_permissions("reviews:read"))):
    rows = db.query(ReviewTemplate).order_by(ReviewTemplate.created_at.desc()).all()
    return [{"id": str(t.id), "name": t.name, "version": t.version, "is_active": t.is_active, "created_at": t.created_at.isoformat() if t.created_at else None} for t in rows]


@router.post("/templates")
def create_template(payload: dict, db: Session = Depends(get_db), _=Depends(require_permissions("reviews:admin"))):
    t = ReviewTemplate(name=payload.get("name","Template"), version=int(payload.get("version") or 1), is_active=bool(payload.get("is_active", True)))
    db.add(t)
    db.commit()
    db.refresh(t)
    for i, q in enumerate(payload.get("questions") or []):
        db.add(ReviewTemplateQuestion(template_id=t.id, order_index=int(q.get("order_index", i)), key=q.get("key") or f"q{i+1}", label=q.get("label") or "Question", type=q.get("type") or "text", options=q.get("options"), required=bool(q.get("required"))))
    db.commit()
    return {"id": str(t.id)}


@router.get("/templates/{template_id}/questions")
def list_template_questions(template_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("reviews:read"))):
    tid = _uuid_or_none(template_id)
    if not tid:
        raise HTTPException(status_code=400, detail="Invalid template_id")
    rows = db.query(ReviewTemplateQuestion).filter(ReviewTemplateQuestion.template_id == tid).order_by(ReviewTemplateQuestion.order_index.asc()).all()
    return [{"id": str(q.id), "order_index": q.order_index, "key": q.key, "label": q.label, "type": q.type, "options": q.options, "required": q.required} for q in rows]


@router.put("/templates/{template_id}")
def update_template(template_id: str, payload: dict, db: Session = Depends(get_db), _=Depends(require_permissions("reviews:admin"))):
    """Update template name and/or replace questions (order by list index)."""
    tid = _uuid_or_none(template_id)
    if not tid:
        raise HTTPException(status_code=400, detail="Invalid template_id")
    t = db.query(ReviewTemplate).filter(ReviewTemplate.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    if "name" in payload and payload["name"] is not None:
        t.name = str(payload["name"]).strip() or t.name
    if "is_active" in payload:
        t.is_active = bool(payload["is_active"])
    questions = payload.get("questions")
    if questions is not None:
        db.query(ReviewTemplateQuestion).filter(ReviewTemplateQuestion.template_id == tid).delete()
        for i, q in enumerate(questions):
            db.add(ReviewTemplateQuestion(
                template_id=tid,
                order_index=int(q.get("order_index", i)),
                key=q.get("key") or f"q{i+1}",
                label=q.get("label") or "Question",
                type=q.get("type") or "text",
                options=q.get("options"),
                required=bool(q.get("required")),
            ))
    db.commit()
    db.refresh(t)
    return {"id": str(t.id)}


# ----- Cycles -----
@router.post("/cycles")
def create_cycle(payload: dict, db: Session = Depends(get_db), _=Depends(require_permissions("reviews:admin"))):
    tid = _uuid_or_none(payload.get("template_id"))
    if not tid:
        raise HTTPException(status_code=400, detail="template_id is required")
    c = ReviewCycle(
        name=payload.get("name","Review Cycle"),
        period_start=_parse_dt(payload.get("period_start")),
        period_end=_parse_dt(payload.get("period_end")),
        template_id=tid,
        template_by_department=payload.get("template_by_department"),
        status="active" if payload.get("activate") else "draft",
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": str(c.id)}


@router.get("/cycles")
def list_cycles(db: Session = Depends(get_db), _=Depends(require_permissions("reviews:read"))):
    rows = db.query(ReviewCycle).order_by(ReviewCycle.period_start.desc().nullslast()).all()
    return [{"id": str(c.id), "name": c.name, "period_start": c.period_start.isoformat() if c.period_start else None, "period_end": c.period_end.isoformat() if c.period_end else None, "template_id": str(c.template_id), "template_by_department": getattr(c, "template_by_department", None), "status": c.status} for c in rows]


@router.post("/cycles/{cycle_id}/assign")
def assign_cycle(cycle_id: str, include_self: bool = True, db: Session = Depends(get_db), _=Depends(require_permissions("reviews:admin"))):
    c = db.query(ReviewCycle).filter(ReviewCycle.id == cycle_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cycle not found")
    # For MVP: assign each employee to their direct manager
    users = db.query(User).all()
    now = datetime.now(timezone.utc)
    created = 0
    for u in users:
        reports = get_direct_reports(str(u.id), db)
        # For each direct report r, create assignment where reviewer=u, reviewee=r
        for rid in reports:
            exists = db.query(ReviewAssignment).filter(ReviewAssignment.cycle_id == c.id, ReviewAssignment.reviewee_user_id == rid, ReviewAssignment.reviewer_user_id == u.id).first()
            if exists:
                continue
            a = ReviewAssignment(cycle_id=c.id, reviewee_user_id=rid, reviewer_user_id=u.id, status="pending", due_date=c.period_end or now)
            db.add(a)
            created += 1
    if include_self:
        # Self-reviews for all active users
        for u in users:
            exists = db.query(ReviewAssignment).filter(ReviewAssignment.cycle_id == c.id, ReviewAssignment.reviewee_user_id == u.id, ReviewAssignment.reviewer_user_id == u.id).first()
            if exists:
                continue
            a = ReviewAssignment(cycle_id=c.id, reviewee_user_id=u.id, reviewer_user_id=u.id, status="pending", due_date=c.period_end or now)
            db.add(a)
            created += 1
    db.commit()
    return {"status":"ok", "created": created}


@router.get("/cycles/{cycle_id}/assignments")
def list_assignments(cycle_id: str, reviewer: Optional[str] = None, reviewee: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_permissions("reviews:read"))):
    q = db.query(ReviewAssignment).filter(ReviewAssignment.cycle_id == cycle_id)
    if reviewer:
        q = q.filter(ReviewAssignment.reviewer_user_id == reviewer)
    if reviewee:
        q = q.filter(ReviewAssignment.reviewee_user_id == reviewee)
    rows = q.all()
    return [{"id": str(a.id), "cycle_id": str(a.cycle_id), "reviewee_user_id": str(a.reviewee_user_id), "reviewer_user_id": str(a.reviewer_user_id), "status": a.status, "due_date": a.due_date.isoformat() if a.due_date else None} for a in rows]


@router.get("/cycles/{cycle_id}/hr-status")
def cycle_hr_status(cycle_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("reviews:read"))):
    """List all employees in the cycle with employee self-review done and supervisor review done flags (for HR filters)."""
    c = db.query(ReviewCycle).filter(ReviewCycle.id == cycle_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cycle not found")
    assigns = db.query(ReviewAssignment).filter(ReviewAssignment.cycle_id == cycle_id).all()
    from collections import defaultdict
    by_reviewee = defaultdict(list)
    for a in assigns:
        by_reviewee[str(a.reviewee_user_id)].append(a)
    out = []
    for reviewee_id, arr in by_reviewee.items():
        self_a = next((a for a in arr if str(a.reviewee_user_id) == str(a.reviewer_user_id)), None)
        mgr_a = next((a for a in arr if str(a.reviewee_user_id) != str(a.reviewer_user_id)), None)
        employee_self_done = self_a is not None and self_a.status == "submitted"
        supervisor_done = mgr_a is not None and mgr_a.status == "submitted"
        both_done = employee_self_done and supervisor_done
        missing_employee = not employee_self_done
        missing_supervisor = not supervisor_done
        display_name = None
        try:
            u = db.query(User).filter(User.id == reviewee_id).first()
            display_name = getattr(u, "username", None) or (getattr(u, "email", None) if u else None)
        except Exception:
            pass
        out.append({
            "user_id": reviewee_id,
            "name": display_name,
            "employee_self_done": employee_self_done,
            "supervisor_done": supervisor_done,
            "both_done": both_done,
            "missing_employee": missing_employee,
            "missing_supervisor": missing_supervisor,
        })
    return out


# ----- Answers -----
@router.get("/assignments/{assignment_id}/questions")
def assignment_questions(assignment_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("reviews:read"))):
    a = db.query(ReviewAssignment).filter(ReviewAssignment.id == assignment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    cycle = db.query(ReviewCycle).filter(ReviewCycle.id == a.cycle_id).first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle not found")
    template_id = _template_id_for_reviewee(cycle, a.reviewee_user_id, db)
    rows = db.query(ReviewTemplateQuestion).filter(ReviewTemplateQuestion.template_id == template_id).order_by(ReviewTemplateQuestion.order_index.asc()).all()
    return [{"key": r.key, "label": r.label, "type": r.type, "options": r.options, "required": r.required} for r in rows]


@router.post("/assignments/{assignment_id}/answers")
def submit_answers(assignment_id: str, payload: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = db.query(ReviewAssignment).filter(ReviewAssignment.id == assignment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    # Only reviewer can submit (or admin with reviews:admin / hr:reviews:admin)
    if str(a.reviewer_user_id) != str(user.id) and not _has_permission(user, "reviews:admin") and not _has_permission(user, "hr:reviews:admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    # payload: { answers: [{ key, label?, value, score? }] }
    for ans in (payload.get("answers") or []):
        key = ans.get("key")
        value = ans.get("value")
        label = ans.get("label")
        score = ans.get("score")
        if not key:
            continue
        row = ReviewAnswer(assignment_id=a.id, question_key=key, question_label_snapshot=label or key, answer_json={"value": value}, score=score, commented_at=datetime.now(timezone.utc))
        db.add(row)
    a.status = "submitted"
    db.commit()
    return {"status":"ok"}


# ----- Me (current user) -----
@router.get("/me/available")
def me_available(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Return whether the current user has a review available (active cycle with at least one assignment as reviewee or reviewer)."""
    # Any assignment in an active cycle where user is reviewee or reviewer
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
    out = []
    for a in rows:
        reviewee_id = str(a.reviewee_user_id)
        is_self = reviewee_id == str(user.id)
        rec = {
            "id": str(a.id),
            "cycle_id": str(a.cycle_id),
            "reviewee_user_id": reviewee_id,
            "reviewer_user_id": str(a.reviewer_user_id),
            "status": a.status,
            "due_date": a.due_date.isoformat() if a.due_date else None,
            "is_self": is_self,
            "is_subordinate": not is_self and reviewee_id in direct_reports,
        }
        try:
            rev = db.query(User).filter(User.id == a.reviewee_user_id).first()
            rec["reviewee_username"] = getattr(rev, 'username', None)
        except Exception:
            pass
        out.append(rec)
    return out


@router.get("/cycles/{cycle_id}/compare")
def compare_cycle(cycle_id: str, user_id: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_permissions("reviews:read"))):
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
        template_id = _template_id_for_reviewee(cyc, rid, db)
        qs = db.query(ReviewTemplateQuestion).filter(ReviewTemplateQuestion.template_id == template_id).order_by(ReviewTemplateQuestion.order_index.asc()).all()
        self_a = next((a for a in arr if str(a.reviewee_user_id) == str(a.reviewer_user_id)), None)
        mgr_a = next((a for a in arr if str(a.reviewee_user_id) != str(a.reviewer_user_id)), None)
        def answers_for(aid):
            if not aid:
                return {}
            rows = db.query(ReviewAnswer).filter(ReviewAnswer.assignment_id == aid.id).all()
            return { r.question_key: (r.answer_json or {}).get('value') for r in rows }
        self_ans = answers_for(self_a)
        mgr_ans = answers_for(mgr_a)
        comp = []
        for qrow in qs:
            k = qrow.key
            comp.append({
                "key": k,
                "label": qrow.label,
                "self": self_ans.get(k),
                "manager": mgr_ans.get(k),
            })
        # Resolve display name
        display_name = None
        try:
            rev = db.query(User).filter(User.id == rid).first()
            display_name = getattr(rev, 'username', None)
        except Exception:
            display_name = None
        out.append({
            "reviewee_user_id": rid,
            "reviewee_name": display_name,
            "self_assignment_id": str(self_a.id) if self_a else None,
            "manager_assignment_id": str(mgr_a.id) if mgr_a else None,
            "self_status": getattr(self_a, 'status', None) if self_a else None,
            "manager_status": getattr(mgr_a, 'status', None) if mgr_a else None,
            "self_reviewer_id": str(getattr(self_a, 'reviewer_user_id')) if self_a else None,
            "manager_reviewer_id": str(getattr(mgr_a, 'reviewer_user_id')) if mgr_a else None,
            "comparison": comp,
        })
    return out


def _parse_dt(value: Optional[str]):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except Exception:
        return None


