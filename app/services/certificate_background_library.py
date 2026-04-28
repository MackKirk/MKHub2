"""Certificate page backgrounds from SettingList `certificate_backgrounds` (meta.file_object_id)."""
from __future__ import annotations

import uuid
from typing import Optional, List, Dict, Any

from sqlalchemy.orm import Session

from ..models.models import SettingList, SettingItem

LIST_NAME = "certificate_backgrounds"


def ensure_certificate_backgrounds_list(db: Session) -> None:
    if db.query(SettingList).filter(SettingList.name == LIST_NAME).first():
        return
    db.add(SettingList(name=LIST_NAME))
    db.commit()


def _list_id(db: Session) -> Optional[uuid.UUID]:
    lst = db.query(SettingList).filter(SettingList.name == LIST_NAME).first()
    return lst.id if lst else None


def is_valid_certificate_background_setting_item(db: Session, item_id: uuid.UUID) -> bool:
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


def resolve_certificate_background_file_id(db: Session, item_id: uuid.UUID) -> Optional[uuid.UUID]:
    if not is_valid_certificate_background_setting_item(db, item_id):
        return None
    it = db.query(SettingItem).filter(SettingItem.id == item_id).first()
    if not it or not it.meta:
        return None
    try:
        return uuid.UUID(str(it.meta["file_object_id"]))
    except (ValueError, TypeError, KeyError):
        return None


def list_certificate_background_choices_for_api(db: Session) -> List[Dict[str, Any]]:
    """Presets from settings (key = setting item id for form state)."""
    ensure_certificate_backgrounds_list(db)
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
        iid = str(it.id)
        out.append(
            {
                "key": iid,
                "label": it.label,
                "preview_url": f"/training/certificate-background-library/{iid}",
                "source": "library",
            }
        )
    return out
