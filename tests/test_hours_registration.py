"""Tests for salary hours-registration rules."""
import unittest

from app.services.hours_registration import employee_should_register_hours, is_salary_pay_type


class TestHoursRegistration(unittest.TestCase):
    def test_is_salary_pay_type(self):
        self.assertTrue(is_salary_pay_type("Salary"))
        self.assertTrue(is_salary_pay_type("salary"))
        self.assertFalse(is_salary_pay_type("Hourly"))
        self.assertFalse(is_salary_pay_type(None))
        self.assertFalse(is_salary_pay_type(""))

    def test_hourly_must_register(self):
        self.assertTrue(employee_should_register_hours(pay_type="Hourly"))
        self.assertTrue(employee_should_register_hours(pay_type="Contract", needs_register_hours=False))

    def test_salary_skips_by_default(self):
        self.assertFalse(employee_should_register_hours(pay_type="Salary"))
        self.assertFalse(employee_should_register_hours(pay_type="Salary", needs_register_hours=False))

    def test_salary_with_flag_must_register(self):
        self.assertTrue(employee_should_register_hours(pay_type="Salary", needs_register_hours=True))


if __name__ == "__main__":
    unittest.main()
