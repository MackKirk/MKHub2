"""Milestone selection for opportunity follow-up reminders."""
import unittest
from datetime import datetime, timezone

import pytz

from app.services.opportunity_alerts import (
    _days_since,
    prospecting_reminder_due,
    sent_reminder_copy,
    unsent_sent_milestones,
)


class TestOpportunityAlertMilestones(unittest.TestCase):
    def test_before_first_milestone(self):
        self.assertEqual(unsent_sent_milestones(29, set()), [])

    def test_first_milestone_only(self):
        self.assertEqual(unsent_sent_milestones(30, set()), [30])

    def test_catch_up_returns_every_due_key_so_only_the_latest_is_notified(self):
        due = unsent_sent_milestones(90, set())
        self.assertEqual(due, [30, 60, 90])
        self.assertEqual(max(due), 90)

    def test_already_sent_milestones_are_skipped(self):
        self.assertEqual(unsent_sent_milestones(90, {"sent_30", "sent_60"}), [90])

    def test_prospecting_is_a_single_threshold(self):
        self.assertFalse(prospecting_reminder_due(29, set()))
        self.assertTrue(prospecting_reminder_due(30, set()))
        self.assertFalse(prospecting_reminder_due(45, {"prospecting_30"}))

    def test_day_count_uses_vancouver(self):
        # 07:30 UTC on Mar 2 is still Mar 1 in Vancouver (PST, UTC-8).
        anchor = datetime(2026, 3, 2, 7, 30, tzinfo=timezone.utc)
        vancouver = pytz.timezone("America/Vancouver")
        today = vancouver.localize(datetime(2026, 4, 1, 12, 0)).date()
        self.assertEqual(_days_since(anchor, today), 31)

    def test_sent_copy_names_the_milestone(self):
        title, message = sent_reminder_copy("Roof bid", 60)
        self.assertEqual(title, "Bid pricing follow-up")
        self.assertIn("60 days", message)
        self.assertIn("price is no longer held", message)
