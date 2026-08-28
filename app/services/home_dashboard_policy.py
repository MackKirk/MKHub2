"""
Home dashboard widget visibility: align with Services menu permissions (no extra financial permission).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from ..auth.security import _has_permission, can_access_business_line
from ..models.models import User
from ..services.business_line import (
    BUSINESS_LINE_CONSTRUCTION,
    BUSINESS_LINE_REPAIRS_MAINTENANCE,
    normalize_business_line,
)

# Shortcuts: same spirit as AppShell Services / Customers
_SHORTCUT_PUBLIC = frozenset({"tasks", "schedule", "clock"})
_SHORTCUT_SERVICES = frozenset({"projects", "opportunities", "business"})


def _is_admin(user: User) -> bool:
    return any((getattr(r, "name", None) or "").lower() == "admin" for r in (user.roles or []))


def infer_default_home_business_line(user: User) -> str:
    """RM-only → R&M; Production-only or both → Production."""
    has_production = can_access_business_line(user, BUSINESS_LINE_CONSTRUCTION)
    has_rm = can_access_business_line(user, BUSINESS_LINE_REPAIRS_MAINTENANCE)
    if has_rm and not has_production:
        return BUSINESS_LINE_REPAIRS_MAINTENANCE
    return BUSINESS_LINE_CONSTRUCTION


def _resolve_widget_business_line(user: User, business_line: Optional[str]) -> str:
    if business_line and str(business_line).strip():
        return normalize_business_line(business_line)
    return infer_default_home_business_line(user)


def user_may_use_business_line_on_home(user: User, business_line: Optional[str]) -> bool:
    """User may load KPI/chart/list widgets for this business line (Services read)."""
    if _is_admin(user):
        return True
    line = _resolve_widget_business_line(user, business_line)
    return can_access_business_line(user, line)


def _widget_config(widget: Dict[str, Any]) -> Dict[str, Any]:
    c = widget.get("config")
    return c if isinstance(c, dict) else {}


def home_widget_allowed_for_user(user: User, widget: Dict[str, Any]) -> bool:
    if not isinstance(widget, dict):
        return False
    wtype = widget.get("type")
    if not wtype:
        return False
    cfg = _widget_config(widget)

    if wtype in ("list_tasks", "calendar", "schedule", "clock_in_out"):
        return True

    if wtype == "shortcuts":
        items = cfg.get("items")
        if not isinstance(items, list) or len(items) == 0:
            return True
        bl = cfg.get("business_line")
        for raw in items:
            item = str(raw).strip() if raw is not None else ""
            if not item or item in _SHORTCUT_PUBLIC:
                continue
            if item in _SHORTCUT_SERVICES:
                line = _resolve_widget_business_line(user, bl if isinstance(bl, str) else None)
                if not user_may_use_business_line_on_home(user, line):
                    return False
            elif item == "customers":
                if not _is_admin(user) and not _has_permission(user, "business:customers:read"):
                    return False
            # unknown shortcut id: allow (forward compatible)
        return True

    if wtype in ("kpi", "chart", "list_projects", "list_opportunities"):
        bl = cfg.get("business_line")
        return user_may_use_business_line_on_home(user, bl if isinstance(bl, str) else None)

    return False


def sanitize_home_dashboard(user: User, layout: List[Any], widgets: List[Any]) -> Tuple[List[dict], List[dict]]:
    """Drop widgets the user must not see; drop orphan layout cells."""
    clean_widgets: List[dict] = []
    for w in widgets:
        if isinstance(w, dict) and home_widget_allowed_for_user(user, w):
            clean_widgets.append(w)
    allowed_ids = {str(w.get("id")) for w in clean_widgets if w.get("id") is not None}
    clean_layout: List[dict] = []
    for cell in layout:
        if not isinstance(cell, dict):
            continue
        i = cell.get("i")
        if i is not None and str(i) in allowed_ids:
            clean_layout.append(cell)
    return clean_layout, clean_widgets
