from app.auth.mass_assignment import sanitize_orm_patch
import unittest


class MassAssignmentTests(unittest.TestCase):
    def test_drops_deleted_at_and_id(self):
        out = sanitize_orm_patch(
            {"name": "Acme", "deleted_at": "2026-01-01", "id": "x", "is_system": True}
        )
        self.assertEqual(out, {"name": "Acme"})

    def test_keeps_normal_project_fields(self):
        out = sanitize_orm_patch(
            {"name": "Job", "status_label": "Active", "cost_estimated": 10, "address": "1 St"}
        )
        self.assertEqual(out["name"], "Job")
        self.assertEqual(out["cost_estimated"], 10)
        self.assertEqual(out["status_label"], "Active")


if __name__ == "__main__":
    unittest.main()
