"""Lightweight tests for signature template validation (requires PyMuPDF for page sizing)."""
import io
import unittest
import uuid

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


class TestSignatureTemplate(unittest.TestCase):
    def setUp(self):
        if not _HAVE_FITZ:
            self.skipTest("PyMuPDF (fitz) required for validate_and_normalize_template")

    def test_validate_normalize_one_field(self):
        from app.services.onboarding_signature_template import validate_and_normalize_template

        pdf = _minimal_pdf_bytes()
        fid = str(uuid.uuid4())
        raw = {
            "version": 1,
            "fields": [
                {
                    "id": fid,
                    "type": "signature",
                    "page_index": 0,
                    "rect": {"x": 72, "y": 72, "width": 150, "height": 40},
                    "field_name": "Sign here",
                    "required": True,
                    "assignee": "employee",
                }
            ],
        }
        out = validate_and_normalize_template(raw, pdf)
        self.assertEqual(out["version"], 1)
        self.assertEqual(len(out["fields"]), 1)
        self.assertEqual(out["fields"][0]["id"], fid)
        self.assertEqual(out["fields"][0]["rect"]["width"], 150)


if __name__ == "__main__":
    unittest.main()
