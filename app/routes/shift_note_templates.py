"""Reusable notes for shift assignment."""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from ..auth.security import assert_project_workload_permission, get_current_user
from ..auth.settings_permissions import has_any_settings_permission
from ..db import get_db
from ..models.models import Project, ShiftNoteTemplate, User
from ..services.permissions import is_admin, is_supervisor

router = APIRouter(prefix="/dispatch", tags=["dispatch"])

NOTE_MAX = 2000


def _normalize_body(raw) -> str:
    text = str(raw or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Note text is required")
    if len(text) > NOTE_MAX:
        raise HTTPException(status_code=400, detail="Note must be 2000 characters or fewer")
    return text


def _can_read_project(user: User, project: Project, db: Session) -> bool:
    if is_admin(user, db) or is_supervisor(user, db) or has_any_settings_permission(user):
        return True
    try:
        assert_project_workload_permission(user, project, "read", db)
        return True
    except HTTPException:
        return False


def _can_write_project(user: User, project: Project, db: Session) -> bool:
    if is_admin(user, db) or has_any_settings_permission(user):
        return True
    try:
        assert_project_workload_permission(user, project, "write", db)
        return True
    except HTTPException:
        return False


def _load_project(db: Session, project_id: Optional[str]) -> Optional[Project]:
    if not project_id:
        return None
    return db.query(Project).filter(Project.id == project_id).first()


def _can_edit_template(user: User, row: ShiftNoteTemplate, db: Session, context_project: Optional[Project]) -> bool:
    if is_admin(user, db) or has_any_settings_permission(user):
        return True
    if row.scope == "project" and row.project_id:
        project = db.query(Project).filter(Project.id == row.project_id).first()
        return bool(project and _can_write_project(user, project, db))
    if context_project and _can_write_project(user, context_project, db):
        return True
    return is_supervisor(user, db)


def _to_dict(row: ShiftNoteTemplate, project_name: Optional[str] = None) -> dict:
    return {
        "id": str(row.id),
        "scope": row.scope,
        "project_id": str(row.project_id) if row.project_id else None,
        "project_name": project_name,
        "body": row.body,
        "updated_at": row.updated_at.isoformat() if row.updated_at else (
            row.created_at.isoformat() if row.created_at else None
        ),
    }


def _find_duplicate(db: Session, scope: str, body: str, project_id) -> Optional[ShiftNoteTemplate]:
    query = db.query(ShiftNoteTemplate).filter(
        ShiftNoteTemplate.scope == scope,
        ShiftNoteTemplate.body == body,
    )
    if scope == "project":
        query = query.filter(ShiftNoteTemplate.project_id == project_id)
    else:
        query = query.filter(ShiftNoteTemplate.project_id.is_(None))
    return query.first()


def _names_for(db: Session, rows: List[ShiftNoteTemplate]) -> dict:
    ids = [row.project_id for row in rows if row.project_id]
    if not ids:
        return {}
    return {project.id: project.name for project in db.query(Project).filter(Project.id.in_(ids)).all()}


@router.get("/shift-note-templates")
def list_shift_note_templates(
    project_id: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    With project_id: that project's notes plus global notes.
    Without project_id: every saved note, for Settings.
    """
    query = db.query(ShiftNoteTemplate)
    if project_id:
        project = _load_project(db, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        if not _can_read_project(user, project, db):
            raise HTTPException(status_code=403, detail="Access denied")
        query = query.filter(
            or_(
                ShiftNoteTemplate.scope == "global",
                and_(ShiftNoteTemplate.scope == "project", ShiftNoteTemplate.project_id == project.id),
            )
        )
    else:
        if not (is_admin(user, db) or has_any_settings_permission(user)):
            raise HTTPException(status_code=403, detail="Access denied")

    needle = (q or "").strip().lower()
    rows = query.order_by(ShiftNoteTemplate.updated_at.desc(), ShiftNoteTemplate.created_at.desc()).all()
    if needle:
        rows = [row for row in rows if needle in (row.body or "").lower()]
    names = _names_for(db, rows)
    payload = [_to_dict(row, names.get(row.project_id)) for row in rows]
    return {
        "project": [row for row in payload if row["scope"] == "project"],
        "global": [row for row in payload if row["scope"] == "global"],
    }


@router.post("/shift-note-templates")
def create_shift_note_templates(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    body = _normalize_body(payload.get("body"))
    save_on_project = bool(payload.get("save_on_project"))
    save_global = bool(payload.get("save_global"))
    scope = str(payload.get("scope") or "").strip().lower()
    if scope == "project":
        save_on_project = True
    elif scope == "global":
        save_global = True
    if not save_on_project and not save_global:
        raise HTTPException(status_code=400, detail="Choose a project note, a global note, or both")

    project = _load_project(db, payload.get("project_id"))
    if save_on_project and not project:
        raise HTTPException(status_code=400, detail="project_id is required to save a project note")
    if project and not _can_write_project(user, project, db):
        raise HTTPException(status_code=403, detail="Access denied")
    if save_global and not project and not (is_admin(user, db) or has_any_settings_permission(user)):
        raise HTTPException(status_code=403, detail="Access denied")

    now = datetime.now(timezone.utc)
    saved = []
    if save_on_project and project:
        existing = _find_duplicate(db, "project", body, project.id)
        if existing:
            saved.append(existing)
        else:
            row = ShiftNoteTemplate(
                scope="project",
                project_id=project.id,
                body=body,
                created_by=user.id,
                updated_by=user.id,
                created_at=now,
                updated_at=now,
            )
            db.add(row)
            saved.append(row)
    if save_global:
        existing = _find_duplicate(db, "global", body, None)
        if existing:
            saved.append(existing)
        else:
            row = ShiftNoteTemplate(
                scope="global",
                project_id=None,
                body=body,
                created_by=user.id,
                updated_by=user.id,
                created_at=now,
                updated_at=now,
            )
            db.add(row)
            saved.append(row)
    db.commit()
    for row in saved:
        db.refresh(row)
    names = _names_for(db, saved)
    return [_to_dict(row, names.get(row.project_id)) for row in saved]


@router.patch("/shift-note-templates/{template_id}")
def update_shift_note_template(
    template_id: str,
    payload: dict,
    context_project_id: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.query(ShiftNoteTemplate).filter(ShiftNoteTemplate.id == template_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Saved note not found")
    context = _load_project(db, context_project_id or payload.get("context_project_id"))
    if not _can_edit_template(user, row, db, context):
        raise HTTPException(status_code=403, detail="Access denied")
    row.body = _normalize_body(payload.get("body"))
    row.updated_by = user.id
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    project_name = None
    if row.project_id:
        project = db.query(Project).filter(Project.id == row.project_id).first()
        project_name = project.name if project else None
    return _to_dict(row, project_name)


@router.delete("/shift-note-templates/{template_id}")
def delete_shift_note_template(
    template_id: str,
    context_project_id: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.query(ShiftNoteTemplate).filter(ShiftNoteTemplate.id == template_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Saved note not found")
    context = _load_project(db, context_project_id)
    if not _can_edit_template(user, row, db, context):
        raise HTTPException(status_code=403, detail="Access denied")
    db.delete(row)
    db.commit()
    return {"ok": True}
