"""Reusable brand logos stored as SettingList `organization_logos` (meta.file_object_id)."""
from __future__ import annotations

import uuid
from typing import Optional, List, Dict, Any

from sqlalchemy.orm import Session

from ..models.models import SettingList, SettingItem

LIST_NAME = "organization_logos"


def ensure_organization_logos_list(db: Session) -> None:
    """Create empty list if missing (idempotent)."""
    if db.query(SettingList).filter(SettingList.name == LIST_NAME).first():
        return
    db.add(SettingList(name=LIST_NAME))
    db.commit()


def _list_id(db: Session) -> Optional[uuid.UUID]:
    lst = db.query(SettingList).filter(SettingList.name == LIST_NAME).first()
    return lst.id if lst else None


def is_valid_organization_logo_setting_item(db: Session, item_id: uuid.UUID) -> bool:
    lid = _list_id(db)
    if not lid:
        return False
    it = db.query(SettingItem).filter(SettingItem.id == item_id, SettingItem.list_id == lid).first()
    if not it or not it.meta:
        return False
    fid = it.meta.get("file_object_id")
    if not fid:
        return False
    try:
        uuid.UUID(str(fid))
    except (ValueError, TypeError):
        return False
    return True


def resolve_organization_logo_file_id(db: Session, item_id: uuid.UUID) -> Optional[uuid.UUID]:
    if not is_valid_organization_logo_setting_item(db, item_id):
        return None
    it = db.query(SettingItem).filter(SettingItem.id == item_id).first()
    if not it or not it.meta:
        return None
    try:
        return uuid.UUID(str(it.meta["file_object_id"]))
    except (ValueError, TypeError, KeyError):
        return None


def list_organization_logo_presets_for_api(db: Session) -> List[Dict[str, Any]]:
    """Ordered presets for pickers (id, label, file_object_id)."""
    ensure_organization_logos_list(db)
    lid = _list_id(db)
    if not lid:
        return []
    rows = (
        db.query(SettingItem)
        .filter(SettingItem.list_id == lid)
        .order_by(SettingItem.sort_index.asc())
        .all()
    )
    out: List[Dict[str, Any]] = []
    for it in rows:
        meta = it.meta or {}
        fid = meta.get("file_object_id")
        if not fid:
            continue
        try:
            uuid.UUID(str(fid))
        except (ValueError, TypeError):
            continue
        out.append({"id": str(it.id), "label": it.label, "file_object_id": str(fid)})
    return out
