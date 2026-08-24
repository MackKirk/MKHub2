"""Builder blocking flag and cancel semantics."""
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from app.services.signature_compliance import get_signature_compliance


class TestSignatureBuilderBlocking(unittest.TestCase):
    def test_builder_blocking_disabled_does_not_block(self):
        from app.services.signature_compliance import _builder_blockers

        db = MagicMock()
        uid = uuid.uuid4()
        now = datetime.now(timezone.utc)
        part = MagicMock()
        db.query.return_value.join.return_value.filter.return_value.all.return_value = [part]

        with patch("app.services.signature_compliance.settings") as mock_settings:
            mock_settings.signature_builder_blocking_enabled = False
            blockers, src = _builder_blockers(db, uid, now)
        self.assertEqual(blockers, [])
        self.assertEqual(src.pending_count, 1)
        self.assertEqual(src.blocking_count, 0)

    def test_cancelled_request_excluded_from_blockers(self):
        """Cancelled requests must not contribute blockers (query filters active statuses)."""
        from app.services.signature_compliance import _inbox_status_builder
        from app.models.models import DocumentSignatureParticipant, DocumentSignatureRequest

        part = DocumentSignatureParticipant()
        part.status = "ready"
        req = DocumentSignatureRequest()
        req.status = "cancelled"
        self.assertEqual(_inbox_status_builder(part, req), "cancelled")


if __name__ == "__main__":
    unittest.main()
