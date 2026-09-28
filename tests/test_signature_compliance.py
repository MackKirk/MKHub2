"""Unit tests for signature compliance aggregation."""
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from app.services.signature_compliance import (
    ComplianceCheckError,
    compliance_result_to_status_dict,
    get_onboarding_compliance_slice,
    get_signature_compliance,
    set_participant_turn_deadline,
)


def _item(*, status="pending", required=True, deadline_at=None):
    it = MagicMock()
    it.id = uuid.uuid4()
    it.status = status
    it.required = required
    it.deadline_at = deadline_at
    it.display_name = "Test Doc"
    it.employee_visible = True
    return it


class TestSignatureCompliance(unittest.TestCase):
    def test_compliance_result_to_status_dict(self):
        now = datetime.now(timezone.utc)
        from app.services.signature_compliance import ComplianceResult, SourceCounts

        result = ComplianceResult(
            has_pending=True,
            pending_count=2,
            overdue_count=1,
            blocked=True,
            earliest_deadline=now,
            sources={
                "onboarding": SourceCounts(pending_count=1, overdue_count=1, blocking_count=1),
                "document_builder": SourceCounts(pending_count=1, overdue_count=0, blocking_count=0),
            },
            action_required_count=2,
        )
        d = compliance_result_to_status_dict(result)
        self.assertTrue(d["has_pending"])
        self.assertTrue(d["blocked"])
        self.assertTrue(d["status_available"])
        self.assertEqual(d["action_required_count"], 2)
        self.assertEqual(d["sources"]["onboarding"]["blocking_count"], 1)

    def test_onboarding_slice_no_pending(self):
        db = MagicMock()
        with patch("app.services.signature_compliance.promote_scheduled_assignment_items"), patch(
            "app.services.signature_compliance._onboarding_my_items", return_value=[]
        ):
            out = get_onboarding_compliance_slice(db, uuid.uuid4())
        self.assertFalse(out["has_pending"])
        self.assertFalse(out["past_deadline"])
        self.assertEqual(out["pending_count"], 0)

    def test_onboarding_slice_past_deadline(self):
        db = MagicMock()
        past = datetime.now(timezone.utc) - timedelta(days=1)
        items = [_item(deadline_at=past)]
        with patch("app.services.signature_compliance.promote_scheduled_assignment_items"), patch(
            "app.services.signature_compliance._onboarding_my_items", return_value=items
        ):
            out = get_onboarding_compliance_slice(db, uuid.uuid4())
        self.assertTrue(out["has_pending"])
        self.assertTrue(out["past_deadline"])
        self.assertEqual(out["pending_count"], 1)

    def test_get_signature_compliance_raises_compliance_check_error(self):
        db = MagicMock()
        with patch(
            "app.services.signature_compliance._onboarding_blockers",
            side_effect=RuntimeError("db down"),
        ):
            with self.assertRaises(ComplianceCheckError):
                get_signature_compliance(db, uuid.uuid4())

    def test_set_participant_turn_deadline(self):
        from app.models.models import DocumentSignatureParticipant, DocumentSignatureRequest

        part = DocumentSignatureParticipant()
        req = DocumentSignatureRequest()
        req.signing_deadline_days = 7
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        set_participant_turn_deadline(part, req, now=now)
        self.assertEqual(part.available_at, now)
        self.assertEqual(part.deadline_at, now + timedelta(days=7))

    def test_set_participant_turn_deadline_no_days(self):
        from app.models.models import DocumentSignatureParticipant, DocumentSignatureRequest

        part = DocumentSignatureParticipant()
        req = DocumentSignatureRequest()
        req.signing_deadline_days = None
        set_participant_turn_deadline(part, req)
        self.assertIsNotNone(part.available_at)
        self.assertIsNone(part.deadline_at)

    def test_inbox_source_label_invite(self):
        from app.services.signature_compliance import (
            ONBOARDING_PROCESS_SOURCE_LABEL,
            _inbox_source_label,
        )

        self.assertEqual(_inbox_source_label("invite"), ONBOARDING_PROCESS_SOURCE_LABEL)
        self.assertEqual(_inbox_source_label("INVITE"), ONBOARDING_PROCESS_SOURCE_LABEL)
        self.assertIsNone(_inbox_source_label(None))
        self.assertIsNone(_inbox_source_label(""))
        self.assertIsNone(_inbox_source_label("manual"))

    @patch("app.services.signature_compliance.get_user_display", return_value="Fernando")
    @patch("app.services.signature_compliance.promote_scheduled_assignment_items")
    def test_inbox_invite_origin_suppresses_sent_by(self, _promote, _display):
        from app.services.signature_compliance import get_user_signature_inbox

        uid = uuid.uuid4()
        now = datetime.now(timezone.utc)

        ob_item = MagicMock()
        ob_item.id = uuid.uuid4()
        ob_item.status = "pending"
        ob_item.required = True
        ob_item.deadline_at = now + timedelta(days=7)
        ob_item.available_at = now
        ob_item.display_name = "14. Overtime Policy"
        ob_item.user_message = None
        ob_item.signed_at = None
        ob_item.signed_file_id = None
        ob_item.subject_user_id = None
        ob_item.origin = "invite"

        part = MagicMock()
        part.request_id = uuid.uuid4()
        part.signer_user_id = uid
        part.status = "ready"
        part.deadline_at = now + timedelta(days=7)
        part.available_at = now
        part.role_label = "Employee"
        part.role = "employee"
        part.signed_at = None
        part.created_at = now

        req = MagicMock()
        req.id = part.request_id
        req.status = "pending"
        req.display_name = "Estimator Contract"
        req.requested_by_id = uuid.uuid4()
        req.block_hub_access = False
        req.message_to_signers = None
        req.signed_file_id = None
        req.created_at = now
        req.origin = "invite"

        db = MagicMock()

        def query_side_effect(model):
            m = MagicMock()
            name = getattr(model, "__name__", str(model))
            if "DocumentSignatureParticipant" in name:
                m.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [part]
            elif "DocumentSignatureRequest" in name:
                m.filter.return_value.first.return_value = req
            else:
                m.filter.return_value.first.return_value = None
            return m

        db.query.side_effect = query_side_effect

        with patch(
            "app.services.signature_compliance._onboarding_my_items", return_value=[ob_item]
        ):
            out = get_user_signature_inbox(db, uid)

        by_title = {i["title"]: i for i in out["items"]}
        self.assertEqual(by_title["14. Overtime Policy"]["source_label"], "Onboarding Process")
        self.assertIsNone(by_title["14. Overtime Policy"]["requested_by_name"])
        self.assertEqual(by_title["Estimator Contract"]["source_label"], "Onboarding Process")
        self.assertIsNone(by_title["Estimator Contract"]["requested_by_name"])
        self.assertEqual(by_title["Estimator Contract"]["source"], "document_builder")


if __name__ == "__main__":
    unittest.main()
