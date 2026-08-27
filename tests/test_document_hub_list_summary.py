"""Hub document list summary enrichment (scope, signature status)."""
import unittest
import uuid
from unittest.mock import MagicMock, patch

from app.models.models import DocumentSignatureParticipant, DocumentSignatureRequest


class TestDocumentScope(unittest.TestCase):
    def test_standalone(self):
        from app.routes.document_creator import _document_scope

        doc = MagicMock()
        doc.project_id = None
        doc.subject_user_id = None
        self.assertEqual(_document_scope(doc), "standalone")

    def test_project(self):
        from app.routes.document_creator import _document_scope

        doc = MagicMock()
        doc.project_id = uuid.uuid4()
        doc.subject_user_id = None
        self.assertEqual(_document_scope(doc), "project")

    def test_user(self):
        from app.routes.document_creator import _document_scope

        doc = MagicMock()
        doc.project_id = None
        doc.subject_user_id = uuid.uuid4()
        self.assertEqual(_document_scope(doc), "user")


class TestSignatureStatusForDocument(unittest.TestCase):
    def test_signed_when_request_completed(self):
        from app.routes.document_creator import _signature_status_for_document

        doc = MagicMock()
        doc.pages = []
        req = MagicMock(spec=DocumentSignatureRequest)
        req.status = "completed"
        out = _signature_status_for_document(doc, req, [])
        self.assertEqual(out["signature_status"], "signed")
        self.assertEqual(out["signature_label"], "SIGNED")

    def test_in_progress_counts_participants(self):
        from app.routes.document_creator import _signature_status_for_document

        doc = MagicMock()
        doc.pages = []
        req = MagicMock(spec=DocumentSignatureRequest)
        req.status = "pending"
        p1 = MagicMock(spec=DocumentSignatureParticipant)
        p1.status = "signed"
        p2 = MagicMock(spec=DocumentSignatureParticipant)
        p2.status = "ready"
        p3 = MagicMock(spec=DocumentSignatureParticipant)
        p3.status = "pending"
        out = _signature_status_for_document(doc, req, [p1, p2, p3])
        self.assertEqual(out["signature_status"], "in_progress")
        self.assertEqual(out["signature_label"], "1 OF 3 SIGNED")
        self.assertEqual(out["signature_signed_count"], 1)
        self.assertEqual(out["signature_total_count"], 3)

    def test_ready_when_signature_fields_present(self):
        from app.routes.document_creator import _signature_status_for_document

        doc = MagicMock()
        doc.pages = [{"elements": []}]
        with patch(
            "app.document_creator.signature_fields.build_signature_template_payload",
            return_value={"fields": [{"id": "f1"}]},
        ):
            out = _signature_status_for_document(doc, None, [])
        self.assertEqual(out["signature_status"], "ready")
        self.assertEqual(out["signature_label"], "READY")

    def test_draft_when_no_fields(self):
        from app.routes.document_creator import _signature_status_for_document

        doc = MagicMock()
        doc.pages = []
        with patch(
            "app.document_creator.signature_fields.build_signature_template_payload",
            return_value={"fields": []},
        ):
            out = _signature_status_for_document(doc, None, [])
        self.assertEqual(out["signature_status"], "draft")
        self.assertEqual(out["signature_label"], "DRAFT")


class TestDocToSummaryEnrichment(unittest.TestCase):
    def test_enriched_summary_includes_scope_and_signature(self):
        from app.routes.document_creator import _doc_to_summary

        doc = MagicMock()
        doc.id = uuid.uuid4()
        doc.title = "Contract"
        doc.document_type_id = None
        doc.project_id = None
        doc.subject_user_id = None
        doc.pages = []
        doc.created_by = uuid.uuid4()
        doc.created_at = None
        doc.updated_at = None

        user = MagicMock()
        db = MagicMock()
        with patch("app.routes.document_creator._can_access_document", return_value=True):
            with patch("app.routes.document_creator._holder_display_name", return_value="Fernando"):
                with patch(
                    "app.routes.document_creator._signature_status_for_document",
                    return_value={
                        "signature_status": "draft",
                        "signature_label": "DRAFT",
                        "signature_signed_count": None,
                        "signature_total_count": None,
                    },
                ):
                    summary = _doc_to_summary(doc, db, user, signature_ctx={})
        self.assertEqual(summary["scope"], "standalone")
        self.assertEqual(summary["created_by_name"], "Fernando")
        self.assertEqual(summary["signature_status"], "draft")
        self.assertTrue(summary["can_edit"])


if __name__ == "__main__":
    unittest.main()
