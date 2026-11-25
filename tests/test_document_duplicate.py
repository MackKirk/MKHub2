"""Duplicate UserDocument: deep copy with new element ids and unique title."""
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


class TestDocumentDuplicate(unittest.TestCase):
    def test_duplicate_copies_pages_with_new_element_ids(self):
        from app.routes.document_creator import duplicate_document

        src_id = uuid.uuid4()
        user = MagicMock()
        user.id = uuid.uuid4()

        src = MagicMock()
        src.id = src_id
        src.title = "Leak Test"
        src.document_type_id = None
        src.project_id = uuid.uuid4()
        src.subject_user_id = None
        src.signer_roles = [{"id": "signer-1", "label": "Client"}]
        src.pages = [
            {
                "template_id": str(uuid.uuid4()),
                "margins": {"left_pct": 5},
                "elements": [
                    {"id": "el-old-1", "type": "text", "content": "Hello", "x_pct": 10, "y_pct": 20},
                ],
            }
        ]

        db = MagicMock()

        def query_side_effect(model):
            q = MagicMock()
            name = getattr(model, "__name__", str(model))
            if name == "UserDocument":
                q.filter.return_value.first.return_value = src
                # unique_title_in_scope queries titles
                q.filter.return_value.all.return_value = [("Leak Test",)]
            return q

        db.query.side_effect = query_side_effect

        created = {}

        def add_side_effect(obj):
            created["doc"] = obj
            obj.id = uuid.uuid4()
            obj.created_at = None
            obj.updated_at = None
            obj.edit_lock_user_id = None
            obj.edit_lock_session_id = None
            obj.edit_lock_expires_at = None

        db.add.side_effect = add_side_effect

        with patch("app.routes.document_creator._can_access_document", return_value=True):
            with patch("app.routes.document_creator._doc_to_out", side_effect=lambda d, _db=None: {"id": str(d.id), "title": d.title, "pages": d.pages}):
                out = duplicate_document(str(src_id), db=db, user=user)

        self.assertIn("doc", created)
        new_doc = created["doc"]
        self.assertEqual(new_doc.title, "Leak Test (copy)")
        self.assertEqual(new_doc.project_id, src.project_id)
        self.assertEqual(len(new_doc.pages), 1)
        new_el = new_doc.pages[0]["elements"][0]
        self.assertNotEqual(new_el["id"], "el-old-1")
        self.assertEqual(new_el["content"], "Hello")
        self.assertEqual(out["title"], "Leak Test (copy)")
        db.commit.assert_called()

    def test_duplicate_forbidden_without_access(self):
        from app.routes.document_creator import duplicate_document

        user = MagicMock()
        user.id = uuid.uuid4()
        src = MagicMock()
        src.id = uuid.uuid4()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = src

        with patch("app.routes.document_creator._can_access_document", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                duplicate_document(str(src.id), db=db, user=user)
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
