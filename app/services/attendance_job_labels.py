"""Resolve attendance job_type / reason_text markers to human-readable labels."""
from __future__ import annotations

import uuid
from typing import Dict, Iterable, List, Optional, Tuple, Union

from sqlalchemy.orm import Session

from ..models.models import Project

PREDEFINED_JOBS_DICT: Dict[str, str] = {
    "0": "No Project Assigned",
    "37": "Repairs",
    "47": "Shop",
    "53": "YPK Developments",
    "136": "Stat Holiday",
}


def parse_job_type_from_reason_text(reason_text: Optional[str]) -> Optional[str]:
    if not reason_text or not reason_text.startswith("JOB_TYPE:"):
        return None
    marker = reason_text.split("|", 1)[0]
    job_type = marker.replace("JOB_TYPE:", "", 1).strip()
    return job_type or None


def format_project_job_label(project: Union[Project, object]) -> str:
    name = (getattr(project, "name", None) or "").strip()
    code = (getattr(project, "code", None) or "").strip()
    if name and code:
        return f"{name} ({code})"
    return name or code or "Unknown"


def _is_valid_uuid(value: str) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, TypeError, AttributeError):
        return False


def collect_project_ids_from_job_types(job_types: Iterable[Optional[str]]) -> List[uuid.UUID]:
    ids: List[uuid.UUID] = []
    seen = set()
    for job_type in job_types:
        if not job_type or job_type in PREDEFINED_JOBS_DICT:
            continue
        if not _is_valid_uuid(job_type):
            continue
        uid = uuid.UUID(str(job_type))
        key = str(uid)
        if key in seen:
            continue
        seen.add(key)
        ids.append(uid)
    return ids


def load_projects_by_id(db: Session, project_ids: Iterable[uuid.UUID]) -> Dict[str, Project]:
    ids = list(project_ids)
    if not ids:
        return {}
    rows = (
        db.query(Project)
        .filter(Project.id.in_(ids), Project.deleted_at.is_(None))
        .all()
    )
    return {str(p.id): p for p in rows}


def resolve_job_label(
    db: Session,
    job_type: Optional[str],
    *,
    project_name: Optional[str] = None,
    projects_by_id: Optional[Dict[str, Project]] = None,
) -> Tuple[str, Optional[str]]:
    """Return (job_name, project_name) for display."""
    if not job_type:
        return project_name or "Unknown", project_name

    predefined = PREDEFINED_JOBS_DICT.get(job_type)
    if predefined:
        return predefined, project_name

    if _is_valid_uuid(job_type):
        project = None
        if projects_by_id is not None:
            project = projects_by_id.get(str(job_type))
        if project is None:
            try:
                project = (
                    db.query(Project)
                    .filter(Project.id == uuid.UUID(str(job_type)), Project.deleted_at.is_(None))
                    .first()
                )
            except (ValueError, TypeError):
                project = None
        if project is not None:
            resolved_name = format_project_job_label(project)
            return resolved_name, getattr(project, "name", None) or resolved_name

    if project_name:
        return project_name, project_name

    return "Unknown", project_name
