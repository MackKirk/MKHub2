"""Employment type is the working relationship. Salary belongs on pay type."""
import unittest

from app.services.employment_type import (
    canonical_employment_type,
    employment_type_for_storage,
    reconcile_employment_and_pay,
)


class TestEmploymentType(unittest.TestCase):
    def test_maps_schedule_and_contract(self):
        self.assertEqual(canonical_employment_type("full-time"), "Full-time")
        self.assertEqual(canonical_employment_type("Full Time"), "Full-time")
        self.assertEqual(canonical_employment_type("part time"), "Part-time")
        self.assertEqual(canonical_employment_type("contractor"), "Contract")
        self.assertEqual(employment_type_for_storage("Full-time"), "Full-time")

    def test_pay_labels_are_not_stored_as_employment_type(self):
        self.assertIsNone(canonical_employment_type("salary"))
        self.assertIsNone(employment_type_for_storage("Salary"))
        self.assertIsNone(employment_type_for_storage("hourly"))
        self.assertIsNone(employment_type_for_storage("  "))
        self.assertIsNone(employment_type_for_storage(None))


class TestReconcileEmploymentAndPay(unittest.TestCase):
    def test_salary_employment_becomes_salary_pay_and_stops_hours(self):
        employment, pay, clear_hours = reconcile_employment_and_pay("salary", "hourly")
        self.assertIsNone(employment)
        self.assertEqual(pay, "salary")
        self.assertTrue(clear_hours)

        employment, pay, clear_hours = reconcile_employment_and_pay("Salary", None)
        self.assertIsNone(employment)
        self.assertEqual(pay, "salary")
        self.assertTrue(clear_hours)

    def test_full_time_salary_stays_full_time(self):
        employment, pay, clear_hours = reconcile_employment_and_pay("Full-time", "salary")
        self.assertEqual(employment, "Full-time")
        self.assertEqual(pay, "salary")
        self.assertFalse(clear_hours)

    def test_contract_pay_becomes_hourly_and_contract_employment_when_missing(self):
        employment, pay, clear_hours = reconcile_employment_and_pay(None, "contract")
        self.assertEqual(employment, "Contract")
        self.assertEqual(pay, "hourly")
        self.assertFalse(clear_hours)

    def test_hourly_employment_without_pay_becomes_hourly(self):
        employment, pay, clear_hours = reconcile_employment_and_pay("Hourly", None)
        self.assertIsNone(employment)
        self.assertEqual(pay, "hourly")
        self.assertFalse(clear_hours)


if __name__ == "__main__":
    unittest.main()
