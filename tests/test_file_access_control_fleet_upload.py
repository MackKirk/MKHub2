"""Fleet category uploads must authorize via Fleet keys under misc scope."""
import sys
import types
import unittest
from unittest.mock import MagicMock

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

from app.services.file_access_control import assert_can_initiate_upload


def _user_with(perms: dict[str, bool]):
    user = MagicMock()
    user.roles = []
    user.permissions_override = perms
    return user


class TestFleetMiscUploadPermissions(unittest.TestCase):
    def test_fleet_work_order_files_write_allows_work_order_files_category(self):
        user = _user_with(
            {
                "fleet:access": True,
                "fleet:work_orders:files:write": True,
            }
        )
        assert_can_initiate_upload(
            user,
            MagicMock(),
            project_id=None,
            client_id=None,
            employee_id=None,
            category_id="work-order-files",
        )

    def test_fleet_work_order_files_write_allows_photo_categories(self):
        user = _user_with(
            {
                "fleet:access": True,
                "fleet:work_orders:files:write": True,
            }
        )
        for cat in ("fleet-work-order-photos", "fleet-work-order"):
            assert_can_initiate_upload(
                user,
                MagicMock(),
                project_id=None,
                client_id=None,
                employee_id=None,
                category_id=cat,
            )

    def test_fleet_files_write_does_not_open_generic_misc(self):
        user = _user_with(
            {
                "fleet:access": True,
                "fleet:work_orders:files:write": True,
            }
        )
        with self.assertRaises(HTTPException) as ctx:
            assert_can_initiate_upload(
                user,
                MagicMock(),
                project_id=None,
                client_id=None,
                employee_id=None,
                category_id="files",
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("misc scope", str(ctx.exception.detail))

    def test_business_files_write_still_allows_work_order_files_category(self):
        user = _user_with({"business:projects:files:write": True})
        assert_can_initiate_upload(
            user,
            MagicMock(),
            project_id=None,
            client_id=None,
            employee_id=None,
            category_id="work-order-files",
        )

    def test_fleet_inspections_write_allows_fleet_inspection_category(self):
        user = _user_with(
            {
                "fleet:access": True,
                "fleet:inspections:write": True,
            }
        )
        assert_can_initiate_upload(
            user,
            MagicMock(),
            project_id=None,
            client_id=None,
            employee_id=None,
            category_id="fleet-inspection",
        )

    def test_fleet_compliance_write_allows_fleet_compliance_category(self):
        user = _user_with(
            {
                "fleet:access": True,
                "fleet:vehicles:compliance:write": True,
            }
        )
        assert_can_initiate_upload(
            user,
            MagicMock(),
            project_id=None,
            client_id=None,
            employee_id=None,
            category_id="fleet-compliance",
        )

    def test_fleet_assignment_photos_with_vehicle_general_write(self):
        user = _user_with(
            {
                "fleet:access": True,
                "fleet:vehicles:general:write": True,
            }
        )
        assert_can_initiate_upload(
            user,
            MagicMock(),
            project_id=None,
            client_id=None,
            employee_id=None,
            category_id="fleet-assignment-photos",
        )


if __name__ == "__main__":
    unittest.main()
