"""Divisions without pricing stay; fully unapproved divisions are dropped."""
import unittest

from app.services.project_utils import reconcile_project_division_ids


class ReconcileProjectDivisionIdsTests(unittest.TestCase):
    def test_keeps_division_that_has_no_pricing_rows(self):
        current = ["roofing", "siding", "gutters"]
        costs = [
            {"division_id": "roofing", "approved": True},
            {"division_id": "siding"},
        ]
        self.assertEqual(
            reconcile_project_division_ids(current, costs),
            ["roofing", "siding", "gutters"],
        )

    def test_adds_approved_division_that_was_not_on_the_project(self):
        self.assertEqual(
            reconcile_project_division_ids(
                ["roofing"],
                [{"division_id": "siding", "approved": True}],
            ),
            ["roofing", "siding"],
        )

    def test_drops_division_whose_items_are_all_unapproved(self):
        self.assertEqual(
            reconcile_project_division_ids(
                ["roofing", "siding", "gutters"],
                [
                    {"division_id": "siding", "approved": False},
                    {"division_id": "siding", "approved": False},
                ],
            ),
            ["roofing", "gutters"],
        )

    def test_keeps_division_when_any_item_stays_approved(self):
        self.assertEqual(
            reconcile_project_division_ids(
                ["roofing"],
                [
                    {"division_id": "roofing", "approved": False},
                    {"division_id": "roofing", "approved": True},
                ],
            ),
            ["roofing"],
        )

    def test_does_not_add_a_new_division_that_is_only_unapproved(self):
        self.assertEqual(
            reconcile_project_division_ids(
                ["roofing"],
                [{"division_id": "siding", "approved": False}],
            ),
            ["roofing"],
        )

    def test_empty_pricing_leaves_existing_divisions(self):
        self.assertEqual(reconcile_project_division_ids(["roofing", "siding"], []), ["roofing", "siding"])
        self.assertEqual(reconcile_project_division_ids(["roofing"], None), ["roofing"])


if __name__ == "__main__":
    unittest.main()
