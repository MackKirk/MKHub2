"""Metals customers tab permissions stand alone (no metals:access / product:access gate)."""
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

from app.auth.security import (
    _has_permission,
    can_read_metals_client_for_quotes,
    has_metals_customer_detail_access,
    has_metals_customer_tab_permission,
)


def _user_with_perms(**perms):
    user = MagicMock()
    user.roles = []
    user.permissions_override = perms
    return user


class TestMetalsCustomerPermissions(unittest.TestCase):
    def test_metals_customers_read_without_area_access(self):
        user = _user_with_perms(**{"metals:customers:read": True})
        self.assertTrue(_has_permission(user, "metals:customers:read"))
        self.assertTrue(has_metals_customer_detail_access(user))

    def test_product_metals_access_without_product_access(self):
        user = _user_with_perms(**{"product:metals:access": True})
        self.assertTrue(_has_permission(user, "product:metals:access"))

    def test_main_read_does_not_unlock_tabs(self):
        user = _user_with_perms(**{"metals:customers:read": True})
        for tab in ("overview", "general", "contacts", "files", "sites", "notes"):
            self.assertFalse(has_metals_customer_tab_permission(user, tab, "read"))
            self.assertFalse(has_metals_customer_tab_permission(user, tab, "write"))

    def test_tab_read_requires_tab_key(self):
        user = _user_with_perms(**{"metals:customers:notes:read": True})
        self.assertTrue(has_metals_customer_tab_permission(user, "notes", "read"))
        self.assertFalse(has_metals_customer_tab_permission(user, "notes", "write"))
        self.assertFalse(has_metals_customer_tab_permission(user, "contacts", "read"))

    def test_tab_write_requires_tab_key(self):
        user = _user_with_perms(
            **{
                "metals:customers:read": True,
                "metals:customers:contacts:write": True,
            }
        )
        self.assertTrue(has_metals_customer_tab_permission(user, "contacts", "write"))
        self.assertFalse(has_metals_customer_tab_permission(user, "notes", "write"))

    def test_quotes_read_allowlist(self):
        user = _user_with_perms(**{"sales:quotations:read": True})
        self.assertTrue(can_read_metals_client_for_quotes(user))
        self.assertFalse(has_metals_customer_detail_access(user))


if __name__ == "__main__":
    unittest.main()
