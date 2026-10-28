"""Normalize optional_services approval status (pending | approved | not_approved)."""

from __future__ import annotations

from typing import Any

OPTIONAL_SERVICE_STATUSES = ("pending", "approved", "not_approved")


def normalize_optional_service_status(raw: Any) -> str:
    """Legacy approved:false → not_approved; true/absent → pending."""
    if isinstance(raw, dict):
        status = raw.get("status")
        if status in OPTIONAL_SERVICE_STATUSES:
            return str(status)
        approved = raw.get("approved")
        if approved is False or approved == "false" or approved == 0:
            return "not_approved"
    return "pending"


def coerce_optional_service_approval(value: Any) -> str:
    """Map convert payload entry (string status or legacy bool) to a status."""
    if value in OPTIONAL_SERVICE_STATUSES:
        return str(value)
    if value is True or value == "true" or value == 1:
        return "approved"
    if value is False or value == "false" or value == 0:
        return "not_approved"
    return "pending"


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is True or value == "true" or value == 1:
        return True
    if value is False or value == "false" or value == 0:
        return False
    return default


def _normalize_division_id(value: Any) -> str | None:
    if value is None or value == "":
        return None
    text = str(value).strip()
    return text or None


def normalize_optional_service(raw: Any) -> dict:
    obj = raw if isinstance(raw, dict) else {}
    try:
        price = float(obj.get("price") or 0)
    except (TypeError, ValueError):
        price = 0.0
    return {
        "service": str(obj.get("service") or ""),
        "price": price,
        "status": normalize_optional_service_status(obj),
        "pst": _as_bool(obj.get("pst"), False),
        "gst": _as_bool(obj.get("gst"), False),
        "division_id": _normalize_division_id(obj.get("division_id")),
    }


def optional_service_visible_in_pdf(raw: Any) -> bool:
    return normalize_optional_service_status(raw) != "not_approved"


def is_optional_service_not_approved(raw: Any) -> bool:
    return normalize_optional_service_status(raw) == "not_approved"
