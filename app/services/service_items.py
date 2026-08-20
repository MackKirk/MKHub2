"""Clock / timesheet service items stored as SettingList `service_items`.

Used when logging hours (Regular now; overtime and other codes later).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from ..models.models import SettingItem, SettingList

LIST_NAME = "service_items"
DEFAULT_VALUE = "regular"
DEFAULT_LABEL = "Regular"


def ensure_service_items_list(db: Session) -> None:
    """Create the list and seed Regular if missing (idempotent)."""
    lst = db.query(SettingList).filter(SettingList.name == LIST_NAME).first()
    if not lst:
        lst = SettingList(name=LIST_NAME)
        db.add(lst)
        db.flush()

    items = db.query(SettingItem).filter(SettingItem.list_id == lst.id).all()
    values = {str(i.value or "").strip().lower() for i in items}
    labels = {str(i.label or "").strip().lower() for i in items}
    if DEFAULT_VALUE in values or DEFAULT_LABEL.lower() in labels:
        return

    db.add(
        SettingItem(
            list_id=lst.id,
            label=DEFAULT_LABEL,
            value=DEFAULT_VALUE,
            sort_index=0,
        )
    )
    db.commit()


def list_service_items(db: Session) -> List[Dict[str, Any]]:
    ensure_service_items_list(db)
    lst = db.query(SettingList).filter(SettingList.name == LIST_NAME).first()
    if not lst:
        return [
            {"id": DEFAULT_VALUE, "label": DEFAULT_LABEL, "value": DEFAULT_VALUE, "sort_index": 0}
        ]
    items = (
        db.query(SettingItem)
        .filter(SettingItem.list_id == lst.id)
        .order_by(SettingItem.sort_index.asc())
        .all()
    )
    if not items:
        return [
            {"id": DEFAULT_VALUE, "label": DEFAULT_LABEL, "value": DEFAULT_VALUE, "sort_index": 0}
        ]
    return [
        {
            "id": str(i.id),
            "label": i.label,
            "value": (i.value or i.label or "").strip() or DEFAULT_VALUE,
            "sort_index": i.sort_index,
        }
        for i in items
    ]


def resolve_service_item_value(db: Session, raw: Optional[str]) -> Optional[str]:
    """Return canonical item value, or None if raw is set but unknown."""
    ensure_service_items_list(db)
    s = (raw or "").strip()
    if not s:
        return DEFAULT_VALUE

    items = list_service_items(db)
    lowered = s.lower()
    for item in items:
        if (
            str(item["id"]).lower() == lowered
            or str(item["value"]).lower() == lowered
            or str(item["label"]).lower() == lowered
        ):
            return str(item["value"])
    return None
