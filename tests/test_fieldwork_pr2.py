"""PR2 Fieldwork: phrase catalogs, server snapshots, template settings, domain isolation."""
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
from app.routes import form_templates as ft
from app.services import fieldwork_phrases as phrases
from app.services.form_engine import (
    FIELDWORK_PHOTO_ENTRY_OBSERVATION,
    FIELDWORK_PHOTO_ENTRY_WORK_PERFORMED,
    LIST_DOMAIN_FIELDWORK,
    LIST_DOMAIN_SAFETY,
    SITE_ASSESSMENT_CATEGORY,
    WORK_REPORT_CATEGORY,
)


def _user():
    u = MagicMock()
    u.id = uuid.uuid4()
    u.roles = []
    u.permissions_override = {}
    return u


class FieldworkSettingsTests(unittest.TestCase):
    def test_site_assessment_default_folder(self):
        s = fw._default_settings_for_kind(SITE_ASSESSMENT_CATEGORY)
        self.assertEqual(s["default_pictures_folder"], "Proposal Photos")
        # Final comments are Work Report close-out only — not global for all Fieldwork kinds.
        self.assertFalse(s["require_final_comments"])

    def test_work_report_default_folder(self):
        s = fw._default_settings_for_kind(WORK_REPORT_CATEGORY)
        self.assertEqual(s["default_pictures_folder"], "Invoice Photos")
        self.assertTrue(s["require_final_comments"])

    def test_settings_from_template_reads_fieldwork_settings(self):
        tpl = MagicMock()
        tpl.definition = {
            "sections": [],
            "fieldwork_settings": {
                "require_final_comments": False,
                "require_min_photos": 2,
                "default_pictures_folder": "Unused Extra Proposal Photos",
            },
        }
        s = fw._settings_from_template(tpl, SITE_ASSESSMENT_CATEGORY)
        self.assertFalse(s["require_final_comments"])
        self.assertEqual(s["require_min_photos"], 2)
        self.assertEqual(s["default_pictures_folder"], "Unused Extra Proposal Photos")

    def test_invalid_folder_falls_back(self):
        name = fw._normalize_pictures_folder("Not A Real Folder", kind=WORK_REPORT_CATEGORY)
        self.assertEqual(name, "Invoice Photos")

    def test_legacy_slug_mapped(self):
        name = fw._normalize_pictures_folder("proposal_photos", kind=SITE_ASSESSMENT_CATEGORY)
        self.assertEqual(name, "Proposal Photos")


class FormTemplateFieldworkSettingsNormalizeTests(unittest.TestCase):
    def test_preserves_fieldwork_settings(self):
        raw = {
            "sections": [],
            "signature_policy": {"worker": {"required": False}},
            "fieldwork_settings": {
                "require_final_comments": True,
                "require_min_photos": 1,
                "default_pictures_folder": "Invoice Photos",
            },
        }
        out = ft._normalize_definition(raw)
        self.assertIn("fieldwork_settings", out)
        self.assertEqual(out["fieldwork_settings"]["default_pictures_folder"], "Invoice Photos")
        self.assertEqual(out["fieldwork_settings"]["require_min_photos"], 1)

    def test_rejects_invalid_pictures_folder(self):
        with self.assertRaises(HTTPException) as ctx:
            ft._normalize_fieldwork_settings({"default_pictures_folder": "Random Folder"})
        self.assertEqual(ctx.exception.status_code, 400)


class PhraseSnapshotResolutionTests(unittest.TestCase):
    def test_rejects_phrase_from_wrong_list(self):
        db = MagicMock()
        catalog = MagicMock()
        catalog.id = uuid.uuid4()
        catalog.name = phrases.OBSERVED_CONDITIONS_LIST_NAME
        catalog.domain = LIST_DOMAIN_FIELDWORK

        wrong_phrase = MagicMock()
        wrong_phrase.id = uuid.uuid4()
        wrong_phrase.list_id = uuid.uuid4()  # not catalog
        wrong_phrase.status = "active"
        wrong_phrase.name = "Leak at sill"
        wrong_phrase.parent_id = None

        with patch.object(phrases, "_load_fieldwork_list_for_entry", return_value=catalog):
            db.query.return_value.filter.return_value.first.return_value = wrong_phrase
            with self.assertRaises(HTTPException) as ctx:
                phrases.resolve_phrase_snapshots(
                    db,
                    entry_type=FIELDWORK_PHOTO_ENTRY_OBSERVATION,
                    phrase_item_id=wrong_phrase.id,
                )
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("does not belong", str(ctx.exception.detail))

    def test_rejects_inactive_phrase(self):
        db = MagicMock()
        catalog = MagicMock()
        catalog.id = uuid.uuid4()
        catalog.name = phrases.OBSERVED_CONDITIONS_LIST_NAME
        catalog.domain = LIST_DOMAIN_FIELDWORK

        phrase = MagicMock()
        phrase.id = uuid.uuid4()
        phrase.list_id = catalog.id
        phrase.status = "inactive"
        phrase.name = "Old phrase"
        phrase.parent_id = None

        with patch.object(phrases, "_load_fieldwork_list_for_entry", return_value=catalog):
            db.query.return_value.filter.return_value.first.return_value = phrase
            with self.assertRaises(HTTPException) as ctx:
                phrases.resolve_phrase_snapshots(
                    db,
                    entry_type=FIELDWORK_PHOTO_ENTRY_OBSERVATION,
                    phrase_item_id=phrase.id,
                    require_active=True,
                )
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("inactive", str(ctx.exception.detail).lower())

    def test_server_derives_snapshot_text(self):
        db = MagicMock()
        catalog = MagicMock()
        catalog.id = uuid.uuid4()
        catalog.name = phrases.WORK_PERFORMED_LIST_NAME
        catalog.domain = LIST_DOMAIN_FIELDWORK

        phrase = MagicMock()
        phrase.id = uuid.uuid4()
        phrase.list_id = catalog.id
        phrase.status = "active"
        phrase.name = "Replaced weatherstripping"
        phrase.parent_id = None

        with patch.object(phrases, "_load_fieldwork_list_for_entry", return_value=catalog):
            with patch.object(phrases, "path_label_for_item", return_value="Replaced weatherstripping"):
                db.query.return_value.filter.return_value.first.return_value = phrase
                class_snap, phrase_snap, class_id, phrase_id = phrases.resolve_phrase_snapshots(
                    db,
                    entry_type=FIELDWORK_PHOTO_ENTRY_WORK_PERFORMED,
                    phrase_item_id=phrase.id,
                )
        self.assertEqual(phrase_snap, "Replaced weatherstripping")
        self.assertEqual(class_snap, "Replaced weatherstripping")
        self.assertEqual(phrase_id, phrase.id)
        self.assertEqual(class_id, phrase.id)

    def test_wrong_entry_type_catalog_mapping(self):
        self.assertEqual(
            phrases.ENTRY_TYPE_TO_LIST_NAME[FIELDWORK_PHOTO_ENTRY_OBSERVATION],
            phrases.OBSERVED_CONDITIONS_LIST_NAME,
        )
        self.assertEqual(
            phrases.ENTRY_TYPE_TO_LIST_NAME[FIELDWORK_PHOTO_ENTRY_WORK_PERFORMED],
            phrases.WORK_PERFORMED_LIST_NAME,
        )


class SeededCatalogProtectionTests(unittest.TestCase):
    def test_seeded_catalog_detected(self):
        from app.routes import form_custom_lists as fcl

        lst = MagicMock()
        lst.name = phrases.OBSERVED_CONDITIONS_LIST_NAME
        lst.domain = LIST_DOMAIN_FIELDWORK
        self.assertTrue(fcl._is_seeded_fieldwork_phrase_catalog(lst))

        lst2 = MagicMock()
        lst2.name = "Other list"
        lst2.domain = LIST_DOMAIN_FIELDWORK
        self.assertFalse(fcl._is_seeded_fieldwork_phrase_catalog(lst2))

        lst3 = MagicMock()
        lst3.name = phrases.OBSERVED_CONDITIONS_LIST_NAME
        lst3.domain = LIST_DOMAIN_SAFETY
        self.assertFalse(fcl._is_seeded_fieldwork_phrase_catalog(lst3))


class DomainIsolationRegressionTests(unittest.TestCase):
    @patch("app.routes.form_templates.user_has_any_rm_fieldwork_permission", return_value=False)
    @patch("app.routes.form_templates._hr_can_manage_employee_review_templates", return_value=False)
    @patch("app.routes.form_templates.user_has_any_project_safety_permission", return_value=True)
    def test_safety_cannot_write_fieldwork_template(self, *_m):
        with self.assertRaises(HTTPException):
            ft._ensure_form_template_write(_user(), None, new_category=SITE_ASSESSMENT_CATEGORY)

    @patch("app.routes.form_custom_lists.user_has_any_rm_fieldwork_permission", return_value=True)
    @patch("app.routes.form_custom_lists.user_has_any_project_safety_permission", return_value=False)
    @patch("app.routes.form_custom_lists._hr_can_manage_form_lists", return_value=False)
    @patch("app.routes.form_custom_lists._user_is_admin", return_value=False)
    def test_fieldwork_writer_cannot_write_safety_list(self, *_m):
        from app.routes import form_custom_lists as fcl

        self.assertFalse(fcl._can_write_list_domain(_user(), LIST_DOMAIN_SAFETY))
        self.assertTrue(fcl._can_write_list_domain(_user(), LIST_DOMAIN_FIELDWORK))


class ConcurrencyInvariantTests(unittest.TestCase):
    def test_photo_ops_require_row_version_bump(self):
        row = MagicMock()
        row.row_version = 5
        with self.assertRaises(HTTPException) as ctx:
            fw._bump_row_version(row, 4)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_approved_immutable(self):
        row = MagicMock()
        row.status = "approved"
        with self.assertRaises(HTTPException) as ctx:
            fw._assert_editable(row)
        self.assertEqual(ctx.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
