"""Shared utilities for Project model."""


def _division_key(division_id) -> str | None:
    if division_id is None:
        return None
    key = str(division_id).strip()
    return key or None


def reconcile_project_division_ids(current_division_ids, additional_costs):
    """Keep unpriced divisions, add approved pricing divisions, drop only fully unapproved ones.

    A division with no pricing rows stays. A division is removed only when it has
    pricing rows and every one of them is marked not approved. Approved rows for a
    division that is not on the project yet are appended, in first-appearance order.
    Items without an explicit approved flag count as approved.
    """
    current = []
    current_keys = []
    for division_id in current_division_ids or []:
        key = _division_key(division_id)
        if key is None or key in current_keys:
            continue
        current.append(division_id)
        current_keys.append(key)

    divisions_with_items: set[str] = set()
    approved_in_order = []
    approved_seen: set[str] = set()
    for item in additional_costs or []:
        if not isinstance(item, dict):
            continue
        key = _division_key(item.get("division_id"))
        if key is None:
            continue
        divisions_with_items.add(key)
        if item.get("approved", True) is True and key not in approved_seen:
            approved_seen.add(key)
            approved_in_order.append(item.get("division_id"))

    kept = []
    kept_keys: set[str] = set()
    for division_id, key in zip(current, current_keys):
        if key in divisions_with_items and key not in approved_seen:
            continue
        kept.append(division_id)
        kept_keys.add(key)
    for division_id in approved_in_order:
        key = _division_key(division_id)
        if key is None or key in kept_keys:
            continue
        kept.append(division_id)
        kept_keys.add(key)
    return kept


def sanitize_division_onsite_leads(division_onsite_leads, project_division_ids):
    """Return division_onsite_leads filtered to only divisions that exist in project_division_ids.
    Invariant: no on-site lead for a division that does not exist in the project."""
    if not isinstance(division_onsite_leads, dict):
        return {}
    kept = set(str(did) for did in (project_division_ids or []))
    return {k: v for k, v in division_onsite_leads.items() if str(k) in kept}
