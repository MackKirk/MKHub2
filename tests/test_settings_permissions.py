"""Tests for granular Settings permissions."""
import sys
import types
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

if "jwt" not in sys.modules:
    jwt_module = types.ModuleType("jwt")
    jwt_module.encode = lambda *args, **kwargs: "token"
    jwt_module.decode = lambda *args, **kwargs: {}
    sys.modules["jwt"] = jwt_module

if "passlib.context" not in sys.modules:
    passlib_module = types.ModuleType("passlib")
    passlib_context_module = types.ModuleType("passlib.context")

    class _CryptContext:
        def __init__(self, *args, **kwargs):
            pass

        def hash(self, value):
            return f"hashed:{value}"

        def verify(self, plain, hashed):
            return hashed == f"hashed:{plain}"

    passlib_context_module.CryptContext = _CryptContext
    sys.modules["passlib"] = passlib_module
    sys.modules["passlib.context"] = passlib_context_module

from app.auth.security import granted_permission_keys_from_map
from app.auth.settings_permissions import (
    can_read_document_backgrounds,
    can_read_document_templates,
    can_read_files_assets,
    can_read_list_in_settings_bundle,
    can_read_lookup_lists,
    can_read_setting_list,
    can_read_terms_templates,
    can_write_lookup_lists,
    can_write_setting_list,
    has_any_settings_permission,
    has_settings_access,
    settings_permissions_payload,
)
from app.models.models import SettingList
from app.routes.settings import get_settings_admin_bundle, list_settings


def _user_with(perms: dict[str, bool]):
    user = MagicMock()
    user.roles = []
    user.permissions_override = perms
    return user


class _FakeQuery:
    def __init__(self, *, all_rows=None, first_row=None):
        self._all_rows = all_rows or []
        self._first_row = first_row

    def filter(self, *_args, **_kwargs):
        return self

    def order_by(self, *_args, **_kwargs):
        return self

    def all(self):
        return list(self._all_rows)

    def first(self):
        return self._first_row


class _FakeDb:
    def __init__(self, query_map=None):
        self.query_map = query_map or {}

    def query(self, model):
        return self.query_map.get(model, _FakeQuery())


class TestSettingsPermissions(unittest.TestCase):
    def test_legacy_settings_access_no_longer_grants_runtime_access(self):
        user = _user_with({"settings:access": True})
        self.assertTrue(has_settings_access(user))
        self.assertFalse(has_any_settings_permission(user))
        self.assertFalse(can_read_lookup_lists(user))
        self.assertFalse(can_read_files_assets(user))
        self.assertFalse(can_write_setting_list(user, "terms-templates"))

    def test_lookup_read_does_not_grant_legacy_access_in_me(self):
        perm_map = {
            "settings:access": True,
            "settings:lookup_lists:read": True,
            "settings:lookup_lists:write": False,
            "settings:files_assets:read": False,
            "settings:files_assets:write": False,
        }
        granted = granted_permission_keys_from_map(perm_map)
        self.assertIn("settings:lookup_lists:read", granted)
        self.assertNotIn("settings:access", granted)

    def test_lookup_lists_read_without_write(self):
        user = _user_with({"settings:lookup_lists:read": True})
        self.assertFalse(has_settings_access(user))
        self.assertTrue(can_read_lookup_lists(user))
        self.assertFalse(can_write_lookup_lists(user))
        self.assertTrue(can_read_setting_list(user, "client_statuses"))
        self.assertFalse(can_write_setting_list(user, "client_statuses"))
        self.assertFalse(can_read_files_assets(user))
        self.assertFalse(can_read_setting_list(user, "departments"))

    def test_lookup_lists_write_requires_read_for_granular(self):
        user = _user_with({"settings:lookup_lists:write": True})
        self.assertTrue(can_read_lookup_lists(user))
        self.assertTrue(can_write_lookup_lists(user))
        self.assertTrue(can_write_setting_list(user, "project_statuses"))

    def test_files_assets_mapping(self):
        user = _user_with({"settings:files_assets:read": True})
        self.assertTrue(can_read_files_assets(user))
        self.assertTrue(can_read_setting_list(user, "departments"))
        self.assertFalse(can_read_setting_list(user, "client_statuses"))
        self.assertFalse(can_write_setting_list(user, "organization_logos"))

        writer = _user_with({"settings:files_assets:write": True})
        self.assertTrue(can_write_setting_list(writer, "standard_file_categories"))

    def test_terms_templates_mapping(self):
        user = _user_with({"settings:terms_templates:write": True})
        self.assertTrue(can_read_terms_templates(user))
        self.assertTrue(can_write_setting_list(user, "terms-templates"))
        self.assertFalse(can_write_setting_list(user, "payment_terms"))

    def test_document_template_permissions_do_not_open_settings_templates_tab(self):
        payload = settings_permissions_payload(_user_with({"settings:document_templates:read": True}))
        self.assertFalse(payload["can_view_templates_tab"])
        self.assertFalse(payload["can_access_settings"])
        self.assertTrue(payload["can_view_document_templates"])

    def test_document_template_permissions_do_not_cross_grant_backgrounds(self):
        user = _user_with({"settings:document_templates:read": True})
        self.assertTrue(can_read_document_templates(user))
        self.assertFalse(can_read_document_backgrounds(user))

    def test_settings_permissions_endpoint_no_access(self):
        payload = settings_permissions_payload(_user_with({}))
        self.assertFalse(payload["can_access_settings"])
        self.assertFalse(payload["can_view_lookup_lists"])
        self.assertFalse(payload["can_view_templates_tab"])
        self.assertFalse(payload["can_view_auto_tasks"])

    def test_settings_permissions_endpoint_single_view_lookup_only(self):
        payload = settings_permissions_payload(_user_with({"settings:lookup_lists:read": True}))
        self.assertTrue(payload["can_access_settings"])
        self.assertTrue(payload["can_view_lookup_lists"])
        self.assertFalse(payload["can_edit_lookup_lists"])
        self.assertFalse(payload["can_view_files_assets"])
        self.assertFalse(payload["can_view_templates_tab"])

    def test_settings_permissions_endpoint_single_write_files_only(self):
        payload = settings_permissions_payload(_user_with({"settings:files_assets:write": True}))
        self.assertTrue(payload["can_access_settings"])
        self.assertFalse(payload["can_view_lookup_lists"])
        self.assertTrue(payload["can_view_files_assets"])
        self.assertTrue(payload["can_edit_files_assets"])
        self.assertFalse(payload["can_view_templates_tab"])

    @patch("app.auth.settings_permissions._has_permission")
    def test_timesheet_hr_exception(self, mock_has):
        user = _user_with({})
        mock_has.side_effect = lambda _u, key: key == "hr:users:edit:timesheet"
        self.assertTrue(
            can_write_setting_list(user, "timesheet", label="break_eligible_employees"),
        )
        self.assertFalse(can_write_setting_list(user, "timesheet", label="default_break_minutes"))

    @patch("app.auth.settings_permissions._has_permission")
    def test_bundle_dropdown_lists_without_settings_admin(self, mock_has):
        user = _user_with({})
        mock_has.side_effect = lambda _u, key: key == "business:projects:read"
        self.assertTrue(can_read_list_in_settings_bundle(user, "client_statuses"))
        self.assertFalse(can_read_list_in_settings_bundle(user, "departments"))
        self.assertFalse(can_read_list_in_settings_bundle(user, "terms-templates"))

    def test_admin_bundle_forbidden_without_settings_permissions(self):
        with self.assertRaises(HTTPException) as ctx:
            get_settings_admin_bundle(db=_FakeDb(), user=_user_with({}))
        self.assertEqual(ctx.exception.status_code, 403)

    @patch("app.routes.settings.ensure_standard_file_categories")
    @patch("app.routes.settings.ensure_training_matrix_slots")
    @patch("app.routes.settings.ensure_organization_logos_list")
    @patch("app.routes.settings.ensure_certificate_backgrounds_list")
    def test_admin_bundle_allows_single_lookup_view_permission(
        self,
        _mock_bg,
        _mock_logos,
        _mock_training,
        _mock_standard,
    ):
        db = _FakeDb({SettingList: _FakeQuery(all_rows=[])})
        result = get_settings_admin_bundle(
            db=db,
            user=_user_with({"settings:lookup_lists:read": True}),
        )
        self.assertEqual(result, {})

    def test_list_settings_denies_without_matching_granular_permission(self):
        with self.assertRaises(HTTPException) as ctx:
            list_settings("client_statuses", db=_FakeDb(), user=_user_with({}))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_list_settings_allows_matching_granular_permission(self):
        db = _FakeDb({SettingList: _FakeQuery(first_row=None)})
        result = list_settings(
            "client_statuses",
            db=db,
            user=_user_with({"settings:lookup_lists:read": True}),
        )
        self.assertEqual(result, [])


if __name__ == "__main__":
    unittest.main()
