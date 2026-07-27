"""Tests for warranty domain logic."""
import unittest
from datetime import date
from unittest.mock import MagicMock

from app.services.warranty import (
    apply_warranty_status_transitions,
    calculate_end_date,
    calculate_next_maintenance_date,
    compute_overall_warranty_status,
    compute_total_internal_cost,
    validate_warranty_payload,
)


class _ProjectStub:
    project_division_ids = []


class _WarrantyStub:
    def __init__(self, status: str, end_date: date | None = None):
        self.status = status
        self.end_date = end_date


class TestWarrantyDateMath(unittest.TestCase):
    def test_calculate_end_date_years(self):
        start = date(2026, 1, 15)
        end = calculate_end_date(start, 2, "years")
        self.assertEqual(end, date(2028, 1, 15))

    def test_calculate_end_date_months(self):
        start = date(2026, 1, 31)
        end = calculate_end_date(start, 1, "months")
        self.assertEqual(end.month, 2)

    def test_next_maintenance_annually(self):
        nxt = calculate_next_maintenance_date(date(2026, 3, 1), "annually", None, None)
        self.assertEqual(nxt, date(2027, 3, 1))


class TestWarrantyStatusTransitions(unittest.TestCase):
    def test_expired_when_past_end(self):
        w = _WarrantyStub("active", date(2020, 1, 1))
        changed = apply_warranty_status_transitions(w, today=date(2026, 1, 1))
        self.assertTrue(changed)
        self.assertEqual(w.status, "expired")

    def test_expiring_soon_within_90_days(self):
        w = _WarrantyStub("active", date(2026, 2, 1))
        changed = apply_warranty_status_transitions(w, today=date(2026, 1, 1))
        self.assertTrue(changed)
        self.assertEqual(w.status, "expiring_soon")

    def test_skips_voided(self):
        w = _WarrantyStub("voided", date(2020, 1, 1))
        changed = apply_warranty_status_transitions(w, today=date(2026, 1, 1))
        self.assertFalse(changed)
        self.assertEqual(w.status, "voided")


class TestOverallStatus(unittest.TestCase):
    def test_no_warranty(self):
        self.assertEqual(compute_overall_warranty_status([]), "no_warranty")

    def test_active_when_all_active(self):
        rows = [_WarrantyStub("active", date(2030, 1, 1))]
        self.assertEqual(compute_overall_warranty_status(rows), "active")

    def test_partial_coverage(self):
        rows = [
            _WarrantyStub("active", date(2030, 1, 1)),
            _WarrantyStub("pending_registration", date(2030, 1, 1)),
        ]
        self.assertEqual(compute_overall_warranty_status(rows), "partial_coverage")


class TestCostTotals(unittest.TestCase):
    def test_compute_total_internal_cost(self):
        total = compute_total_internal_cost(100, 50, 25, 25)
        self.assertEqual(total, 200.0)

    def test_compute_total_ignores_none(self):
        total = compute_total_internal_cost(100, None, 50, None)
        self.assertEqual(total, 150.0)


class TestValidateWarrantyPayload(unittest.TestCase):
    def test_duration_calculates_end_date_when_end_date_empty_in_payload(self):
        result = validate_warranty_payload(
            MagicMock(),
            _ProjectStub(),
            {
                "name": "Roof warranty",
                "start_date": "2026-01-15",
                "duration_value": 2,
                "duration_unit": "years",
                "end_date": "",
            },
        )
        self.assertEqual(result["end_date"], date(2028, 1, 15))

    def test_duration_does_not_override_explicit_end_date(self):
        result = validate_warranty_payload(
            MagicMock(),
            _ProjectStub(),
            {
                "name": "Roof warranty",
                "start_date": "2026-01-15",
                "duration_value": 2,
                "duration_unit": "years",
                "end_date": "2030-06-01",
            },
        )
        self.assertEqual(result["end_date"], date(2030, 6, 1))

    def test_maintenance_syncs_first_due_from_next_when_new(self):
        result = validate_warranty_payload(
            MagicMock(),
            _ProjectStub(),
            {
                "name": "Roof warranty",
                "maintenance_required": True,
                "maintenance_frequency": "annually",
                "next_maintenance_due_date": "2027-03-01",
            },
        )
        self.assertEqual(result["first_maintenance_due_date"], date(2027, 3, 1))
        self.assertEqual(result["next_maintenance_due_date"], date(2027, 3, 1))

    def test_maintenance_disabled_clears_fields_from_payload(self):
        existing = MagicMock()
        existing.maintenance_required = True
        existing.maintenance_frequency = "annually"
        existing.maintenance_interval_value = None
        existing.maintenance_interval_unit = None
        existing.next_maintenance_due_date = date(2027, 3, 1)
        existing.first_maintenance_due_date = date(2027, 3, 1)
        existing.last_maintenance_completed_at = None
        existing.start_date = None
        existing.end_date = None
        existing.status = "draft"

        result = validate_warranty_payload(
            MagicMock(),
            _ProjectStub(),
            {
                "maintenance_required": False,
                "maintenance_frequency": None,
                "maintenance_interval_value": None,
                "maintenance_interval_unit": None,
                "next_maintenance_due_date": None,
                "first_maintenance_due_date": None,
            },
            existing=existing,
        )
        self.assertFalse(result["maintenance_required"])
        self.assertIsNone(result["maintenance_frequency"])
        self.assertIsNone(result["next_maintenance_due_date"])
        self.assertIsNone(result["first_maintenance_due_date"])


if __name__ == "__main__":
    unittest.main()
