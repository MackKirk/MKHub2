"""Custom list domain isolation (Safety / HR / Fieldwork)."""
from __future__ import annotations

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

from app.routes import form_custom_lists as fcl
from app.services.form_engine import (
    LIST_DOMAIN_EMPLOYEE_REVIEW,
    LIST_DOMAIN_FIELDWORK,
    LIST_DOMAIN_SAFETY,
    LIST_DOMAIN_SHARED,
)


def _user():
    u = MagicMock()
    u.roles = []
    u.permissions_override = {}
    return u


def _list(domain: str):
    lst = MagicMock()
    lst.domain = domain
    return lst


class CustomListDomainAclTests(unittest.TestCase):
    @patch("app.routes.form_custom_lists._hr_can_manage_form_lists", return_value=False)
    @patch("app.routes.form_custom_lists.user_has_any_rm_fieldwork_permission", return_value=True)
    @patch("app.routes.form_custom_lists.user_has_any_project_safety_permission", return_value=False)
    def test_fieldwork_cannot_write_safety_list(self, *_m):
        with self.assertRaises(HTTPException) as ctx:
            fcl._assert_can_write_list(_user(), _list(LIST_DOMAIN_SAFETY))
        self.assertEqual(ctx.exception.status_code, 403)

    @patch("app.routes.form_custom_lists._hr_can_manage_form_lists", return_value=False)
    @patch("app.routes.form_custom_lists.user_has_any_rm_fieldwork_permission", return_value=True)
    @patch("app.routes.form_custom_lists.user_has_any_project_safety_permission", return_value=False)
    def test_fieldwork_cannot_write_hr_list(self, *_m):
        with self.assertRaises(HTTPException) as ctx:
            fcl._assert_can_write_list(_user(), _list(LIST_DOMAIN_EMPLOYEE_REVIEW))
        self.assertEqual(ctx.exception.status_code, 403)

    @patch("app.routes.form_custom_lists._hr_can_manage_form_lists", return_value=False)
    @patch("app.routes.form_custom_lists.user_has_any_rm_fieldwork_permission", return_value=True)
    @patch("app.routes.form_custom_lists.user_has_any_project_safety_permission", return_value=False)
    def test_fieldwork_can_write_fieldwork_list(self, *_m):
        fcl._assert_can_write_list(_user(), _list(LIST_DOMAIN_FIELDWORK))

    @patch("app.routes.form_custom_lists._hr_can_manage_form_lists", return_value=False)
    @patch("app.routes.form_custom_lists.user_has_any_rm_fieldwork_permission", return_value=False)
    @patch("app.routes.form_custom_lists.user_has_any_project_safety_permission", return_value=True)
    def test_safety_cannot_write_fieldwork_list(self, safety_perm, *_rest):
        safety_perm.side_effect = lambda _u, action: action in ("read", "write")
        with self.assertRaises(HTTPException):
            fcl._assert_can_write_list(_user(), _list(LIST_DOMAIN_FIELDWORK))

    @patch("app.routes.form_custom_lists._hr_can_manage_form_lists", return_value=False)
    @patch("app.routes.form_custom_lists.user_has_any_rm_fieldwork_permission")
    @patch("app.routes.form_custom_lists.user_has_any_project_safety_permission", return_value=False)
    def test_fieldwork_read_only_cannot_write_shared(self, _safety, fw_perm, _hr):
        fw_perm.side_effect = lambda _u, action: action == "read"
        self.assertFalse(fcl._can_write_list_domain(_user(), LIST_DOMAIN_SHARED))
        with self.assertRaises(HTTPException):
            fcl._assert_can_write_list(_user(), _list(LIST_DOMAIN_SHARED))

    @patch("app.routes.form_custom_lists._hr_can_manage_form_lists", return_value=False)
    @patch("app.routes.form_custom_lists.user_has_any_rm_fieldwork_permission")
    @patch("app.routes.form_custom_lists.user_has_any_project_safety_permission", return_value=False)
    def test_fieldwork_can_read_shared_and_fieldwork_only(self, _safety, fw_perm, _hr):
        fw_perm.side_effect = lambda _u, action: action == "read"
        domains = fcl._readable_list_domains(_user())
        self.assertEqual(domains, {LIST_DOMAIN_SHARED, LIST_DOMAIN_FIELDWORK})
        self.assertNotIn(LIST_DOMAIN_SAFETY, domains)
        self.assertNotIn(LIST_DOMAIN_EMPLOYEE_REVIEW, domains)


class FieldworkPermissionGranularityTests(unittest.TestCase):
    @patch("app.auth.security._user_is_admin", return_value=False)
    @patch("app.auth.security._has_permission")
    def test_review_does_not_grant_write(self, has_perm, _admin):
        from app.auth.security import user_has_any_rm_fieldwork_permission

        has_perm.side_effect = lambda _u, key: key == "business:rm:projects:fieldwork:review"
        self.assertTrue(user_has_any_rm_fieldwork_permission(_user(), "read"))
        self.assertTrue(user_has_any_rm_fieldwork_permission(_user(), "review"))
        self.assertFalse(user_has_any_rm_fieldwork_permission(_user(), "write"))

    @patch("app.auth.security._user_is_admin", return_value=False)
    @patch("app.auth.security._has_permission")
    def test_write_does_not_grant_review(self, has_perm, _admin):
        from app.auth.security import user_has_any_rm_fieldwork_permission

        has_perm.side_effect = lambda _u, key: key == "business:rm:projects:fieldwork:write"
        self.assertTrue(user_has_any_rm_fieldwork_permission(_user(), "read"))
        self.assertTrue(user_has_any_rm_fieldwork_permission(_user(), "write"))
        self.assertFalse(user_has_any_rm_fieldwork_permission(_user(), "review"))


class TemplateOptimisticConcurrencyTests(unittest.TestCase):
    def test_definition_save_requires_matching_version(self):
        from app.routes import form_templates as ft

        user = _user()
        t = MagicMock()
        t.category = "inspection"
        t.definition_version = 2
        t.name = "T"
        t.description = None
        t.status = "active"
        t.version_label = ""
        t.created_by = None
        t.created_at = None
        t.updated_at = None
        t.definition = {"sections": []}
        t.id = "00000000-0000-0000-0000-000000000099"

        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = t

        body = ft.FormTemplateUpdate(
            definition={"sections": []},
            expected_definition_version=1,
        )
        with patch("app.routes.form_templates._ensure_form_template_write"):
            with patch("app.routes.form_templates._validate_definition_structure"):
                with patch("app.routes.form_templates._validate_dropdown_custom_lists"):
                    with self.assertRaises(HTTPException) as ctx:
                        ft.update_form_template(str(t.id), body, db=db, user=user)
        self.assertEqual(ctx.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
