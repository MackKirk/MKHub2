"""Document template categories stored as SettingList `document_template_categories`."""
from __future__ import annotations

from typing import Any, List, Optional, Set

from sqlalchemy.orm import Session

from ..auth.security import _get_user_permission_map, _user_is_admin
from ..models.models import SettingItem, SettingList, User

LIST_NAME = "document_template_categories"
PERMISSION_CONFIG_KEY = "document_hub:templates:categories:read"


def ensure_document_template_categories_list(db: Session) -> None:
    """Create the list if missing (idempotent). Items are seeded via migration script."""
    lst = db.query(SettingList).filter(SettingList.name == LIST_NAME).first()
    if not lst:
        db.add(SettingList(name=LIST_NAME))
        db.commit()


def _category_list(db: Session) -> Optional[SettingList]:
    return db.query(SettingList).filter(SettingList.name == LIST_NAME).first()


def get_document_template_category_items(db: Session) -> List[SettingItem]:
    lst = _category_list(db)
    if not lst:
        return []
    return (
        db.query(SettingItem)
        .filter(SettingItem.list_id == lst.id)
        .order_by(SettingItem.sort_index.asc(), SettingItem.label.asc())
        .all()
    )


def get_document_template_category_labels(db: Session) -> Set[str]:
    """Return the set of category labels defined in settings."""
    return {
        str(i.label or "").strip()
        for i in get_document_template_category_items(db)
        if str(i.label or "").strip()
    }


def resolve_category_setting_id(db: Session, category_label: Optional[str]) -> Optional[str]:
    normalized = (category_label or "").strip()
    if not normalized:
        return None
    for item in get_document_template_category_items(db):
        if str(item.label or "").strip() == normalized:
            return str(item.id)
    return None


def get_allowed_category_ids(user: User) -> Optional[Set[str]]:
    """
    Return allowed SettingItem ids for template visibility / use / assign.

    None => admin bypass (all categories).
    Empty set => deny categorized templates (deny-by-default).
    """
    if _user_is_admin(user):
        return None
    perm_map = _get_user_permission_map(user)
    raw = perm_map.get(PERMISSION_CONFIG_KEY)
    if not isinstance(raw, list):
        return set()
    return {str(x) for x in raw if x}


def should_bypass_category_filter(user: User) -> bool:
    """Only system admins bypass category allow-lists."""
    return _user_is_admin(user)


def can_use_document_template_category(
    user: User,
    db: Session,
    category_label: Optional[str],
) -> bool:
    """True if user may see/use/assign this category (empty = uncategorized always OK)."""
    if should_bypass_category_filter(user):
        return True
    normalized = (category_label or "").strip()
    if not normalized:
        return True
    allowed = get_allowed_category_ids(user)
    if allowed is None:
        return True
    setting_id = resolve_category_setting_id(db, normalized)
    if not setting_id:
        return False
    return setting_id in allowed


def assert_can_use_document_template_category(
    user: User,
    db: Session,
    category_label: Optional[str],
) -> None:
    if can_use_document_template_category(user, db, category_label):
        return
    from fastapi import HTTPException

    raise HTTPException(
        status_code=403,
        detail="You do not have permission to use this document template category",
    )


def filter_document_types_for_user(
    user: User,
    db: Session,
    types: List[Any],
    *,
    for_picker: bool = False,
) -> List[Any]:
    """Filter document types by category allow-list. for_picker kept for API compatibility."""
    del for_picker  # category filter always applies for non-admins
    if should_bypass_category_filter(user):
        return types
    allowed = get_allowed_category_ids(user)
    if allowed is None:
        return types
    filtered: List[Any] = []
    for doc_type in types:
        category = getattr(doc_type, "category", None)
        if not (category or "").strip():
            filtered.append(doc_type)
            continue
        setting_id = resolve_category_setting_id(db, category)
        if setting_id and setting_id in allowed:
            filtered.append(doc_type)
    return filtered


def validate_document_template_category(
    db: Session,
    category: Optional[str],
    *,
    allow_legacy: Optional[str] = None,
) -> Optional[str]:
    """Validate category against settings list. Returns normalized category or raises ValueError."""
    normalized = (category or "").strip()
    if not normalized:
        return None
    labels = get_document_template_category_labels(db)
    if normalized in labels:
        return normalized
    if allow_legacy and normalized == (allow_legacy or "").strip():
        return normalized
    raise ValueError(f"Unknown document template category: {normalized}")
