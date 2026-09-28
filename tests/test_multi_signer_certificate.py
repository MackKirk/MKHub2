"""Electronic signature certificate: multi-signer audit page."""
import io
import unittest
from datetime import datetime, timezone

from PyPDF2 import PdfReader
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


class TestMultiSignerCertificate(unittest.TestCase):
    def test_certificate_lists_all_signers(self):
        from app.services.onboarding_sign import build_certificate_page_pdf

        pdf = build_certificate_page_pdf(
            document_name="Test Doc",
            document_id="doc-123",
            document_hash_before_sign="abc123hash",
            requested_by="Sender Name",
            requested_at_utc="2026-08-21 18:00:00 UTC",
            requested_by_email="sender@example.com",
            requested_ip="10.0.0.1",
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
        reader = PdfReader(io.BytesIO(pdf))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
        self.assertIn("Alice One", text)
        self.assertIn("Bob Two", text)
        self.assertIn("Carol Three", text)
        self.assertIn("alice@example.com", text)
        self.assertIn("bob@example.com", text)
        self.assertIn("carol@example.com", text)
        self.assertIn("Requested:", text)
        self.assertIn("Sender Name (sender@example.com)", text)
        self.assertIn("IP: 10.0.0.1", text)
        self.assertEqual(text.count("Signed:"), 3)
        self.assertNotIn("Signed —", text)
        self.assertIn("2026-08-21 18:00:00 UTC", text)
        self.assertIn("IP: 1.1.1.1", text)
        self.assertNotIn("User agent", text)
        self.assertNotIn("Signed (local)", text)
        self.assertNotIn("Mozilla/5.0", text)

    def test_from_merged_accepts_signers_list(self):
        from app.services.onboarding_sign import build_signed_pdf_with_certificate_from_merged

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=A4)
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
        self.assertNotIn("User agent", text)
        self.assertNotIn("Signed (local)", text)

    def test_format_signed_times_vancouver_offset(self):
        from app.services.onboarding_sign import _format_signed_times

        signed_at = datetime(2026, 8, 26, 18, 24, 34, tzinfo=timezone.utc)
        local, utc = _format_signed_times(signed_at, "America/Vancouver")
        self.assertEqual(utc, "2026-08-26 18:24:34 UTC")
        self.assertIn("2026-08-26 11:24", local)
        self.assertNotIn("UTC", local)

    def test_from_merged_formats_signer_utc_only(self):
        from app.services.onboarding_sign import build_signed_pdf_with_certificate_from_merged

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=A4)
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
        self.assertIn("2026-08-26 18:30:00 UTC", text)
        self.assertNotIn("Signed (local)", text)
        # Local Vancouver time must not appear on the certificate page
        self.assertNotIn("2026-08-26 11:30", text)

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
        text = "\n".join(
            (p.extract_text() or "") for p in PdfReader(io.BytesIO(pdf)).pages
        )
        self.assertIn("Only One", text)
        self.assertIn("Signed:", text)
        self.assertNotIn("Signed (1)", text)
        self.assertNotIn("User agent", text)
        self.assertNotIn("Signed (local)", text)

    def test_tight_margins_overflow_creates_multiple_pages(self):
        from app.services.onboarding_sign import build_certificate_page_pdf

        # Large top/bottom margins → tiny content box → many pages for many signers
        margins = {
            "left_pct": 10,
            "right_pct": 10,
            "top_pct": 45,
            "bottom_pct": 45,
        }
        signers = [
            {
                "name": f"Signer {i}",
                "email": f"s{i}@example.com",
                "role_label": "Employee",
                "signed_utc": f"2026-08-21 18:{i:02d}:00 UTC",
                "ip_address": "1.1.1.1",
            }
            for i in range(12)
        ]
        # Minimal 1x1 PNG as background so template path is exercised
        from PIL import Image

        bg_buf = io.BytesIO()
        Image.new("RGB", (8, 8), color=(240, 240, 240)).save(bg_buf, format="PNG")
        bg = bg_buf.getvalue()

        pdf = build_certificate_page_pdf(
            document_name="Overflow Doc",
            document_id="ov-1",
            document_hash_before_sign="hash",
            requested_by="Sender",
            requested_at_utc="2026-08-21 18:00:00 UTC",
            acceptance_statement="I agree.",
            signers=signers,
            background_bytes=bg,
            margins=margins,
        )
        reader = PdfReader(io.BytesIO(pdf))
        self.assertGreater(len(reader.pages), 1)
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
        self.assertIn("Electronic Signature Certificate", text)
        self.assertIn("continued", text)
        self.assertIn("Signer 0", text)
        self.assertIn("Signer 11", text)
        # All pages A4
        for page in reader.pages:
            w = float(page.mediabox.width)
            h = float(page.mediabox.height)
            self.assertAlmostEqual(w, A4[0], delta=1.0)
            self.assertAlmostEqual(h, A4[1], delta=1.0)

    def test_content_box_from_margins(self):
        from app.services.onboarding_sign import content_box_from_margins

        page_w, page_h = A4
        x, y_bottom, width, y_top = content_box_from_margins(
            page_w,
            page_h,
            {"left_pct": 10, "right_pct": 10, "top_pct": 20, "bottom_pct": 15},
        )
        self.assertAlmostEqual(x, page_w * 0.10, delta=0.5)
        self.assertAlmostEqual(y_bottom, page_h * 0.15, delta=0.5)
        self.assertAlmostEqual(y_top, page_h * 0.80, delta=0.5)
        self.assertAlmostEqual(width, page_w * 0.80, delta=0.5)

    def test_content_box_respects_block_elements(self):
        from app.services.onboarding_sign import content_box_from_margins

        page_w, page_h = A4
        # Bottom band block (legacy case)
        elements = [
            {
                "type": "block",
                "x_pct": 0,
                "y_pct": 60,
                "width_pct": 100,
                "height_pct": 40,
            }
        ]
        _x, y_bottom, _w, y_top = content_box_from_margins(
            page_w,
            page_h,
            {"left_pct": 0, "right_pct": 0, "top_pct": 0, "bottom_pct": 0},
            elements=elements,
        )
        self.assertAlmostEqual(y_bottom, page_h * 0.40, delta=1.0)
        self.assertGreater(y_top - y_bottom, 100)

    def test_content_box_respects_top_block(self):
        from app.services.onboarding_sign import content_box_from_margins

        page_w, page_h = A4
        # Certified Doc style: seal zone blocked at top ~32%
        elements = [
            {
                "type": "block",
                "x_pct": 0,
                "y_pct": 0,
                "width_pct": 100,
                "height_pct": 32.27,
            },
            {
                "type": "block",
                "x_pct": 0,
                "y_pct": 91.89,
                "width_pct": 100,
                "height_pct": 8.11,
            },
        ]
        _x, y_bottom, _w, y_top = content_box_from_margins(
            page_w,
            page_h,
            {"left_pct": 0, "right_pct": 0, "top_pct": 0, "bottom_pct": 0},
            elements=elements,
        )
        # Text must start below the top block (~67.7% from page bottom)
        expected_top = page_h * (1.0 - 0.3227)
        self.assertAlmostEqual(y_top, expected_top, delta=2.0)
        # And end above the footer block
        expected_bottom = page_h * (1.0 - 0.9189)
        self.assertAlmostEqual(y_bottom, expected_bottom, delta=2.0)
        self.assertGreater(y_top, y_bottom)


if __name__ == "__main__":
    unittest.main()
