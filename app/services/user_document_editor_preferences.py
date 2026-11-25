"""Normalize / merge per-user document editor customization preferences."""
from __future__ import annotations

from typing import Any, Optional

TEXT_EDIT_EXIT_REQUIRE_DONE = "require_done"
TEXT_EDIT_EXIT_CLICK_OUTSIDE = "click_outside"
TEXT_EDIT_EXIT_MODES = (TEXT_EDIT_EXIT_REQUIRE_DONE, TEXT_EDIT_EXIT_CLICK_OUTSIDE)

# Keep in sync with frontend ZOOM_LEVELS in DocumentEditorRibbon.
ALLOWED_ZOOM_LEVELS = (0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.25, 1.5, 2.0)
DEFAULT_ZOOM = 0.8


def empty_document_editor_preferences() -> dict:
    return {
        "text_edit_exit": TEXT_EDIT_EXIT_REQUIRE_DONE,
        "snap_to_guides": True,
        "show_drag_guides": True,
        "default_zoom": DEFAULT_ZOOM,
    }


def _normalize_text_edit_exit(raw: Any) -> str:
    value = str(raw or "").strip()
    if value in TEXT_EDIT_EXIT_MODES:
        return value
    return TEXT_EDIT_EXIT_REQUIRE_DONE


def _normalize_bool(raw: Any, default: bool) -> bool:
    if isinstance(raw, bool):
        return raw
    if raw in (0, "0", "false", "False", "off", "no"):
        return False
    if raw in (1, "1", "true", "True", "on", "yes"):
        return True
    return default


def _normalize_zoom(raw: Any) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return DEFAULT_ZOOM
    best = ALLOWED_ZOOM_LEVELS[0]
    best_dist = abs(best - value)
    for level in ALLOWED_ZOOM_LEVELS:
        dist = abs(level - value)
        if dist < best_dist - 1e-9:
            best = level
            best_dist = dist
    return best


def normalize_document_editor_preferences_data(raw: Optional[dict]) -> dict:
    data = raw if isinstance(raw, dict) else {}
    return {
        "text_edit_exit": _normalize_text_edit_exit(data.get("text_edit_exit")),
        "snap_to_guides": _normalize_bool(data.get("snap_to_guides"), True),
        "show_drag_guides": _normalize_bool(data.get("show_drag_guides"), True),
        "default_zoom": _normalize_zoom(
            data["default_zoom"] if "default_zoom" in data else DEFAULT_ZOOM
        ),
    }


def merge_document_editor_preferences(existing: Optional[dict], patch: Optional[dict]) -> dict:
    base = normalize_document_editor_preferences_data(existing)
    if not isinstance(patch, dict):
        return base
    if "text_edit_exit" in patch:
        base["text_edit_exit"] = _normalize_text_edit_exit(patch.get("text_edit_exit"))
    if "snap_to_guides" in patch:
        base["snap_to_guides"] = _normalize_bool(patch.get("snap_to_guides"), base["snap_to_guides"])
    if "show_drag_guides" in patch:
        base["show_drag_guides"] = _normalize_bool(
            patch.get("show_drag_guides"), base["show_drag_guides"]
        )
    if "default_zoom" in patch:
        base["default_zoom"] = _normalize_zoom(patch.get("default_zoom"))
    return base
