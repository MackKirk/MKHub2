"""BambooHR time-off request parsing and employee filtering."""
import unittest

from app.services.bamboohr_client import (
    coerce_time_off_requests_payload,
    extract_time_off_request_employee_id,
    filter_time_off_requests_for_employee,
    normalize_time_off_status,
)


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


if __name__ == "__main__":
    unittest.main()
