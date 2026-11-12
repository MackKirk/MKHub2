"""Fieldwork phrase catalogs (Form Custom Lists) and server-side snapshot resolution."""
from __future__ import annotations

import uuid
from typing import Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import FormCustomList, FormCustomListItem
from .form_engine import (
    FIELDWORK_PHOTO_ENTRY_OBSERVATION,
    FIELDWORK_PHOTO_ENTRY_WORK_PERFORMED,
    LIST_DOMAIN_FIELDWORK,
    normalized_list_domain,
)

# Canonical list names (seeded empty for R&M to fill).
OBSERVED_CONDITIONS_LIST_NAME = "R&M Observed Conditions"
WORK_PERFORMED_LIST_NAME = "R&M Work Performed"

ENTRY_TYPE_TO_LIST_NAME = {
    FIELDWORK_PHOTO_ENTRY_OBSERVATION: OBSERVED_CONDITIONS_LIST_NAME,
    FIELDWORK_PHOTO_ENTRY_WORK_PERFORMED: WORK_PERFORMED_LIST_NAME,
}


def path_label_for_item(db: Session, item: FormCustomListItem) -> str:
    parts: list[str] = []
    cur: Optional[FormCustomListItem] = item
    guard = 0
    while cur is not None and guard < 5:
        parts.insert(0, (cur.name or "").strip())
        if not cur.parent_id:
            break
        cur = db.query(FormCustomListItem).filter(FormCustomListItem.id == cur.parent_id).first()
        guard += 1
    return " › ".join(p for p in parts if p)


def ensure_fieldwork_phrase_lists(db: Session, *, commit: bool = False) -> dict:
    """Idempotent seed of the two empty Fieldwork phrase lists. Returns {entry_type: list_id}.

    Does not commit by default so callers mid-transaction (photo create / submit) keep
    row locks. Startup / admin bootstrap should pass commit=True.
    """
    out: dict = {}
    for entry_type, name in ENTRY_TYPE_TO_LIST_NAME.items():
        row = (
            db.query(FormCustomList)
            .filter(
                FormCustomList.name == name,
                FormCustomList.domain == LIST_DOMAIN_FIELDWORK,
            )
            .first()
        )
        if not row:
            row = FormCustomList(
                name=name,
                description=(
                    "Observed site conditions for R&M Fieldwork photo classification."
                    if entry_type == FIELDWORK_PHOTO_ENTRY_OBSERVATION
                    else "Work performed phrases for R&M Fieldwork photo classification."
                ),
                status="active",
                domain=LIST_DOMAIN_FIELDWORK,
                include_other=False,
            )
            db.add(row)
            db.flush()
        out[entry_type] = str(row.id)
    if commit:
        db.commit()
    return out


def _load_fieldwork_list_for_entry(db: Session, entry_type: str) -> FormCustomList:
    name = ENTRY_TYPE_TO_LIST_NAME.get(entry_type)
    if not name:
        raise HTTPException(status_code=400, detail="Invalid entry_type")
    lst = (
        db.query(FormCustomList)
        .filter(
            FormCustomList.name == name,
            FormCustomList.domain == LIST_DOMAIN_FIELDWORK,
        )
        .first()
    )
    if not lst:
        # Auto-heal missing seed
        ensure_fieldwork_phrase_lists(db)
        lst = (
            db.query(FormCustomList)
            .filter(
                FormCustomList.name == name,
                FormCustomList.domain == LIST_DOMAIN_FIELDWORK,
            )
            .first()
        )
    if not lst:
        raise HTTPException(status_code=500, detail="Fieldwork phrase catalog is not configured")
    return lst


def resolve_phrase_snapshots(
    db: Session,
    *,
    entry_type: str,
    phrase_item_id: uuid.UUID,
    classification_item_id: Optional[uuid.UUID] = None,
    require_active: bool = True,
) -> Tuple[str, str, Optional[uuid.UUID], uuid.UUID]:
    """
    Validate phrase belongs to the Fieldwork catalog for entry_type and return
    (classification_snapshot, phrase_text_snapshot, classification_item_id, phrase_item_id).

    Snapshots are always derived server-side from the library — never trusted from the client.
    """
    entry = (entry_type or "").strip().lower()
    catalog = _load_fieldwork_list_for_entry(db, entry)
    phrase = db.query(FormCustomListItem).filter(FormCustomListItem.id == phrase_item_id).first()
    if not phrase:
        raise HTTPException(status_code=404, detail="Phrase item not found")
    if phrase.list_id != catalog.id:
        raise HTTPException(
            status_code=400,
            detail=f"Phrase does not belong to the {catalog.name} catalog for entry_type={entry}",
        )
    if require_active and (phrase.status or "").lower() != "active":
        raise HTTPException(status_code=400, detail="Phrase item is inactive")
    if normalized_list_domain(getattr(catalog, "domain", None)) != LIST_DOMAIN_FIELDWORK:
        raise HTTPException(status_code=400, detail="Phrase catalog domain must be fieldwork")

    phrase_text = (phrase.name or "").strip()
    if not phrase_text:
        raise HTTPException(status_code=400, detail="Phrase item has empty text")

    class_id = classification_item_id
    if class_id:
        class_item = db.query(FormCustomListItem).filter(FormCustomListItem.id == class_id).first()
        if not class_item:
            raise HTTPException(status_code=404, detail="Classification item not found")
        if class_item.list_id != catalog.id:
            raise HTTPException(
                status_code=400,
                detail="Classification item must belong to the same Fieldwork catalog as the phrase",
            )
        if require_active and (class_item.status or "").lower() != "active":
            raise HTTPException(status_code=400, detail="Classification item is inactive")
        # Classification must be an ancestor of the phrase (or the phrase itself)
        walk = phrase
        guard = 0
        ok = False
        while walk is not None and guard < 6:
            if walk.id == class_id:
                ok = True
                break
            if not walk.parent_id:
                break
            walk = db.query(FormCustomListItem).filter(FormCustomListItem.id == walk.parent_id).first()
            guard += 1
        if not ok:
            raise HTTPException(
                status_code=400,
                detail="Classification item must be an ancestor of the selected phrase",
            )
        class_snap = path_label_for_item(db, class_item)
    else:
        # Default classification path = full path excluding the leaf phrase name when nested
        full = path_label_for_item(db, phrase)
        if " › " in full:
            class_snap = " › ".join(full.split(" › ")[:-1])
            # Prefer parent id as classification when available
            class_id = phrase.parent_id
        else:
            class_snap = full
            class_id = phrase.id

    return class_snap, phrase_text, class_id, phrase.id
