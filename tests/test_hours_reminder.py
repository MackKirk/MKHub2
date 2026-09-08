"""Hours reminder copy, including the Blair easter egg."""
import unittest

from app.services.hours_reminder import BLAIR_TITLE, BODY, TITLE, hours_reminder_copy


class TestHoursReminderCopy(unittest.TestCase):
    def test_default_copy(self):
        self.assertEqual(hours_reminder_copy("otheruser"), (TITLE, BODY))

    def test_blair_joke(self):
        self.assertEqual(hours_reminder_copy("bbennett"), (BLAIR_TITLE, BODY))
        self.assertEqual(hours_reminder_copy("BBennett"), (BLAIR_TITLE, BODY))
