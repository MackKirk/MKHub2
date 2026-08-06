"""Tests for invite-driven onboarding document filtering."""
import unittest
import uuid
from unittest.mock import MagicMock

from app.services.onboarding_assign import (
    normalize_invite_document_ids,
    resolve_onboarding_document_filter,
)


class _FakeProfile:
    def __init__(self, onboarding_document_ids):
        self.onboarding_document_ids = onboarding_document_ids


class TestResolveOnboardingDocumentFilter(unittest.TestCase):
    def test_none_means_no_filter(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = _FakeProfile(None)
        subject_id = uuid.uuid4()
        self.assertIsNone(resolve_onboarding_document_filter(db, subject_id))

    def test_missing_profile_means_no_filter(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        subject_id = uuid.uuid4()
        self.assertIsNone(resolve_onboarding_document_filter(db, subject_id))

    def test_list_returns_allowed_ids(self):
        id1 = str(uuid.uuid4())
        id2 = str(uuid.uuid4())
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = _FakeProfile([id1, id2])
        subject_id = uuid.uuid4()
        result = resolve_onboarding_document_filter(db, subject_id)
        self.assertEqual(result, {id1, id2})


class TestNormalizeInviteDocumentIds(unittest.TestCase):
    def test_empty_returns_none(self):
        db = MagicMock()
        self.assertIsNone(normalize_invite_document_ids(db, None))
        self.assertIsNone(normalize_invite_document_ids(db, []))

    def test_invalid_ids_raise(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = []
        with self.assertRaises(ValueError):
            normalize_invite_document_ids(db, [str(uuid.uuid4())])

    def test_valid_ids_returned(self):
        doc_id = uuid.uuid4()
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [(doc_id,)]
        result = normalize_invite_document_ids(db, [str(doc_id)])
        self.assertEqual(result, [str(doc_id)])


if __name__ == "__main__":
    unittest.main()
