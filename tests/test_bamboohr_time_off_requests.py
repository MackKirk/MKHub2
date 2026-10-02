"""BambooHR time-off request parsing and employee filtering."""
import unittest

from app.services.bamboohr_client import (
    coerce_time_off_requests_payload,
    extract_time_off_request_employee_id,
    filter_time_off_requests_for_employee,
    normalize_time_off_policy_name,
    normalize_time_off_status,
    parse_time_off_request_days,
    parse_time_off_request_notes,
)
from app.services.bamboohr_time_off_sync import (
    _is_bamboo_sourced_history,
    _is_manual_history_row,
)


class _FakeHistory:
    def __init__(
        self,
        description=None,
        bamboohr_transaction_id=None,
        last_synced_at=None,
    ):
        self.description = description
        self.bamboohr_transaction_id = bamboohr_transaction_id
        self.last_synced_at = last_synced_at


class TestBambooHRTimeOffRequests(unittest.TestCase):
    def test_extracts_nested_employee_id(self):
        self.assertEqual(extract_time_off_request_employee_id({"employeeId": 41}), "41")
        self.assertEqual(
            extract_time_off_request_employee_id({"employee": {"id": "41"}}),
            "41",
        )

    def test_normalizes_status_object(self):
        self.assertEqual(normalize_time_off_status("Approved"), "approved")
        self.assertEqual(
            normalize_time_off_status({"status": "approved", "lastChanged": "2026-01-01"}),
            "approved",
        )

    def test_filters_out_other_employees(self):
        payload = coerce_time_off_requests_payload(
            [
                {"id": "1", "employeeId": "41", "status": "approved"},
                {"id": "2", "employeeId": "99", "status": "approved"},
                {"id": "3", "employee": {"id": "41"}, "status": {"status": "approved"}},
            ]
        )
        filtered = filter_time_off_requests_for_employee(payload, "41")
        self.assertEqual([row["id"] for row in filtered], ["1", "3"])

    def test_empty_payload_is_empty_list_not_none(self):
        self.assertEqual(coerce_time_off_requests_payload([]), [])
        self.assertEqual(filter_time_off_requests_for_employee([], "41"), [])

    def test_drops_rows_without_employee_id(self):
        """Fail-closed: missing employeeId must not land on the synced user."""
        payload = [
            {"id": "1", "status": "approved", "start": "2025-01-01"},
            {"id": "2", "employeeId": "41", "status": "approved"},
        ]
        filtered = filter_time_off_requests_for_employee(payload, "41")
        self.assertEqual([row["id"] for row in filtered], ["2"])

    def test_normalize_policy_names(self):
        self.assertEqual(normalize_time_off_policy_name("Sick"), "Sick Leave")
        self.assertEqual(normalize_time_off_policy_name("Sick Leave"), "Sick Leave")
        self.assertEqual(normalize_time_off_policy_name("Vacation Days"), "Vacation")
        self.assertEqual(normalize_time_off_policy_name("Day Off"), "Vacation")
        self.assertEqual(normalize_time_off_policy_name("PTO"), "Vacation")
        self.assertEqual(normalize_time_off_policy_name("Bereavement"), "Bereavement")

    def test_parse_amount_days_default(self):
        self.assertEqual(parse_time_off_request_days({"amount": 2}), 2.0)
        self.assertEqual(parse_time_off_request_days({"amount": 16, "unit": "hours"}), 2.0)
        self.assertEqual(
            parse_time_off_request_days({"amount": {"unit": "days", "amount": "1"}}),
            1.0,
        )
        self.assertEqual(
            parse_time_off_request_days({"start": "2025-01-01", "end": "2025-01-03"}),
            3.0,
        )

    def test_parse_request_notes_employee_manager_dict(self):
        self.assertEqual(
            parse_time_off_request_notes({"notes": {"employee": "Birthday!"}}),
            "Birthday!",
        )
        self.assertEqual(
            parse_time_off_request_notes(
                {"notes": {"employee": "Leaving at noon", "manager": "1/2 day off"}}
            ),
            "Leaving at noon\nManager: 1/2 day off",
        )
        self.assertEqual(
            parse_time_off_request_notes(
                {"notes": [{"from": "employee", "note": "Appointments"}]}
            ),
            "Appointments",
        )

    def test_clean_keeps_manual_adjustments(self):
        manual = _FakeHistory(description="Bonus day (Adjusted by Jane)")
        self.assertTrue(_is_manual_history_row(manual))
        self.assertFalse(_is_bamboo_sourced_history(manual))

        bamboo = _FakeHistory(
            description="Time off used for 01/15/2025",
            bamboohr_transaction_id="req:123",
        )
        self.assertTrue(_is_bamboo_sourced_history(bamboo))

        accrual = _FakeHistory(description="Accrual for 01/01/2025 to 12/31/2025")
        self.assertTrue(_is_bamboo_sourced_history(accrual))

    def test_calculator_delta_skips_pure_usage(self):
        from datetime import date

        from app.services.bamboohr_time_off_sync import (
            _calculator_delta_is_interesting,
            _entries_for_calculator_day_change,
        )

        # Exact 1:1 usage
        prev = {"Vacation": (30.0, 0.0)}
        cur = {"Vacation": (18.0, 12.0)}
        self.assertFalse(_calculator_delta_is_interesting(prev, cur, date(2025, 6, 1)))
        self.assertEqual(
            _entries_for_calculator_day_change(prev, cur, date(2025, 6, 1), set()),
            [],
        )
        # Multi-day request: balance drops up front, usedYTD +1
        prev2 = {"Vacation": (17.0, 13.0)}
        cur2 = {"Vacation": (2.0, 14.0)}
        self.assertFalse(_calculator_delta_is_interesting(prev2, cur2, date(2026, 9, 30)))
        self.assertEqual(
            _entries_for_calculator_day_change(prev2, cur2, date(2026, 9, 30), set()),
            [],
        )

    def test_calculator_delta_year_boundary_carryover_and_accrual(self):
        from datetime import date

        from app.services.bamboohr_time_off_sync import _entries_for_calculator_day_change

        prev = {"Sick Leave": (12.0, 0.0)}
        cur = {"Sick Leave": (5.0, 0.0)}
        rows = _entries_for_calculator_day_change(prev, cur, date(2026, 1, 1), set())
        self.assertEqual(len(rows), 2)
        self.assertIn("carryover", rows[0]["description"].lower())
        self.assertEqual(rows[0]["used"], -12.0)
        self.assertEqual(rows[0]["balance"], 0.0)
        self.assertIn("Accrual", rows[1]["description"])
        self.assertEqual(rows[1]["earned"], 5.0)
        self.assertEqual(rows[1]["balance"], 5.0)

        # Balance went UP (forfeit 10 + accrue 15) — still expand fully
        up = _entries_for_calculator_day_change(
            {"Vacation": (10.0, 0.0)},
            {"Vacation": (15.0, 0.0)},
            date(2026, 1, 1),
            set(),
        )
        self.assertEqual(len(up), 2)
        self.assertEqual(up[0]["used"], -10.0)
        self.assertEqual(up[1]["earned"], 15.0)
        self.assertEqual(up[1]["balance"], 15.0)

        # Net-zero rollover (forfeit 5 + accrue 5)
        flat = _entries_for_calculator_day_change(
            {"Sick Leave": (5.0, 3.0)},
            {"Sick Leave": (5.0, 0.0)},
            date(2025, 1, 1),
            set(),
        )
        self.assertEqual(len(flat), 2)
        self.assertEqual(flat[0]["used"], -5.0)
        self.assertEqual(flat[1]["earned"], 5.0)

    def test_calculator_same_day_usage_plus_half_day_clawback(self):
        from datetime import date

        from app.services.bamboohr_time_off_sync import (
            _calculator_delta_is_interesting,
            _entries_for_calculator_day_change,
        )

        prev = {"Sick Leave": (5.0, 0.0)}
        cur = {"Sick Leave": (4.5, 1.0)}  # -1 used request +0.5 Gabi clawback
        self.assertTrue(_calculator_delta_is_interesting(prev, cur, date(2025, 2, 27)))
        rows = _entries_for_calculator_day_change(prev, cur, date(2025, 2, 27), set())
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["description"], "Balance adjusted")
        self.assertEqual(rows[0]["earned"], 0.5)
        self.assertEqual(rows[0]["balance"], 4.5)

    def test_calculator_delta_opening_and_adjustment(self):
        from datetime import date

        from app.services.bamboohr_time_off_sync import _entries_for_calculator_day_change

        seen = set()
        open_rows = _entries_for_calculator_day_change(
            {"Sick Leave": (0.0, 0.0)},
            {"Sick Leave": (5.0, 0.0)},
            date(2024, 8, 8),
            seen,
        )
        self.assertEqual(len(open_rows), 1)
        self.assertEqual(open_rows[0]["description"], "Added opening balance")
        self.assertEqual(open_rows[0]["earned"], 5.0)

        adj = _entries_for_calculator_day_change(
            {"Sick Leave": (5.0, 0.0)},
            {"Sick Leave": (12.0, 0.0)},
            date(2025, 1, 16),
            seen,
        )
        self.assertEqual(len(adj), 1)
        self.assertEqual(adj[0]["description"], "Balance adjusted")
        self.assertEqual(adj[0]["earned"], 7.0)
        self.assertEqual(adj[0]["balance"], 12.0)


if __name__ == "__main__":
    unittest.main()
