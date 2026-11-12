"""PR1 Fieldwork domain: access rules and workflow invariants (unit-level)."""
from __future__ import annotations

import sys
import types
import unittest
import uuid
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

from app.routes import fieldwork as fw
from app.services.business_line import BUSINESS_LINE_CONSTRUCTION, BUSINESS_LINE_REPAIRS_MAINTENANCE
from app.services.fieldwork_access import assert_rm_fieldwork_project


def _user():
    u = MagicMock()
    u.id = uuid.uuid4()
    u.roles = []
    u.permissions_override = {}
    return u


class FieldworkAccessTests(unittest.TestCase):
    @patch("app.services.fieldwork_access.is_project_visible_to_user", return_value=True)
    @patch("app.services.fieldwork_access.can_access_business_line", return_value=True)
    @patch("app.services.fieldwork_access.user_has_any_rm_fieldwork_permission", return_value=True)
    @patch("app.services.fieldwork_access._user_is_admin", return_value=False)
    def test_rejects_construction_project(self, *_m):
        proj = MagicMock()
        proj.deleted_at = None
        proj.business_line = BUSINESS_LINE_CONSTRUCTION
        with self.assertRaises(HTTPException) as ctx:
            assert_rm_fieldwork_project(MagicMock(), _user(), proj, "read")
        self.assertEqual(ctx.exception.status_code, 400)

    @patch("app.services.fieldwork_access.is_project_visible_to_user", return_value=True)
    @patch("app.services.fieldwork_access.can_access_business_line", return_value=True)
    @patch("app.services.fieldwork_access.user_has_any_rm_fieldwork_permission", return_value=False)
    @patch("app.services.fieldwork_access._user_is_admin", return_value=False)
    def test_requires_fieldwork_permission(self, *_m):
        proj = MagicMock()
        proj.deleted_at = None
        proj.business_line = BUSINESS_LINE_REPAIRS_MAINTENANCE
        with self.assertRaises(HTTPException) as ctx:
            assert_rm_fieldwork_project(MagicMock(), _user(), proj, "write")
        self.assertEqual(ctx.exception.status_code, 403)


class FieldworkWorkflowInvariantTests(unittest.TestCase):
    def test_approved_not_editable(self):
        row = MagicMock()
        row.status = "approved"
        with self.assertRaises(HTTPException) as ctx:
            fw._assert_editable(row)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_row_version_conflict(self):
        row = MagicMock()
        row.row_version = 3
        with self.assertRaises(HTTPException) as ctx:
            fw._bump_row_version(row, 2)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_row_version_bumps(self):
        row = MagicMock()
        row.row_version = 3
        fw._bump_row_version(row, 3)
        self.assertEqual(row.row_version, 4)

    def test_submit_requires_classified_photos_when_present(self):
        db = MagicMock()
        record = MagicMock()
        record.id = uuid.uuid4()
        record.settings_snapshot = {"require_min_photos": 0, "require_final_comments": False}
        photo = MagicMock()
        photo.entry_type = "observation"
        photo.phrase_text_snapshot = None
        photo.phrase_item_id = None
        db.query.return_value.filter.return_value.all.return_value = [photo]
        with self.assertRaises(HTTPException) as ctx:
            fw._validate_photos_for_submit(db, record)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_zero_photos_allowed_by_default(self):
        db = MagicMock()
        record = MagicMock()
        record.id = uuid.uuid4()
        record.settings_snapshot = {"require_min_photos": 0}
        db.query.return_value.filter.return_value.all.return_value = []
        fw._validate_photos_for_submit(db, record)


class SafetyTemplateIsolationRegressionTests(unittest.TestCase):
    """PR0 regression: Safety list must not surface Fieldwork categories."""

    @patch("app.routes.form_templates.user_has_any_rm_fieldwork_permission", return_value=False)
    @patch("app.routes.form_templates._hr_can_manage_employee_review_templates", return_value=False)
    @patch("app.routes.form_templates.user_has_any_project_safety_permission", return_value=True)
    def test_safety_writer_blocked_from_fieldwork_category(self, *_m):
        from app.routes import form_templates as ft

        with self.assertRaises(HTTPException):
            ft._ensure_form_template_write(_user(), None, new_category="site_assessment")


if __name__ == "__main__":
    unittest.main()
