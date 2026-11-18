"""Job progress phase templates + project checklist (not system Tasks)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..auth.security import get_current_user, user_has_fieldwork_permission
from ..db import get_db
from ..models.models import Project, User, WorkPhaseTemplate
from ..services.business_line import VALID_BUSINESS_LINES, normalize_business_line
from ..services.work_phases import (
    add_manual_phase,
    append_template_phases,
    compute_progress_percent,
    instantiate_phases_from_template,
    normalize_project_phases,
    normalize_template_phases,
    remove_phase,
    rename_phase,
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


def _parse_line(raw: Optional[str], *, required: bool = False) -> Optional[str]:
    if raw is None or not str(raw).strip():
        if required:
            raise HTTPException(status_code=400, detail="business_line is required")
        return None
    line = normalize_business_line(raw)
    if line not in VALID_BUSINESS_LINES:
        raise HTTPException(status_code=400, detail="Invalid business_line")
    return line


def _assert_template_admin_read(user: User, business_line: Optional[str] = None) -> None:
    if not user_has_fieldwork_permission(user, "read", business_line=business_line):
        raise HTTPException(status_code=403, detail="Forbidden")


def _assert_template_admin_write(user: User, business_line: Optional[str] = None) -> None:
    if not user_has_fieldwork_permission(user, "write", business_line=business_line):
        raise HTTPException(status_code=403, detail="Forbidden")


def _load_template(db: Session, template_id: str) -> WorkPhaseTemplate:
    try:
        tid = uuid.UUID(str(template_id))
    except Exception:
        raise HTTPException(status_code=404, detail="Template not found")
    tpl = db.query(WorkPhaseTemplate).filter(WorkPhaseTemplate.id == tid).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tpl


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


def _unique_name(db: Session, name: str, *, exclude_id: Optional[uuid.UUID] = None) -> str:
    cleaned = (name or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="name is required")
    q = db.query(WorkPhaseTemplate).filter(WorkPhaseTemplate.name == cleaned)
    if exclude_id is not None:
        q = q.filter(WorkPhaseTemplate.id != exclude_id)
    if q.first():
        raise HTTPException(status_code=409, detail="A template with this name already exists")
    return cleaned


class ApplyTemplateBody(BaseModel):
    template_id: str
    """When false (default), append template phases to the existing checklist (multi-template)."""
    replace: bool = False


class AddPhaseBody(BaseModel):
    label: str = Field(..., min_length=1, max_length=255)


class PhasePatchBody(BaseModel):
    done: Optional[bool] = None
    label: Optional[str] = Field(None, min_length=1, max_length=255)


class WorkPhaseTemplateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    business_line: Optional[str] = None
    phases: List[Any] = Field(default_factory=list)
    is_active: bool = True
    sort_index: int = 0


class WorkPhaseTemplateUpdateBody(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    business_line: Optional[str] = None
    phases: Optional[List[Any]] = None
    is_active: Optional[bool] = None
    sort_index: Optional[int] = None


@router.get("/work-phase-templates")
def list_work_phase_templates(
    business_line: Optional[str] = None,
    include_inactive: bool = False,
    admin: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    List job-progress templates.

    - Default (project picker): active templates only.
    - admin=1: Templates hub; requires fieldwork read for the line.
    - include_inactive=1: only with admin + fieldwork write.
    """
    line = _parse_line(business_line) if business_line else None

    if admin or include_inactive:
        # Templates hub (read). Write is enforced on mutate endpoints.
        _assert_template_admin_read(user, line)

    q = db.query(WorkPhaseTemplate)
    if not include_inactive:
        q = q.filter(WorkPhaseTemplate.is_active.is_(True))

    if line:
        if admin:
            # Hub for a line: templates stamped for that line (not cross-line shared null).
            q = q.filter(WorkPhaseTemplate.business_line == line)
        else:
            q = q.filter(
                (WorkPhaseTemplate.business_line.is_(None))
                | (WorkPhaseTemplate.business_line == line)
            )

    rows = q.order_by(WorkPhaseTemplate.sort_index.asc(), WorkPhaseTemplate.name.asc()).all()
    return [_template_to_dict(t) for t in rows]


@router.post("/work-phase-templates")
def create_work_phase_template(
    body: WorkPhaseTemplateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    line = _parse_line(body.business_line, required=True)
    _assert_template_admin_write(user, line)
    name = _unique_name(db, body.name)
    phases = normalize_template_phases(body.phases)
    if not phases:
        raise HTTPException(status_code=400, detail="Add at least one phase")
    now = _utcnow()
    row = WorkPhaseTemplate(
        name=name,
        description=(body.description or "").strip() or None,
        business_line=line,
        phases=phases,
        is_active=bool(body.is_active),
        sort_index=int(body.sort_index or 0),
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _template_to_dict(row)


@router.get("/work-phase-templates/{template_id}")
def get_work_phase_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tpl = _load_template(db, template_id)
    _assert_template_admin_read(user, getattr(tpl, "business_line", None))
    return _template_to_dict(tpl)


@router.put("/work-phase-templates/{template_id}")
def update_work_phase_template(
    template_id: str,
    body: WorkPhaseTemplateUpdateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tpl = _load_template(db, template_id)
    current_line = getattr(tpl, "business_line", None)
    _assert_template_admin_write(user, current_line)

    if body.business_line is not None:
        new_line = _parse_line(body.business_line, required=True)
        if new_line != current_line:
            _assert_template_admin_write(user, new_line)
            tpl.business_line = new_line

    if body.name is not None:
        tpl.name = _unique_name(db, body.name, exclude_id=tpl.id)
    if body.description is not None:
        tpl.description = (body.description or "").strip() or None
    if body.phases is not None:
        phases = normalize_template_phases(body.phases)
        if not phases:
            raise HTTPException(status_code=400, detail="Add at least one phase")
        tpl.phases = phases
    if body.is_active is not None:
        tpl.is_active = bool(body.is_active)
    if body.sort_index is not None:
        tpl.sort_index = int(body.sort_index)

    tpl.updated_at = _utcnow()
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return _template_to_dict(tpl)


@router.post("/work-phase-templates/{template_id}/duplicate")
def duplicate_work_phase_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    src = _load_template(db, template_id)
    line = getattr(src, "business_line", None)
    _assert_template_admin_write(user, line)
    base = (src.name or "Template").strip() or "Template"
    candidate = f"{base} (copy)"
    n = 2
    while db.query(WorkPhaseTemplate).filter(WorkPhaseTemplate.name == candidate).first():
        candidate = f"{base} (copy {n})"
        n += 1
    now = _utcnow()
    row = WorkPhaseTemplate(
        name=candidate,
        description=src.description,
        business_line=line,
        phases=normalize_template_phases(src.phases),
        is_active=True,
        sort_index=int(src.sort_index or 0),
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _template_to_dict(row)


@router.delete("/work-phase-templates/{template_id}")
def delete_work_phase_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tpl = _load_template(db, template_id)
    _assert_template_admin_write(user, getattr(tpl, "business_line", None))
    # Soft-deactivate so project FKs stay valid; hide from pickers.
    tpl.is_active = False
    tpl.updated_at = _utcnow()
    db.add(tpl)
    db.commit()
    return {"ok": True}


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
    """Apply a template: append by default (stack Pre-prod + Production, etc.)."""
    project = _load_project(db, project_id)
    _assert_project_write(user, project)
    try:
        tid = uuid.UUID(str(body.template_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template_id")
    tpl = db.query(WorkPhaseTemplate).filter(WorkPhaseTemplate.id == tid).first()
    if not tpl or not tpl.is_active:
        raise HTTPException(status_code=404, detail="Template not found")

    tpl_id = str(tpl.id)
    tpl_name = tpl.name
    if body.replace:
        phases = instantiate_phases_from_template(
            tpl.phases,
            source_template_id=tpl_id,
            source_template_name=tpl_name,
        )
    else:
        phases = append_template_phases(
            getattr(project, "work_phases", None),
            tpl.phases,
            source_template_id=tpl_id,
            source_template_name=tpl_name,
        )
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


@router.post("/projects/{project_id}/work-phases")
def add_project_work_phase(
    project_id: str,
    body: AddPhaseBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = _load_project(db, project_id)
    _assert_project_write(user, project)
    try:
        updated = add_manual_phase(getattr(project, "work_phases", None), body.label)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    project.work_phases = updated
    project.progress = compute_progress_percent(updated)
    flag_modified(project, "work_phases")
    db.add(project)
    db.commit()
    db.refresh(project)
    return _project_phases_payload(project)


@router.patch("/projects/{project_id}/work-phases/{phase_id}")
def patch_project_work_phase(
    project_id: str,
    phase_id: str,
    body: PhasePatchBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = _load_project(db, project_id)
    _assert_project_write(user, project)
    rows = normalize_project_phases(getattr(project, "work_phases", None))
    if not any(p["id"] == str(phase_id) for p in rows):
        raise HTTPException(status_code=404, detail="Phase not found")
    if body.done is None and body.label is None:
        raise HTTPException(status_code=400, detail="Provide done and/or label")
    updated = rows
    if body.done is not None:
        updated = set_phase_done(updated, phase_id, body.done)
    if body.label is not None:
        try:
            updated = rename_phase(updated, phase_id, body.label)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    project.work_phases = updated
    project.progress = compute_progress_percent(updated)
    flag_modified(project, "work_phases")
    db.add(project)
    db.commit()
    db.refresh(project)
    return _project_phases_payload(project)


@router.delete("/projects/{project_id}/work-phases/{phase_id}")
def delete_project_work_phase(
    project_id: str,
    phase_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = _load_project(db, project_id)
    _assert_project_write(user, project)
    rows = normalize_project_phases(getattr(project, "work_phases", None))
    if not any(p["id"] == str(phase_id) for p in rows):
        raise HTTPException(status_code=404, detail="Phase not found")
    updated = remove_phase(rows, phase_id)
    project.work_phases = updated
    project.progress = compute_progress_percent(updated) if updated else project.progress
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
