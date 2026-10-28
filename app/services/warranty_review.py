"""Warranty Review: R&M Projects & Opportunities readers can open Finished Production projects."""
from __future__ import annotations

from typing import Any

from ..auth.security import _has_permission, _user_is_admin
from ..models.models import User
from .business_line import BUSINESS_LINE_CONSTRUCTION, normalize_business_line


def finished_status_label(project: Any) -> str:
    return str(getattr(project, "status_label", None) or getattr(project, "status", None) or "").strip().lower()


def is_finished_construction_project(project: Any) -> bool:
    if project is None:
        return False
    if normalize_business_line(getattr(project, "business_line", None)) != BUSINESS_LINE_CONSTRUCTION:
        return False
    if bool(getattr(project, "is_bidding", False)):
        return False
    return finished_status_label(project) == "finished"


def user_has_rm_projects_opportunities_permission(user: User) -> bool:
    """
    Same gate as the R&M "Projects & Opportunities" permission row
    (business:rm:projects:read / write) — not any residual section grant.
    """
    if _user_is_admin(user):
        return True
    return _has_permission(user, "business:rm:projects:read") or _has_permission(
        user, "business:rm:projects:write"
    )


def user_can_warranty_review_read(user: User, project: Any) -> bool:
    """R&M Projects & Opportunities users may read a Finished Production project without Construction membership."""
    if not is_finished_construction_project(project):
        return False
    return user_has_rm_projects_opportunities_permission(user)
