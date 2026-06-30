"""Project billing snapshot helpers — copy Customer billing at project create/convert."""

from __future__ import annotations

from typing import Any, Optional

from ..models.models import Client, Project

BILLING_SNAPSHOT_FIELDS = (
    "billing_contact",
    "invoice_to",
    "billing_email",
    "po_required",
    "billing_address_line1",
    "billing_address_line2",
    "billing_city",
    "billing_province",
    "billing_postal_code",
    "billing_country",
)


def _str_or_none(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def billing_snapshot_from_client(client: Client) -> dict:
    """Resolved billing address + contact fields for snapshot copy."""
    same_as_primary = bool(getattr(client, "billing_same_as_address", False))
    if same_as_primary:
        addr = {
            "billing_address_line1": _str_or_none(getattr(client, "address_line1", None)),
            "billing_address_line2": _str_or_none(getattr(client, "address_line2", None)),
            "billing_city": _str_or_none(getattr(client, "city", None)),
            "billing_province": _str_or_none(getattr(client, "province", None)),
            "billing_postal_code": _str_or_none(getattr(client, "postal_code", None)),
            "billing_country": _str_or_none(getattr(client, "country", None)),
        }
    else:
        addr = {
            "billing_address_line1": _str_or_none(getattr(client, "billing_address_line1", None)),
            "billing_address_line2": _str_or_none(getattr(client, "billing_address_line2", None)),
            "billing_city": _str_or_none(getattr(client, "billing_city", None)),
            "billing_province": _str_or_none(getattr(client, "billing_province", None)),
            "billing_postal_code": _str_or_none(getattr(client, "billing_postal_code", None)),
            "billing_country": _str_or_none(getattr(client, "billing_country", None)),
        }
    return {
        "billing_contact": _str_or_none(getattr(client, "billing_contact", None)),
        "invoice_to": _str_or_none(getattr(client, "invoice_to", None)),
        "billing_email": _str_or_none(getattr(client, "billing_email", None)),
        "po_required": bool(getattr(client, "po_required", False)),
        **addr,
    }


def _snapshot_value(project_or_dict: Any, key: str) -> Optional[str]:
    if isinstance(project_or_dict, dict):
        val = project_or_dict.get(key)
    else:
        val = getattr(project_or_dict, key, None)
    if key == "po_required":
        return "true" if bool(val) else "false"
    return _str_or_none(val)


def billing_snapshot_differs_from_client(project: Project, client: Client) -> bool:
    """True when project billing snapshot differs from current Customer billing."""
    expected = billing_snapshot_from_client(client)
    for key in BILLING_SNAPSHOT_FIELDS:
        proj_val = _snapshot_value(project, key)
        exp_val = _snapshot_value(expected, key)
        if proj_val != exp_val:
            return True
    return False


def normalize_purchase_order_number(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    s = s.upper()
    return s[:100] if len(s) > 100 else s


def project_invoice_blocked_reason(project: Project) -> Optional[str]:
    if bool(getattr(project, "po_required", False)) and not normalize_purchase_order_number(
        getattr(project, "purchase_order_number", None)
    ):
        return "This customer requires a Purchase Order Number before invoicing."
    return None


def apply_billing_snapshot_to_project(project: Project, client: Client) -> None:
    """Replace project billing snapshot from client; does not touch purchase_order_number."""
    snap = billing_snapshot_from_client(client)
    for key, val in snap.items():
        setattr(project, key, val)


def project_billing_response_fields(project: Project) -> dict:
    """Serialize billing fields for API responses."""
    return {
        "purchase_order_number": getattr(project, "purchase_order_number", None),
        "billing_contact": getattr(project, "billing_contact", None),
        "invoice_to": getattr(project, "invoice_to", None),
        "billing_email": getattr(project, "billing_email", None),
        "po_required": bool(getattr(project, "po_required", False)),
        "billing_address_line1": getattr(project, "billing_address_line1", None),
        "billing_address_line2": getattr(project, "billing_address_line2", None),
        "billing_city": getattr(project, "billing_city", None),
        "billing_province": getattr(project, "billing_province", None),
        "billing_postal_code": getattr(project, "billing_postal_code", None),
        "billing_country": getattr(project, "billing_country", None),
        "invoice_blocked_reason": project_invoice_blocked_reason(project),
    }
