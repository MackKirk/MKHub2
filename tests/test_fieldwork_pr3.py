"""PR3 Fieldwork Web UI support: list enrichment helpers and concurrency helpers."""
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


class FieldworkListEnrichmentTests(unittest.TestCase):
    def test_record_dict_marks_pending_review(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.count.return_value = 3
        db.query.return_value.filter.return_value.first.return_value = None

        row = MagicMock()
        row.id = uuid.uuid4()
        row.project_id = uuid.uuid4()
        row.kind = "site_assessment"
        row.form_template_id = uuid.uuid4()
        row.form_definition_snapshot = {"sections": []}
        row.form_payload = {}
        row.settings_snapshot = {}
        row.status = "submitted"
        row.final_comments = None
        row.review_note = None
        row.version = 1
        row.row_version = 2
        row.revision_of_id = None
        row.superseded_by_id = None
        row.created_at = None
        row.created_by = None
        row.updated_at = None
        row.updated_by = None
        row.submitted_at = None
        row.submitted_by = None
        row.reviewed_at = None
        row.reviewed_by = None
        row.approved_at = None
        row.approved_by = None

        out = fw._record_to_dict(db, row)
        self.assertTrue(out["pending_review"])
        self.assertEqual(out["photo_count"], 3)
        self.assertEqual(out["row_version"], 2)

    def test_patch_requires_matching_row_version(self):
        row = MagicMock()
        row.row_version = 4
        with self.assertRaises(HTTPException) as ctx:
            fw._bump_row_version(row, 3)
        self.assertEqual(ctx.exception.status_code, 409)


class FieldworkPreferredKindTests(unittest.TestCase):
    """Document the product rule used by the web UI (Opportunity vs Project)."""

    def test_kinds(self):
        self.assertIn("site_assessment", fw.KINDS)
        self.assertIn("work_report", fw.KINDS)


if __name__ == "__main__":
    unittest.main()
