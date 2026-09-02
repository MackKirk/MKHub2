"""Tests for document template category validation and permissions."""
import unittest
import uuid
from unittest.mock import MagicMock, patch

from app.routes.permissions import PERMISSION_CONFIG_KEYS
from app.services.document_template_categories import (
    PERMISSION_CONFIG_KEY,
    can_use_document_template_category,
    filter_document_types_for_user,
    get_allowed_category_ids,
    should_bypass_category_filter,
    validate_document_template_category,
)


class _FakeDocType:
    def __init__(self, category=None):
        self.category = category


class TestDocumentTemplateCategoryValidation(unittest.TestCase):
    @patch("app.services.document_template_categories.get_document_template_category_labels")
    def test_accepts_empty_category(self, mock_labels):
        mock_labels.return_value = {"Contract"}
        self.assertIsNone(validate_document_template_category(MagicMock(), None))
        self.assertIsNone(validate_document_template_category(MagicMock(), "  "))

    @patch("app.services.document_template_categories.get_document_template_category_labels")
    def test_accepts_known_category(self, mock_labels):
        mock_labels.return_value = {"Contract", "Proposal"}
        result = validate_document_template_category(MagicMock(), "Contract")
        self.assertEqual(result, "Contract")

    @patch("app.services.document_template_categories.get_document_template_category_labels")
    def test_rejects_unknown_category(self, mock_labels):
        mock_labels.return_value = {"Contract"}
        with self.assertRaises(ValueError):
            validate_document_template_category(MagicMock(), "Unknown")

    @patch("app.services.document_template_categories.get_document_template_category_labels")
    def test_allows_legacy_value_on_patch(self, mock_labels):
        mock_labels.return_value = {"Contract"}
        result = validate_document_template_category(
            MagicMock(),
            "Old Category",
            allow_legacy="Old Category",
        )
        self.assertEqual(result, "Old Category")


class TestDocumentTemplateCategoryPermissions(unittest.TestCase):
    def test_config_key_registered(self):
        self.assertIn(PERMISSION_CONFIG_KEY, PERMISSION_CONFIG_KEYS)

    def _user(self, perms=None):
        user = MagicMock()
        user.roles = []
        user.permissions_override = perms or {}
        return user

    @patch("app.services.document_template_categories._user_is_admin")
    def test_admin_bypass_returns_none_allowed_set(self, mock_admin):
        mock_admin.return_value = True
        self.assertIsNone(get_allowed_category_ids(self._user()))
        self.assertTrue(should_bypass_category_filter(self._user()))

    @patch("app.services.document_template_categories._user_is_admin")
    def test_missing_config_denies_by_default(self, mock_admin):
        mock_admin.return_value = False
        self.assertEqual(get_allowed_category_ids(self._user()), set())
        self.assertFalse(should_bypass_category_filter(self._user()))

    @patch("app.services.document_template_categories._user_is_admin")
    def test_explicit_allow_list(self, mock_admin):
        mock_admin.return_value = False
        cat_id = str(uuid.uuid4())
        allowed = get_allowed_category_ids(
            self._user({PERMISSION_CONFIG_KEY: [cat_id]}),
        )
        self.assertEqual(allowed, {cat_id})

    @patch("app.services.document_template_categories.resolve_category_setting_id")
    @patch("app.services.document_template_categories.get_allowed_category_ids")
    @patch("app.services.document_template_categories._user_is_admin")
    def test_uncategorized_always_allowed(self, mock_admin, mock_allowed, mock_resolve):
        mock_admin.return_value = False
        mock_allowed.return_value = set()
        mock_resolve.return_value = None
        user = self._user()
        db = MagicMock()
        self.assertTrue(can_use_document_template_category(user, db, None))
        self.assertTrue(can_use_document_template_category(user, db, "  "))

    @patch("app.services.document_template_categories.resolve_category_setting_id")
    @patch("app.services.document_template_categories.get_allowed_category_ids")
    @patch("app.services.document_template_categories._user_is_admin")
    def test_templates_write_does_not_bypass_category_filter(
        self, mock_admin, mock_allowed, mock_resolve
    ):
        """templates:write alone must not reveal Letterhead without category access."""
        mock_admin.return_value = False
        mock_allowed.return_value = set()
        mock_resolve.return_value = "letterhead-id"
        user = self._user({"document_hub:templates:write": True})
        db = MagicMock()
        self.assertFalse(can_use_document_template_category(user, db, "Letterhead"))
        types = [_FakeDocType("Letterhead"), _FakeDocType(None)]
        out = filter_document_types_for_user(user, db, types, for_picker=True)
        self.assertEqual(len(out), 1)
        self.assertIsNone(out[0].category)
        # Admin list path also filters (for_picker=False no longer bypasses).
        out_admin = filter_document_types_for_user(user, db, types, for_picker=False)
        self.assertEqual(len(out_admin), 1)

    @patch("app.services.document_template_categories.resolve_category_setting_id")
    @patch("app.services.document_template_categories.get_allowed_category_ids")
    @patch("app.services.document_template_categories._user_is_admin")
    def test_category_access_without_templates_write_can_use(
        self, mock_admin, mock_allowed, mock_resolve
    ):
        mock_admin.return_value = False
        mock_allowed.return_value = {"letterhead-id"}
        mock_resolve.return_value = "letterhead-id"
        user = self._user({"document_hub:builder:read": True})
        db = MagicMock()
        self.assertTrue(can_use_document_template_category(user, db, "Letterhead"))

    @patch("app.services.document_template_categories.resolve_category_setting_id")
    @patch("app.services.document_template_categories.get_allowed_category_ids")
    @patch("app.services.document_template_categories._user_is_admin")
    def test_templates_write_empty_allow_list_cannot_assign_letterhead(
        self, mock_admin, mock_allowed, mock_resolve
    ):
        mock_admin.return_value = False
        mock_allowed.return_value = set()
        mock_resolve.return_value = "letterhead-id"
        user = self._user({"document_hub:templates:write": True})
        self.assertFalse(can_use_document_template_category(user, MagicMock(), "Letterhead"))

    @patch("app.services.document_template_categories.resolve_category_setting_id")
    @patch("app.services.document_template_categories.get_allowed_category_ids")
    @patch("app.services.document_template_categories._user_is_admin")
    def test_filter_keeps_uncategorized_only_when_denied(self, mock_admin, mock_allowed, mock_resolve):
        mock_admin.return_value = False
        mock_allowed.return_value = set()
        mock_resolve.return_value = "cat-id"
        user = self._user()
        db = MagicMock()
        types = [_FakeDocType("Employee Contract"), _FakeDocType(None), _FakeDocType("Proposal")]
        out = filter_document_types_for_user(user, db, types, for_picker=True)
        self.assertEqual(len(out), 1)
        self.assertIsNone(out[0].category)


if __name__ == "__main__":
    unittest.main()
