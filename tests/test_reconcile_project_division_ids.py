"""Divisions without pricing stay; fully unapproved divisions are dropped."""
import unittest

from app.services.project_utils import equal_division_percentages, reconcile_project_division_ids


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

    def test_approved_optional_adds_division(self):
        self.assertEqual(
            reconcile_project_division_ids(
                ["roofing"],
                [],
                [{"division_id": "siding", "status": "approved", "price": 100}],
            ),
            ["roofing", "siding"],
        )

    def test_pending_optional_does_not_add_or_drop(self):
        self.assertEqual(
            reconcile_project_division_ids(
                ["roofing", "siding"],
                [],
                [{"division_id": "gutters", "status": "pending", "price": 50}],
            ),
            ["roofing", "siding"],
        )

    def test_not_approved_optional_drops_division_with_no_approved_rows(self):
        self.assertEqual(
            reconcile_project_division_ids(
                ["roofing", "siding"],
                [],
                [{"division_id": "siding", "status": "not_approved", "price": 50}],
            ),
            ["roofing"],
        )

    def test_equal_division_percentages(self):
        self.assertEqual(equal_division_percentages(["a", "b", "c"]), {"a": 33, "b": 33, "c": 34})
        self.assertEqual(equal_division_percentages([]), {})


if __name__ == "__main__":
    unittest.main()
