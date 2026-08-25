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
            hp.side_effect = lambda u, p: p == "documents:read"
            self.assertTrue(can_view_builder_signature_admin(user))
            self.assertFalse(can_view_onboarding_signature_admin(user))

            db = MagicMock()
            db.query.return_value.order_by.return_value.limit.return_value.all.return_value = []
            rows = list_admin_signature_requests(db, user)
            self.assertEqual(rows, [])

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
            rows = list_admin_signature_requests(db, user)
            self.assertEqual(rows, [])

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
            return q

        db.query.side_effect = query_side_effect
        with patch("app.services.signature_admin.get_user_display", return_value="User"):
            with patch("app.services.signature_admin.settings") as s:
                s.signature_builder_blocking_enabled = False
                out = _builder_admin_row(db, row, datetime.now(timezone.utc))

        self.assertEqual(out["source"], "document_builder")
        self.assertEqual(out["signed_count"], 1)
        self.assertEqual(out["participant_count"], 2)
        self.assertTrue(out["is_overdue"])
        self.assertTrue(out["block_on_overdue"])
        self.assertFalse(out["has_access_blocker"])

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


if __name__ == "__main__":
    unittest.main()
