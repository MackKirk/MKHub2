"""Authorization helpers for Fieldwork (project-scoped, Construction + R&M)."""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..auth.security import (
    _user_is_admin,
    can_access_business_line,
    user_has_fieldwork_permission,
)
from ..models.models import Project, User
from ..services.business_line import (
    BUSINESS_LINE_CONSTRUCTION,
    BUSINESS_LINE_REPAIRS_MAINTENANCE,
    VALID_BUSINESS_LINES,
    normalize_business_line,
)
from ..services.project_visibility import is_project_visible_to_user

FieldworkAction = Literal["read", "write", "review"]


def assert_fieldwork_project(
    db: Session,
    user: User,
    project: Project,
    action: FieldworkAction,
) -> None:
    """Require Construction/R&M project, visibility, and line-scoped fieldwork permission."""
    if _user_is_admin(user):
        if getattr(project, "deleted_at", None) is not None:
            raise HTTPException(status_code=404, detail="Project not found")
        return

    if getattr(project, "deleted_at", None) is not None:
        raise HTTPException(status_code=404, detail="Project not found")

    line = normalize_business_line(getattr(project, "business_line", None))
    if line not in VALID_BUSINESS_LINES:
        raise HTTPException(status_code=400, detail="Fieldwork is not available on this project")

    if not can_access_business_line(user, line):
        raise HTTPException(status_code=403, detail="No access to this business line")

    if not is_project_visible_to_user(db, user, project):
        raise HTTPException(status_code=403, detail="Project not visible to user")

    if not user_has_fieldwork_permission(user, action, line):
        raise HTTPException(status_code=403, detail=f"Missing fieldwork:{action} permission")


def assert_rm_fieldwork_project(
    db: Session,
    user: User,
    project: Project,
    action: FieldworkAction,
) -> None:
    """Backward-compatible alias for assert_fieldwork_project."""
    assert_fieldwork_project(db, user, project, action)


def fieldwork_lines_for_user(user: User, action: FieldworkAction = "read") -> list[str]:
    """Business lines the user may use for fieldwork inbox / nav scoping."""
    if _user_is_admin(user):
        return [BUSINESS_LINE_CONSTRUCTION, BUSINESS_LINE_REPAIRS_MAINTENANCE]
    out: list[str] = []
    for line in (BUSINESS_LINE_CONSTRUCTION, BUSINESS_LINE_REPAIRS_MAINTENANCE):
        if user_has_fieldwork_permission(user, action, line):
            out.append(line)
    return out


def parse_optional_business_line(raw: Optional[str]) -> Optional[str]:
    if raw is None or not str(raw).strip():
        return None
    line = normalize_business_line(raw)
    if line not in VALID_BUSINESS_LINES:
        raise HTTPException(status_code=400, detail="Invalid business_line")
    return line
