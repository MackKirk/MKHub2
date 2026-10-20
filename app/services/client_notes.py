"""Client Notes / Communication Log helpers."""

from __future__ import annotations

import uuid
from typing import Any, Optional

from sqlalchemy.orm import Session

# Categories that belong on the customer communication log.
# Project notes in these categories are stored as ClientNote (not ProjectReport).
CLIENT_COMMUNICATION_CATEGORY_IDS = frozenset(
    {
        "client-communication-log",
        "client-request",
        "client-contact-update",
        "prospecting",
        "legal-action",
        "warranty-contact",
        "preventive-maintenance",
    }
)


def is_client_communication_category(category_id: Optional[str]) -> bool:
    if not category_id:
        return False
    return str(category_id).strip().lower() in CLIENT_COMMUNICATION_CATEGORY_IDS


def resolve_user_display_names(db: Session, user_ids: list) -> dict[str, str]:
    """Batch-resolve user ids to display names."""
    if not user_ids:
        return {}
    from ..models.models import EmployeeProfile, User

    unique_ids: list[uuid.UUID] = []
    for raw in user_ids:
        if not raw:
            continue
        try:
            unique_ids.append(uuid.UUID(str(raw)))
        except (ValueError, TypeError):
            continue
    if not unique_ids:
        return {}
    rows = (
        db.query(User, EmployeeProfile)
        .outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)
        .filter(User.id.in_(unique_ids))
        .all()
    )
    out: dict[str, str] = {}
    for u, ep in rows:
        name = (getattr(ep, "preferred_name", None) or "").strip() if ep else ""
        if not name and ep:
            first = (getattr(ep, "first_name", None) or "").strip()
            last = (getattr(ep, "last_name", None) or "").strip()
            name = " ".join(x for x in (first, last) if x)
        if not name:
            name = u.username
        out[str(u.id)] = name
    return out


def serialize_client_note(
    row: Any,
    *,
    names_by_id: Optional[dict[str, str]] = None,
    project_code: Optional[str] = None,
    project_name: Optional[str] = None,
    include_project_fields: bool = True,
) -> dict:
    created_by = getattr(row, "created_by", None)
    project_id = getattr(row, "project_id", None)
    client_id = getattr(row, "client_id", None)
    out = {
        "id": str(row.id),
        "source": "client_note",
        "client_id": str(client_id) if client_id else None,
        "title": getattr(row, "title", None),
        "category_id": getattr(row, "category_id", None),
        "description": getattr(row, "description", None),
        "images": getattr(row, "images", None),
        "status": getattr(row, "status", None),
        "created_at": getattr(row, "created_at", None).isoformat()
        if getattr(row, "created_at", None)
        else None,
        "updated_at": getattr(row, "updated_at", None).isoformat()
        if getattr(row, "updated_at", None)
        else None,
        "created_by": str(created_by) if created_by else None,
        "created_by_name": (names_by_id or {}).get(str(created_by)) if created_by else None,
        # Project-report shape compatibility (financial fields unused for client notes)
        "financial_value": None,
        "financial_type": None,
        "estimate_data": None,
        "approval_status": None,
        "approved_by": None,
        "approved_at": None,
        "division_id": None,
    }
    if include_project_fields:
        out["project_id"] = str(project_id) if project_id else None
        out["project_code"] = project_code
        out["project_name"] = project_name
    return out
