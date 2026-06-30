"""Leak investigation helpers — division-based (R&M projects with Leak Investigations division)."""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import Project, SettingItem, SettingList
from .business_line import BUSINESS_LINE_REPAIRS_MAINTENANCE

LEAK_INVESTIGATION_DIVISION_LABEL = "Leak Investigations"


def get_leak_investigation_division_id(db: Session) -> Optional[uuid.UUID]:
    divisions_list = db.query(SettingList).filter(SettingList.name == "project_divisions").first()
    if not divisions_list:
        return None
    row = (
        db.query(SettingItem)
        .filter(
            SettingItem.list_id == divisions_list.id,
            SettingItem.label == LEAK_INVESTIGATION_DIVISION_LABEL,
            SettingItem.parent_id.is_(None),
        )
        .first()
    )
    return row.id if row else None


def _division_ids_on_project(p: Project) -> set[str]:
    raw = getattr(p, "project_division_ids", None) or []
    if not isinstance(raw, list):
        return set()
    return {str(x) for x in raw if x}


def project_has_leak_investigation_division(
    db: Session,
    p: Project,
    *,
    leak_div_id: Optional[uuid.UUID] = None,
) -> bool:
    lid = leak_div_id if leak_div_id is not None else get_leak_investigation_division_id(db)
    if lid is None:
        return False
    return str(lid) in _division_ids_on_project(p)


def project_is_leak_investigation(
    db: Session,
    p: Project,
    *,
    leak_div_id: Optional[uuid.UUID] = None,
) -> bool:
    return project_has_leak_investigation_division(db, p, leak_div_id=leak_div_id)


def assert_valid_related_leak_investigation_target(db: Session, leak: Project) -> None:
    if leak is None or getattr(leak, "deleted_at", None) is not None:
        raise HTTPException(status_code=400, detail="Related leak investigation not found")
    if getattr(leak, "business_line", None) != BUSINESS_LINE_REPAIRS_MAINTENANCE:
        raise HTTPException(status_code=400, detail="Invalid related leak investigation")
    if getattr(leak, "is_bidding", False):
        raise HTTPException(status_code=400, detail="Related leak investigation not found")
    if not project_is_leak_investigation(db, leak):
        raise HTTPException(status_code=400, detail="Related leak investigation not found")


def resolve_related_leak_investigation_uuid(db: Session, raw_rel) -> uuid.UUID:
    try:
        lid_uuid = uuid.UUID(str(raw_rel))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid related_leak_investigation_id")
    leak = db.query(Project).filter(Project.id == lid_uuid, Project.deleted_at.is_(None)).first()
    assert_valid_related_leak_investigation_target(db, leak)
    return lid_uuid
