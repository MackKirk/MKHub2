"""Hours reminder copy, including the Blair easter egg."""
import unittest

from app.services.hours_reminder import (
    BLAIR_TITLE,
    BODY,
    TITLE,
    hours_reminder_copy,
    hours_reminder_payload,
)


class TestHoursReminderCopy(unittest.TestCase):
    def test_default_copy(self):
        self.assertEqual(hours_reminder_copy("otheruser"), (TITLE, BODY))

    def test_blair_joke(self):
        self.assertEqual(hours_reminder_copy("bbennett"), (BLAIR_TITLE, BODY))
        self.assertEqual(hours_reminder_copy("BBennett"), (BLAIR_TITLE, BODY))

    def test_web_payload_uses_real_copy(self):
        from datetime import date

        payload = hours_reminder_payload("crew", date(2026, 10, 13))
        self.assertEqual(payload["title"], TITLE)
        self.assertEqual(payload["message"], BODY)
        self.assertEqual(payload["type"], "hours_reminder")
        self.assertEqual(payload["link"], "/home?open=hours")
        self.assertFalse(payload["read"])
