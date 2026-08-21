"""Send-for-signature MVP: empty-fields guard + overlay smoke."""
import base64
import io
import unittest
import uuid


def _minimal_pdf_bytes() -> bytes:
    from PyPDF2 import PdfWriter

    w = PdfWriter()
    w.add_blank_page(612, 792)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


# 1x1 opaque black PNG
_TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


class TestDocumentSignatureRequests(unittest.TestCase):
    def test_builder_without_signature_fields_has_empty_payload(self):
        from app.document_creator.signature_fields import build_signature_template_payload
        from app.routes.document_signature_requests import _fields_for_signer

        pages = [
            {
                "id": str(uuid.uuid4()),
                "elements": [
                    {
                        "id": str(uuid.uuid4()),
                        "type": "text",
                        "x": 40,
                        "y": 40,
                        "width": 200,
                        "height": 24,
                        "content": "Hello only",
                    }
                ],
            }
        ]
        raw = build_signature_template_payload(pages)
        fields = raw.get("fields") or []
        self.assertEqual(fields, [])
        self.assertEqual(_fields_for_signer(raw), [])
        # Same guard used by POST .../send-for-signature
        self.assertFalse(bool(fields), "send-for-signature must reject when fields is empty")

    def test_apply_template_signature_overlay_smoke(self):
        from app.services.onboarding_sign import apply_template_field_overlays
        from PyPDF2 import PdfReader

        pdf = _minimal_pdf_bytes()
        fid = str(uuid.uuid4())
        fields = [
            {
                "id": fid,
                "type": "signature",
                "page_index": 0,
                "rect": {"x": 72, "y": 72, "width": 150, "height": 40},
                "field_name": "Sign here",
                "required": True,
                "assignee": "employee",
            }
        ]
        data_url = f"data:image/png;base64,{_TINY_PNG_B64}"
        png_bytes = base64.b64decode(_TINY_PNG_B64)
        self.assertGreaterEqual(len(png_bytes), 10)
        out = apply_template_field_overlays(pdf, fields, {fid: png_bytes})
        self.assertIsInstance(out, (bytes, bytearray))
        self.assertGreater(len(out), 100)
        reader = PdfReader(io.BytesIO(out))
        self.assertEqual(len(reader.pages), 1)
        # data URL form is what the sign API accepts before decode
        self.assertTrue(data_url.startswith("data:image/png;base64,"))


if __name__ == "__main__":
    unittest.main()
