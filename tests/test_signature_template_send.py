"""Signature Editor send-for-signature helpers and hub envelope filter."""
import io
import unittest
import uuid
from unittest.mock import MagicMock, patch

try:
    import fitz  # noqa: F401

    _HAVE_FITZ = True
except ImportError:
    _HAVE_FITZ = False


def _minimal_pdf_bytes() -> bytes:
    from PyPDF2 import PdfWriter

    w = PdfWriter()
    w.add_blank_page(612, 792)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


class TestRolesPresentInSigningFields(unittest.TestCase):
    def test_ignores_non_signing_fields(self):
        from app.services.document_signer_roles import LEGACY_STABLE_IDS
        from app.services.onboarding_signature_template import roles_present_in_signing_fields

        template = {
            "version": 1,
            "fields": [
                {
                    "id": str(uuid.uuid4()),
                    "type": "employee_info",
                    "assignee": "employee",
                    "page_index": 0,
                    "rect": {"x": 1, "y": 1, "width": 10, "height": 10},
                },
                {
                    "id": str(uuid.uuid4()),
                    "type": "text",
                    "assignee": "user",
                    "page_index": 0,
                    "rect": {"x": 1, "y": 1, "width": 10, "height": 10},
                },
            ],
        }
        self.assertEqual(roles_present_in_signing_fields(template), [])

    def test_collects_signature_initial_date_roles(self):
        from app.services.document_signer_roles import LEGACY_STABLE_IDS
        from app.services.onboarding_signature_template import roles_present_in_signing_fields

        template = {
            "version": 1,
            "fields": [
                {
                    "id": str(uuid.uuid4()),
                    "type": "signature",
                    "assignee": "employee",
                    "page_index": 0,
                    "rect": {"x": 1, "y": 1, "width": 10, "height": 10},
                },
                {
                    "id": str(uuid.uuid4()),
                    "type": "date",
                    "assignee": "user",
                    "page_index": 0,
                    "rect": {"x": 1, "y": 1, "width": 10, "height": 10},
                },
            ],
        }
        roles = roles_present_in_signing_fields(template)
        self.assertEqual(len(roles), 2)
        self.assertIn(LEGACY_STABLE_IDS["employee"], roles)
        self.assertIn(LEGACY_STABLE_IDS["company"], roles)


class TestSendTemplateForSignatureValidation(unittest.TestCase):
    def setUp(self):
        if not _HAVE_FITZ:
            self.skipTest("PyMuPDF (fitz) required")

    def test_rejects_template_without_signing_fields(self):
        from fastapi import HTTPException

        from app.routes.document_signature_templates import send_template_for_signature

        row = MagicMock()
        row.name = "Test PDF"
        row.file_id = uuid.uuid4()
        row.signature_template = {
            "version": 1,
            "fields": [
                {
                    "id": str(uuid.uuid4()),
                    "type": "text",
                    "assignee": "employee",
                    "page_index": 0,
                    "rect": {"x": 72, "y": 72, "width": 100, "height": 20},
                    "field_name": "Notes",
                }
            ],
        }

        db = MagicMock()
        db.query.return_value.filter.return_value.first.side_effect = [row, MagicMock()]

        user = MagicMock()
        user.id = uuid.uuid4()

        with patch(
            "app.routes.document_signature_templates.read_file_object_bytes",
            return_value=_minimal_pdf_bytes(),
        ):
            with self.assertRaises(HTTPException) as ctx:
                send_template_for_signature(row.id, {}, db=db, user=user)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("signature, initials, or date", str(ctx.exception.detail).lower())

    def test_creates_envelope_and_request(self):
        from app.routes.document_signature_templates import send_template_for_signature

        pdf = _minimal_pdf_bytes()
        fid = str(uuid.uuid4())
        signer_id = uuid.uuid4()
        template_id = uuid.uuid4()

        row = MagicMock()
        row.id = template_id
        row.name = "NDA"
        row.file_id = uuid.uuid4()
        row.signature_template = {
            "version": 1,
            "fields": [
                {
                    "id": fid,
                    "type": "signature",
                    "assignee": "employee",
                    "page_index": 0,
                    "rect": {"x": 72, "y": 72, "width": 150, "height": 40},
                    "field_name": "Sign",
                    "required": True,
                }
            ],
        }

        fo = MagicMock()
        signer = MagicMock()
        signer.id = signer_id

        db = MagicMock()

        def query_side_effect(model):
            q = MagicMock()
            if model.__name__ == "DocumentSignatureTemplate":
                q.filter.return_value.first.return_value = row
            elif model.__name__ == "FileObject":
                q.filter.return_value.first.return_value = fo
            elif model.__name__ == "User":
                q.filter.return_value.first.return_value = signer
            return q

        db.query.side_effect = query_side_effect

        user = MagicMock()
        user.id = uuid.uuid4()
        user.roles = []
        user.permissions = {}

        req_row = MagicMock()
        req_row.id = uuid.uuid4()

        with patch(
            "app.routes.document_signature_templates.read_file_object_bytes",
            return_value=pdf,
        ), patch(
            "app.routes.document_signature_templates._create_signature_request",
            return_value=req_row,
        ) as mock_create, patch(
            "app.routes.document_signature_templates._request_dict",
            return_value={"id": str(req_row.id)},
        ):
            out = send_template_for_signature(
                template_id,
                {"assignments": {"00000000-0000-4000-8000-000000000001": str(signer_id)}},
                db=db,
                user=user,
            )

        self.assertEqual(out["id"], str(req_row.id))
        mock_create.assert_called_once()
        added_doc = db.add.call_args_list[0][0][0]
        self.assertEqual(added_doc.signature_template_id, template_id)
        self.assertEqual(added_doc.pages, [])


class TestHubEnvelopeFilter(unittest.TestCase):
    def test_standalone_hub_query_excludes_signature_template_envelopes(self):
        import inspect

        from app.routes import document_creator

        source = inspect.getsource(document_creator.list_documents)
        self.assertIn("signature_template_id.is_(None)", source)


if __name__ == "__main__":
    unittest.main()
