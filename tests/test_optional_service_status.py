"""Tests for optional service 3-state status normalization and convert mapping."""

from app.services.optional_service_status import (
    coerce_optional_service_approval,
    is_optional_service_not_approved,
    normalize_optional_service,
    normalize_optional_service_status,
    optional_service_visible_in_pdf,
)


def test_normalize_preserves_explicit_status():
    assert normalize_optional_service_status({"status": "approved"}) == "approved"
    assert normalize_optional_service_status({"status": "pending"}) == "pending"
    assert normalize_optional_service_status({"status": "not_approved"}) == "not_approved"


def test_normalize_legacy_approved_false():
    assert normalize_optional_service_status({"approved": False}) == "not_approved"


def test_normalize_legacy_true_or_absent_is_pending():
    assert normalize_optional_service_status({"approved": True}) == "pending"
    assert normalize_optional_service_status({"service": "X", "price": 10}) == "pending"
    assert normalize_optional_service_status({}) == "pending"


def test_normalize_optional_service_defaults_pst_gst():
    assert normalize_optional_service({"service": "Leak", "price": "1200.5", "approved": True}) == {
        "service": "Leak",
        "price": 1200.5,
        "status": "pending",
        "pst": False,
        "gst": False,
    }


def test_pdf_visibility():
    assert optional_service_visible_in_pdf({"status": "approved"}) is True
    assert optional_service_visible_in_pdf({"status": "pending"}) is True
    assert optional_service_visible_in_pdf({"approved": True}) is True
    assert optional_service_visible_in_pdf({"status": "not_approved"}) is False
    assert optional_service_visible_in_pdf({"approved": False}) is False


def test_coerce_convert_payload():
    assert coerce_optional_service_approval("pending") == "pending"
    assert coerce_optional_service_approval("approved") == "approved"
    assert coerce_optional_service_approval("not_approved") == "not_approved"
    assert coerce_optional_service_approval(True) == "approved"
    assert coerce_optional_service_approval(False) == "not_approved"
    assert coerce_optional_service_approval(None) == "pending"


def test_is_not_approved_helper():
    assert is_optional_service_not_approved({"status": "not_approved"}) is True
    assert is_optional_service_not_approved({"approved": False}) is True
    assert is_optional_service_not_approved({"status": "pending"}) is False


def test_convert_mapping_writes_status_not_bool():
    """Simulate convert_to_project optional_service_approvals mapping."""
    optional_services = [
        {"service": "A", "price": 100, "approved": True},
        {"service": "B", "price": 200},
        {"service": "C", "price": 300, "approved": False},
    ]
    approvals = ["approved", "pending", "not_approved"]
    updated = []
    for i, item in enumerate(optional_services):
        status = coerce_optional_service_approval(approvals[i] if i < len(approvals) else "pending")
        new_item = dict(item)
        new_item["status"] = status
        new_item.pop("approved", None)
        if "pst" not in new_item:
            new_item["pst"] = False
        if "gst" not in new_item:
            new_item["gst"] = False
        updated.append(new_item)

    assert updated[0]["status"] == "approved"
    assert "approved" not in updated[0]
    assert updated[1]["status"] == "pending"
    assert updated[2]["status"] == "not_approved"
    assert updated[0]["pst"] is False
    assert updated[0]["gst"] is False


def test_convert_mapping_defaults_missing_index_to_pending():
    item = {"service": "Only", "price": 1}
    status = coerce_optional_service_approval(None)
    assert status == "pending"
    new_item = dict(item)
    new_item["status"] = status
    assert new_item["status"] == "pending"
