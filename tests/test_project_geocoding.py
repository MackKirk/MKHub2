"""Tests for project geocoding service."""
import unittest
from unittest.mock import MagicMock, patch

from app.services.project_geocoding_service import (
    GEOCODING_STATUS_MANUAL,
    address_fields_changed,
    is_valid_coordinate,
    normalize_project_address,
)


class _ProjectStub:
    address = "123 Main St"
    address_city = "Vancouver"
    address_province = "BC"
    address_country = "Canada"
    site_id = None
    lat = None
    lng = None
    geocoding_status = None


class TestGeocodingHelpers(unittest.TestCase):
    def test_normalize_address(self):
        p = _ProjectStub()
        addr = normalize_project_address(p)
        self.assertIn("Vancouver", addr)
        self.assertIn("123 Main St", addr)

    def test_address_fields_changed(self):
        self.assertTrue(address_fields_changed({"address": "New"}))
        self.assertFalse(address_fields_changed({"name": "New"}))
        self.assertTrue(
            address_fields_changed(
                {"address_city": "Burnaby"},
                before={"address_city": "Vancouver"},
            )
        )

    @patch("app.services.project_geocoding_service.geocode_address_string")
    def test_geocode_project_sync_success(self, mock_geocode):
        mock_geocode.return_value = (49.28, -123.12, "123 Main St, Vancouver", None)
        db = MagicMock()
        project = MagicMock()
        project.id = "proj-1"
        project.deleted_at = None
        project.geocoding_status = None
        project.site_id = None
        project.lat = None
        project.lng = None
        db.query.return_value.filter.return_value.first.return_value = project

        from app.services.project_geocoding_service import geocode_project_sync

        ok = geocode_project_sync(db, "proj-1")
        self.assertTrue(ok)
        self.assertEqual(project.geocoding_status, "success")

    def test_manual_status_skipped(self):
        db = MagicMock()
        project = MagicMock()
        project.id = "proj-1"
        project.deleted_at = None
        project.geocoding_status = GEOCODING_STATUS_MANUAL
        project.lat = 49.28
        project.lng = -123.12
        db.query.return_value.filter.return_value.first.return_value = project

        from app.services.project_geocoding_service import geocode_project_sync

        ok = geocode_project_sync(db, "proj-1")
        self.assertTrue(ok)


if __name__ == "__main__":
    unittest.main()
