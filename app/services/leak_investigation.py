"""Leak investigation helpers — division-based (R&M projects with Leak Investigations division)."""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.orm import Session

from ..models.models import Project, SettingItem, SettingList

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