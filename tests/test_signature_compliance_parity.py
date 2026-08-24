"""Parity: onboarding compliance slice vs legacy /auth/me/onboarding/status logic."""
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from app.services.signature_compliance import get_onboarding_compliance_slice


def _legacy_status(items):
    """Mirror of me_onboarding_status in onboarding.py (must stay in sync for parity)."""
    now = datetime.now(timezone.utc)
    pending_required = [i for i in items if i.status == "pending" and i.required]
    has_pending = len(pending_required) > 0
    past_deadline = False
    earliest = None
    for i in pending_required:
        d = i.deadline_at
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        if d < now:
            past_deadline = True
        if earliest is None or d < earliest:
            earliest = d
    return {
        "has_pending": has_pending,
        "past_deadline": past_deadline and has_pending,
        "pending_count": len(pending_required),
        "earliest_deadline": earliest.isoformat() if earliest else None,
    }


def _item(*, status="pending", required=True, deadline_at=None, optional=False):
    it = MagicMock()
    it.status = status
    it.required = required if not optional else False
    it.deadline_at = deadline_at
    return it


class TestOnboardingComplianceParity(unittest.TestCase):
    def _assert_parity(self, items):
        db = MagicMock()
        uid = uuid.uuid4()
        with patch("app.services.signature_compliance.promote_scheduled_assignment_items"), patch(
            "app.services.signature_compliance._onboarding_my_items", return_value=items
        ):
            slice_out = get_onboarding_compliance_slice(db, uid)
        legacy = _legacy_status(items)
        self.assertEqual(slice_out["has_pending"], legacy["has_pending"])
        self.assertEqual(slice_out["past_deadline"], legacy["past_deadline"])
        self.assertEqual(slice_out["pending_count"], legacy["pending_count"])
        self.assertEqual(slice_out["earliest_deadline"], legacy["earliest_deadline"])

    def test_empty(self):
        self._assert_parity([])

    def test_future_deadline(self):
        future = datetime.now(timezone.utc) + timedelta(days=5)
        self._assert_parity([_item(deadline_at=future)])

    def test_past_deadline_required(self):
        past = datetime.now(timezone.utc) - timedelta(days=2)
        self._assert_parity([_item(deadline_at=past)])

    def test_optional_pending_not_counted(self):
        future = datetime.now(timezone.utc) + timedelta(days=3)
        self._assert_parity([_item(deadline_at=future, optional=True)])

    def test_signed_not_pending(self):
        past = datetime.now(timezone.utc) - timedelta(days=2)
        self._assert_parity([_item(status="signed", deadline_at=past)])

    def test_mixed_required_and_signed(self):
        now = datetime.now(timezone.utc)
        items = [
            _item(status="signed", deadline_at=now - timedelta(days=10)),
            _item(deadline_at=now + timedelta(days=3)),
            _item(deadline_at=now - timedelta(days=1)),
        ]
        self._assert_parity(items)


if __name__ == "__main__":
    unittest.main()
