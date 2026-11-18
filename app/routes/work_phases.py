"""Job progress phase templates + project checklist (not system Tasks)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..auth.security import get_current_user, _user_is_admin
from ..db import get_db
from ..models.models import Project, User, WorkPhaseTemplate
from ..services.business_line import VALID_BUSINESS_LINES, normalize_business_line
from ..services.work_phases import (
    compute_progress_percent,
    instantiate_phases_from_template,
    normalize_project_phases,
    normalize_template_phases,
    set_phase_done,
)

router = APIRouter(tags=["work-phases"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _load_project(db: Session, project_id: str) -> Project:
    try:
        pid = uuid.UUID(str(project_id))
    except Exception:
        raise HTTPException(status_code=404, detail="Project not found")
    p = db.query(Project).filter(Project.id == pid, Project.deleted_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


def _assert_project_write(user: User, project: Project) -> None:
    from ..routes.projects import _assert_project_line_write

    _assert_project_line_write(user, project)


def _assert_project_read(user: User, project: Project) -> None:
    from ..routes.projects import _assert_project_line_read

    _assert_project_line_read(user, project)


def _template_to_dict(t: WorkPhaseTemplate) -> dict:
    return {
        "id": str(t.id),
        "name": t.name,
        "description": t.description,
        "business_line": t.business_line,
        "phases": normalize_template_phases(t.phases),
        "is_active": bool(t.is_active),
        "sort_index": int(t.sort_index or 0),
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def _project_phases_payload(project: Project) -> dict:
    phases = normalize_project_phases(getattr(project, "work_phases", None))
    pct = compute_progress_percent(phases)
    return {
        "work_phases": phases,
        "work_phase_template_id": str(project.work_phase_template_id)
        if getattr(project, "work_phase_template_id", None)
        else None,
        "progress": getattr(project, "progress", None),
        "progress_from_phases": pct,
    }


class ApplyTemplateBody(BaseModel):
    template_id: str
    replace: bool = True


class PhaseDoneBody(BaseModel):
    done: bool = True


@router.get("/work-phase-templates")
def list_work_phase_templates(
    business_line: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(WorkPhaseTemplate).filter(WorkPhaseTemplate.is_active.is_(True))
    if business_line and str(business_line).strip():
        line = normalize_business_line(business_line)
        if line not in VALID_BUSINESS_LINES:
            raise HTTPException(status_code=400, detail="Invalid business_line")
        q = q.filter(
            (WorkPhaseTemplate.business_line.is_(None))
            | (WorkPhaseTemplate.business_line == line)
        )
    rows = q.order_by(WorkPhaseTemplate.sort_index.asc(), WorkPhaseTemplate.name.asc()).all()
    return [_template_to_dict(t) for t in rows]


@router.get("/projects/{project_id}/work-phases")
def get_project_work_phases(
    project_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = _load_project(db, project_id)
    _assert_project_read(user, project)
    return _project_phases_payload(project)


@router.post("/projects/{project_id}/work-phases/apply-template")
def apply_work_phase_template(
    project_id: str,
    body: ApplyTemplateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = _load_project(db, project_id)
    _assert_project_write(user, project)
    try:
        tid = uuid.UUID(str(body.template_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template_id")
    tpl = db.query(WorkPhaseTemplate).filter(WorkPhaseTemplate.id == tid).first()
    if not tpl or not tpl.is_active:
        raise HTTPException(status_code=404, detail="Template not found")

    existing = normalize_project_phases(getattr(project, "work_phases", None))
    if existing and not body.replace:
        raise HTTPException(
            status_code=409,
            detail="Project already has work phases; pass replace=true to overwrite",
        )

    phases = instantiate_phases_from_template(tpl.phases)
    if not phases:
        raise HTTPException(status_code=400, detail="Template has no phases")

    project.work_phases = phases
    project.work_phase_template_id = tpl.id
    project.progress = compute_progress_percent(phases)
    flag_modified(project, "work_phases")
    db.add(project)
    db.commit()
    db.refresh(project)
    return _project_phases_payload(project)


@router.patch("/projects/{project_id}/work-phases/{phase_id}")
def patch_project_work_phase(
    project_id: str,
    phase_id: str,
    body: PhaseDoneBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = _load_project(db, project_id)
    _assert_project_write(user, project)
    rows = normalize_project_phases(getattr(project, "work_phases", None))
    if not any(p["id"] == str(phase_id) for p in rows):
        raise HTTPException(status_code=404, detail="Phase not found")
    updated = set_phase_done(rows, phase_id, body.done)
    project.work_phases = updated
    project.progress = compute_progress_percent(updated)
    flag_modified(project, "work_phases")
    db.add(project)
    db.commit()
    db.refresh(project)
    return _project_phases_payload(project)


@router.delete("/projects/{project_id}/work-phases")
def clear_project_work_phases(
    project_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = _load_project(db, project_id)
    _assert_project_write(user, project)
    project.work_phases = []
    project.work_phase_template_id = None
    # Leave progress as-is so manual % is not wiped unexpectedly.
    flag_modified(project, "work_phases")
    db.add(project)
    db.commit()
    db.refresh(project)
    return _project_phases_payload(project)
