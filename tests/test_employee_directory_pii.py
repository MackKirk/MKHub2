import unittest

from app.routes.employees import strip_employee_directory_pii


class EmployeeDirectoryPiiTests(unittest.TestCase):
    def test_hr_keeps_personal_fields(self):
        row = {
            "email": "home@example.com",
            "address": "1 Main",
            "phone": "555",
            "hire_date": "2020-01-01",
            "work_email": "w@co.com",
            "name": "Pat",
        }
        out = strip_employee_directory_pii(row, see_pii=True)
        self.assertEqual(out["email"], "home@example.com")
        self.assertEqual(out["address"], "1 Main")
        self.assertEqual(out["work_email"], "w@co.com")

    def test_non_hr_loses_personal_keeps_work(self):
        row = {
            "email": "home@example.com",
            "address": "1 Main",
            "phone": "555",
            "hire_date": "2020-01-01",
            "work_email": "w@co.com",
            "work_phone": "111",
            "name": "Pat",
        }
        out = strip_employee_directory_pii(row, see_pii=False)
        self.assertIsNone(out["email"])
        self.assertIsNone(out["address"])
        self.assertIsNone(out["phone"])
        self.assertIsNone(out["hire_date"])
        self.assertEqual(out["work_email"], "w@co.com")
        self.assertEqual(out["work_phone"], "111")
        self.assertEqual(out["name"], "Pat")


if __name__ == "__main__":
    unittest.main()
