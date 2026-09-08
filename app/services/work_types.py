"""Work Type catalog (operational activity / project costing).

Phase 1: dedicated table, Regular is default. SettingList `service_items` remains a
compat shim so Settings HR can add types (Crane, Electrical) without new screens.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from ..models.models import SettingItem, SettingList, WorkType

DEFAULT_CODE = "regular"
DEFAULT_NAME = "Regular"
LIST_NAME = "service_items"


def ensure_work_types(db: Session) -> WorkType:
    """Seed Regular and copy any SettingList service_items. Returns the default row."""
    default = db.query(WorkType).filter(WorkType.code == DEFAULT_CODE).first()
    if not default:
        default = db.query(WorkType).filter(WorkType.is_default.is_(True)).first()
    if not default:
        default = WorkType(
            code=DEFAULT_CODE,
            name=DEFAULT_NAME,
            is_active=True,
            is_default=True,
            sort_index=0,
        )
        db.add(default)
        db.flush()

    _sync_from_setting_items(db)
    db.flush()
    return db.query(WorkType).filter(WorkType.is_default.is_(True)).first() or default


def get_default_work_type(db: Session) -> WorkType:
    return ensure_work_types(db)


def list_work_types(db: Session, *, active_only: bool = True) -> List[WorkType]:
    ensure_work_types(db)
    q = db.query(WorkType)
    if active_only:
        q = q.filter(WorkType.is_active.is_(True))
    return q.order_by(WorkType.sort_index.asc(), WorkType.name.asc()).all()


def work_types_as_service_items(db: Session) -> List[Dict[str, Any]]:
    """Shape expected by GET /dispatch/attendance/service-items and clock UIs."""
    rows = list_work_types(db, active_only=True)
    if not rows:
        return [
            {
                "id": DEFAULT_CODE,
                "label": DEFAULT_NAME,
                "value": DEFAULT_CODE,
                "sort_index": 0,
            }
        ]
    return [
        {
            "id": str(wt.id),
            "label": wt.name,
            "value": wt.code,
            "sort_index": wt.sort_index,
        }
        for wt in rows
    ]


def resolve_work_type(db: Session, raw: Optional[str]) -> Optional[WorkType]:
    """Resolve id / code / name. Empty raw → default Regular. Unknown → None."""
    ensure_work_types(db)
    s = (raw or "").strip()
    if not s:
        return get_default_work_type(db)

    lowered = s.lower()
    rows = db.query(WorkType).all()
    for wt in rows:
        if (
            str(wt.id).lower() == lowered
            or str(wt.code or "").lower() == lowered
            or str(wt.name or "").lower() == lowered
        ):
            return wt
    return None


def _sync_from_setting_items(db: Session) -> None:
    lst = db.query(SettingList).filter(SettingList.name == LIST_NAME).first()
    if not lst:
        return
    items = (
        db.query(SettingItem)
        .filter(SettingItem.list_id == lst.id)
        .order_by(SettingItem.sort_index.asc())
        .all()
    )
    existing = {str(w.code or "").strip().lower(): w for w in db.query(WorkType).all()}
    for item in items:
        code = (item.value or item.label or "").strip().lower() or DEFAULT_CODE
        name = (item.label or item.value or DEFAULT_NAME).strip() or DEFAULT_NAME
        row = existing.get(code)
        if row:
            if not row.name:
                row.name = name
            continue
        is_default = code == DEFAULT_CODE or name.lower() == DEFAULT_NAME.lower()
        wt = WorkType(
            code=code,
            name=name,
            is_active=True,
            is_default=is_default and not any(w.is_default for w in existing.values()),
            sort_index=item.sort_index or 0,
        )
        db.add(wt)
        existing[code] = wt


def sync_work_type_from_setting_item(
    db: Session,
    *,
    label: str,
    value: Optional[str],
    sort_index: int = 0,
    deactivate: bool = False,
    previous_code: Optional[str] = None,
) -> None:
    code = (value or label or "").strip().lower() or DEFAULT_CODE
    name = (label or value or DEFAULT_NAME).strip() or DEFAULT_NAME
    row = None
    if previous_code:
        row = db.query(WorkType).filter(WorkType.code == previous_code.strip().lower()).first()
    if row is None:
        row = db.query(WorkType).filter(WorkType.code == code).first()
    if deactivate:
        if row and not row.is_default:
            row.is_active = False
        return
    if row is None:
        row = WorkType(
            code=code,
            name=name,
            is_active=True,
            is_default=code == DEFAULT_CODE,
            sort_index=sort_index,
        )
        db.add(row)
        return
    row.code = code
    row.name = name
    row.sort_index = sort_index
    row.is_active = True
