"""Shift Job Types as SettingList `job_types` (Lookup lists / Create Shift dropdown)."""
from __future__ import annotations

from typing import List, Tuple

from sqlalchemy.orm import Session

from ..models.models import SettingItem, SettingList

LIST_NAME = "job_types"

# label == value (display name persisted on attendance.job_type)
DEFAULT_JOB_TYPES: List[Tuple[str, str]] = [
    ("General Labor", "General Labor"),
    ("Roofing", "Roofing"),
    ("Installation", "Installation"),
    ("Maintenance", "Maintenance"),
    ("Inspection", "Inspection"),
    ("Cleanup", "Cleanup"),
    ("Repair", "Repair"),
    ("Demolition", "Demolition"),
    ("Safety", "Safety"),
    ("Supervision", "Supervision"),
    ("Leak Investigation", "Leak Investigation"),
]


def ensure_job_types_list(db: Session) -> None:
    """Create job_types list if missing; seed default items that are not already present."""
    lst = db.query(SettingList).filter(SettingList.name == LIST_NAME).first()
    created_list = False
    if not lst:
        lst = SettingList(name=LIST_NAME)
        db.add(lst)
        db.flush()
        created_list = True

    items = db.query(SettingItem).filter(SettingItem.list_id == lst.id).all()
    existing = set()
    for i in items:
        for raw in (i.label, i.value):
            s = str(raw or "").strip().lower()
            if s:
                existing.add(s)

    added = False
    next_sort = max((int(i.sort_index or 0) for i in items), default=-1) + 1
    for label, value in DEFAULT_JOB_TYPES:
        key = label.strip().lower()
        if key in existing:
            continue
        db.add(
            SettingItem(
                list_id=lst.id,
                label=label,
                value=value,
                sort_index=next_sort,
            )
        )
        existing.add(key)
        next_sort += 1
        added = True

    if created_list or added:
        db.commit()
