"""Metals website auth is isolated from Hub customer portal."""
from __future__ import annotations

from app.auth.hub_route_manifest import is_public_path
from app.auth.metals_portal_security import METALS_PORTAL_PRINCIPAL, create_metals_access_token
from app.auth.portal_security import PORTAL_PRINCIPAL, create_portal_access_token


def test_metals_auth_paths_are_public():
    assert is_public_path("POST", "/portal/metals/auth/register")
    assert is_public_path("POST", "/portal/metals/auth/login")
    assert is_public_path("POST", "/portal/metals/auth/forgot-password")
    assert is_public_path("POST", "/portal/metals/auth/reset-password")


def test_metals_and_hub_principals_differ():
    assert METALS_PORTAL_PRINCIPAL == "metals_portal"
    assert PORTAL_PRINCIPAL == "hub_portal"
    assert METALS_PORTAL_PRINCIPAL != PORTAL_PRINCIPAL


def test_token_principals_are_encoded_separately():
    import jwt

    from app.config import settings

    metals = create_metals_access_token("00000000-0000-0000-0000-000000000001", session_version=0)
    hub = create_portal_access_token("00000000-0000-0000-0000-000000000002", session_version=0)
    metals_payload = jwt.decode(metals, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    hub_payload = jwt.decode(hub, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    assert metals_payload["principal"] == "metals_portal"
    assert hub_payload["principal"] == "hub_portal"


def test_portal_metals_user_model_isolated():
    from app.models.models import PortalHubUser, PortalMetalsUser

    assert PortalMetalsUser.__tablename__ == "portal_metals_users"
    assert PortalHubUser.__tablename__ == "portal_hub_users"
    assert PortalMetalsUser.__tablename__ != PortalHubUser.__tablename__
