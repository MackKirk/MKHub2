"""
Standard file categories: used for project/client file upload `category` slugs and
default subfolder names. Stored in setting_items under list `standard_file_categories`.
Each item: label = slug (id), value = display / folder name, meta.icon, meta.description.
"""
from __future__ import annotations

from typing import Any, List, Dict, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

from ..models.models import SettingList, SettingItem

# label = API id / DB category string, value = folder display name
DEFAULT_STANDARD_FILE_CATEGORIES: List[Dict[str, Any]] = [
    {"label": "bid-documents", "value": "BidDocuments", "sort_index": 0, "meta": {"icon": "📁", "description": ""}},
    {"label": "drawings", "value": "Drawings", "sort_index": 1, "meta": {"icon": "📐", "description": ""}},
    {"label": "pictures", "value": "Pictures", "sort_index": 2, "meta": {"icon": "🖼️", "description": ""}},
    {"label": "specs", "value": "Specs", "sort_index": 3, "meta": {"icon": "📋", "description": ""}},
    {"label": "contract", "value": "Contract", "sort_index": 4, "meta": {"icon": "📄", "description": ""}},
    {"label": "accounting", "value": "Accounting", "sort_index": 5, "meta": {"icon": "💰", "description": ""}},
    {"label": "hse", "value": "Hse", "sort_index": 6, "meta": {"icon": "🛡️", "description": ""}},
    {"label": "submittals", "value": "Submittals", "sort_index": 7, "meta": {"icon": "📤", "description": ""}},
    {"label": "purchasing", "value": "Purchasing", "sort_index": 8, "meta": {"icon": "🛒", "description": ""}},
    {"label": "changes", "value": "Changes", "sort_index": 9, "meta": {"icon": "🔄", "description": ""}},
    {"label": "schedules", "value": "Schedules", "sort_index": 10, "meta": {"icon": "📅", "description": ""}},
    {"label": "reports", "value": "Reports", "sort_index": 11, "meta": {"icon": "📊", "description": ""}},
    {"label": "sub-contractors", "value": "SubContractors", "sort_index": 12, "meta": {"icon": "👷", "description": ""}},
    {"label": "closeout", "value": "Closeout", "sort_index": 13, "meta": {"icon": "✅", "description": ""}},
    {"label": "photos", "value": "Photos", "sort_index": 14, "meta": {"icon": "📷", "description": ""}},
    {"label": "other", "value": "Other", "sort_index": 15, "meta": {"icon": "📦", "description": ""}},
    {"label": "safety", "value": "Safety", "sort_index": 16, "meta": {"icon": "⚠️", "description": "Site safety inspection PDFs"}},
]

LIST_NAME = "standard_file_categories"

# Merged on every GET if missing (DBs seeded before `safety` existed).
_MERGE_CATEGORY_SPECS: List[Dict[str, Any]] = [
    {"label": "safety", "value": "Safety", "sort_index": 16, "meta": {"icon": "⚠️", "description": "Site safety inspection PDFs"}},
]


def merge_missing_standard_category_items(db: "Session") -> None:
    """Insert known category slugs when absent (idempotent)."""
    lst = db.query(SettingList).filter(SettingList.name == LIST_NAME).first()
    if not lst:
        return
    existing = {str(it.label) for it in db.query(SettingItem).filter(SettingItem.list_id == lst.id).all()}
    added = False
    for spec in _MERGE_CATEGORY_SPECS:
        lab = str(spec.get("label") or "").strip()
        if not lab or lab in existing:
            continue
        db.add(
            SettingItem(
                list_id=lst.id,
                label=lab,
                value=spec.get("value") or lab,
                sort_index=int(spec.get("sort_index") or 0),
                meta=spec.get("meta"),
            )
        )
        added = True
    if added:
        db.commit()


def ensure_standard_file_categories(db: "Session") -> None:
    """Create list and seed defaults if empty (idempotent)."""
    lst = db.query(SettingList).filter(SettingList.name == LIST_NAME).first()
    if not lst:
        lst = SettingList(name=LIST_NAME)
        db.add(lst)
        db.flush()
    n = db.query(SettingItem).filter(SettingItem.list_id == lst.id).count()
    if n > 0:
        return
    for row in DEFAULT_STANDARD_FILE_CATEGORIES:
        it = SettingItem(
            list_id=lst.id,
            label=row["label"],
            value=row.get("value") or row["label"],
            sort_index=row.get("sort_index", 0),
            meta=row.get("meta") or None,
        )
        db.add(it)
    db.commit()


def get_categories_for_client_api(db: "Session") -> List[Dict[str, Any]]:
    """Shape expected by GET /clients/file-categories and UIs."""
    ensure_standard_file_categories(db)
    merge_missing_standard_category_items(db)
    lst = db.query(SettingList).filter(SettingList.name == LIST_NAME).first()
    if not lst:
        return []
    items = (
        db.query(SettingItem)
        .filter(SettingItem.list_id == lst.id)
        .order_by(SettingItem.sort_index.asc(), SettingItem.label.asc())
        .all()
    )
    out: List[Dict[str, Any]] = []
    for it in items:
        meta = it.meta or {}
        out.append(
            {
                "id": it.label,
                "name": (it.value or it.label or "").strip() or it.label,
                "icon": (meta.get("icon") or "📁") if isinstance(meta, dict) else "📁",
                "description": (meta.get("description") or "") if isinstance(meta, dict) else "",
                "itemId": str(it.id),
                "sortIndex": int(it.sort_index or 0),
            }
        )
    return out


def get_default_folder_rows(db: "Session") -> List[Dict[str, Any]]:
    """For create_default_folders_for_parent: name + sort_index from settings."""
    ensure_standard_file_categories(db)
    merge_missing_standard_category_items(db)
    lst = db.query(SettingList).filter(SettingList.name == LIST_NAME).first()
    if not lst:
        return [
            {"name": d["value"], "sort_index": d["sort_index"]}
            for d in DEFAULT_STANDARD_FILE_CATEGORIES
        ]
    items = (
        db.query(SettingItem)
        .filter(SettingItem.list_id == lst.id)
        .order_by(SettingItem.sort_index.asc(), SettingItem.label.asc())
        .all()
    )
    return [
        {
            "name": (it.value or it.label or "").strip() or it.label,
            "sort_index": it.sort_index or 0,
        }
        for it in items
    ]
