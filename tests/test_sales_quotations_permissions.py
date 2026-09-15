"""Sales quotations permissions do not require sales:access."""
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

from app.auth.security import _has_permission


def _user_with_perms(**perms):
    user = MagicMock()
    user.roles = []
    user.permissions_override = perms
    return user


class TestSalesQuotationsPermissions(unittest.TestCase):
    def test_quotations_read_without_sales_access(self):
        user = _user_with_perms(**{"sales:quotations:read": True})
        self.assertTrue(_has_permission(user, "sales:quotations:read"))
        self.assertFalse(_has_permission(user, "sales:quotations:write"))

    def test_quotations_write_without_sales_access(self):
        user = _user_with_perms(
            **{"sales:quotations:read": True, "sales:quotations:write": True}
        )
        self.assertTrue(_has_permission(user, "sales:quotations:read"))
        self.assertTrue(_has_permission(user, "sales:quotations:write"))

    def test_quotations_denied_when_not_granted(self):
        user = _user_with_perms()
        self.assertFalse(_has_permission(user, "sales:quotations:read"))
        self.assertFalse(_has_permission(user, "sales:quotations:write"))


if __name__ == "__main__":
    unittest.main()
