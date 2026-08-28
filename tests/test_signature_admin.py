"""Admin Signature Requests — permission gating, filters, and source aggregation."""
import sys
import types
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

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


class TestSignatureAdminPermissions(unittest.TestCase):
    def test_documents_only_can_view_builder_not_onboarding(self):
        from app.services.signature_admin import (
            can_view_builder_signature_admin,
            can_view_onboarding_signature_admin,
            list_admin_signature_requests,
        )

        user = MagicMock()
        user.roles = []
        with patch("app.services.signature_admin._has_permission") as hp:
            hp.side_effect = lambda u, p: p == "document_hub:signature_requests:read"
            self.assertTrue(can_view_builder_signature_admin(user))
            self.assertFalse(can_view_onboarding_signature_admin(user))

            db = MagicMock()
            db.query.return_value.order_by.return_value.limit.return_value.all.return_value = []
            result = list_admin_signature_requests(db, user)
            self.assertEqual(result["items"], [])
            self.assertEqual(result["total"], 0)
            self.assertEqual(result["page"], 1)
            self.assertEqual(result["page_size"], 25)
            self.assertEqual(result["total_pages"], 0)

    def test_legacy_manage_implies_builder_signature_admin(self):
        from app.services.signature_admin import (
            can_manage_builder_signature_admin,
            can_view_builder_signature_admin,
        )

        user = MagicMock()
        user.roles = []
        with patch("app.services.signature_admin._has_permission") as hp:
            # Simulate security aliases: manage satisfies signature_requests:write/read checks
            hp.side_effect = lambda u, p: p in (
                "document_hub:signature_requests:read",
                "document_hub:signature_requests:write",
            )
            self.assertTrue(can_view_builder_signature_admin(user))
            self.assertTrue(can_manage_builder_signature_admin(user))

    def test_hr_only_can_view_onboarding_not_builder(self):
        from app.services.signature_admin import (
            can_view_builder_signature_admin,
            can_view_onboarding_signature_admin,
            list_admin_signature_requests,
        )

        user = MagicMock()
        user.roles = []
        with patch("app.services.signature_admin._has_permission") as hp:
            hp.side_effect = lambda u, p: p == "hr:onboarding:read"
            self.assertFalse(can_view_builder_signature_admin(user))
            self.assertTrue(can_view_onboarding_signature_admin(user))

            db = MagicMock()
            q = MagicMock()
            q.join.return_value.order_by.return_value.limit.return_value.all.return_value = []
            db.query.return_value = q
            result = list_admin_signature_requests(db, user)
            self.assertEqual(result["items"], [])
            self.assertEqual(result["total"], 0)

    def test_admin_route_forbidden_without_any_admin_permission(self):
        from fastapi import HTTPException
        from app.routes.signature_admin import admin_list_signature_requests

        user = MagicMock()
        user.roles = []
        with patch("app.routes.signature_admin.can_view_builder_signature_admin", return_value=False):
            with patch("app.routes.signature_admin.can_view_onboarding_signature_admin", return_value=False):
                with self.assertRaises(HTTPException) as ctx:
                    admin_list_signature_requests(db=MagicMock(), user=user)
        self.assertEqual(ctx.exception.status_code, 403)


class TestSignatureAdminAggregation(unittest.TestCase):
    def _builder_row(self):
        from app.models.models import DocumentSignatureParticipant, DocumentSignatureRequest

        now = datetime.now(timezone.utc)
        row = DocumentSignatureRequest()
        row.id = uuid.uuid4()
        row.user_document_id = uuid.uuid4()
        row.display_name = "Builder Doc"
        row.status = "in_progress"
        row.requested_by_id = uuid.uuid4()
        row.created_at = now
        row.block_hub_access = True
        row.signing_deadline_days = 7

        ready = DocumentSignatureParticipant()
        ready.id = uuid.uuid4()
        ready.request_id = row.id
        ready.signer_user_id = uuid.uuid4()
        ready.role = "employee"
        ready.status = "ready"
        ready.sort_order = 0
        ready.deadline_at = now - timedelta(days=1)
        ready.available_at = now - timedelta(days=8)

        signed = DocumentSignatureParticipant()
        signed.id = uuid.uuid4()
        signed.request_id = row.id
        signed.signer_user_id = uuid.uuid4()
        signed.role = "company"
        signed.status = "signed"
        signed.sort_order = 1
        signed.signed_at = now - timedelta(days=2)

        return row, [ready, signed]

    def test_builder_admin_row_includes_counts_and_overdue(self):
        from app.services.signature_admin import _builder_admin_row

        db = MagicMock()
        row, parts = self._builder_row()

        def query_side_effect(model):
            q = MagicMock()
            name = getattr(model, "__name__", str(model))
            if name == "DocumentSignatureParticipant":
                q.filter.return_value.order_by.return_value.all.return_value = parts
            elif name == "UserDocument":
                doc = MagicMock()
                doc.signature_template_id = None
                q.filter.return_value.first.return_value = doc
            return q

        db.query.side_effect = query_side_effect
        with patch("app.services.signature_admin.get_user_display", return_value="User"):
            with patch("app.services.signature_admin.settings") as s:
                s.signature_builder_blocking_enabled = False
                out = _builder_admin_row(db, row, datetime.now(timezone.utc))
                managed = _builder_admin_row(db, row, datetime.now(timezone.utc), can_manage=True)

        self.assertEqual(out["source"], "document_builder")
        self.assertEqual(out["signed_count"], 1)
        self.assertEqual(out["participant_count"], 2)
        self.assertTrue(out["is_overdue"])
        self.assertTrue(out["block_on_overdue"])
        self.assertFalse(out["has_access_blocker"])
        self.assertFalse(out["admin_actions_available"])
        self.assertTrue(managed["admin_actions_available"])

    def test_builder_admin_row_keeps_deadline_when_completed(self):
        from app.services.signature_admin import _builder_admin_row

        db = MagicMock()
        row, parts = self._builder_row()
        row.status = "completed"
        now = datetime.now(timezone.utc)
        # No ready participant — both signed (completed envelope)
        for p in parts:
            p.status = "signed"
            p.deadline_at = now - timedelta(days=1)
            p.signed_at = now
        parts[1].deadline_at = now - timedelta(hours=2)

        def query_side_effect(model):
            q = MagicMock()
            name = getattr(model, "__name__", str(model))
            if name == "DocumentSignatureParticipant":
                q.filter.return_value.order_by.return_value.all.return_value = parts
            elif name == "UserDocument":
                doc = MagicMock()
                doc.signature_template_id = None
                q.filter.return_value.first.return_value = doc
            return q

        db.query.side_effect = query_side_effect
        with patch("app.services.signature_admin.get_user_display", return_value="User"):
            with patch("app.services.signature_admin.settings") as s:
                s.signature_builder_blocking_enabled = False
                out = _builder_admin_row(db, row, now)

        self.assertIsNotNone(out["deadline_at"])
        self.assertEqual(out["deadline_at"], (now - timedelta(hours=2)).isoformat())

    def test_builder_admin_row_signature_editor_source(self):
        from app.services.signature_admin import _builder_admin_row, document_signature_request_source

        db = MagicMock()
        row, parts = self._builder_row()
        template_id = uuid.uuid4()

        def query_side_effect(model):
            q = MagicMock()
            name = getattr(model, "__name__", str(model))
            if name == "DocumentSignatureParticipant":
                q.filter.return_value.order_by.return_value.all.return_value = parts
            elif name == "UserDocument":
                doc = MagicMock()
                doc.signature_template_id = template_id
                q.filter.return_value.first.return_value = doc
            return q

        db.query.side_effect = query_side_effect
        self.assertEqual(document_signature_request_source(db, row), "signature_editor")
        with patch("app.services.signature_admin.get_user_display", return_value="User"):
            with patch("app.services.signature_admin.settings") as s:
                s.signature_builder_blocking_enabled = False
                out = _builder_admin_row(db, row, datetime.now(timezone.utc), can_manage=True)
        self.assertEqual(out["source"], "signature_editor")
        self.assertTrue(out["admin_actions_available"])

    def test_document_signature_request_source_defaults_to_builder(self):
        from app.services.signature_admin import document_signature_request_source

        db = MagicMock()
        row = MagicMock()
        row.user_document_id = uuid.uuid4()
        db.query.return_value.filter.return_value.first.return_value = None
        self.assertEqual(document_signature_request_source(db, row), "document_builder")

    def test_onboarding_admin_row_single_participant(self):
        from app.models.models import OnboardingAssignment, OnboardingAssignmentItem
        from app.services.signature_admin import _onboarding_admin_row

        now = datetime.now(timezone.utc)
        assignment = OnboardingAssignment()
        assignment.id = uuid.uuid4()
        assignment.user_id = uuid.uuid4()
        assignment.assigned_by_id = uuid.uuid4()
        assignment.assigned_at = now

        it = OnboardingAssignmentItem()
        it.id = uuid.uuid4()
        it.display_name = "Policy ACK"
        it.status = "pending"
        it.required = True
        it.available_at = now
        it.deadline_at = now + timedelta(days=3)

        db = MagicMock()
        with patch("app.services.signature_admin.get_user_display", return_value="Signer"):
            out = _onboarding_admin_row(db, it, assignment, now)

        self.assertEqual(out["source"], "onboarding")
        self.assertEqual(out["participant_count"], 1)
        self.assertEqual(out["signed_count"], 0)
        self.assertFalse(out["admin_actions_available"])
        self.assertEqual(len(out["participants"]), 1)


class TestActionRequiredCount(unittest.TestCase):
    def test_action_required_excludes_waiting_builder_signer(self):
        from app.services.signature_compliance import ComplianceResult, SourceCounts, compliance_result_to_status_dict

        result = ComplianceResult(
            has_pending=True,
            pending_count=1,
            overdue_count=0,
            blocked=False,
            earliest_deadline=None,
            sources={
                "onboarding": SourceCounts(),
                "document_builder": SourceCounts(),
            },
            action_required_count=1,
        )
        d = compliance_result_to_status_dict(result)
        self.assertEqual(d["action_required_count"], 1)

    def test_waiting_not_in_action_required_count(self):
        """pending_count for compliance uses ready-only for builder — action_required mirrors it."""
        from app.services.signature_compliance import _inbox_status_builder
        from app.models.models import DocumentSignatureParticipant, DocumentSignatureRequest

        part = DocumentSignatureParticipant()
        part.status = "pending"
        req = DocumentSignatureRequest()
        req.status = "in_progress"
        self.assertEqual(_inbox_status_builder(part, req), "waiting")


class TestSignatureAdminFilters(unittest.TestCase):
    def test_source_filter_blocks_cross_source_in_matches(self):
        from app.services.signature_admin import _matches_filters

        row = {"source": "onboarding", "status": "pending", "is_overdue": False, "block_on_overdue": True}
        self.assertFalse(_matches_filters(row, filters={"source": "document_builder"}, now=datetime.now(timezone.utc)))

    def test_search_matches_display_name_and_signer(self):
        from app.services.signature_admin import _matches_search

        row = {
            "display_name": "Safety Policy 2026",
            "requested_by_name": "Jane Admin",
            "participants": [{"name": "John Smith", "subject_label": None}],
        }
        self.assertTrue(_matches_search(row, "safety"))
        self.assertTrue(_matches_search(row, "john"))
        self.assertFalse(_matches_search(row, "payroll"))


class TestSignatureAdminPagination(unittest.TestCase):
    def test_empty_permission_returns_paginated_shape(self):
        from app.services.signature_admin import list_admin_signature_requests

        user = MagicMock()
        user.roles = []
        with patch("app.services.signature_admin.can_view_builder_signature_admin", return_value=False):
            with patch("app.services.signature_admin.can_view_onboarding_signature_admin", return_value=False):
                result = list_admin_signature_requests(MagicMock(), user, page=2, page_size=50)
        self.assertEqual(
            result,
            {"items": [], "total": 0, "page": 1, "page_size": 50, "total_pages": 0},
        )

    def test_pagination_slices_matching_rows(self):
        from app.services.signature_admin import list_admin_signature_requests

        user = MagicMock()
        user.roles = []

        now = datetime.now(timezone.utc)
        fake_rows = [
            {
                "id": str(uuid.uuid4()),
                "source": "document_builder",
                "display_name": f"Doc {i}",
                "status": "pending",
                "created_at": (now - timedelta(minutes=i)).isoformat(),
                "is_overdue": False,
                "block_on_overdue": False,
                "participants": [],
            }
            for i in range(5)
        ]

        req_mocks = []
        for i, fr in enumerate(fake_rows):
            req = MagicMock()
            req.id = uuid.UUID(fr["id"])
            req.user_document_id = uuid.uuid4()
            req.requested_by_id = None
            req.created_at = now - timedelta(minutes=i)
            req_mocks.append(req)

        def query_side_effect(*_models):
            q = MagicMock()
            q.order_by.return_value.limit.return_value.all.return_value = req_mocks
            q.filter.return_value.order_by.return_value.all.return_value = []
            q.filter.return_value.all.return_value = []
            q.filter.return_value.first.return_value = None
            return q

        db = MagicMock()
        db.query.side_effect = query_side_effect

        call_state = {"n": 0}

        def fake_build(*_args, **_kwargs):
            idx = call_state["n"] % len(fake_rows)
            call_state["n"] += 1
            return fake_rows[idx]

        with patch("app.services.signature_admin.can_view_builder_signature_admin", return_value=True):
            with patch("app.services.signature_admin.can_view_onboarding_signature_admin", return_value=False):
                with patch("app.services.signature_admin.can_manage_builder_signature_admin", return_value=True):
                    with patch("app.services.signature_admin._builder_admin_row_from_parts", side_effect=fake_build):
                        with patch("app.services.signature_admin._matches_filters", return_value=True):
                            with patch("app.services.signature_admin._matches_search", return_value=True):
                                page1 = list_admin_signature_requests(db, user, page=1, page_size=2)
                                page2 = list_admin_signature_requests(db, user, page=2, page_size=2)
                                page3 = list_admin_signature_requests(db, user, page=3, page_size=2)

        self.assertEqual(page1["total"], 5)
        self.assertEqual(page1["page"], 1)
        self.assertEqual(page1["page_size"], 2)
        self.assertEqual(page1["total_pages"], 3)
        self.assertEqual([r["display_name"] for r in page1["items"]], ["Doc 0", "Doc 1"])
        self.assertEqual([r["display_name"] for r in page2["items"]], ["Doc 2", "Doc 3"])
        self.assertEqual([r["display_name"] for r in page3["items"]], ["Doc 4"])
        self.assertEqual(page3["page"], 3)
    def test_document_signature_request_source_uses_batch_map(self):
        from app.services.signature_admin import document_signature_request_source

        db = MagicMock()
        row = MagicMock()
        row.user_document_id = uuid.uuid4()
        template_id = uuid.uuid4()
        self.assertEqual(
            document_signature_request_source(
                db, row, template_id_by_doc={row.user_document_id: template_id}
            ),
            "signature_editor",
        )
        self.assertEqual(
            document_signature_request_source(
                db, row, template_id_by_doc={row.user_document_id: None}
            ),
            "document_builder",
        )
        db.query.assert_not_called()


if __name__ == "__main__":
    unittest.main()
