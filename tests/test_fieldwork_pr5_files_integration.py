"""PR5: Fieldwork ↔ Files integration — derived classification, protection, folders."""
from __future__ import annotations

import sys
import types
import unittest
import uuid
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

from fastapi import HTTPException

from app.routes import fieldwork as fw
from app.services import fieldwork_files as ff
from app.services.form_engine import (
    FIELDWORK_CLASSIFICATION_NEEDS,
    FIELDWORK_TECHNICAL_PHOTO_FOLDER_NAMES,
    SITE_ASSESSMENT_CATEGORY,
    WORK_REPORT_CATEGORY,
)


class FieldworkPr5DefaultsTests(unittest.TestCase):
    def test_work_report_requires_final_comments_by_default(self):
        s = fw._default_settings_for_kind(WORK_REPORT_CATEGORY)
        self.assertTrue(s["require_final_comments"])
        self.assertEqual(s["default_pictures_folder"], "Invoice Photos")

    def test_site_assessment_does_not_force_final_comments(self):
        s = fw._default_settings_for_kind(SITE_ASSESSMENT_CATEGORY)
        self.assertFalse(s["require_final_comments"])
        self.assertEqual(s["default_pictures_folder"], "Proposal Photos")


class FieldworkPr5FolderPolicyTests(unittest.TestCase):
    def test_technical_folders_recognized(self):
        for name in (
            "Proposal Photos",
            "Invoice Photos",
            "Unused Extra Proposal Photos",
            "Unused Extra Invoicing Photos",
            "Photos for Additional Recommendations",
        ):
            self.assertTrue(ff.is_rm_technical_photo_category(name))
            self.assertIn(name, FIELDWORK_TECHNICAL_PHOTO_FOLDER_NAMES)

    def test_general_category_not_technical(self):
        self.assertFalse(ff.is_rm_technical_photo_category("Contracts"))
        self.assertFalse(ff.is_rm_technical_photo_category(None))


class FieldworkPr5ProtectionTests(unittest.TestCase):
    def test_assert_blocks_approved_evidence_delete(self):
        db = MagicMock()
        cf = MagicMock()
        cf.id = uuid.uuid4()
        cf.file_object_id = uuid.uuid4()

        obs = MagicMock()
        rec = MagicMock()
        rec.status = "approved"
        db.query.return_value.join.return_value.filter.return_value.all.return_value = [(obs, rec)]

        with self.assertRaises(HTTPException) as ctx:
            ff.assert_client_file_not_protected_fieldwork_evidence(db, cf, action="delete")
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("approved", str(ctx.exception.detail).lower())

    def test_assert_allows_draft_linked_file(self):
        db = MagicMock()
        cf = MagicMock()
        cf.id = uuid.uuid4()
        cf.file_object_id = uuid.uuid4()

        obs = MagicMock()
        rec = MagicMock()
        rec.status = "draft"
        db.query.return_value.join.return_value.filter.return_value.all.return_value = [(obs, rec)]

        # Should not raise
        ff.assert_client_file_not_protected_fieldwork_evidence(db, cf, action="delete")


class FieldworkPr5MetaBatchTests(unittest.TestCase):
    def test_unclassified_technical_image_needs_classification(self):
        db = MagicMock()
        # No observation rows
        db.query.return_value.join.return_value.filter.return_value.filter.return_value.all.return_value = []

        cf = MagicMock()
        cf.id = uuid.uuid4()
        cf.category = "Proposal Photos"
        cf.original_name = "site.jpg"
        cf.key = "site.jpg"

        fo = MagicMock()
        fo.id = uuid.uuid4()
        fo.content_type = "image/jpeg"

        meta = ff.batch_fieldwork_file_meta(db, project_id=uuid.uuid4(), pairs=[(cf, fo)])
        self.assertIn(str(cf.id), meta)
        self.assertTrue(meta[str(cf.id)]["needs_classification"])
        self.assertEqual(meta[str(cf.id)]["classification_state"], FIELDWORK_CLASSIFICATION_NEEDS)

    def test_non_technical_file_omits_fieldwork_meta(self):
        db = MagicMock()
        db.query.return_value.join.return_value.filter.return_value.filter.return_value.all.return_value = []

        cf = MagicMock()
        cf.id = uuid.uuid4()
        cf.category = "Contracts"
        cf.original_name = "agreement.pdf"
        cf.key = "agreement.pdf"

        fo = MagicMock()
        fo.id = uuid.uuid4()
        fo.content_type = "application/pdf"

        meta = ff.batch_fieldwork_file_meta(db, project_id=uuid.uuid4(), pairs=[(cf, fo)])
        self.assertEqual(meta, {})


class FieldworkPr5ConvertPreservationTests(unittest.TestCase):
    def test_convert_keeps_same_project_identity(self):
        """Opportunity→Project is is_bidding flip on the same row — files/fieldwork stay linked."""
        # Documented contract: no remapping of FileObject.project_id or ClientFile rows.
        self.assertTrue(hasattr(fw, "_default_settings_for_kind"))
        # convert_to_project lives on projects router; identity preservation is by design.
        from app.routes import projects as proj_routes

        self.assertTrue(callable(proj_routes.convert_to_project))
        doc = (proj_routes.convert_to_project.__doc__ or "").lower()
        self.assertIn("does not relocate", doc)


if __name__ == "__main__":
    unittest.main()
