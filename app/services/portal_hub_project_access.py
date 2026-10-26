"""Portal project visibility: owner OR awarded for membership client_ids (no related-only)."""
from __future__ import annotations

import uuid
from typing import List, Literal, Optional, Sequence, Tuple

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models.models import Client, PortalHubMembership, PortalHubUser, Project
from .business_line import BUSINESS_LINE_CONSTRUCTION
from .project_customer_participation import (
    _json_array_contains_client_id,
    effective_awarded_related_client_ids,
)

Participation = Literal["owner", "awarded"]


def active_membership_client_ids(db: Session, portal_user: PortalHubUser) -> List[uuid.UUID]:
    rows = (
        db.query(PortalHubMembership.client_id)
        .filter(
            PortalHubMembership.portal_user_id == portal_user.id,
            PortalHubMembership.status == "active",
        )
        .all()
    )
    return [r[0] for r in rows if r[0]]


def owner_or_awarded_filter(client_ids: Sequence[uuid.UUID], dialect_name: str):
    """SQLAlchemy OR clause: project is owned by or awards any of client_ids."""
    if not client_ids:
        return None
    parts = []
    for cid in client_ids:
        cid_str = str(cid)
        parts.append(Project.client_id == cid)
        parts.append(Project.awarded_related_client_id == cid)
        parts.append(_json_array_contains_client_id(Project.awarded_related_client_ids, cid_str, dialect_name))
    return or_(*parts)


def resolve_participation(project: Project, client_ids: Sequence[uuid.UUID]) -> Optional[Participation]:
    """Prefer owner over awarded when both match (same client or multi-membership)."""
    id_set = {str(c) for c in client_ids}
    owner = getattr(project, "client_id", None)
    if owner and str(owner) in id_set:
        return "owner"
    awarded = effective_awarded_related_client_ids(project)
    for a in awarded:
        if a in id_set:
            return "awarded"
    return None


def membership_client_for_access(
    project: Project, client_ids: Sequence[uuid.UUID]
) -> Optional[uuid.UUID]:
    """Which membership client_id granted access (owner preferred)."""
    id_map = {str(c): c for c in client_ids}
    owner = getattr(project, "client_id", None)
    if owner and str(owner) in id_map:
        return id_map[str(owner)]
    for a in effective_awarded_related_client_ids(project):
        if a in id_map:
            return id_map[a]
    return None


def list_accessible_projects(db: Session, portal_user: PortalHubUser) -> List[Tuple[Project, Participation, uuid.UUID]]:
    client_ids = active_membership_client_ids(db, portal_user)
    if not client_ids:
        return []
    dialect = db.bind.dialect.name if db.bind is not None else "sqlite"
    clause = owner_or_awarded_filter(client_ids, dialect)
    if clause is None:
        return []
    projects = (
        db.query(Project)
        .filter(Project.deleted_at.is_(None), clause)
        .order_by(Project.created_at.desc())
        .all()
    )
    out: List[Tuple[Project, Participation, uuid.UUID]] = []
    for p in projects:
        part = resolve_participation(p, client_ids)
        mid = membership_client_for_access(p, client_ids)
        if part and mid:
            out.append((p, part, mid))
    return out


def get_accessible_project(
    db: Session, portal_user: PortalHubUser, project_id: uuid.UUID
) -> Optional[Tuple[Project, Participation, uuid.UUID]]:
    client_ids = active_membership_client_ids(db, portal_user)
    if not client_ids:
        return None
    p = db.query(Project).filter(Project.id == project_id, Project.deleted_at.is_(None)).first()
    if not p:
        return None
    part = resolve_participation(p, client_ids)
    mid = membership_client_for_access(p, client_ids)
    if not part or not mid:
        return None
    return p, part, mid


def user_can_access_project(db: Session, portal_user: PortalHubUser, project_id: uuid.UUID) -> bool:
    return get_accessible_project(db, portal_user, project_id) is not None


def user_has_client_membership(db: Session, portal_user: PortalHubUser, client_id: uuid.UUID) -> bool:
    return (
        db.query(PortalHubMembership)
        .filter(
            PortalHubMembership.portal_user_id == portal_user.id,
            PortalHubMembership.client_id == client_id,
            PortalHubMembership.status == "active",
        )
        .first()
        is not None
    )


def serialize_portal_project(
    p: Project,
    participation: Participation,
    membership_client_id: uuid.UUID,
    client_name: Optional[str] = None,
) -> dict:
    return {
        "id": str(p.id),
        "code": p.code,
        "name": p.name,
        "status_label": getattr(p, "status_label", None),
        "progress": getattr(p, "progress", None),
        "date_start": p.date_start.isoformat() if getattr(p, "date_start", None) else None,
        "date_eta": p.date_eta.isoformat() if getattr(p, "date_eta", None) else None,
        "date_end": p.date_end.isoformat() if getattr(p, "date_end", None) else None,
        "business_line": getattr(p, "business_line", None) or BUSINESS_LINE_CONSTRUCTION,
        "address": getattr(p, "address", None),
        "address_city": getattr(p, "address_city", None),
        "address_province": getattr(p, "address_province", None),
        "is_bidding": bool(getattr(p, "is_bidding", False)),
        "participation": participation,
        "client_id": str(p.client_id) if getattr(p, "client_id", None) else None,
        "membership_client_id": str(membership_client_id),
        "membership_client_name": client_name,
    }


def client_display_name(db: Session, client_id: uuid.UUID) -> Optional[str]:
    c = db.query(Client).filter(Client.id == client_id, Client.deleted_at.is_(None)).first()
    if not c:
        return None
    return (c.display_name or c.name or c.legal_name or "").strip() or None
