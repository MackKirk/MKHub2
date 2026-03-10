"""Shared utilities for Project model."""


def sanitize_division_onsite_leads(division_onsite_leads, project_division_ids):
    """Return division_onsite_leads filtered to only divisions that exist in project_division_ids.
    Invariant: no on-site lead for a division that does not exist in the project."""
    if not isinstance(division_onsite_leads, dict):
        return {}
    kept = set(str(did) for did in (project_division_ids or []))
    return {k: v for k, v in division_onsite_leads.items() if str(k) in kept}
