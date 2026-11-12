"""Legacy employment type strings must match the profile select options."""
import unittest

from app.services.employment_type import canonical_employment_type, employment_type_for_storage


class TestEmploymentType(unittest.TestCase):
    def test_maps_lowercase_labels(self):
        self.assertEqual(canonical_employment_type("salary"), "Salary")
        self.assertEqual(canonical_employment_type("hourly"), "Hourly")
        self.assertEqual(canonical_employment_type("full-time"), "Full-time")
        self.assertEqual(canonical_employment_type("Full Time"), "Full-time")
        self.assertEqual(canonical_employment_type("part time"), "Part-time")

    def test_keeps_option_values(self):
        self.assertEqual(canonical_employment_type("Salary"), "Salary")
        self.assertEqual(employment_type_for_storage("Salary"), "Salary")

    def test_unknown_text_is_preserved_for_storage(self):
        self.assertIsNone(canonical_employment_type("contractor"))
        self.assertEqual(employment_type_for_storage("contractor"), "contractor")
        self.assertIsNone(employment_type_for_storage("  "))
        self.assertIsNone(employment_type_for_storage(None))


if __name__ == "__main__":
    unittest.main()
