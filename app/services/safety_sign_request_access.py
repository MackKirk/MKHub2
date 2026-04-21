"""Safety inspection sign requests — allow external signers without full project/safety permissions."""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..auth.security import _has_permission
from ..models.models import ProjectSafetyInspection, ProjectSafetyInspectionSignRequest, User


def assert_safety_read_or_pending_sign_session(
    user: User,
    db: Session,
    *,
    sign_project_id: Optional[str],
    sign_inspection_id: Optional[str],
) -> None:
    """Same as business:projects:safety:read, or this user was invited to sign this inspection (pending or already signed)."""
    if _has_permission(user, "business:projects:safety:read"):
        return
    if sign_project_id and sign_inspection_id and user_has_sign_request_for_inspection(
        db, user, sign_project_id, sign_inspection_id
    ):
        return
    raise HTTPException(status_code=403, detail="Forbidden")


def user_has_sign_request_for_inspection(
    db: Session, user: User, project_id: str, inspection_id: str
) -> bool:
    """True if this user has a sign-request row for this inspection (pending or signed — for read-only return visits)."""
    try:
        pid = uuid.UUID(str(project_id))
        iid = uuid.UUID(str(inspection_id))
    except Exception:
        return False
    row = (
        db.query(ProjectSafetyInspectionSignRequest)
        .join(
            ProjectSafetyInspection,
            ProjectSafetyInspection.id == ProjectSafetyInspectionSignRequest.inspection_id,
        )
        .filter(
            ProjectSafetyInspection.project_id == pid,
            ProjectSafetyInspectionSignRequest.inspection_id == iid,
            ProjectSafetyInspectionSignRequest.signer_user_id == user.id,
        )
        .first()
    )
    return row is not None


def user_has_pending_safety_sign_request_for_inspection(
    db: Session, user: User, project_id: str, inspection_id: str
) -> bool:
    try:
        pid = uuid.UUID(str(project_id))
        iid = uuid.UUID(str(inspection_id))
    except Exception:
        return False
    row = (
        db.query(ProjectSafetyInspectionSignRequest)
        .join(
            ProjectSafetyInspection,
            ProjectSafetyInspection.id == ProjectSafetyInspectionSignRequest.inspection_id,
        )
        .filter(
            ProjectSafetyInspection.project_id == pid,
            ProjectSafetyInspectionSignRequest.inspection_id == iid,
            ProjectSafetyInspectionSignRequest.signer_user_id == user.id,
            ProjectSafetyInspectionSignRequest.status == "pending",
        )
        .first()
    )
    return row is not None


def user_has_any_sign_request_on_project(db: Session, user: User, project_id: str) -> bool:
    """Any sign request for this user on this project (pending or signed) — e.g. form file thumbnails after signing."""
    try:
        pid = uuid.UUID(str(project_id))
    except Exception:
        return False
    row = (
        db.query(ProjectSafetyInspectionSignRequest)
        .join(
            ProjectSafetyInspection,
            ProjectSafetyInspection.id == ProjectSafetyInspectionSignRequest.inspection_id,
        )
        .filter(
            ProjectSafetyInspection.project_id == pid,
            ProjectSafetyInspectionSignRequest.signer_user_id == user.id,
        )
        .first()
    )
    return row is not None
