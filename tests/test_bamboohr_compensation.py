"""BambooHR compensation row normalization."""
import unittest

from app.services.bamboohr_client import (
    coerce_compensation_rows,
    normalize_compensation_pay_type,
    normalize_compensation_rate,
    normalize_compensation_row,
)
from app.services.bamboohr_compensation_sync import (
    BAMBOO_JUSTIFICATION_PREFIX,
    _bamboo_id_from_notes,
    _build_justification,
    _build_notes,
)


class TestBambooCompensationNormalize(unittest.TestCase):
    def test_rate_from_dict(self):
        self.assertEqual(
            normalize_compensation_rate({"currency": "CAD", "value": "27.00"}),
            "27.00",
        )

    def test_rate_from_string_with_currency(self):
        self.assertEqual(normalize_compensation_rate("21.00 CAD"), "21.00")

    def test_pay_type_mapping(self):
        self.assertEqual(normalize_compensation_pay_type("Hourly"), "hourly")
        self.assertEqual(normalize_compensation_pay_type("Annual"), "salary")
        self.assertEqual(normalize_compensation_pay_type("Salary"), "salary")

    def test_named_json_row(self):
        row = normalize_compensation_row(
            {
                "id": "18297",
                "employeeId": "209",
                "startDate": "2024-06-05",
                "rate": {"currency": "CAD", "value": "27.00"},
                "type": "Hourly",
                "reason": "",
                "comment": None,
                "paidPer": "Hour",
            }
        )
        self.assertIsNotNone(row)
        self.assertEqual(row["id"], "18297")
        self.assertEqual(row["rate"], "27.00")
        self.assertEqual(row["type"], "hourly")
        self.assertEqual(row["startDate"], "2024-06-05")
        self.assertEqual(row["comment"], "")

    def test_array_row(self):
        row = normalize_compensation_row(
            ["2023-04-28", "21.00", "Hourly", "", "", "Starting Wage", "Hour", "Weekly", ""]
        )
        self.assertIsNotNone(row)
        self.assertEqual(row["startDate"], "2023-04-28")
        self.assertEqual(row["rate"], "21.00")
        self.assertEqual(row["type"], "hourly")
        self.assertEqual(row["comment"], "Starting Wage")

    def test_coerce_sorts_oldest_first(self):
        rows = coerce_compensation_rows(
            [
                {
                    "id": "2",
                    "startDate": "2024-06-05",
                    "rate": {"value": "27.00"},
                    "type": "Hourly",
                },
                {
                    "id": "1",
                    "startDate": "2023-04-28",
                    "rate": {"value": "21.00"},
                    "type": "Hourly",
                },
            ]
        )
        self.assertEqual([r["startDate"] for r in rows], ["2023-04-28", "2024-06-05"])

    def test_notes_and_justification(self):
        notes = _build_notes(
            {
                "id": "18294",
                "comment": "Starting Wage",
                "currency": "CAD",
                "paidPer": "Hour",
            }
        )
        self.assertIn("bamboo_compensation_id:18294", notes)
        self.assertIn("Starting Wage", notes)
        self.assertEqual(_bamboo_id_from_notes(notes), "18294")
        self.assertEqual(
            _build_justification({"reason": "Promotion"}),
            f"{BAMBOO_JUSTIFICATION_PREFIX}: Promotion",
        )


if __name__ == "__main__":
    unittest.main()
