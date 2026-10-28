"""Hub vs Metals customer product scope helpers."""
from __future__ import annotations

from fastapi import HTTPException

from ..auth.security import _has_permission, has_customer_detail_access
from ..models.models import Client, User


def can_read_metals_customers(user: User) -> bool:
    return _has_permission(user, "metals:customers:read") or _has_permission(
        user, "metals:customers:write"
    )


def can_write_metals_customers(user: User) -> bool:
    return _has_permission(user, "metals:customers:write")


def assert_can_view_client(user: User, client: Client) -> None:
    """Allow detail if user can access Hub customers and client serves Hub, or Metals + serves Metals."""
    hub_ok = bool(getattr(client, "serves_hub", True)) and has_customer_detail_access(user)
    metals_ok = bool(getattr(client, "serves_metals", False)) and can_read_metals_customers(user)
    if hub_ok or metals_ok:
        return
    raise HTTPException(status_code=404, detail="Not found")


def assert_can_write_client_record(user: User, client: Client) -> None:
    hub_ok = bool(getattr(client, "serves_hub", True)) and (
        _has_permission(user, "business:customers:write")
        or _has_permission(user, "clients:write")
    )
    metals_ok = bool(getattr(client, "serves_metals", False)) and can_write_metals_customers(user)
    if hub_ok or metals_ok:
        return
    raise HTTPException(status_code=404, detail="Not found")
