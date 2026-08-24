"""Delete guard: UserDocument cannot be deleted when signature history exists."""
import sys
import types
import unittest
import uuid
from unittest.mock import MagicMock, patch

if "passlib.context" not in sys.modules:
    passlib_module = types.ModuleType("passlib")
    passlib_context_module = types.ModuleType("passlib.context")

    class _CryptContext:
        def __init__(self, *args, **kwargs):
            pass

        def hash(self, value):
            return f"hashed:{value}"

        def verify(self, plain, hashed):
            return hashed == f"hashed:{plain}"

    passlib_context_module.CryptContext = _CryptContext
    sys.modules["passlib"] = passlib_module
    sys.modules["passlib.context"] = passlib_context_module

from fastapi import HTTPException


class TestDocumentDeleteSignatureGuard(unittest.TestCase):
    def _mock_db(self, *, existing_request):
        doc = MagicMock()
        doc.id = uuid.uuid4()
        db = MagicMock()

        def query_side_effect(model):
            q = MagicMock()
            name = getattr(model, "__name__", str(model))
            if name == "UserDocument":
                q.filter.return_value.first.return_value = doc
            elif name == "DocumentSignatureRequest":
                q.filter.return_value.limit.return_value.first.return_value = existing_request
            return q

        db.query.side_effect = query_side_effect
        return db, doc

    def test_delete_blocked_when_signature_request_exists(self):
        from app.routes.document_creator import delete_document

        user = MagicMock()
        user.id = uuid.uuid4()
        db, doc = self._mock_db(existing_request=MagicMock())

        with patch("app.routes.document_creator._can_access_document", return_value=True):
            with self.assertRaises(HTTPException) as ctx:
                delete_document(str(doc.id), db=db, user=user)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("signature", str(ctx.exception.detail).lower())

    def test_delete_allowed_when_no_signature_requests(self):
        from app.routes.document_creator import delete_document

        user = MagicMock()
        user.id = uuid.uuid4()
        db, doc = self._mock_db(existing_request=None)

        with patch("app.routes.document_creator._can_access_document", return_value=True):
            delete_document(str(doc.id), db=db, user=user)
        db.delete.assert_called_once_with(doc)
        db.commit.assert_called()

    def test_delete_blocked_for_completed_request_history(self):
        from app.routes.document_creator import delete_document

        user = MagicMock()
        user.id = uuid.uuid4()
        existing = MagicMock()
        existing.status = "completed"
        db, doc = self._mock_db(existing_request=existing)

        with patch("app.routes.document_creator._can_access_document", return_value=True):
            with self.assertRaises(HTTPException) as ctx:
                delete_document(str(doc.id), db=db, user=user)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_delete_blocked_for_cancelled_request_history(self):
        from app.routes.document_creator import delete_document

        user = MagicMock()
        user.id = uuid.uuid4()
        existing = MagicMock()
        existing.status = "cancelled"
        db, doc = self._mock_db(existing_request=existing)

        with patch("app.routes.document_creator._can_access_document", return_value=True):
            with self.assertRaises(HTTPException) as ctx:
                delete_document(str(doc.id), db=db, user=user)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_delete_blocked_for_in_progress_request_history(self):
        from app.routes.document_creator import delete_document

        user = MagicMock()
        user.id = uuid.uuid4()
        existing = MagicMock()
        existing.status = "in_progress"
        db, doc = self._mock_db(existing_request=existing)

        with patch("app.routes.document_creator._can_access_document", return_value=True):
            with self.assertRaises(HTTPException) as ctx:
                delete_document(str(doc.id), db=db, user=user)
        self.assertEqual(ctx.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
