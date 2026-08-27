"""Scoped UserDocument title generation and deduplication."""
import sys
import types
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

if "jwt" not in sys.modules:
    jwt_module = types.ModuleType("jwt")
    jwt_module.encode = lambda *args, **kwargs: "token"
    jwt_module.decode = lambda *args, **kwargs: {}
    sys.modules["jwt"] = jwt_module

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


class TestDocumentTitle(unittest.TestCase):
    def _mock_db_chain(self, result):
        q = MagicMock()
        q.filter.return_value = q
        q.first.return_value = result
        q.all.return_value = [(result.title,)] if result and hasattr(result, "title") else []
        return q

    def test_build_scoped_title_project_preset(self):
        from app.services.document_title import build_scoped_document_title

        pid = uuid.uuid4()
        dtype_id = uuid.uuid4()
        db = MagicMock()
        db.query.side_effect = [
            self._mock_db_chain(SimpleNamespace(name="Roof Review Report #1")),
            self._mock_db_chain(SimpleNamespace(name="Leak Test")),
        ]
        title = build_scoped_document_title(
            db,
            document_type_id=dtype_id,
            pages=[],
            project_id=pid,
            subject_user_id=None,
        )
        self.assertEqual(title, "Roof Review Report #1 - Leak Test")

    def test_build_scoped_title_user_background(self):
        from app.services.document_title import build_scoped_document_title

        sid = uuid.uuid4()
        tid = uuid.uuid4()
        db = MagicMock()
        db.query.side_effect = [
            self._mock_db_chain(SimpleNamespace(name="Cladding Template")),
            self._mock_db_chain(None),
        ]
        with unittest.mock.patch(
            "app.services.document_title.get_user_display",
            return_value="Fernando Junior",
        ):
            title = build_scoped_document_title(
                db,
                document_type_id=None,
                pages=[{"template_id": str(tid), "elements": []}],
                project_id=None,
                subject_user_id=sid,
            )
        self.assertEqual(title, "Cladding Template - Fernando Junior")

    def test_build_scoped_title_standalone_preset(self):
        from app.services.document_title import build_scoped_document_title

        dtype_id = uuid.uuid4()
        db = MagicMock()
        db.query.return_value = self._mock_db_chain(SimpleNamespace(name="Cladding Contract"))

        title = build_scoped_document_title(
            db,
            document_type_id=dtype_id,
            pages=[],
            project_id=None,
            subject_user_id=None,
        )
        self.assertEqual(title, "Cladding Contract")

    def test_build_scoped_title_blank(self):
        from app.services.document_title import build_scoped_document_title, UNTITLED_TEMPLATE

        pid = uuid.uuid4()
        db = MagicMock()
        db.query.return_value = self._mock_db_chain(SimpleNamespace(name="Leak Test"))
        title = build_scoped_document_title(
            db,
            document_type_id=None,
            pages=[{"template_id": None, "elements": []}],
            project_id=pid,
            subject_user_id=None,
        )
        self.assertEqual(title, f"{UNTITLED_TEMPLATE} - Leak Test")

    def test_unique_title_appends_suffix(self):
        from app.services.document_title import unique_title_in_scope

        pid = uuid.uuid4()
        db = MagicMock()
        q = MagicMock()
        q.filter.return_value = q
        q.all.return_value = [
            ("Roof Review Report #1 - Leak Test",),
            ("Roof Review Report #1 - Leak Test (1)",),
        ]
        db.query.return_value = q

        title = unique_title_in_scope(
            db,
            "Roof Review Report #1 - Leak Test",
            project_id=pid,
            subject_user_id=None,
        )
        self.assertEqual(title, "Roof Review Report #1 - Leak Test (2)")

    def test_title_taken_in_scope(self):
        from app.services.document_title import title_taken_in_scope

        pid = uuid.uuid4()
        db = MagicMock()
        q = MagicMock()
        q.filter.return_value = q
        q.all.return_value = [("Existing Doc",)]
        db.query.return_value = q

        self.assertTrue(
            title_taken_in_scope(
                db,
                "Existing Doc",
                project_id=pid,
                subject_user_id=None,
            )
        )
        self.assertFalse(
            title_taken_in_scope(
                db,
                "New Doc",
                project_id=pid,
                subject_user_id=None,
            )
        )


if __name__ == "__main__":
    unittest.main()
