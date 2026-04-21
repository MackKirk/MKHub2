"""
Training matrix column definitions: stored under SettingList `training_matrix_slots`.
Each item: label = column title, value = stable slug (stored in employee_training_records.matrix_training_id),
meta.cell_kind ∈ {expiry, date_taken, text}.
"""
from __future__ import annotations

import re
from typing import List, Optional, Set, cast

from sqlalchemy.orm import Session

from ..models.models import SettingList, SettingItem
from ..training_matrix_catalog import (
    DEFAULT_MATRIX_TRAINING_CATALOG,
    MatrixTrainingDef,
    CellKind,
)

LIST_NAME = "training_matrix_slots"

_SLUG_RE = re.compile(r"^[a-z][a-z0-9_]*$")


def ensure_training_matrix_slots(db: Session) -> None:
    """Create list and seed defaults if empty (idempotent)."""
    lst = db.query(SettingList).filter(SettingList.name == LIST_NAME).first()
    if not lst:
        lst = SettingList(name=LIST_NAME)
        db.add(lst)
        db.flush()
    n = db.query(SettingItem).filter(SettingItem.list_id == lst.id).count()
    if n > 0:
        return
    for i, row in enumerate(DEFAULT_MATRIX_TRAINING_CATALOG):
        it = SettingItem(
            list_id=lst.id,
            label=row.label,
            value=row.id,
            sort_index=i,
            meta={"cell_kind": row.cell_kind},
        )
        db.add(it)
    db.commit()


def get_matrix_training_defs(db: Session) -> List[MatrixTrainingDef]:
    """Ordered matrix column definitions from settings, or baked-in defaults if list is missing/empty."""
    ensure_training_matrix_slots(db)
    lst = db.query(SettingList).filter(SettingList.name == LIST_NAME).first()
    if not lst:
        return list(DEFAULT_MATRIX_TRAINING_CATALOG)
    items = (
        db.query(SettingItem)
        .filter(SettingItem.list_id == lst.id)
        .order_by(SettingItem.sort_index.asc())
        .all()
    )
    if not items:
        return list(DEFAULT_MATRIX_TRAINING_CATALOG)
    out: List[MatrixTrainingDef] = []
    for it in items:
        slug = (it.value or "").strip()
        lab = (it.label or "").strip()
        if not slug and lab:
            slug = _fallback_slug_from_label(lab)
        if not slug:
            continue
        meta = it.meta if isinstance(it.meta, dict) else {}
        ck = meta.get("cell_kind") or "text"
        if ck not in ("expiry", "date_taken", "text"):
            ck = "text"
        if not lab:
            lab = slug
        out.append(MatrixTrainingDef(slug, lab, cast(CellKind, ck)))
    return out if out else list(DEFAULT_MATRIX_TRAINING_CATALOG)


def _fallback_slug_from_label(label: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", label.lower().strip())
    s = re.sub(r"_+", "_", s).strip("_")
    if not s:
        return ""
    if s[0].isdigit():
        s = "m_" + s
    return s


def matrix_training_ids_set(db: Session) -> Set[str]:
    return {d.id for d in get_matrix_training_defs(db)}


def is_valid_matrix_training_id(mid: Optional[str], db: Session) -> bool:
    if mid is None:
        return True
    s = str(mid).strip()
    if not s:
        return True
    return s in matrix_training_ids_set(db)


def validate_matrix_slot_slug(slug: str) -> None:
    from fastapi import HTTPException

    s = (slug or "").strip()
    if not s:
        raise HTTPException(status_code=400, detail="Matrix slot slug (value) is required.")
    if not _SLUG_RE.match(s):
        raise HTTPException(
            status_code=400,
            detail="Slug must start with a letter and contain only lowercase letters, digits, and underscores.",
        )


def validate_cell_kind(raw: Optional[str]) -> str:
    ck = (raw or "text").strip().lower()
    if ck not in ("expiry", "date_taken", "text"):
        return "text"
    return ck
