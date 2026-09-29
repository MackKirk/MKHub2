"""Warranty Review: R&M readers can open Finished Production projects."""
from __future__ import annotations

from typing import Any

from ..auth.security import can_access_business_line
from ..models.models import User
from .business_line import BUSINESS_LINE_CONSTRUCTION, BUSINESS_LINE_REPAIRS_MAINTENANCE, normalize_business_line


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


def user_can_warranty_review_read(user: User, project: Any) -> bool:
    """R&M users may read a Finished Production project without Construction membership."""
    if not is_finished_construction_project(project):
        return False
    return can_access_business_line(user, BUSINESS_LINE_REPAIRS_MAINTENANCE)
