"""Tests for user list preferences normalization/merge."""
import unittest

from app.services.user_list_preferences import (
    empty_list_preferences,
    empty_opportunity_status_ids,
    merge_list_preferences,
    normalize_list_preferences_data,
)


class TestUserListPreferences(unittest.TestCase):
    def test_empty_defaults_are_all_mode(self):
        self.assertEqual(
            empty_opportunity_status_ids(),
            {"construction": None, "repairs": None},
        )
        self.assertEqual(
            empty_list_preferences(),
            {
                "opportunity_status_ids": {"construction": None, "repairs": None},
                "project_status_ids": {"construction": None, "repairs": None},
            },
        )

    def test_normalize_omitted_is_all_null(self):
        out = normalize_list_preferences_data({})
        self.assertIsNone(out["opportunity_status_ids"]["construction"])
        self.assertIsNone(out["opportunity_status_ids"]["repairs"])
        self.assertIsNone(out["project_status_ids"]["construction"])
        self.assertIsNone(out["project_status_ids"]["repairs"])

    def test_normalize_filters_invalid_uuids_keeps_empty_as_none_mode(self):
        good = "11111111-1111-1111-1111-111111111111"
        raw = {
            "opportunity_status_ids": {
                "construction": [good, "not-a-uuid", good, ""],
                "repairs": [],
            },
            "project_status_ids": {
                "construction": [],
                "repairs": [good],
            },
        }
        out = normalize_list_preferences_data(raw)
        self.assertEqual(out["opportunity_status_ids"]["construction"], [good])
        self.assertEqual(out["opportunity_status_ids"]["repairs"], [])
        self.assertEqual(out["project_status_ids"]["construction"], [])
        self.assertEqual(out["project_status_ids"]["repairs"], [good])

    def test_normalize_explicit_null_is_all(self):
        raw = {
            "opportunity_status_ids": {"construction": None, "repairs": None},
            "project_status_ids": {"construction": None, "repairs": None},
        }
        out = normalize_list_preferences_data(raw)
        self.assertIsNone(out["opportunity_status_ids"]["construction"])
        self.assertIsNone(out["project_status_ids"]["repairs"])

    def test_merge_overwrites_only_provided_lines_and_buckets(self):
        a = "11111111-1111-1111-1111-111111111111"
        b = "22222222-2222-2222-2222-222222222222"
        existing = {
            "opportunity_status_ids": {
                "construction": [a],
                "repairs": [b],
            },
            "project_status_ids": {
                "construction": [b],
                "repairs": [a],
            },
        }
        merged = merge_list_preferences(
            existing,
            {"opportunity_status_ids": {"construction": None}},
        )
        self.assertIsNone(merged["opportunity_status_ids"]["construction"])
        self.assertEqual(merged["opportunity_status_ids"]["repairs"], [b])
        self.assertEqual(merged["project_status_ids"]["construction"], [b])
        self.assertEqual(merged["project_status_ids"]["repairs"], [a])

        merged_proj = merge_list_preferences(
            existing,
            {"project_status_ids": {"construction": []}},
        )
        self.assertEqual(merged_proj["opportunity_status_ids"]["construction"], [a])
        self.assertEqual(merged_proj["project_status_ids"]["construction"], [])
        self.assertEqual(merged_proj["project_status_ids"]["repairs"], [a])


if __name__ == "__main__":
    unittest.main()
