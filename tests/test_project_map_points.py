"""Tests for project map points endpoint logic."""
import unittest
import uuid
from unittest.mock import MagicMock, patch

from app.services.map_address_format import format_map_address
from app.services.project_geocoding_service import is_valid_coordinate
from app.services.project_list_filters import (
    BusinessProjectListFilters,
    apply_bounding_box_filter,
    filters_from_query_params,
)
from app.services.project_map_service import _format_map_address, get_project_map_points


class _ProjectStub:
    def __init__(
        self,
        pid=None,
        lat=None,
        lng=None,
        name="Test",
        code="MK-001",
        status_label="Finished",
        client_id=None,
        site_id=None,
        project_division_ids=None,
        project_admin_id=None,
        date_start=None,
        date_end=None,
        is_bidding=False,
        deleted_at=None,
        address="123 Main St",
        address_city="Vancouver",
        address_province="BC",
        address_country="Canada",
    ):
        self.id = pid or uuid.uuid4()
        self.lat = lat
        self.lng = lng
        self.name = name
        self.code = code
        self.status_label = status_label
        self.client_id = client_id
        self.site_id = site_id
        self.project_division_ids = project_division_ids or []
        self.project_admin_id = project_admin_id
        self.date_start = date_start
        self.date_end = date_end
        self.is_bidding = is_bidding
        self.deleted_at = deleted_at
        self.address = address
        self.address_city = address_city
        self.address_province = address_province
        self.address_country = address_country


class TestCoordinateValidation(unittest.TestCase):
    def test_valid_coords(self):
        self.assertTrue(is_valid_coordinate(49.28, -123.12))

    def test_invalid_zero_island(self):
        self.assertFalse(is_valid_coordinate(0, 0))

    def test_invalid_out_of_range(self):
        self.assertFalse(is_valid_coordinate(91, 0))
        self.assertFalse(is_valid_coordinate(0, 181))

    def test_invalid_null(self):
        self.assertFalse(is_valid_coordinate(None, None))


class TestFiltersFromQueryParams(unittest.TestCase):
    def test_related_to_me_string(self):
        f = filters_from_query_params(related_to_me="1")
        self.assertTrue(f.related_to_me)
        f2 = filters_from_query_params(related_to_me="false")
        self.assertFalse(f2.related_to_me)


class TestMapAddressFormat(unittest.TestCase):
    def test_full_google_address_deduplicated(self):
        result = format_map_address(
            address_line1="6222 Willingdon Ave, Burnaby, BC V5H 0G3, Canada",
        )
        self.assertEqual(result["address_street"], "6222 Willingdon Ave")
        self.assertEqual(result["address_city_line"], "Burnaby, BC V5H 0G3")

    def test_site_preferred_over_project(self):
        site_id = uuid.uuid4()
        project = _ProjectStub(
            site_id=site_id,
            address="6222 Willingdon Ave, Burnaby, BC V5H 0G3, Canada",
            address_city="Burnaby",
            address_province="British Columbia",
        )
        site = MagicMock()
        site.site_address_line1 = "100 Site St"
        site.site_address_line2 = None
        site.site_city = "Vancouver"
        site.site_province = "BC"
        site.site_postal_code = "V6B 1A1"
        result = _format_map_address(project, site)
        self.assertEqual(result["address_street"], "100 Site St")
        self.assertEqual(result["address_city_line"], "Vancouver, BC V6B 1A1")


class TestMapPointsService(unittest.TestCase):
    @patch("app.services.project_map_service.build_business_projects_query")
    def test_opportunities_is_bidding_flag(self, mock_build):
        p1 = _ProjectStub(lat=49.28, lng=-123.12, is_bidding=True)
        mock_query = MagicMock()
        mock_query.all.return_value = [p1]
        mock_build.return_value = mock_query

        db = MagicMock()
        user = MagicMock()
        get_project_map_points(
            db, user, "construction", BusinessProjectListFilters(), is_bidding=True,
        )

        mock_build.assert_called_once()
        self.assertEqual(mock_build.call_args.kwargs.get("is_bidding"), True)

    @patch("app.services.project_map_service.build_business_projects_query")
    def test_mapped_and_unmapped_counts(self, mock_build):
        p1 = _ProjectStub(lat=49.28, lng=-123.12)
        p2 = _ProjectStub(lat=None, lng=None)
        mock_query = MagicMock()
        mock_query.all.return_value = [p1, p2]
        mock_build.return_value = mock_query

        db = MagicMock()
        user = MagicMock()
        result = get_project_map_points(db, user, "construction", BusinessProjectListFilters())

        self.assertEqual(result["total_matching"], 2)
        self.assertEqual(result["mapped_count"], 1)
        self.assertEqual(result["unmapped_count"], 1)
        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(result["items"][0]["latitude"], 49.28)

    @patch("app.services.project_map_service._load_users_map")
    @patch("app.services.project_map_service.build_business_projects_query")
    def test_admin_avatar_in_payload(self, mock_build, mock_users):
        admin_id = uuid.uuid4()
        estimator_id = uuid.uuid4()
        p1 = _ProjectStub(
            lat=49.28,
            lng=-123.12,
            project_admin_id=admin_id,
        )
        p1.estimator_id = estimator_id
        mock_query = MagicMock()
        mock_query.all.return_value = [p1]
        mock_build.return_value = mock_query
        mock_users.return_value = {
            str(admin_id): {
                "id": str(admin_id),
                "name": "Breanne Topham",
                "avatar_file_id": str(uuid.uuid4()),
            },
            str(estimator_id): {
                "id": str(estimator_id),
                "name": "Callum",
                "avatar_file_id": str(uuid.uuid4()),
            },
        }

        db = MagicMock()
        user = MagicMock()
        result = get_project_map_points(db, user, "construction", BusinessProjectListFilters())

        admin = result["items"][0]["project_admin"]
        estimator = result["items"][0]["estimator"]
        self.assertEqual(admin["name"], "Breanne Topham")
        self.assertIsNotNone(admin["avatar_file_id"])
        self.assertEqual(estimator["name"], "Callum")
        self.assertEqual(result["items"][0]["status_label"], "Finished")

    @patch("app.services.project_map_service.build_business_projects_query")
    def test_no_permission_returns_empty(self, mock_build):
        mock_build.return_value = None
        db = MagicMock()
        user = MagicMock()
        result = get_project_map_points(db, user, "construction", BusinessProjectListFilters())
        self.assertEqual(result["items"], [])
        self.assertEqual(result["total_matching"], 0)


if __name__ == "__main__":
    unittest.main()
