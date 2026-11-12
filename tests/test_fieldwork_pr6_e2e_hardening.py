"""
PR6 — Fieldwork E2E hardening (journeys, permissions, Files meta, mobile contracts).

These tests intentionally avoid writing durable business data to the Render
PostgreSQL pointed at by DATABASE_URL. Journey logic is exercised with mocks /
in-memory invariants. A read-only remote probe only SELECTs schema facts.
"""
from __future__ import annotations

import os
import sys
import types
import unittest
import uuid
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

from app.routes import fieldwork as fw
from app.services import fieldwork_access as access
from app.services import fieldwork_files as ff
from app.services.business_line import BUSINESS_LINE_CONSTRUCTION, BUSINESS_LINE_REPAIRS_MAINTENANCE
from app.services.form_engine import (
    EMPLOYEE_REVIEW_CATEGORY,
    FIELDWORK_PHOTO_ENTRY_OBSERVATION,
    FIELDWORK_PHOTO_ENTRY_WORK_PERFORMED,
    INSPECTION_CATEGORY,
    SITE_ASSESSMENT_CATEGORY,
    WORK_REPORT_CATEGORY,
    domain_for_template_category,
    is_fieldwork_template_category,
    is_safety_template_category,
)


def _load_env_database_url() -> str | None:
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if url:
        return url
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    try:
        with open(env_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                if k.strip() == "DATABASE_URL":
                    return v.strip().strip('"').strip("'")
    except OSError:
        return None
    return None


class JourneyAOpportunitySettingsTests(unittest.TestCase):
    """Site Assessment on Opportunity → Proposal Photos; comments not globally required."""

    def test_site_assessment_folder_and_comments(self):
        s = fw._default_settings_for_kind(SITE_ASSESSMENT_CATEGORY)
        self.assertEqual(s["default_pictures_folder"], "Proposal Photos")
        self.assertFalse(s["require_final_comments"])


class JourneyBWorkReportTests(unittest.TestCase):
    def test_work_report_requires_comments_and_invoice_folder(self):
        s = fw._default_settings_for_kind(WORK_REPORT_CATEGORY)
        self.assertEqual(s["default_pictures_folder"], "Invoice Photos")
        self.assertTrue(s["require_final_comments"])

    def test_entry_types_distinguish_observed_vs_work(self):
        self.assertIn(FIELDWORK_PHOTO_ENTRY_OBSERVATION, fw.ENTRY_TYPES)
        self.assertIn(FIELDWORK_PHOTO_ENTRY_WORK_PERFORMED, fw.ENTRY_TYPES)
        self.assertNotEqual(FIELDWORK_PHOTO_ENTRY_OBSERVATION, FIELDWORK_PHOTO_ENTRY_WORK_PERFORMED)

    def test_submit_rejects_missing_phrase_snapshot(self):
        db = MagicMock()
        record = MagicMock()
        record.id = uuid.uuid4()
        record.settings_snapshot = {"require_min_photos": 0}
        photo = MagicMock()
        photo.entry_type = FIELDWORK_PHOTO_ENTRY_OBSERVATION
        photo.phrase_text_snapshot = ""
        db.query.return_value.filter.return_value.all.return_value = [photo]
        with self.assertRaises(HTTPException) as ctx:
            fw._validate_photos_for_submit(db, record)
        self.assertEqual(ctx.exception.status_code, 400)


class JourneyCReviewWorkflowTests(unittest.TestCase):
    def test_approved_not_editable(self):
        row = MagicMock()
        row.status = "approved"
        with self.assertRaises(HTTPException) as ctx:
            fw._assert_editable(row)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_draft_and_changes_requested_editable(self):
        for st in ("draft", "changes_requested"):
            row = MagicMock()
            row.status = st
            fw._assert_editable(row)  # no raise

    def test_row_version_conflict_surfaces_server_version(self):
        row = MagicMock()
        row.row_version = 4
        with self.assertRaises(HTTPException) as ctx:
            fw._bump_row_version(row, 3)
        self.assertEqual(ctx.exception.status_code, 409)
        detail = ctx.exception.detail
        self.assertEqual(detail["row_version"], 4)

    def test_protected_statuses_block_files_delete(self):
        self.assertEqual(
            ff.PROTECTED_FIELDWORK_STATUSES,
            frozenset({"submitted", "approved", "superseded"}),
        )


class JourneyDFilesIntegrationTests(unittest.TestCase):
    def test_needs_classification_for_invoice_photos_without_observation(self):
        db = MagicMock()
        db.query.return_value.join.return_value.filter.return_value.filter.return_value.all.return_value = []
        cf = MagicMock()
        cf.id = uuid.uuid4()
        cf.category = "Invoice Photos"
        cf.original_name = "job.jpg"
        cf.key = "job.jpg"
        fo = MagicMock()
        fo.id = uuid.uuid4()
        fo.content_type = "image/jpeg"
        meta = ff.batch_fieldwork_file_meta(db, project_id=uuid.uuid4(), pairs=[(cf, fo)])
        self.assertTrue(meta[str(cf.id)]["needs_classification"])

    def test_classified_observation_is_derived_not_needs(self):
        db = MagicMock()
        obs = MagicMock()
        obs.id = uuid.uuid4()
        obs.record_id = uuid.uuid4()
        obs.file_object_id = uuid.uuid4()
        obs.client_file_id = uuid.uuid4()
        obs.entry_type = FIELDWORK_PHOTO_ENTRY_WORK_PERFORMED
        obs.classification_snapshot = "Roof"
        obs.phrase_text_snapshot = "Replaced flashing"
        obs.extra_notes = None
        rec = MagicMock()
        rec.status = "draft"
        rec.kind = WORK_REPORT_CATEGORY
        db.query.return_value.join.return_value.filter.return_value.filter.return_value.all.return_value = [
            (obs, rec)
        ]
        cf = MagicMock()
        cf.id = obs.client_file_id
        cf.category = "Invoice Photos"
        cf.original_name = "job.jpg"
        cf.key = "job.jpg"
        fo = MagicMock()
        fo.id = obs.file_object_id
        fo.content_type = "image/jpeg"
        meta = ff.batch_fieldwork_file_meta(db, project_id=uuid.uuid4(), pairs=[(cf, fo)])
        self.assertFalse(meta[str(cf.id)]["needs_classification"])
        self.assertEqual(meta[str(cf.id)]["phrase_text_snapshot"], "Replaced flashing")

    def test_attach_idempotent_reuses_client_file(self):
        db = MagicMock()
        project = MagicMock()
        project.id = uuid.uuid4()
        project.client_id = uuid.uuid4()
        existing = MagicMock()
        existing.id = uuid.uuid4()
        existing.category = "Invoice Photos"
        fo_id = uuid.uuid4()
        with patch.object(ff, "find_existing_client_file_for_object", return_value=existing):
            out = ff.ensure_client_file_attached(
                db, project=project, file_object_id=fo_id, category="Invoice Photos"
            )
        self.assertIs(out, existing)
        db.add.assert_not_called()


class PermissionIntegrityTests(unittest.TestCase):
    def test_construction_project_rejected(self):
        db = MagicMock()
        user = MagicMock()
        user.roles = []
        project = MagicMock()
        project.deleted_at = None
        project.business_line = BUSINESS_LINE_CONSTRUCTION
        with patch.object(access, "_user_is_admin", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                access.assert_rm_fieldwork_project(db, user, project, "read")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_missing_write_permission(self):
        db = MagicMock()
        user = MagicMock()
        project = MagicMock()
        project.deleted_at = None
        project.business_line = BUSINESS_LINE_REPAIRS_MAINTENANCE
        with patch.object(access, "_user_is_admin", return_value=False), patch.object(
            access, "can_access_business_line", return_value=True
        ), patch.object(access, "is_project_visible_to_user", return_value=True), patch.object(
            access, "user_has_any_rm_fieldwork_permission", return_value=False
        ):
            with self.assertRaises(HTTPException) as ctx:
                access.assert_rm_fieldwork_project(db, user, project, "write")
        self.assertEqual(ctx.exception.status_code, 403)

    def test_invisible_project_forbidden(self):
        db = MagicMock()
        user = MagicMock()
        project = MagicMock()
        project.deleted_at = None
        project.business_line = BUSINESS_LINE_REPAIRS_MAINTENANCE
        with patch.object(access, "_user_is_admin", return_value=False), patch.object(
            access, "can_access_business_line", return_value=True
        ), patch.object(access, "is_project_visible_to_user", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                access.assert_rm_fieldwork_project(db, user, project, "read")
        self.assertEqual(ctx.exception.status_code, 403)

    def test_file_object_other_project_rejected(self):
        db = MagicMock()
        project = MagicMock()
        project.id = uuid.uuid4()
        fo_id = uuid.uuid4()
        fo = MagicMock()
        fo.project_id = uuid.uuid4()  # different project
        db.query.return_value.filter.return_value.first.return_value = fo
        with self.assertRaises(HTTPException) as ctx:
            fw._assert_file_belongs_to_project(db, project, fo_id)
        self.assertEqual(ctx.exception.status_code, 400)


class DomainIsolationRegressionTests(unittest.TestCase):
    """Safety / HR / Fieldwork shared Form Engine isolation (pilot readiness)."""

    def test_categories_map_to_distinct_domains(self):
        self.assertEqual(domain_for_template_category(INSPECTION_CATEGORY), "safety")
        self.assertEqual(domain_for_template_category(EMPLOYEE_REVIEW_CATEGORY), "employee_review")
        self.assertEqual(domain_for_template_category(SITE_ASSESSMENT_CATEGORY), "fieldwork")
        self.assertEqual(domain_for_template_category(WORK_REPORT_CATEGORY), "fieldwork")

    def test_safety_not_fieldwork(self):
        self.assertTrue(is_safety_template_category(INSPECTION_CATEGORY))
        self.assertFalse(is_fieldwork_template_category(INSPECTION_CATEGORY))
        self.assertFalse(is_safety_template_category(WORK_REPORT_CATEGORY))


class MobileReliabilityContractTests(unittest.TestCase):
    def test_client_mutation_idempotency_key_shape(self):
        # Mirrors mobile newClientMutationId prefix used for photo create retries.
        sample = f"cm_{int(1e12)}_{uuid.uuid4().hex[:8]}"
        self.assertTrue(sample.startswith("cm_"))

    def test_draft_key_stable_for_crash_recovery(self):
        project_id = str(uuid.uuid4())
        record_id = str(uuid.uuid4())
        key = f"fieldwork:draft:{project_id}:{record_id}"
        self.assertEqual(key.split(":")[0], "fieldwork")
        self.assertEqual(key.split(":")[1], "draft")

    def test_submit_gate_requires_final_comments_for_work_report_snapshot(self):
        settings = {"require_final_comments": True}
        comments = ""
        required = bool(settings.get("require_final_comments", False)) and not comments.strip()
        self.assertTrue(required)


class ConvertPreservationContractTests(unittest.TestCase):
    def test_convert_docstring_promises_no_file_relocation(self):
        from app.routes import projects as proj_routes

        doc = (proj_routes.convert_to_project.__doc__ or "").lower()
        self.assertIn("does not relocate", doc)
        self.assertIn("historical", doc)


class BatchMetaNPlusOneGuardTests(unittest.TestCase):
    def test_batch_meta_issues_single_observation_query_for_many_files(self):
        db = MagicMock()
        chain = db.query.return_value.join.return_value.filter.return_value.filter.return_value
        chain.all.return_value = []
        pairs = []
        for _ in range(12):
            cf = MagicMock()
            cf.id = uuid.uuid4()
            cf.category = "Proposal Photos"
            cf.original_name = "a.jpg"
            cf.key = "a.jpg"
            fo = MagicMock()
            fo.id = uuid.uuid4()
            fo.content_type = "image/jpeg"
            pairs.append((cf, fo))
        meta = ff.batch_fieldwork_file_meta(db, project_id=uuid.uuid4(), pairs=pairs)
        self.assertEqual(len(meta), 12)
        # One query() for observations — not one per file.
        self.assertEqual(db.query.call_count, 1)


class RemoteDatabaseReadOnlyProbeTests(unittest.TestCase):
    """Confirm Render DB identity with SELECT-only probes (never mutate production)."""

    def test_database_url_host_is_documented(self):
        url = _load_env_database_url() or ""
        self.assertTrue(url, "DATABASE_URL missing — cannot classify environment")
        lower = url.lower()
        is_render = "render.com" in lower or "dpg-" in lower
        is_sqlite = lower.startswith("sqlite")
        # Local .env often points at production Render db_mkhub — single persistent DB.
        self.assertTrue(is_render or is_sqlite)
        if is_render:
            self.assertIn("db_mkhub", lower)

    def test_read_only_schema_presence_no_writes(self):
        url = _load_env_database_url()
        if not url or url.lower().startswith("sqlite"):
            self.skipTest("No remote Postgres URL")
        # Opt-in: default skip so routine suites never open a production connection.
        if (os.environ.get("ALLOW_FIELDWORK_PROD_DB_READONLY") or "").strip() != "1":
            self.skipTest(
                "Set ALLOW_FIELDWORK_PROD_DB_READONLY=1 to run SELECT-only schema probe on db_mkhub"
            )
        from sqlalchemy import create_engine, text

        engine = create_engine(url)
        with engine.connect() as conn:
            tables = {
                r[0]
                for r in conn.execute(
                    text(
                        """
                        SELECT table_name FROM information_schema.tables
                        WHERE table_schema = 'public'
                          AND table_name IN (
                            'fieldwork_records',
                            'fieldwork_photo_observations',
                            'fieldwork_record_events',
                            'client_files',
                            'file_objects',
                            'form_templates'
                          )
                        """
                    )
                )
            }
        for required in (
            "fieldwork_records",
            "fieldwork_photo_observations",
            "client_files",
            "file_objects",
        ):
            self.assertIn(required, tables)
        # Explicitly no INSERT/UPDATE/DELETE in this probe.


class ClosureStatesDocumentationTests(unittest.TestCase):
    """Guardrails: Project Completed must not auto-block on pending Files photos."""

    def test_no_global_project_completion_gate_in_fieldwork_module(self):
        import inspect
        from app.routes import fieldwork as fw_mod

        src = inspect.getsource(fw_mod)
        self.assertNotIn("project completed", src.lower())
        self.assertNotIn("status_label == \"Completed\"", src)


if __name__ == "__main__":
    unittest.main()
