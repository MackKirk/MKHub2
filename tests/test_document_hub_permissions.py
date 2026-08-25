"""Documents hub permission aliases, settings filter, and access helpers."""
import sys
import types
import unittest
from unittest.mock import MagicMock

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

from app.auth.security import _perm_matches_map
from app.auth.settings_permissions import (
    SETTINGS_CHILD_KEYS,
    can_read_document_backgrounds,
    can_read_document_templates,
    settings_permissions_payload,
)


class TestDocumentHubAliases(unittest.TestCase):
    def test_legacy_settings_backgrounds_imply_hub_keys(self):
        perm_map = {"settings:document_backgrounds:read": True}
        self.assertTrue(_perm_matches_map(perm_map, "document_hub:backgrounds:read"))
        self.assertFalse(_perm_matches_map(perm_map, "document_hub:backgrounds:write"))

        write_map = {"settings:document_backgrounds:write": True}
        self.assertTrue(_perm_matches_map(write_map, "document_hub:backgrounds:read"))
        self.assertTrue(_perm_matches_map(write_map, "document_hub:backgrounds:write"))

    def test_legacy_settings_templates_imply_hub_keys(self):
        perm_map = {"settings:document_templates:write": True}
        self.assertTrue(_perm_matches_map(perm_map, "document_hub:templates:read"))
        self.assertTrue(_perm_matches_map(perm_map, "document_hub:templates:write"))

    def test_manage_implies_signature_requests_write(self):
        perm_map = {"documents:signatures:manage": True}
        self.assertTrue(_perm_matches_map(perm_map, "document_hub:signature_requests:read"))
        self.assertTrue(_perm_matches_map(perm_map, "document_hub:signature_requests:write"))

    def test_legacy_documents_do_not_open_builder_or_editor(self):
        perm_map = {"documents:read": True, "documents:write": True}
        self.assertFalse(_perm_matches_map(perm_map, "document_hub:builder:read"))
        self.assertFalse(_perm_matches_map(perm_map, "document_hub:builder:write"))
        self.assertFalse(_perm_matches_map(perm_map, "document_hub:signature_editor:read"))
        self.assertFalse(_perm_matches_map(perm_map, "document_hub:signature_editor:write"))

    def test_hub_builder_independent_of_company_files(self):
        perm_map = {"document_hub:builder:read": True}
        self.assertTrue(_perm_matches_map(perm_map, "document_hub:builder:read"))
        self.assertFalse(_perm_matches_map(perm_map, "documents:read"))


class TestSettingsChildKeysExcludeDocuments(unittest.TestCase):
    def test_settings_child_keys_exclude_document_defs(self):
        self.assertNotIn("settings:document_backgrounds:read", SETTINGS_CHILD_KEYS)
        self.assertNotIn("settings:document_templates:write", SETTINGS_CHILD_KEYS)
        self.assertIn("settings:permission_templates:read", SETTINGS_CHILD_KEYS)
        self.assertIn("settings:terms_templates:read", SETTINGS_CHILD_KEYS)

    def test_legacy_settings_document_keys_still_resolve_via_hub(self):
        user = MagicMock()
        user.roles = []
        user.permissions_override = {"settings:document_templates:read": True}
        self.assertTrue(can_read_document_templates(user))
        self.assertFalse(can_read_document_backgrounds(user))

        payload = settings_permissions_payload(user)
        self.assertTrue(payload["can_view_document_templates"])
        self.assertFalse(payload["can_access_settings"])
        self.assertFalse(payload["can_view_templates_tab"])

    def test_hub_backgrounds_key_resolves(self):
        user = MagicMock()
        user.roles = []
        user.permissions_override = {"document_hub:backgrounds:read": True}
        self.assertTrue(can_read_document_backgrounds(user))
        self.assertFalse(can_read_document_templates(user))


if __name__ == "__main__":
    unittest.main()
