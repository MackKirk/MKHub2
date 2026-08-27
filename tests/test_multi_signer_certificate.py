"""Electronic signature certificate: multi-signer audit page."""
import unittest
from datetime import datetime, timezone

from PyPDF2 import PdfReader


class TestMultiSignerCertificate(unittest.TestCase):
    def test_certificate_lists_all_signers(self):
        from app.services.onboarding_sign import build_certificate_page_pdf

        pdf = build_certificate_page_pdf(
            document_name="Test Doc",
            document_id="doc-123",
            document_hash_before_sign="abc123hash",
            requested_by="Sender Name",
            requested_at_utc="2026-08-21 18:00:00 UTC",
            acceptance_statement="I have read and agree to this document.",
            signers=[
                {
                    "name": "Alice One",
                    "email": "alice@example.com",
                    "role_label": "Employee",
                    "signed_local": "2026-08-21 11:00 PDT",
                    "signed_utc": "2026-08-21 18:00:00 UTC",
                    "ip_address": "1.1.1.1",
                    "user_agent": "Mozilla/5.0 Alice",
                },
                {
                    "name": "Bob Two",
                    "email": "bob@example.com",
                    "role_label": "Company",
                    "signed_local": "2026-08-21 11:10 PDT",
                    "signed_utc": "2026-08-21 18:10:00 UTC",
                    "ip_address": "2.2.2.2",
                    "user_agent": "Mozilla/5.0 Bob",
                },
                {
                    "name": "Carol Three",
                    "email": "carol@example.com",
                    "role_label": "Other",
                    "signed_local": "2026-08-21 11:20 PDT",
                    "signed_utc": "2026-08-21 18:20:00 UTC",
                    "ip_address": "3.3.3.3",
                    "user_agent": "Mozilla/5.0 Carol",
                },
            ],
        )
        reader = PdfReader(__import__("io").BytesIO(pdf))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
        self.assertIn("Alice One", text)
        self.assertIn("Bob Two", text)
        self.assertIn("Carol Three", text)
        self.assertIn("alice@example.com", text)
        self.assertIn("bob@example.com", text)
        self.assertIn("carol@example.com", text)
        self.assertIn("Signature 1", text)
        self.assertIn("Signature 2", text)
        self.assertIn("Signature 3", text)

    def test_from_merged_accepts_signers_list(self):
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        import io
        from app.services.onboarding_sign import build_signed_pdf_with_certificate_from_merged

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        c.drawString(100, 700, "Body")
        c.showPage()
        c.save()
        base = buf.getvalue()

        now = datetime(2026, 8, 21, 18, 30, tzinfo=timezone.utc)
        final, cert_hash = build_signed_pdf_with_certificate_from_merged(
            base,
            document_name="Untitled",
            document_id="rid-1",
            base_doc_hash="hash",
            requested_by="Fernando",
            requested_at=now,
            acceptance_statement="I agree.",
            signers=[
                {
                    "name": "Raphael Coelho",
                    "email": "raph@example.com",
                    "role_label": "Employee",
                    "signed_at": now,
                    "ip_address": "127.0.0.1",
                    "user_agent": "Chrome",
                },
                {
                    "name": "Other Person",
                    "email": "other@example.com",
                    "role_label": "Other",
                    "signed_at": now,
                    "ip_address": "127.0.0.1",
                    "user_agent": "Chrome",
                },
            ],
        )
        self.assertTrue(cert_hash)
        reader = PdfReader(io.BytesIO(final))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
        self.assertIn("Raphael Coelho", text)
        self.assertIn("Other Person", text)

    def test_format_signed_times_vancouver_offset(self):
        from app.services.onboarding_sign import _format_signed_times

        signed_at = datetime(2026, 8, 26, 18, 24, 34, tzinfo=timezone.utc)
        local, utc = _format_signed_times(signed_at, "America/Vancouver")
        self.assertEqual(utc, "2026-08-26 18:24:34 UTC")
        self.assertIn("2026-08-26 11:24", local)
        self.assertNotIn("UTC", local)

    def test_from_merged_formats_signer_local_time(self):
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        import io
        from app.services.onboarding_sign import build_signed_pdf_with_certificate_from_merged

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        c.drawString(100, 700, "Body")
        c.showPage()
        c.save()
        base = buf.getvalue()

        now = datetime(2026, 8, 26, 18, 30, tzinfo=timezone.utc)
        final, cert_hash = build_signed_pdf_with_certificate_from_merged(
            base,
            document_name="Untitled",
            document_id="rid-1",
            base_doc_hash="hash",
            requested_by="Fernando",
            requested_at=now,
            acceptance_statement="I agree.",
            signers=[
                {
                    "name": "Raphael Coelho",
                    "email": "raph@example.com",
                    "role_label": "Employee",
                    "signed_at": now,
                    "ip_address": "127.0.0.1",
                    "user_agent": "Chrome",
                },
            ],
            tz_name="America/Vancouver",
        )
        self.assertTrue(cert_hash)
        text = "\n".join(
            (p.extract_text() or "") for p in PdfReader(io.BytesIO(final)).pages
        )
        self.assertIn("2026-08-26 11:30", text)
        self.assertIn("2026-08-26 18:30:00 UTC", text)

    def test_single_signer_kwargs_still_work(self):
        from app.services.onboarding_sign import build_certificate_page_pdf

        pdf = build_certificate_page_pdf(
            document_name="Solo",
            document_id="1",
            document_hash_before_sign="h",
            requested_by="Boss",
            requested_at_utc="2026-01-01 00:00:00 UTC",
            acceptance_statement="OK",
            signer_name="Only One",
            signer_email="only@example.com",
            signed_local="2026-01-01 00:00 UTC",
            signed_utc="2026-01-01 00:00:00 UTC",
            ip_address="9.9.9.9",
            user_agent="UA",
        )
        import io

        text = "\n".join(
            (p.extract_text() or "") for p in PdfReader(io.BytesIO(pdf)).pages
        )
        self.assertIn("Only One", text)
        self.assertIn("Signature", text)
        self.assertNotIn("Signature 1", text)


if __name__ == "__main__":
    unittest.main()
