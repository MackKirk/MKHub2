"""Document Builder free-form signer roles (1–N named slots per document)."""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional, Tuple

LEGACY_ROLE_KEYS = ("employee", "company", "other")
LEGACY_LABELS = {"employee": "Employee", "company": "Company", "other": "Other"}
# Stable UUIDs so legacy fields remapped on different loads stay consistent per key.
LEGACY_STABLE_IDS = {
    "employee": "00000000-0000-4000-8000-000000000001",
    "company": "00000000-0000-4000-8000-000000000002",
    "other": "00000000-0000-4000-8000-000000000003",
}


def new_role_id() -> str:
    return str(uuid.uuid4())


def default_signer_roles() -> List[dict]:
    return [
        {
            "id": new_role_id(),
            "label": "Signer 1",
            "sortOrder": 0,
            "fillsEmployeeTokens": False,
        }
    ]


def normalize_signer_role_def(raw: Any, *, index: int = 0) -> Optional[dict]:
    if not isinstance(raw, dict):
        return None
    rid = str(raw.get("id") or "").strip()
    if not rid:
        rid = new_role_id()
    label = (str(raw.get("label") or "").strip() or f"Signer {index + 1}")[:120]
    try:
        sort_order = int(raw.get("sortOrder", raw.get("sort_order", index)))
    except (TypeError, ValueError):
        sort_order = index
    fills = bool(raw.get("fillsEmployeeTokens", raw.get("fills_employee_tokens", False)))
    return {
        "id": rid,
        "label": label,
        "sortOrder": sort_order,
        "fillsEmployeeTokens": fills,
    }


def normalize_signer_roles_list(raw: Any) -> List[dict]:
    if not isinstance(raw, list) or not raw:
        return []
    out: List[dict] = []
    seen = set()
    for i, item in enumerate(raw):
        role = normalize_signer_role_def(item, index=i)
        if not role or role["id"] in seen:
            continue
        seen.add(role["id"])
        out.append(role)
    # Enforce at most one fillsEmployeeTokens
    found = False
    for r in out:
        if r["fillsEmployeeTokens"]:
            if found:
                r["fillsEmployeeTokens"] = False
            else:
                found = True
    out.sort(key=lambda r: (r["sortOrder"], r["label"]))
    for i, r in enumerate(out):
        r["sortOrder"] = i
    return out


def is_legacy_assignee_key(raw: Any) -> bool:
    a = (str(raw) if raw is not None else "").strip().lower()
    if a == "user":
        return True
    return a in LEGACY_ROLE_KEYS


def legacy_key_from_assignee(raw: Any) -> str:
    a = (str(raw) if raw is not None else "employee").strip().lower()
    if a == "user":
        return "company"
    if a in LEGACY_ROLE_KEYS:
        return a
    return "employee"


def _looks_like_uuid(s: str) -> bool:
    try:
        uuid.UUID(str(s))
        return True
    except Exception:
        return False


def normalize_field_assignee(raw: Any, role_ids: Optional[set] = None) -> str:
    """Return a role id string. Legacy keys map to stable legacy UUIDs."""
    a = (str(raw) if raw is not None else "").strip()
    if not a:
        if role_ids:
            # Prefer first known id is caller's job; fallback legacy employee
            return LEGACY_STABLE_IDS["employee"]
        return LEGACY_STABLE_IDS["employee"]
    low = a.lower()
    if low == "user":
        return LEGACY_STABLE_IDS["company"]
    if low in LEGACY_ROLE_KEYS:
        return LEGACY_STABLE_IDS[low]
    if role_ids is not None and a in role_ids:
        return a
    if _looks_like_uuid(a):
        return a
    # Unknown string → treat as legacy employee for safety
    return LEGACY_STABLE_IDS["employee"]


def synthesize_roles_from_assignees(assignees: List[Any], existing: Optional[List[dict]] = None) -> List[dict]:
    """Build signer_roles from field assignees + optional existing defs."""
    roles = normalize_signer_roles_list(existing or [])
    by_id = {r["id"]: r for r in roles}
    legacy_needed = set()
    for raw in assignees:
        a = (str(raw) if raw is not None else "").strip()
        if not a:
            continue
        if is_legacy_assignee_key(a):
            legacy_needed.add(legacy_key_from_assignee(a))
        elif _looks_like_uuid(a) and a not in by_id:
            by_id[a] = {
                "id": a,
                "label": f"Signer {len(by_id) + 1}",
                "sortOrder": len(by_id),
                "fillsEmployeeTokens": False,
            }
    for key in LEGACY_ROLE_KEYS:
        if key not in legacy_needed:
            continue
        rid = LEGACY_STABLE_IDS[key]
        if rid not in by_id:
            by_id[rid] = {
                "id": rid,
                "label": LEGACY_LABELS[key],
                "sortOrder": {"employee": 0, "company": 1, "other": 2}[key],
                "fillsEmployeeTokens": key == "employee",
            }
    out = list(by_id.values())
    # If still empty, default one signer
    if not out:
        return default_signer_roles()
    # Ensure only one fillsEmployeeTokens; prefer employee legacy if present
    emp_id = LEGACY_STABLE_IDS["employee"]
    if any(r["fillsEmployeeTokens"] for r in out):
        pass
    elif emp_id in by_id:
        by_id[emp_id]["fillsEmployeeTokens"] = True
    out = normalize_signer_roles_list(out)
    return out


def collect_assignees_from_pages(pages: Any) -> List[str]:
    found: List[str] = []
    if not isinstance(pages, list):
        return found
    for page in pages:
        if not isinstance(page, dict):
            continue
        elements = page.get("elements") or []
        if not isinstance(elements, list):
            continue
        for el in elements:
            if not isinstance(el, dict):
                continue
            et = el.get("type") or ""
            if et in ("initials", "date") and el.get("assignee") is not None:
                found.append(str(el.get("assignee")))
            if et == "text":
                rich = el.get("richLines")
                if isinstance(rich, list):
                    for line in rich:
                        if not isinstance(line, list):
                            continue
                        for run in line:
                            if not isinstance(run, dict):
                                continue
                            kind = run.get("kind")
                            text = run.get("text") or ""
                            if kind in ("signature", "date") or (text == "\ufffc" and run.get("atomId")):
                                if run.get("assignee") is not None:
                                    found.append(str(run.get("assignee")))
    return found


def ensure_document_signer_roles(signer_roles: Any, pages: Any) -> List[dict]:
    """Return normalized signer_roles, synthesizing from pages if needed."""
    roles = normalize_signer_roles_list(signer_roles)
    assignees = collect_assignees_from_pages(pages)
    if roles:
        # Merge any field assignees not in catalog
        return synthesize_roles_from_assignees(assignees, roles)
    if assignees:
        return synthesize_roles_from_assignees(assignees, None)
    return default_signer_roles()


def rewrite_pages_assignees_to_role_ids(pages: Any, roles: List[dict]) -> Any:
    """Deep-ish rewrite of assignee fields from legacy keys to role ids (mutates copy)."""
    import copy

    if not isinstance(pages, list):
        return pages
    role_ids = {r["id"] for r in roles}
    pages = copy.deepcopy(pages)
    for page in pages:
        if not isinstance(page, dict):
            continue
        elements = page.get("elements") or []
        if not isinstance(elements, list):
            continue
        for el in elements:
            if not isinstance(el, dict):
                continue
            et = el.get("type") or ""
            if et in ("initials", "date"):
                el["assignee"] = normalize_field_assignee(el.get("assignee"), role_ids)
            if et == "text":
                rich = el.get("richLines")
                if isinstance(rich, list):
                    for line in rich:
                        if not isinstance(line, list):
                            continue
                        for run in line:
                            if not isinstance(run, dict):
                                continue
                            kind = run.get("kind")
                            text = run.get("text") or ""
                            if kind in ("signature", "date") or (text == "\ufffc" and run.get("atomId")):
                                run["assignee"] = normalize_field_assignee(run.get("assignee"), role_ids)
    return pages


def role_label_map(roles: List[dict]) -> Dict[str, str]:
    return {r["id"]: r["label"] for r in roles}


def employee_token_user_from_assignments(
    roles: List[dict], assignments: Dict[str, Any]
) -> Optional[Any]:
    """User for <Employee *> tokens: flag first, else signer labeled Employee."""
    for r in roles:
        if r.get("fillsEmployeeTokens"):
            uid = assignments.get(r["id"])
            if uid is not None:
                return uid
    for r in roles:
        label = (str(r.get("label") or "")).strip()
        if label.lower() == "employee":
            return assignments.get(r["id"])
    return None


def hr_documents_owner_user_id(
    participants: List[Any],
    roles_catalog: Optional[List[dict]] = None,
) -> Optional[Any]:
    """
    User whose HR Documents folder receives the completed signed PDF.

    Prefer fillsEmployeeTokens / label Employee; else lowest sort_order participant.
    """
    if not participants:
        return None
    ordered = sorted(participants, key=lambda p: int(getattr(p, "sort_order", 0) or 0))
    fills_ids = {
        str(r["id"])
        for r in (roles_catalog or [])
        if r.get("fillsEmployeeTokens") and r.get("id")
    }
    for p in ordered:
        role = str(getattr(p, "role", "") or "")
        if role in fills_ids:
            uid = getattr(p, "signer_user_id", None)
            if uid is not None:
                return uid
    for p in ordered:
        label = (str(getattr(p, "role_label", None) or "")).strip()
        if label.lower() == "employee":
            uid = getattr(p, "signer_user_id", None)
            if uid is not None:
                return uid
    return getattr(ordered[0], "signer_user_id", None)


def order_role_ids_present(roles: List[dict], present_ids: set) -> List[str]:
    ordered = [r["id"] for r in sorted(roles, key=lambda x: x["sortOrder"]) if r["id"] in present_ids]
    # Any present ids not in catalog go last
    for pid in present_ids:
        if pid not in ordered:
            ordered.append(pid)
    return ordered
