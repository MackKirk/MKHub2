"""PR0: shared Form Engine categories and domain ACL helpers."""
from __future__ import annotations

import sys
import types
import unittest
from unittest.mock import MagicMock, patch

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

from fastapi import HTTPException

from app.services.form_engine import (
    EMPLOYEE_REVIEW_CATEGORY,
    FIELDWORK_TECHNICAL_PHOTO_FOLDER_NAMES,
    INSPECTION_CATEGORY,
    SITE_ASSESSMENT_CATEGORY,
    WORK_REPORT_CATEGORY,
    domain_for_template_category,
    is_fieldwork_template_category,
    is_known_template_category,
    is_safety_template_category,
    normalized_template_category,
)
from app.routes import form_templates as ft


def _user():
    u = MagicMock()
    u.roles = []
    u.permissions_override = {}
    return u


class FormEngineCatalogTests(unittest.TestCase):
    def test_normalized_empty_is_inspection(self):
        self.assertEqual(normalized_template_category(None), INSPECTION_CATEGORY)
        self.assertEqual(normalized_template_category("  "), INSPECTION_CATEGORY)

    def test_domains(self):
        self.assertTrue(is_safety_template_category("follow_up"))
        self.assertTrue(is_fieldwork_template_category(SITE_ASSESSMENT_CATEGORY))
        self.assertTrue(is_fieldwork_template_category(WORK_REPORT_CATEGORY))
        self.assertEqual(domain_for_template_category(EMPLOYEE_REVIEW_CATEGORY), "employee_review")
        self.assertTrue(is_known_template_category(WORK_REPORT_CATEGORY))
        self.assertFalse(is_known_template_category("not_a_real_category"))

    def test_technical_folder_constants_match_rm_pictures(self):
        self.assertIn("Invoice Photos", FIELDWORK_TECHNICAL_PHOTO_FOLDER_NAMES)
        self.assertIn("Proposal Photos", FIELDWORK_TECHNICAL_PHOTO_FOLDER_NAMES)


class FormTemplateAclTests(unittest.TestCase):
    @patch("app.routes.form_templates.user_has_any_rm_fieldwork_permission", return_value=False)
    @patch("app.routes.form_templates.user_has_any_project_safety_permission", return_value=True)
    @patch("app.routes.form_templates._hr_can_manage_employee_review_templates", return_value=False)
    def test_safety_writer_cannot_create_fieldwork(self, *_mocks):
        user = _user()
        with self.assertRaises(HTTPException) as ctx:
            ft._ensure_form_template_write(user, None, new_category=SITE_ASSESSMENT_CATEGORY)
        self.assertEqual(ctx.exception.status_code, 403)

    @patch("app.routes.form_templates.user_has_any_rm_fieldwork_permission", return_value=True)
    @patch("app.routes.form_templates.user_has_any_project_safety_permission", return_value=False)
    @patch("app.routes.form_templates._hr_can_manage_employee_review_templates", return_value=False)
    def test_fieldwork_writer_can_create_site_assessment(self, *_mocks):
        user = _user()
        ft._ensure_form_template_write(user, None, new_category=SITE_ASSESSMENT_CATEGORY)

    @patch("app.routes.form_templates.user_has_any_rm_fieldwork_permission", return_value=False)
    @patch("app.routes.form_templates.user_has_any_project_safety_permission", return_value=False)
    @patch("app.routes.form_templates._hr_can_manage_employee_review_templates", return_value=True)
    def test_hr_cannot_create_inspection(self, *_mocks):
        user = _user()
        with self.assertRaises(HTTPException) as ctx:
            ft._ensure_form_template_write(user, None, new_category=INSPECTION_CATEGORY)
        self.assertEqual(ctx.exception.status_code, 403)

    @patch("app.routes.form_templates.user_has_any_rm_fieldwork_permission", return_value=False)
    @patch("app.routes.form_templates.user_has_any_project_safety_permission", return_value=True)
    @patch("app.routes.form_templates._hr_can_manage_employee_review_templates", return_value=False)
    def test_safety_writer_can_create_inspection(self, *_mocks):
        user = _user()
        ft._ensure_form_template_write(user, None, new_category=INSPECTION_CATEGORY)


class DefinitionVersionBumpTests(unittest.TestCase):
    def test_template_to_dict_includes_definition_version(self):
        db = MagicMock()
        t = MagicMock()
        t.id = "00000000-0000-0000-0000-000000000001"
        t.name = "Demo"
        t.description = None
        t.category = "inspection"
        t.status = "active"
        t.version_label = "v1"
        t.definition_version = 3
        t.created_at = None
        t.updated_at = None
        t.created_by = None
        t.definition = {"sections": []}
        with patch("app.routes.form_templates._resolve_user_name", return_value=None):
            out = ft._template_to_dict(db, t, include_definition=True)
        self.assertEqual(out["definition_version"], 3)
        self.assertEqual(out["category"], "inspection")


if __name__ == "__main__":
    unittest.main()
