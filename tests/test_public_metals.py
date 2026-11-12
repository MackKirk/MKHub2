"""Smoke tests for MK Metals public website APIs and helpers."""
from __future__ import annotations

import uuid

from app.services.metals_website import (
    KIND_ESTIMATE,
    STATUS_LABELS,
    normalize_email,
    serialize_catalog_product,
)


def test_normalize_email():
    assert normalize_email("  Foo@Bar.COM ") == "foo@bar.com"


def test_status_labels_cover_mvp():
    for key in ("new", "quoted", "confirmed", "shipped", "cancelled"):
        assert key in STATUS_LABELS


def test_serialize_catalog_product_minimal():
    class _Cat:
        id = uuid.uuid4()
        slug = "panels"
        name = "Panels"

    class _P:
        id = uuid.uuid4()
        slug = "standing-seam"
        name = "Standing Seam"
        short_description = "Short"
        description = "Long"
        specs = {"gauges": ["24ga"]}
        image_url = None
        is_published = True
        sort_index = 1
        category = _Cat()

    data = serialize_catalog_product(_P())
    assert data["slug"] == "standing-seam"
    assert data["category"]["slug"] == "panels"
    assert KIND_ESTIMATE == "estimate"


def test_public_routes_registered():
    from app.main import app

    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/public/metals/meta" in paths or any(
        (getattr(r, "path", "") or "").startswith("/public/metals") for r in app.routes
    )
    assert any((getattr(r, "path", "") or "").startswith("/portal/metals") for r in app.routes)
    assert any((getattr(r, "path", "") or "").startswith("/metals/website") for r in app.routes)


def test_hub_manifest_marks_public_metals():
    from app.auth.hub_route_manifest import is_public_path

    assert is_public_path("GET", "/public/metals/catalog")
    assert is_public_path("POST", "/public/metals/estimates")
    assert is_public_path("POST", "/portal/metals/auth/register")
    assert is_public_path("POST", "/portal/metals/auth/login")
