"""
PR6 Safety / Employee Review regression against the shared Form Engine.

Full PDF signature route tests need reportlab/PyPDF2 in the local env; this module
covers template/list domain isolation that Fieldwork must not break for the upcoming
Safety rollout, plus a signature_compliance smoke import.
"""
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
from app.routes import form_templates as ft
from app.services.form_engine import (
    EMPLOYEE_REVIEW_CATEGORY,
    FOLLOW_UP_CATEGORY,
    INSPECTION_CATEGORY,
    SITE_ASSESSMENT_CATEGORY,
    domain_for_template_category,
    is_employee_review_category,
    is_safety_template_category,
)
from app.services.signature_compliance import get_signature_compliance


def _user():
    u = MagicMock()
    u.id = "user"
    u.roles = []
    u.permissions_override = {}
    return u


class SafetyHrIsolationTests(unittest.TestCase):
    def test_inspection_and_follow_up_remain_safety_domain(self):
        self.assertTrue(is_safety_template_category(INSPECTION_CATEGORY))
        self.assertTrue(is_safety_template_category(FOLLOW_UP_CATEGORY))
        self.assertEqual(domain_for_template_category(INSPECTION_CATEGORY), "safety")
        self.assertEqual(domain_for_template_category(FOLLOW_UP_CATEGORY), "safety")

    def test_employee_review_remains_hr_domain(self):
        self.assertTrue(is_employee_review_category(EMPLOYEE_REVIEW_CATEGORY))
        self.assertEqual(domain_for_template_category(EMPLOYEE_REVIEW_CATEGORY), "employee_review")

    def test_fieldwork_category_not_treated_as_safety(self):
        self.assertFalse(is_safety_template_category(SITE_ASSESSMENT_CATEGORY))
        self.assertEqual(domain_for_template_category(SITE_ASSESSMENT_CATEGORY), "fieldwork")

    @patch("app.routes.form_templates.user_has_any_rm_fieldwork_permission", return_value=False)
    @patch("app.routes.form_templates.user_has_any_project_safety_permission", return_value=True)
    @patch("app.routes.form_templates._hr_can_manage_employee_review_templates", return_value=False)
    def test_safety_writer_cannot_create_fieldwork_template(self, *_m):
        with self.assertRaises(HTTPException) as ctx:
            ft._ensure_form_template_write(_user(), None, new_category=SITE_ASSESSMENT_CATEGORY)
        self.assertEqual(ctx.exception.status_code, 403)

    @patch("app.routes.form_templates.user_has_any_rm_fieldwork_permission", return_value=False)
    @patch("app.routes.form_templates.user_has_any_project_safety_permission", return_value=True)
    @patch("app.routes.form_templates._hr_can_manage_employee_review_templates", return_value=False)
    def test_safety_writer_can_still_create_inspection(self, *_m):
        ft._ensure_form_template_write(_user(), None, new_category=INSPECTION_CATEGORY)

    @patch("app.routes.form_custom_lists._hr_can_manage_form_lists", return_value=False)
    @patch("app.routes.form_custom_lists.user_has_any_rm_fieldwork_permission", return_value=False)
    @patch("app.routes.form_custom_lists.user_has_any_project_safety_permission", return_value=True)
    def test_safety_cannot_write_fieldwork_list_domain(self, *_m):
        self.assertFalse(fcl._can_write_list_domain(_user(), "fieldwork"))

    @patch("app.routes.form_custom_lists._hr_can_manage_form_lists", return_value=True)
    @patch("app.routes.form_custom_lists.user_has_any_rm_fieldwork_permission", return_value=False)
    @patch("app.routes.form_custom_lists.user_has_any_project_safety_permission", return_value=False)
    def test_hr_can_write_employee_review_list_domain(self, *_m):
        self.assertTrue(fcl._can_write_list_domain(_user(), "employee_review"))

    def test_signature_compliance_helper_importable(self):
        self.assertTrue(callable(get_signature_compliance))


if __name__ == "__main__":
    unittest.main()
