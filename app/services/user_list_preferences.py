"""Normalize / merge per-user list preferences (opportunity/project status visibility).

Per business line, *_status_ids may be:
- null / omitted → all statuses (default)
- [] → none (empty list)
- [uuid, ...] → subset
"""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

LINE_KEYS = ("construction", "repairs")
STATUS_BUCKET_KEYS = ("opportunity_status_ids", "project_status_ids")

StatusLineValue = Optional[List[str]]  # None = all, [] = none, list = subset


def _as_uuid_strings(raw: Any) -> List[str]:
    if not isinstance(raw, list):
        return []
    out: List[str] = []
    seen: set[str] = set()
    for item in raw:
        s = str(item or "").strip()
        if not s:
            continue
        try:
            s = str(uuid.UUID(s))
        except (ValueError, AttributeError, TypeError):
            continue
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def _normalize_line_value(raw: Any) -> StatusLineValue:
    """None/omitted → None (all). List → UUID strings (possibly empty = none)."""
    if raw is None:
        return None
    if isinstance(raw, list):
        return _as_uuid_strings(raw)
    return None


def empty_status_ids_by_line() -> Dict[str, StatusLineValue]:
    """Default: all statuses for every line."""
    return {key: None for key in LINE_KEYS}


def empty_opportunity_status_ids() -> Dict[str, StatusLineValue]:
    """Backward-compatible alias for opportunity defaults."""
    return empty_status_ids_by_line()


def empty_list_preferences() -> dict:
    return {bucket: empty_status_ids_by_line() for bucket in STATUS_BUCKET_KEYS}


def _normalize_status_bucket(raw: Any) -> Dict[str, StatusLineValue]:
    if not isinstance(raw, dict):
        raw = {}
    normalized: Dict[str, StatusLineValue] = {}
    for key in LINE_KEYS:
        if key not in raw:
            normalized[key] = None
        else:
            normalized[key] = _normalize_line_value(raw.get(key))
    return normalized


def normalize_list_preferences_data(raw: Optional[dict]) -> dict:
    """Return canonical payload for GET/PUT responses."""
    data = raw if isinstance(raw, dict) else {}
    return {bucket: _normalize_status_bucket(data.get(bucket)) for bucket in STATUS_BUCKET_KEYS}


def merge_list_preferences(existing: Optional[dict], patch: Optional[dict]) -> dict:
    """
    Merge PUT body into existing data.
    Only status-id line keys present in the patch are overwritten per bucket.
    Explicit null means all; [] means none; list means subset.
    """
    base = normalize_list_preferences_data(existing)
    if not isinstance(patch, dict):
        return base
    for bucket in STATUS_BUCKET_KEYS:
        patch_bucket = patch.get(bucket)
        if not isinstance(patch_bucket, dict):
            continue
        merged_bucket: Dict[str, StatusLineValue] = dict(base[bucket])
        for key in LINE_KEYS:
            if key in patch_bucket:
                merged_bucket[key] = _normalize_line_value(patch_bucket.get(key))
        base[bucket] = merged_bucket
    return base
