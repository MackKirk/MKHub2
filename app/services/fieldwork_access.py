"""Authorization helpers for R&M Fieldwork (project-scoped)."""
from __future__ import annotations

from typing import Literal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..auth.security import (
    _user_is_admin,
    can_access_business_line,
    user_has_any_rm_fieldwork_permission,
)
from ..models.models import Project, User
from ..services.business_line import BUSINESS_LINE_REPAIRS_MAINTENANCE
from ..services.project_visibility import is_project_visible_to_user

FieldworkAction = Literal["read", "write", "review"]


def assert_rm_fieldwork_project(
    db: Session,
    user: User,
    project: Project,
    action: FieldworkAction,
) -> None:
    """Require R&M project, visibility, and fieldwork permission for the action."""
    if _user_is_admin(user):
        if getattr(project, "deleted_at", None) is not None:
            raise HTTPException(status_code=404, detail="Project not found")
        return

    if getattr(project, "deleted_at", None) is not None:
        raise HTTPException(status_code=404, detail="Project not found")

    line = getattr(project, "business_line", None)
    if line != BUSINESS_LINE_REPAIRS_MAINTENANCE:
        raise HTTPException(status_code=400, detail="Fieldwork is only available on R&M projects")

    if not can_access_business_line(user, BUSINESS_LINE_REPAIRS_MAINTENANCE):
        raise HTTPException(status_code=403, detail="No access to R&M business line")

    if not is_project_visible_to_user(db, user, project):
        raise HTTPException(status_code=403, detail="Project not visible to user")

    if not user_has_any_rm_fieldwork_permission(user, action):
        raise HTTPException(status_code=403, detail=f"Missing fieldwork:{action} permission")
