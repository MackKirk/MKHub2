from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timezone

from ..db import get_db
from ..models.models import ReviewTemplate, ReviewTemplateQuestion, ReviewCycle, ReviewAssignment, ReviewAnswer, User
from ..auth.security import get_current_user, require_permissions
from ..services.hierarchy import get_direct_reports


router = APIRouter(prefix="/reviews", tags=["reviews"])


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
    rows = db.query(ReviewTemplateQuestion).filter(ReviewTemplateQuestion.template_id == template_id).order_by(ReviewTemplateQuestion.order_index.asc()).all()
    return [{"id": str(q.id), "order_index": q.order_index, "key": q.key, "label": q.label, "type": q.type, "options": q.options, "required": q.required} for q in rows]


# ----- Cycles -----
@router.post("/cycles")
def create_cycle(payload: dict, db: Session = Depends(get_db), _=Depends(require_permissions("reviews:admin"))):
    c = ReviewCycle(
        name=payload.get("name","Review Cycle"),
        period_start=_parse_dt(payload.get("period_start")),
        period_end=_parse_dt(payload.get("period_end")),
        template_id=payload.get("template_id"),
        status="active" if payload.get("activate") else "draft",
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": str(c.id)}


@router.get("/cycles")
def list_cycles(db: Session = Depends(get_db), _=Depends(require_permissions("reviews:read"))):
    rows = db.query(ReviewCycle).order_by(ReviewCycle.period_start.desc().nullslast()).all()
    return [{"id": str(c.id), "name": c.name, "period_start": c.period_start.isoformat() if c.period_start else None, "period_end": c.period_end.isoformat() if c.period_end else None, "template_id": str(c.template_id), "status": c.status} for c in rows]


@router.post("/cycles/{cycle_id}/assign")
def assign_cycle(cycle_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("reviews:admin"))):
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


# ----- Answers -----
@router.get("/assignments/{assignment_id}/questions")
def assignment_questions(assignment_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("reviews:read"))):
    a = db.query(ReviewAssignment).filter(ReviewAssignment.id == assignment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    rows = db.query(ReviewTemplateQuestion).join(ReviewCycle, ReviewCycle.id == a.cycle_id).filter(ReviewTemplateQuestion.template_id == ReviewCycle.template_id).order_by(ReviewTemplateQuestion.order_index.asc()).all()
    return [{"key": r.key, "label": r.label, "type": r.type, "options": r.options, "required": r.required} for r in rows]


@router.post("/assignments/{assignment_id}/answers")
def submit_answers(assignment_id: str, payload: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = db.query(ReviewAssignment).filter(ReviewAssignment.id == assignment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    # Only reviewer can submit
    if str(a.reviewer_user_id) != str(user.id) and not require_permissions("reviews:admin"):
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


@router.get("/my/assignments")
def my_assignments(status: Optional[str] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(ReviewAssignment).filter(ReviewAssignment.reviewer_user_id == user.id)
    if status:
        q = q.filter(ReviewAssignment.status == status)
    rows = q.all()
    # Attach user names when possible
    out = []
    for a in rows:
        rec = {"id": str(a.id), "cycle_id": str(a.cycle_id), "reviewee_user_id": str(a.reviewee_user_id), "reviewer_user_id": str(a.reviewer_user_id), "status": a.status, "due_date": a.due_date.isoformat() if a.due_date else None}
        try:
            rev = db.query(User).filter(User.id == a.reviewee_user_id).first()
            rec["reviewee_username"] = getattr(rev, 'username', None)
        except Exception:
            pass
        out.append(rec)
    return out


def _parse_dt(value: Optional[str]):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except Exception:
        return None


