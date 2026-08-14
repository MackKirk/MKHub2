"""Tests for inbound email → project Notes pipeline."""
from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services.inbound_email import (
    ParsedInboundEmail,
    attachment_allowed,
    extract_email_address,
    extract_mk_code,
    html_to_text,
    is_allowed_sender,
    parse_office365_json,
    parse_sendgrid_inbound_form,
    process_inbound_email,
    resolve_body,
    route_kind_for_recipients,
)


class TestParseHelpers(unittest.TestCase):
    def test_extract_email_from_angle_addr(self):
        self.assertEqual(
            extract_email_address("Raphael Coelho <raphael@mackkirk.com>"),
            "raphael@mackkirk.com",
        )

    def test_extract_mk_code_from_subject(self):
        self.assertEqual(extract_mk_code("Re: Confirmation MK-00497 materials"), "MK-00497")
        self.assertEqual(extract_mk_code("mk-00001 / stuff"), "MK-00001")

    def test_extract_mk_code_first_match(self):
        self.assertEqual(extract_mk_code("MK-00111 then MK-00222"), "MK-00111")

    def test_extract_mk_code_none(self):
        self.assertIsNone(extract_mk_code("No project code here"))

    def test_extract_mk_code_fallback_body(self):
        self.assertEqual(extract_mk_code("Hello", "Please file under MK-00438 thanks"), "MK-00438")

    def test_allowed_sender_domains(self):
        self.assertTrue(is_allowed_sender("a@mackkirk.com", {"mackkirk.com", "mackkirkroofing.com"}))
        self.assertTrue(is_allowed_sender("b@mackkirkroofing.com", {"mackkirk.com", "mackkirkroofing.com"}))
        self.assertFalse(is_allowed_sender("x@gmail.com", {"mackkirk.com", "mackkirkroofing.com"}))

    def test_html_to_text(self):
        out = html_to_text("<p>Hello&nbsp;<b>world</b></p>")
        self.assertIn("Hello", out)
        self.assertIn("world", out)
        self.assertNotIn("<", out)

    def test_resolve_body_prefers_text(self):
        self.assertEqual(resolve_body("plain", "<p>html</p>"), "plain")
        self.assertIn("html", resolve_body("", "<p>html</p>"))

    def test_attachment_allowed(self):
        self.assertTrue(attachment_allowed("a.pdf", "application/pdf"))
        self.assertTrue(attachment_allowed("photo.PNG", "image/png"))
        self.assertFalse(attachment_allowed("evil.exe", "application/octet-stream"))

    @patch("app.services.inbound_email.notes_recipient_addresses", return_value={"notes@mackkirk.com"})
    def test_route_notes(self, _mock):
        self.assertEqual(route_kind_for_recipients(["notes@mackkirk.com"]), "notes")
        self.assertEqual(route_kind_for_recipients(["other@mackkirk.com"]), "unrouted")

    def test_parse_sendgrid_form(self):
        parsed = parse_sendgrid_inbound_form(
            {
                "from": "Alex <alex@mackkirk.com>",
                "to": "Notes <notes@mackkirk.com>",
                "subject": "Fwd: PO MK-00497",
                "text": "Body here",
                "headers": "Message-Id: <abc123@mail>\nDate: Fri, 14 Aug 2026\n",
                "envelope": '{"to":["notes@mackkirk.com"],"from":"alex@mackkirk.com"}',
            },
            [("attachment1", "quote.pdf", "application/pdf", b"%PDF-1.4")],
        )
        self.assertEqual(parsed.from_email, "alex@mackkirk.com")
        self.assertEqual(parsed.subject, "Fwd: PO MK-00497")
        self.assertEqual(parsed.message_id, "abc123@mail")
        self.assertEqual(parsed.envelope_to, ["notes@mackkirk.com"])
        self.assertEqual(len(parsed.attachments), 1)
        self.assertEqual(parsed.attachments[0].filename, "quote.pdf")

    def test_parse_office365_json(self):
        import base64

        parsed = parse_office365_json(
            {
                "from": "Alex <alex@mackkirk.com>",
                "to": "notes@mackkirk.com",
                "subject": "Re: MK-00497 materials",
                "body": "<p>Hello from Outlook</p>",
                "message_id": "AAMkAGI-test",
                "attachments": [
                    {
                        "filename": "a.pdf",
                        "content_type": "application/pdf",
                        "content_base64": base64.b64encode(b"%PDF").decode("ascii"),
                    }
                ],
            }
        )
        self.assertEqual(parsed.from_email, "alex@mackkirk.com")
        self.assertEqual(parsed.envelope_to, ["notes@mackkirk.com"])
        self.assertIn("Hello", parsed.html_body)
        self.assertEqual(parsed.message_id, "AAMkAGI-test")
        self.assertEqual(len(parsed.attachments), 1)
        self.assertEqual(parsed.attachments[0].content, b"%PDF")


class TestProcessInboundNotes(unittest.TestCase):
    def _parsed(self, **kwargs) -> ParsedInboundEmail:
        base = dict(
            from_raw="Alex <alex@mackkirk.com>",
            from_email="alex@mackkirk.com",
            from_name="Alex",
            to_raw="notes@mackkirk.com",
            cc_raw="",
            subject="Re: MK-00497 confirmation",
            text_body="Looks good",
            html_body="",
            message_id="mid-1",
            envelope_to=["notes@mackkirk.com"],
            attachments=[],
        )
        base.update(kwargs)
        return ParsedInboundEmail(**base)

    @patch("app.services.inbound_email.notes_recipient_addresses", return_value={"notes@mackkirk.com"})
    @patch("app.services.inbound_email.allowed_sender_domains", return_value={"mackkirk.com", "mackkirkroofing.com"})
    def test_discard_bad_domain(self, _d, _n):
        db = MagicMock()
        result = process_inbound_email(
            db,
            self._parsed(from_email="outsider@gmail.com", from_raw="x <outsider@gmail.com>"),
        )
        self.assertEqual(result.status, "discarded_bad_domain")
        db.add.assert_not_called()

    @patch("app.services.inbound_email.notes_recipient_addresses", return_value={"notes@mackkirk.com"})
    @patch("app.services.inbound_email.allowed_sender_domains", return_value={"mackkirk.com"})
    def test_discard_no_code(self, _d, _n):
        db = MagicMock()
        result = process_inbound_email(db, self._parsed(subject="Hello", text_body="no code"))
        self.assertEqual(result.status, "discarded_no_code")

    @patch("app.services.inbound_email.notes_recipient_addresses", return_value={"notes@mackkirk.com"})
    @patch("app.services.inbound_email.allowed_sender_domains", return_value={"mackkirk.com"})
    @patch("app.services.inbound_email.find_projects_by_mk_code", return_value=[])
    def test_discard_project_not_found(self, _find, _d, _n):
        db = MagicMock()
        result = process_inbound_email(db, self._parsed())
        self.assertEqual(result.status, "discarded_project_not_found")
        self.assertEqual(result.mk_code, "MK-00497")

    @patch("app.services.inbound_email.notes_recipient_addresses", return_value={"notes@mackkirk.com"})
    @patch("app.services.inbound_email.allowed_sender_domains", return_value={"mackkirk.com"})
    def test_discard_ambiguous(self, _d, _n):
        db = MagicMock()
        p1 = SimpleNamespace(id="p1", code="MK-00497/00001-2026")
        p2 = SimpleNamespace(id="p2", code="MK-00497/00002-2026")
        with patch("app.services.inbound_email.find_projects_by_mk_code", return_value=[p1, p2]):
            result = process_inbound_email(db, self._parsed())
        self.assertEqual(result.status, "discarded_ambiguous_code")

    @patch("app.services.inbound_email.notes_recipient_addresses", return_value={"other@mackkirk.com"})
    def test_ignored_unrouted(self, _n):
        db = MagicMock()
        result = process_inbound_email(db, self._parsed())
        self.assertEqual(result.status, "ignored_unrouted")

    @patch("app.services.inbound_email.notes_recipient_addresses", return_value={"notes@mackkirk.com"})
    @patch("app.services.inbound_email.allowed_sender_domains", return_value={"mackkirk.com"})
    @patch("app.services.inbound_email.find_user_by_email", return_value=None)
    @patch("app.services.inbound_email._already_processed", return_value=None)
    def test_creates_note(self, _dup, _user, _d, _n):
        import uuid

        project = SimpleNamespace(id=uuid.uuid4(), code="MK-00497/00001-2026")
        db = MagicMock()

        def _refresh(row):
            if getattr(row, "id", None) is None:
                row.id = uuid.uuid4()

        db.refresh.side_effect = _refresh

        with patch("app.services.inbound_email.find_projects_by_mk_code", return_value=[project]):
            result = process_inbound_email(db, self._parsed())

        self.assertEqual(result.status, "created")
        self.assertEqual(result.mk_code, "MK-00497")
        self.assertEqual(result.project_code, "MK-00497/00001-2026")
        self.assertTrue(db.add.called)
        self.assertTrue(db.commit.called)
        from app.models.models import ProjectReport

        added = next(c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], ProjectReport))
        self.assertEqual(added.category_id, "client-communication-log")
        self.assertIn("MK-00497", added.title)
        self.assertIn("Looks good", added.description)
        self.assertIn("──────── Email ────────", added.description)
        self.assertEqual(added.images["inbound_email"]["message_id"], "mid-1")

    def test_build_note_description_format(self):
        from app.services.inbound_email import build_note_description

        text = build_note_description(
            from_email="alex@mackkirk.com",
            from_name="Alex",
            subject="Re: MK-00497",
            body="Hello\n\n\n\nWorld\n-----Original Message-----\nOld",
        )
        self.assertIn("──────── Email ────────", text)
        self.assertIn("From: Alex <alex@mackkirk.com>", text)
        self.assertIn("Subject: Re: MK-00497", text)
        self.assertIn("───────────────────────", text)
        self.assertIn("Original message", text)
        self.assertNotIn("\n\n\n\n", text)


class TestFindProjectsByMkCodeFilter(unittest.TestCase):
    def test_prefix_does_not_match_longer_seq(self):
        from app.services.inbound_email import find_projects_by_mk_code

        db = MagicMock()
        q = MagicMock()
        db.query.return_value = q
        q.filter.return_value = q
        q.all.return_value = [
            SimpleNamespace(code="MK-00497/00001-2026"),
            SimpleNamespace(code="MK-004970/00001-2026"),
            SimpleNamespace(code="MK-00498/00001-2026"),
        ]
        rows = find_projects_by_mk_code(db, "MK-00497")
        codes = [r.code for r in rows]
        self.assertEqual(codes, ["MK-00497/00001-2026"])


if __name__ == "__main__":
    unittest.main()
