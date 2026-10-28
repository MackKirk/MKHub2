"""Shared utilities for Project model."""

from __future__ import annotations


def _division_key(division_id) -> str | None:
    if division_id is None:
        return None
    key = str(division_id).strip()
    return key or None


def _item_is_approved_pricing(item: dict) -> bool:
    return item.get("approved", True) is True


def _optional_counts_for_reconcile(item: dict) -> tuple[bool, bool]:
    """Return (counts_as_related, is_approved). Pending optionals are ignored for reconcile."""
    status = item.get("status")
    if status == "approved":
        return True, True
    if status == "not_approved":
        return True, False
    if status == "pending":
        return False, False
    approved = item.get("approved")
    if approved is False or approved == "false" or approved == 0:
        return True, False
    return False, False


def _collect_pricing_signals(rows) -> tuple[set[str], list, set[str]]:
    divisions_with_items: set[str] = set()
    approved_in_order: list = []
    approved_seen: set[str] = set()
    for item in rows or []:
        if not isinstance(item, dict):
            continue
        key = _division_key(item.get("division_id"))
        if key is None:
            continue
        divisions_with_items.add(key)
        if _item_is_approved_pricing(item) and key not in approved_seen:
            approved_seen.add(key)
            approved_in_order.append(item.get("division_id"))
    return divisions_with_items, approved_in_order, approved_seen


def _collect_optional_signals(rows) -> tuple[set[str], list, set[str]]:
    divisions_with_items: set[str] = set()
    approved_in_order: list = []
    approved_seen: set[str] = set()
    for item in rows or []:
        if not isinstance(item, dict):
            continue
        key = _division_key(item.get("division_id"))
        if key is None:
            continue
        related, approved = _optional_counts_for_reconcile(item)
        if not related:
            continue
        divisions_with_items.add(key)
        if approved and key not in approved_seen:
            approved_seen.add(key)
            approved_in_order.append(item.get("division_id"))
    return divisions_with_items, approved_in_order, approved_seen


def reconcile_project_division_ids(
    current_division_ids,
    additional_costs,
    optional_services=None,
):
    """Keep unpriced divisions, add approved pricing/optional divisions, drop fully unapproved ones.

    A division with no pricing or optional rows stays. A division is removed only when it has
    related rows and every one of them is not approved. Approved rows for a division that is
    not on the project yet are appended, in first-appearance order (pricing first, then optionals).
    Pricing items without an explicit approved flag count as approved.
    Optional services: only status approved adds; not_approved can force a drop; pending is ignored.
    """
    current = []
    current_keys = []
    for division_id in current_division_ids or []:
        key = _division_key(division_id)
        if key is None or key in current_keys:
            continue
        current.append(division_id)
        current_keys.append(key)

    pricing_with, pricing_approved_order, pricing_approved = _collect_pricing_signals(additional_costs)
    optional_with, optional_approved_order, optional_approved = _collect_optional_signals(optional_services)

    divisions_with_items = pricing_with | optional_with
    approved_seen = pricing_approved | optional_approved
    approved_in_order = []
    seen_keys: set[str] = set()
    for division_id in list(pricing_approved_order) + list(optional_approved_order):
        key = _division_key(division_id)
        if key is None or key in seen_keys:
            continue
        seen_keys.add(key)
        approved_in_order.append(division_id)

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


def equal_division_percentages(division_ids) -> dict[str, int]:
    """Equal split of 100 across division ids; remainder goes to the last id."""
    cleaned_ids: list[str] = []
    seen: set[str] = set()
    for division_id in division_ids or []:
        key = _division_key(division_id)
        if key is None or key in seen:
            continue
        seen.add(key)
        cleaned_ids.append(key)
    if not cleaned_ids:
        return {}
    count = len(cleaned_ids)
    base = 100 // count
    remainder = 100 - (base * count)
    return {
        division_id: base + (remainder if index == count - 1 else 0)
        for index, division_id in enumerate(cleaned_ids)
    }


def sanitize_division_onsite_leads(division_onsite_leads, project_division_ids):
    """Return division_onsite_leads filtered to only divisions that exist in project_division_ids.
    Invariant: no on-site lead for a division that does not exist in the project."""
    if not isinstance(division_onsite_leads, dict):
        return {}
    kept = set(str(did) for did in (project_division_ids or []))
    return {k: v for k, v in division_onsite_leads.items() if str(k) in kept}
