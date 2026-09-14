"""Sage export display / queue helpers."""
import unittest
import uuid
from types import SimpleNamespace

from app.services.sage_export import (
    is_sage_eligible,
    refresh_sage_export_state,
    sage_display_state,
    sage_source_key_for,
)


def _att(**kwargs):
    base = dict(
        id=uuid.uuid4(),
        status="approved",
        entry_kind="hours_only",
        declared_hours=8,
        clock_in_time="2026-09-10T00:00:00+00:00",
        clock_out_time=None,
        sage_state="none",
        sage_source_key=None,
        sage_error=None,
        sage_urgent=False,
        sage_rec_id=None,
        reason_text="JOB_TYPE:0|HOURS_WORKED:8",
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


class TestSageExport(unittest.TestCase):
    def test_eligible_hours_only_displays_queued_without_persist(self):
        att = _att()
        self.assertTrue(is_sage_eligible(att))
        self.assertEqual(sage_display_state(att), "queued")
        self.assertEqual(att.sage_state, "none")

    def test_hours_marker_still_queues_when_entry_kind_is_clock(self):
        att = _att(
            entry_kind="clock",
            declared_hours=None,
            clock_in_time="2026-09-10T00:00:00+00:00",
            clock_out_time=None,
            reason_text="JOB_TYPE:0|HOURS_WORKED:8",
        )
        self.assertTrue(is_sage_eligible(att))
        self.assertEqual(sage_display_state(att), "queued")

    def test_open_clock_is_not_queued(self):
        att = _att(
            entry_kind="clock",
            declared_hours=None,
            clock_in_time="2026-09-10T14:00:00+00:00",
            clock_out_time=None,
            reason_text="JOB_TYPE:0",
        )
        self.assertFalse(is_sage_eligible(att))
        self.assertEqual(sage_display_state(att), "none")

    def test_pending_is_not_queued(self):
        att = _att(status="pending")
        self.assertEqual(sage_display_state(att), "none")

    def test_refresh_persists_queued_and_source_key(self):
        att = _att()
        refresh_sage_export_state(att)
        self.assertEqual(att.sage_state, "queued")
        self.assertTrue(att.sage_source_key.startswith("MKH"))
        self.assertLessEqual(len(att.sage_source_key), 20)

    def test_paid_is_never_requeued(self):
        att = _att(sage_state="paid")
        refresh_sage_export_state(att, hours_changed=True)
        self.assertEqual(att.sage_state, "paid")
        self.assertEqual(sage_display_state(att), "paid")

    def test_sent_hours_change_requeues_urgent(self):
        att = _att(sage_state="sent")
        refresh_sage_export_state(att, hours_changed=True)
        self.assertEqual(att.sage_state, "queued")
        self.assertTrue(att.sage_urgent)

    def test_source_key_length(self):
        att = _att(id=uuid.UUID("12345678-1234-1234-1234-123456789abc"))
        key = sage_source_key_for(att)
        self.assertEqual(len(key), 20)
        self.assertTrue(key.startswith("MKH"))


if __name__ == "__main__":
    unittest.main()
