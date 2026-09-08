"""Clock / timesheet service items — compat shim over work_types.

Clock UIs still call GET /dispatch/attendance/service-items. Catalog SoT is work_types.
SettingList `service_items` is kept so Settings can add types; those rows are copied
into work_types on ensure.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from ..models.models import SettingItem, SettingList
from .work_types import (
    DEFAULT_CODE,
    DEFAULT_NAME,
    LIST_NAME,
    ensure_work_types,
    resolve_work_type,
    work_types_as_service_items,
)

DEFAULT_VALUE = DEFAULT_CODE
DEFAULT_LABEL = DEFAULT_NAME


def ensure_service_items_list(db: Session) -> None:
    """Create the SettingList shim and seed Regular; sync work_types."""
    lst = db.query(SettingList).filter(SettingList.name == LIST_NAME).first()
    if not lst:
        lst = SettingList(name=LIST_NAME)
        db.add(lst)
        db.flush()

    items = db.query(SettingItem).filter(SettingItem.list_id == lst.id).all()
    values = {str(i.value or "").strip().lower() for i in items}
    labels = {str(i.label or "").strip().lower() for i in items}
    if DEFAULT_VALUE not in values and DEFAULT_LABEL.lower() not in labels:
        db.add(
            SettingItem(
                list_id=lst.id,
                label=DEFAULT_LABEL,
                value=DEFAULT_VALUE,
                sort_index=0,
            )
        )
        db.flush()

    ensure_work_types(db)
    db.commit()


def list_service_items(db: Session) -> List[Dict[str, Any]]:
    ensure_service_items_list(db)
    return work_types_as_service_items(db)


def resolve_service_item_value(db: Session, raw: Optional[str]) -> Optional[str]:
    """Return canonical Work Type code, or None if raw is set but unknown."""
    ensure_service_items_list(db)
    s = (raw or "").strip()
    if not s:
        return DEFAULT_VALUE
    wt = resolve_work_type(db, s)
    if wt is None:
        return None
    return wt.code
