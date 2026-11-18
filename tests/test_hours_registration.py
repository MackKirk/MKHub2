"""Tests for salary hours-registration rules."""
import unittest

from app.services.hours_registration import (
    canonical_pay_type,
    employee_should_register_hours,
    is_salary_pay_type,
    pay_type_for_storage,
)


class TestHoursRegistration(unittest.TestCase):
    def test_is_salary_pay_type(self):
        self.assertTrue(is_salary_pay_type("Salary"))
        self.assertTrue(is_salary_pay_type("salary"))
        self.assertTrue(is_salary_pay_type("Annual"))
        self.assertTrue(is_salary_pay_type("Exempt"))
        self.assertFalse(is_salary_pay_type("Hourly"))
        self.assertFalse(is_salary_pay_type(None))
        self.assertFalse(is_salary_pay_type(""))

    def test_canonical_pay_type(self):
        self.assertEqual(canonical_pay_type("Salary"), "salary")
        self.assertEqual(canonical_pay_type("Hourly"), "hourly")
        self.assertEqual(canonical_pay_type("Contractor"), "contract")
        self.assertEqual(canonical_pay_type("Salary - Exempt"), "salary")
        self.assertIsNone(canonical_pay_type("piece work"))
        self.assertIsNone(canonical_pay_type(None))

    def test_hourly_must_register(self):
        self.assertTrue(employee_should_register_hours(pay_type="Hourly"))
        self.assertTrue(employee_should_register_hours(pay_type="Contract", needs_register_hours=False))

    def test_salary_skips_by_default(self):
        self.assertFalse(employee_should_register_hours(pay_type="Salary"))
        self.assertFalse(employee_should_register_hours(pay_type="Annual"))
        self.assertFalse(employee_should_register_hours(pay_type="Salary", needs_register_hours=False))

    def test_salary_with_flag_must_register(self):
        self.assertTrue(employee_should_register_hours(pay_type="Salary", needs_register_hours=True))

    def test_salary_employment_label_skips_hours_even_if_pay_type_is_hourly(self):
        self.assertFalse(
            employee_should_register_hours(pay_type="hourly", employment_type="salary", needs_register_hours=False)
        )
        self.assertFalse(
            employee_should_register_hours(pay_type=None, employment_type="Salary")
        )

    def test_contract_pay_is_stored_as_hourly(self):
        self.assertEqual(pay_type_for_storage("contract"), "hourly")
        self.assertEqual(pay_type_for_storage("salary"), "salary")


if __name__ == "__main__":
    unittest.main()
