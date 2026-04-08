"""
Resolve how a client participates in projects for customer dashboard rollups.

PostgreSQL: jsonb containment via cast(column, JSONB).contains([uuid]) -> @> operator.
SQLite: generic JSON .contains() (LIKE on serialized JSON).
"""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Literal, Optional, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import cast, or_

from ..models.models import Project
from ..services.business_line import BUSINESS_LINE_CONSTRUCTION

Participation = Literal["owner", "awarded_related"]


def effective_awarded_related_client_ids(p: Project) -> List[str]:
    """Match app.routes.projects._effective_awarded_related_client_ids (avoid circular import)."""
    out: List[str] = []
    raw = getattr(p, "awarded_related_client_ids", None)
    if isinstance(raw, list):
        for x in raw:
            if x is None:
                continue
            s = str(x).strip()
            if s:
                out.append(s)
    seen: set[str] = set()
    uniq: List[str] = []
    for s in out:
        if s not in seen:
            seen.add(s)
            uniq.append(s)
    if uniq:
        return uniq
    leg = getattr(p, "awarded_related_client_id", None)
    if leg:
        return [str(leg)]
    return []


def _json_array_contains_client_id(column, client_id_str: str, dialect_name: str) -> Any:
    """
    PostgreSQL stores these columns as jsonb; SQLAlchemy JSON.contains() compiles to LIKE there,
    which is invalid (jsonb ~~ text). Cast to JSONB so .contains() uses the @> operator.
    SQLite keeps the generic JSON contains (LIKE on serialized JSON).
    """
    if dialect_name == "postgresql":
        from sqlalchemy.dialects.postgresql import JSONB

        return cast(column, JSONB).contains([client_id_str])
    return column.contains([client_id_str])


def participation_query_filter(client_uuid: uuid.UUID, dialect_name: str) -> Any:
    """Projects visible for participation endpoint: owner, related (non-owner), or awarded."""
    cid_str = str(client_uuid)
    parts = [
        Project.client_id == client_uuid,
        _json_array_contains_client_id(Project.related_client_ids, cid_str, dialect_name),
        Project.awarded_related_client_id == client_uuid,
        _json_array_contains_client_id(Project.awarded_related_client_ids, cid_str, dialect_name),
    ]
    return or_(*parts)


def serialize_list_row(p: Project, participation: Participation) -> Dict[str, Any]:
    """Same shape as list_projects in projects.py (+ participation)."""
    return {
        "id": str(p.id),
        "code": p.code,
        "name": p.name,
        "slug": p.slug,
        "client_id": str(p.client_id) if getattr(p, "client_id", None) else None,
        "created_at": p.created_at.isoformat() if getattr(p, "created_at", None) else None,
        "date_start": p.date_start.isoformat() if getattr(p, "date_start", None) else None,
        "date_eta": getattr(p, "date_eta", None).isoformat() if getattr(p, "date_eta", None) else None,
        "date_awarded": getattr(p, "date_awarded", None).isoformat() if getattr(p, "date_awarded", None) else None,
        "date_end": p.date_end.isoformat() if getattr(p, "date_end", None) else None,
        "progress": getattr(p, "progress", None),
        "status_label": getattr(p, "status_label", None),
        "status_changed_at": getattr(p, "status_changed_at", None).isoformat()
        if getattr(p, "status_changed_at", None)
        else None,
        "division_ids": getattr(p, "division_ids", None),
        "project_division_ids": getattr(p, "project_division_ids", None),
        "project_division_percentages": getattr(p, "project_division_percentages", None),
        "is_bidding": getattr(p, "is_bidding", False),
        "business_line": getattr(p, "business_line", None) or BUSINESS_LINE_CONSTRUCTION,
        "estimator_id": str(getattr(p, "estimator_id", None)) if getattr(p, "estimator_id", None) else None,
        "estimator_ids": [str(eid) for eid in (getattr(p, "estimator_ids", None) or [])]
        if getattr(p, "estimator_ids", None)
        else ([str(getattr(p, "estimator_id", None))] if getattr(p, "estimator_id", None) else []),
        "project_admin_id": str(getattr(p, "project_admin_id", None)) if getattr(p, "project_admin_id", None) else None,
        "participation": participation,
    }


def build_participation_payload(
    db: Session,
    client_uuid: uuid.UUID,
    bl_filter: Any,
    limit: int = 400,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Returns (rollup, related_memberships).
    rollup: owner OR awarded_related only.
    related_memberships: related_client_ids includes client, not owner; each dict has is_awarded_related.
    """
    cid_str = str(client_uuid)
    dialect_name = db.get_bind().dialect.name
    q = (
        db.query(Project)
        .filter(Project.deleted_at.is_(None))
        .filter(bl_filter)
        .filter(participation_query_filter(client_uuid, dialect_name))
        .order_by(Project.created_at.desc())
        .limit(limit)
    )
    rows: List[Project] = q.all()

    rollup: List[Dict[str, Any]] = []
    related_memberships: List[Dict[str, Any]] = []
    seen_rollup: set[str] = set()
    seen_related: set[str] = set()

    for p in rows:
        pid = str(p.id)
        is_owner = p.client_id == client_uuid
        aw = effective_awarded_related_client_ids(p)
        is_awarded = cid_str in aw

        if is_owner:
            if pid not in seen_rollup:
                seen_rollup.add(pid)
                rollup.append(serialize_list_row(p, "owner"))
        elif is_awarded:
            if pid not in seen_rollup:
                seen_rollup.add(pid)
                rollup.append(serialize_list_row(p, "awarded_related"))

        # related_memberships: in related_client_ids, not owner
        rel_raw = getattr(p, "related_client_ids", None) or []
        in_related = False
        if isinstance(rel_raw, list):
            in_related = cid_str in {str(x).strip() for x in rel_raw if x is not None}
        if in_related and not is_owner:
            if pid not in seen_related:
                seen_related.add(pid)
                related_memberships.append(
                    {
                        "id": pid,
                        "code": p.code,
                        "name": p.name,
                        "is_bidding": bool(getattr(p, "is_bidding", False)),
                        "is_awarded_related": is_awarded,
                    }
                )

    return rollup, related_memberships
