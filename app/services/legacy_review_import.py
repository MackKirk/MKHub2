"""Shared helpers for legacy employee-review JSON import and template type fixes."""
from __future__ import annotations

import copy
import re
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

LEGACY_TYPE_TO_FIELD_TYPE: Dict[str, str] = {
    "scale": "scale_1_5",
    "yesno": "yes_no_na",
    "text": "long_text",
}


def norm_review_label(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def expected_field_type_for_legacy(legacy_type: str) -> Optional[str]:
    return LEGACY_TYPE_TO_FIELD_TYPE.get((legacy_type or "").strip().lower())


def patch_definition_field_types(definition: dict, patches: Dict[str, str]) -> dict:
    """Return a copy of definition with field types updated for the given keys."""
    if not patches:
        return definition
    out = copy.deepcopy(definition)
    for sec in out.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        for f in sec.get("fields") or []:
            if not isinstance(f, dict):
                continue
            k = f.get("key")
            if isinstance(k, str) and k.strip() in patches:
                f["type"] = patches[k.strip()]
    return out


def _legacy_type_by_label(legacy_items: List[dict]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for item in legacy_items:
        q = item.get("question")
        lt = item.get("type")
        if not isinstance(q, str) or not q.strip():
            continue
        if lt is None:
            continue
        out[norm_review_label(q)] = str(lt).strip().lower()
    return out


def detect_definition_type_fixes(
    definition: dict,
    legacy_items: List[dict],
    *,
    fuzzy_yesno: bool = True,
) -> Tuple[Dict[str, str], List[str]]:
    """
    Compare template definition to legacy export rows (by question label).
    Returns (field_key -> corrected_type, human-readable change lines).
    """
    legacy_by_label = _legacy_type_by_label(legacy_items)
    patches: Dict[str, str] = {}
    notes: List[str] = []

    fields: List[Tuple[str, str, str]] = []
    for sec in definition.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        for f in sec.get("fields") or []:
            if not isinstance(f, dict):
                continue
            k = f.get("key")
            if not isinstance(k, str) or not k.strip():
                continue
            lab = ((f.get("label") or k) or "").strip() or k.strip()
            ft = f.get("type")
            fields.append((k.strip(), (ft or "").strip() if isinstance(ft, str) else "", lab))

    for key, ft, lab in fields:
        qnorm = norm_review_label(lab)
        lt = legacy_by_label.get(qnorm)
        if not lt and fuzzy_yesno and ft == "scale_1_5":
            # Label typo drift: find closest legacy yesno question
            best_lt: Optional[str] = None
            best_ratio = 0.0
            for lnorm, ltype in legacy_by_label.items():
                if ltype != "yesno":
                    continue
                ratio = SequenceMatcher(None, qnorm, lnorm).ratio()
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_lt = ltype
            if best_lt and best_ratio >= 0.88:
                lt = best_lt
                notes.append(
                    f'Fuzzy legacy match for {key} ("{lab}") — ~{int(best_ratio * 100)}% similar to yes/no question'
                )
        if not lt:
            continue
        expected = expected_field_type_for_legacy(lt)
        if not expected or ft == expected:
            continue
        patches[key] = expected
        notes.append(f'{key}: {ft or "?"} → {expected} ("{lab}")')

    return patches, notes


def auto_patch_field_type_for_legacy_row(
    field_key: str,
    field_type: str,
    legacy_type: str,
) -> Tuple[Optional[str], Optional[str]]:
    """
    When coerce failed due to type mismatch, return (patched_field_type, note) or (None, None).
    """
    lt = (legacy_type or "").strip().lower()
    ft = (field_type or "").strip()
    expected = expected_field_type_for_legacy(lt)
    if not expected or ft == expected:
        return None, None
    return expected, (
        f"Auto-corrected {field_key} from {ft} → {expected} for legacy {lt} "
        f"(assignment snapshot only — run scripts/fix_employee_review_template_types_from_legacy.py to fix template)"
    )
