from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import String, cast, exists, literal, or_, select
from sqlalchemy.orm import Session

from ..auth.security import (
    _has_permission,
    _has_project_feature_permission,
    can_access_business_line,
)
from ..models.models import Project, ProjectMember, User
from .business_line import (
    BUSINESS_LINE_CONSTRUCTION,
    BUSINESS_LINE_REPAIRS_MAINTENANCE,
    normalize_business_line,
)

# Tabs/sections that count as "can usefully open this project" (Overview alone does not).
PROJECT_SECTION_FEATURES: tuple[str, ...] = (
    "reports",
    "workload",
    "timesheet",
    "files",
    "documents",
    "proposal",
    "costs",
    "warranties",
    "orders",
    "safety",
)


def _is_admin(user: User) -> bool:
    return any((getattr(r, "name", None) or "").lower() == "admin" for r in user.roles)


def _legacy_section_read(user: User, feature: str) -> bool:
    """Match frontend hasLegacyProjectFeaturePermission for read (write implies read)."""
    if feature == "costs":
        return bool(
            _has_permission(user, "business:projects:costs:read")
            or _has_permission(user, "business:projects:costs:write")
            or _has_permission(user, "business:projects:estimate:read")
            or _has_permission(user, "business:projects:estimate:write")
        )
    return bool(
        _has_permission(user, f"business:projects:{feature}:read")
        or _has_permission(user, f"business:projects:{feature}:write")
    )


def user_has_any_project_section_permission(user: User, project: Project) -> bool:
    """
    True when the user may open the project detail UI.

    Membership / estimator / onsite lead / read:all only grant *candidate* visibility.
    Listing and opening require at least one section/tab permission (files, reports, …).
    Shift assignment never grants this.
    """
    if _is_admin(user):
        return True
    line = getattr(project, "business_line", None)
    for feature in PROJECT_SECTION_FEATURES:
        if _has_project_feature_permission(user, line, feature, "read"):
            return True
        if _legacy_section_read(user, feature):
            return True
    return False


def filter_projects_with_section_access(user: User, projects: list) -> list:
    """Drop projects the user cannot open (no section/tab permissions)."""
    if _is_admin(user):
        return list(projects)
    return [p for p in projects if user_has_any_project_section_permission(user, p)]


def can_view_all_projects_in_line(user: User, line: Optional[str]) -> bool:
    if _is_admin(user):
        return True
    ln = normalize_business_line(line)
    if ln == BUSINESS_LINE_CONSTRUCTION:
        return _has_permission(user, "business:construction:projects:read:all")
    if ln == BUSINESS_LINE_REPAIRS_MAINTENANCE:
        return _has_permission(user, "business:rm:projects:read:all")
    return False


def can_manage_project_members(user: User, line: Optional[str] = None) -> bool:
    if _is_admin(user):
        return True
    if _has_permission(user, "business:projects:members:write"):
        return True
    ln = normalize_business_line(line)
    if ln == BUSINESS_LINE_REPAIRS_MAINTENANCE:
        return _has_permission(user, "business:rm:projects:members:write")
    return _has_permission(user, "business:construction:projects:members:write")


def _legacy_related_clause(user_id: uuid.UUID):
    user_id_str = str(user_id)
    return or_(
        Project.estimator_id == user_id,
        Project.project_admin_id == user_id,
        Project.onsite_lead_id == user_id,
        cast(Project.estimator_ids, String).like(f"%{user_id_str}%"),
        cast(Project.division_onsite_leads, String).like(f"%{user_id_str}%"),
    )


def _membership_exists_clause(user_id: uuid.UUID):
    return exists(
        select(ProjectMember.id).where(
            ProjectMember.project_id == Project.id,
            ProjectMember.user_id == user_id,
        )
    )


def project_related_to_user_clause(user_id: uuid.UUID, *, include_legacy: bool = True):
    acl_clause = or_(
        Project.created_by_user_id == user_id,
        _membership_exists_clause(user_id),
    )
    if include_legacy:
        return or_(acl_clause, _legacy_related_clause(user_id))
    return acl_clause


def project_visibility_clause_for_user(user: User):
    """
    Query-level visibility clause. Intended to be combined with business-line filters.

    A project is visible when the user either:
    - has explicit "read all" permission for that project's business line, or
    - is related to the project by ACL (creator/member), with legacy fields included for rollout safety.
    """
    if _is_admin(user):
        return literal(True)

    clauses = [project_related_to_user_clause(user.id, include_legacy=True)]
    if can_view_all_projects_in_line(user, BUSINESS_LINE_CONSTRUCTION):
        clauses.append(Project.business_line == BUSINESS_LINE_CONSTRUCTION)
    if can_view_all_projects_in_line(user, BUSINESS_LINE_REPAIRS_MAINTENANCE):
        clauses.append(Project.business_line == BUSINESS_LINE_REPAIRS_MAINTENANCE)
    return or_(*clauses)


def is_project_visible_to_user(db: Session, user: User, project: Project) -> bool:
    """
    Detail + list semantics: line access, related/read:all, AND at least one section tab.

    Being a project member (or estimator/onsite lead) is not enough without section permissions.
    """
    if _is_admin(user):
        return True
    if not can_access_business_line(user, getattr(project, "business_line", None)):
        return False

    related_or_all = False
    if can_view_all_projects_in_line(user, getattr(project, "business_line", None)):
        related_or_all = True
    elif getattr(project, "created_by_user_id", None) == user.id:
        related_or_all = True
    else:
        rel = (
            db.query(ProjectMember.id)
            .filter(ProjectMember.project_id == project.id, ProjectMember.user_id == user.id)
            .first()
        )
        if rel:
            related_or_all = True
        else:
            user_id_str = str(user.id)
            legacy_strings = (
                str(getattr(project, "estimator_ids", None) or ""),
                str(getattr(project, "division_onsite_leads", None) or ""),
            )
            related_or_all = bool(
                getattr(project, "estimator_id", None) == user.id
                or getattr(project, "project_admin_id", None) == user.id
                or getattr(project, "onsite_lead_id", None) == user.id
                or any(user_id_str in raw for raw in legacy_strings)
            )

    if not related_or_all:
        return False
    return user_has_any_project_section_permission(user, project)
