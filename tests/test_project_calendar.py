"""Tests for projects calendar: only days with scheduled shifts."""
import unittest
import uuid
from datetime import date, datetime, time
from unittest.mock import MagicMock, patch

from app.models.models import Client, Shift
from app.services.project_calendar_service import get_project_calendar_data
from app.services.project_list_filters import BusinessProjectListFilters


class _ProjectStub:
    def __init__(
        self,
        pid=None,
        name="Test Project",
        code="MK-001",
        status_label="In Progress",
        client_id=None,
        date_start=None,
        date_eta=None,
        date_end=None,
        created_at=None,
        business_line="repairs_maintenance",
        project_admin_id=None,
        estimator_ids=None,
        estimator_id=None,
        division_onsite_leads=None,
        project_division_ids=None,
        onsite_lead_id=None,
    ):
        self.id = pid or uuid.uuid4()
        self.name = name
        self.code = code
        self.status_label = status_label
        self.client_id = client_id
        self.date_start = date_start
        self.date_eta = date_eta
        self.date_end = date_end
        self.created_at = created_at
        self.business_line = business_line
        self.project_admin_id = project_admin_id
        self.estimator_ids = estimator_ids or []
        self.estimator_id = estimator_id
        self.division_onsite_leads = division_onsite_leads or {}
        self.project_division_ids = project_division_ids or []
        self.onsite_lead_id = onsite_lead_id


class _ShiftStub:
    def __init__(
        self,
        project_id,
        shift_date,
        worker_id=None,
        start=None,
        end=None,
        status="scheduled",
        sid=None,
    ):
        self.id = sid or uuid.uuid4()
        self.project_id = project_id
        self.date = shift_date
        self.worker_id = worker_id or uuid.uuid4()
        self.start_time = start or time(8, 0)
        self.end_time = end or time(16, 0)
        self.status = status


def _make_db(shifts, clients=None):
    db = MagicMock()

    def query(model, *args):
        q = MagicMock()
        q.filter.return_value = q
        q.join.return_value = q
        q.order_by.return_value = q
        if model is Shift:
            q.all.return_value = shifts
        elif model is Client:
            q.all.return_value = clients or []
        else:
            q.all.return_value = []
        return q

    db.query.side_effect = query
    return db


class TestProjectCalendarShiftsOnly(unittest.TestCase):
    @patch("app.services.project_calendar_service._has_project_feature_permission", return_value=True)
    @patch("app.services.project_calendar_service._load_users_map", return_value={})
    @patch("app.services.project_calendar_service._division_labels_map", return_value={})
    @patch("app.services.project_calendar_service.build_business_projects_query")
    def test_date_range_only_project_excluded(self, mock_build, *_mocks):
        project = _ProjectStub(
            date_start=datetime(2026, 9, 1),
            date_eta=datetime(2026, 9, 30),
        )
        mock_query = MagicMock()
        mock_query.all.return_value = [project]
        mock_build.return_value = mock_query

        result = get_project_calendar_data(
            _make_db([]),
            MagicMock(),
            "repairs_maintenance",
            BusinessProjectListFilters(),
            start="2026-09-01",
            end="2026-09-30",
        )

        self.assertEqual(result["days"], {})
        self.assertEqual(result["meta"]["project_count"], 0)
        self.assertEqual(result["meta"]["days_with_activity"], 0)

    @patch("app.services.project_calendar_service._has_project_feature_permission", return_value=True)
    @patch("app.services.project_calendar_service._load_users_map", return_value={})
    @patch("app.services.project_calendar_service._division_labels_map", return_value={})
    @patch("app.services.project_calendar_service.build_business_projects_query")
    def test_appears_only_on_shift_day(self, mock_build, *_mocks):
        project = _ProjectStub(
            date_start=datetime(2026, 9, 1),
            date_eta=datetime(2026, 9, 30),
        )
        shift_day = date(2026, 9, 15)
        shift = _ShiftStub(project.id, shift_day)
        mock_query = MagicMock()
        mock_query.all.return_value = [project]
        mock_build.return_value = mock_query

        result = get_project_calendar_data(
            _make_db([shift]),
            MagicMock(),
            "repairs_maintenance",
            BusinessProjectListFilters(),
            start="2026-09-01",
            end="2026-09-30",
        )

        self.assertEqual(result["meta"]["project_count"], 1)
        self.assertEqual(result["meta"]["days_with_activity"], 1)
        self.assertIn("2026-09-15", result["days"])
        self.assertEqual(len(result["days"]), 1)
        entries = result["days"]["2026-09-15"]
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["project_id"], str(project.id))
        self.assertEqual(entries[0]["appearance"], "both")
        self.assertEqual(entries[0]["shift_count"], 1)
        self.assertNotIn("2026-09-01", result["days"])
        self.assertNotIn("2026-09-30", result["days"])

    @patch("app.services.project_calendar_service._has_project_feature_permission", return_value=True)
    @patch("app.services.project_calendar_service._load_users_map", return_value={})
    @patch("app.services.project_calendar_service._division_labels_map", return_value={})
    @patch("app.services.project_calendar_service.build_business_projects_query")
    def test_shift_outside_date_range_still_appears(self, mock_build, *_mocks):
        project = _ProjectStub(
            date_start=datetime(2026, 9, 10),
            date_eta=datetime(2026, 9, 20),
        )
        outside_day = date(2026, 9, 5)
        shift = _ShiftStub(project.id, outside_day)
        mock_query = MagicMock()
        mock_query.all.return_value = [project]
        mock_build.return_value = mock_query

        result = get_project_calendar_data(
            _make_db([shift]),
            MagicMock(),
            "repairs_maintenance",
            BusinessProjectListFilters(),
            start="2026-09-01",
            end="2026-09-30",
        )

        self.assertEqual(result["meta"]["project_count"], 1)
        self.assertIn("2026-09-05", result["days"])
        entry = result["days"]["2026-09-05"][0]
        self.assertEqual(entry["appearance"], "shift_only")
        self.assertEqual(entry["shift_count"], 1)
        # No chips on in-range days without shifts
        self.assertNotIn("2026-09-10", result["days"])
        self.assertNotIn("2026-09-15", result["days"])


if __name__ == "__main__":
    unittest.main()
