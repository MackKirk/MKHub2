"""Create document with document_type_id and a client-provided pages subset."""
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


class TestDocumentCreatorPartialPages(unittest.TestCase):
    def test_create_with_document_type_and_pages_subset(self):
        from app.routes.document_creator import DocumentCreate, create_document

        dtype_id = uuid.uuid4()
        creator_id = uuid.uuid4()
        user = MagicMock()
        user.id = creator_id

        doc_type = MagicMock()
        doc_type.id = dtype_id
        doc_type.page_templates = [
            {"template_id": str(uuid.uuid4()), "label": "Page 1"},
            {"template_id": str(uuid.uuid4()), "label": "Page 2"},
            {"template_id": str(uuid.uuid4()), "label": "Page 3"},
            {"template_id": str(uuid.uuid4()), "label": "Page 4"},
            {"template_id": str(uuid.uuid4()), "label": "Page 5"},
        ]
        doc_type.signer_roles = [{"role": "employee", "label": "Employee"}]

        subset_pages = [
            {"template_id": str(uuid.uuid4()), "elements": [{"type": "text", "content": "A"}]},
            {"template_id": str(uuid.uuid4()), "elements": [{"type": "text", "content": "B"}]},
        ]

        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = doc_type

        body = DocumentCreate(
            document_type_id=str(dtype_id),
            pages=subset_pages,
        )

        with patch("app.routes.document_creator._project_token_values", return_value={}):
            with patch(
                "app.routes.document_creator._substitute_project_tokens",
                side_effect=lambda elements, _values: None,
            ):
                with patch(
                    "app.services.document_signer_roles.ensure_document_signer_roles",
                    return_value=[{"role": "employee", "label": "Employee"}],
                ) as ensure_roles:
                    with patch(
                        "app.routes.document_creator._doc_to_out",
                        return_value={"id": str(uuid.uuid4()), "page_count": 2},
                    ):
                        create_document(body, db=db, user=user)

        db.add.assert_called_once()
        added = db.add.call_args[0][0]
        self.assertEqual(added.document_type_id, dtype_id)
        self.assertEqual(len(added.pages), 2)
        self.assertEqual(added.pages[0]["elements"][0]["content"], "A")
        self.assertEqual(added.pages[1]["elements"][0]["content"], "B")
        ensure_roles.assert_called_once()
        self.assertEqual(ensure_roles.call_args[0][0], doc_type.signer_roles)

    def test_create_with_document_type_only_expands_all_pages(self):
        from app.routes.document_creator import DocumentCreate, create_document

        dtype_id = uuid.uuid4()
        template_id = uuid.uuid4()
        user = MagicMock()
        user.id = uuid.uuid4()

        doc_type = MagicMock()
        doc_type.id = dtype_id
        doc_type.page_templates = [
            {"template_id": str(template_id), "elements": [], "margins": None},
            {"template_id": None, "elements": [], "margins": None},
        ]
        doc_type.signer_roles = None

        template = MagicMock()
        template.id = template_id

        db = MagicMock()

        def query_side_effect(model):
            q = MagicMock()
            if model.__name__ == "DocumentType":
                q.filter.return_value.first.return_value = doc_type
            elif model.__name__ == "DocumentTemplate":
                q.filter.return_value.first.return_value = template
            return q

        db.query.side_effect = query_side_effect

        body = DocumentCreate(document_type_id=str(dtype_id))

        with patch("app.routes.document_creator._project_token_values", return_value={}):
            with patch(
                "app.routes.document_creator._substitute_project_tokens",
                side_effect=lambda elements, _values: None,
            ):
                with patch(
                    "app.routes.document_creator._doc_to_out",
                    return_value={"id": str(uuid.uuid4())},
                ):
                    create_document(body, db=db, user=user)

        added = db.add.call_args[0][0]
        self.assertEqual(len(added.pages), 2)
        self.assertEqual(added.pages[0]["template_id"], str(template_id))
