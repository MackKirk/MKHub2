"""Tests for document editor preference normalization/merge."""
import unittest

from app.services.user_document_editor_preferences import (
    empty_document_editor_preferences,
    merge_document_editor_preferences,
    normalize_document_editor_preferences_data,
)


class TestUserDocumentEditorPreferences(unittest.TestCase):
    def test_empty_defaults(self):
        self.assertEqual(
            empty_document_editor_preferences(),
            {
                "text_edit_exit": "require_done",
                "snap_to_guides": True,
                "show_drag_guides": True,
                "default_zoom": 0.8,
            },
        )

    def test_normalize_unknown_falls_back(self):
        out = normalize_document_editor_preferences_data({"text_edit_exit": "nope"})
        self.assertEqual(out["text_edit_exit"], "require_done")
        self.assertTrue(out["snap_to_guides"])
        self.assertTrue(out["show_drag_guides"])
        self.assertEqual(out["default_zoom"], 0.8)

    def test_normalize_accepts_click_outside_and_flags(self):
        out = normalize_document_editor_preferences_data(
            {
                "text_edit_exit": "click_outside",
                "snap_to_guides": False,
                "show_drag_guides": False,
                "default_zoom": 0.6,
            }
        )
        self.assertEqual(out["text_edit_exit"], "click_outside")
        self.assertFalse(out["snap_to_guides"])
        self.assertFalse(out["show_drag_guides"])
        self.assertEqual(out["default_zoom"], 0.6)

    def test_normalize_zoom_snaps_to_nearest(self):
        out = normalize_document_editor_preferences_data({"default_zoom": 0.74})
        self.assertEqual(out["default_zoom"], 0.7)

    def test_merge_only_updates_provided_keys(self):
        merged = merge_document_editor_preferences(
            {
                "text_edit_exit": "require_done",
                "snap_to_guides": True,
                "show_drag_guides": True,
                "default_zoom": 0.8,
            },
            {"snap_to_guides": False},
        )
        self.assertEqual(merged["text_edit_exit"], "require_done")
        self.assertFalse(merged["snap_to_guides"])
        self.assertTrue(merged["show_drag_guides"])
        self.assertEqual(merged["default_zoom"], 0.8)
        merged = merge_document_editor_preferences(
            merged,
            {"text_edit_exit": "click_outside", "default_zoom": 1.5},
        )
        self.assertEqual(merged["text_edit_exit"], "click_outside")
        self.assertEqual(merged["default_zoom"], 1.5)


if __name__ == "__main__":
    unittest.main()
