"""Subject-user Document Builder — scoping, autofill, and access."""
import sys
import types
import unittest
import uuid
from datetime import date
from types import SimpleNamespace
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


class TestSubjectUserDocumentTokens(unittest.TestCase):
    def test_project_token_values_fills_employee_from_subject(self):
        from app.routes.document_creator import _project_token_values

        subject_id = uuid.uuid4()
        ep = SimpleNamespace(
            first_name="Ada",
            last_name="Lovelace",
            preferred_name=None,
            address_line1="1 Analytical Engine Rd",
            address_line2=None,
            city="London",
            province="ON",
            postal_code="A1A 1A1",
            pay_rate="50",
            hire_date=date(2020, 1, 15),
        )
        user = SimpleNamespace(username="ada")
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = ep
        db.get.return_value = user

        values = _project_token_values(None, db, employee_user_id=subject_id)
        self.assertEqual(values["employee_name"], "Ada Lovelace")
        self.assertIn("Analytical Engine", values["employee_address"])
        self.assertEqual(values["employee_wage"], "$50")
        self.assertTrue(values["employee_hiring_date"])
        self.assertEqual(values["project_name"], "")
        self.assertTrue(values["auto_date"])

    def test_pages_with_subject_fills_employee_token(self):
        from app.routes.document_creator import _pages_with_project_tokens

        subject_id = uuid.uuid4()
        pages = [
            {
                "elements": [
                    {"type": "text", "content": "Name: <Employee Name>", "richLines": None},
                ]
            }
        ]
        with patch(
            "app.routes.document_creator._project_token_values",
            return_value={
                "project_name": "",
                "project_address": "",
                "customer_name": "",
                "customer_address": "",
                "reference_code": "",
                "auto_date": "August 24, 2026",
                "employee_name": "Ada Lovelace",
                "employee_address": "",
                "employee_wage": "",
                "employee_hiring_date": "",
            },
        ):
            out = _pages_with_project_tokens(pages, None, MagicMock(), employee_user_id=subject_id)
        self.assertEqual(out[0]["elements"][0]["content"], "Name: Ada Lovelace")


class TestSubjectUserDocumentAccess(unittest.TestCase):
    def test_can_access_subject_doc_with_hr_view(self):
        from app.routes.document_creator import _can_access_document

        user = MagicMock()
        user.id = uuid.uuid4()
        doc = MagicMock()
        doc.created_by = uuid.uuid4()
        doc.project_id = None
        doc.subject_user_id = uuid.uuid4()

        with patch("app.routes.document_creator._user_is_admin", return_value=False):
            with patch("app.routes.document_creator._can_view_subject_user_docs", return_value=True):
                self.assertTrue(_can_access_document(user, doc, MagicMock(), require_write=False))
            with patch("app.routes.document_creator._can_view_subject_user_docs", return_value=False):
                self.assertFalse(_can_access_document(user, doc, MagicMock(), require_write=False))

    def test_can_edit_subject_doc_requires_hr_edit(self):
        from app.routes.document_creator import _can_access_document

        user = MagicMock()
        user.id = uuid.uuid4()
        doc = MagicMock()
        doc.created_by = uuid.uuid4()
        doc.project_id = None
        doc.subject_user_id = uuid.uuid4()

        with patch("app.routes.document_creator._user_is_admin", return_value=False):
            with patch("app.routes.document_creator._can_edit_subject_user_docs", return_value=True):
                self.assertTrue(_can_access_document(user, doc, MagicMock(), require_write=True))
            with patch("app.routes.document_creator._can_edit_subject_user_docs", return_value=False):
                self.assertFalse(_can_access_document(user, doc, MagicMock(), require_write=True))


class TestSubjectUserDocumentCreate(unittest.TestCase):
    def test_rejects_both_project_and_subject(self):
        from app.routes.document_creator import DocumentCreate, create_document

        body = DocumentCreate(
            title="Test",
            project_id=str(uuid.uuid4()),
            subject_user_id=str(uuid.uuid4()),
            pages=[],
        )
        with self.assertRaises(HTTPException) as ctx:
            create_document(body, db=MagicMock(), user=MagicMock())
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("mutually exclusive", str(ctx.exception.detail).lower())

    def test_create_stores_subject_user_id_and_fills_tokens(self):
        from app.routes.document_creator import DocumentCreate, create_document

        subject_id = uuid.uuid4()
        creator_id = uuid.uuid4()
        user = MagicMock()
        user.id = creator_id

        db = MagicMock()
        subject = MagicMock()
        db.get.return_value = subject

        created_doc = MagicMock()
        created_doc.id = uuid.uuid4()
        created_doc.title = "Offer letter"
        created_doc.document_type_id = None
        created_doc.project_id = None
        created_doc.subject_user_id = subject_id
        created_doc.pages = []
        created_doc.signer_roles = []
        created_doc.created_by = creator_id
        created_doc.created_at = None
        created_doc.updated_at = None
        created_doc.edit_lock_user_id = None
        created_doc.edit_lock_session_id = None
        created_doc.edit_lock_expires_at = None

        body = DocumentCreate(
            title="Offer letter",
            subject_user_id=str(subject_id),
            pages=[
                {
                    "elements": [
                        {"type": "text", "content": "Hi <Employee Name>", "richLines": None},
                    ]
                }
            ],
        )

        with patch("app.routes.document_creator._can_edit_subject_user_docs", return_value=True):
            with patch(
                "app.routes.document_creator._project_token_values",
                return_value={
                    "project_name": "",
                    "project_address": "",
                    "customer_name": "",
                    "customer_address": "",
                    "reference_code": "",
                    "auto_date": "August 24, 2026",
                    "employee_name": "Ada Lovelace",
                    "employee_address": "",
                    "employee_wage": "",
                    "employee_hiring_date": "",
                },
            ):
                with patch(
                    "app.routes.document_creator._doc_to_out",
                    return_value={"id": str(created_doc.id), "subject_user_id": str(subject_id)},
                ):
                    out = create_document(body, db=db, user=user)

        self.assertEqual(out["subject_user_id"], str(subject_id))
        db.add.assert_called_once()
        added = db.add.call_args[0][0]
        self.assertEqual(added.subject_user_id, subject_id)
        self.assertIsNone(added.project_id)
        self.assertEqual(added.pages[0]["elements"][0]["content"], "Hi Ada Lovelace")

    def test_create_forbidden_without_hr_edit(self):
        from app.routes.document_creator import DocumentCreate, create_document

        body = DocumentCreate(
            title="Offer",
            subject_user_id=str(uuid.uuid4()),
            pages=[],
        )
        with patch("app.routes.document_creator._can_edit_subject_user_docs", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                create_document(body, db=MagicMock(), user=MagicMock())
        self.assertEqual(ctx.exception.status_code, 403)


class TestSubjectUserDocumentList(unittest.TestCase):
    def test_list_requires_view_permission(self):
        from app.routes.document_creator import list_documents

        with patch("app.routes.document_creator._can_view_subject_user_docs", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                list_documents(
                    project_id=None,
                    subject_user_id=str(uuid.uuid4()),
                    db=MagicMock(),
                    user=MagicMock(),
                )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_list_rejects_both_filters(self):
        from app.routes.document_creator import list_documents

        with self.assertRaises(HTTPException) as ctx:
            list_documents(
                project_id=str(uuid.uuid4()),
                subject_user_id=str(uuid.uuid4()),
                db=MagicMock(),
                user=MagicMock(),
            )
        self.assertEqual(ctx.exception.status_code, 400)

    def test_summary_includes_subject_user_id(self):
        from app.routes.document_creator import _doc_to_summary

        sid = uuid.uuid4()
        doc = MagicMock()
        doc.id = uuid.uuid4()
        doc.title = "Doc"
        doc.document_type_id = None
        doc.project_id = None
        doc.subject_user_id = sid
        doc.pages = []
        doc.created_by = uuid.uuid4()
        doc.created_at = None
        doc.updated_at = None
        summary = _doc_to_summary(doc)
        self.assertEqual(summary["subject_user_id"], str(sid))


class TestLinkStandaloneDocToEmployeeSubject(unittest.TestCase):
    def test_sets_subject_user_id_when_no_project(self):
        from app.routes.document_signature_requests import link_standalone_doc_to_employee_subject

        emp = uuid.uuid4()
        doc = MagicMock()
        doc.project_id = None
        doc.subject_user_id = None
        self.assertTrue(link_standalone_doc_to_employee_subject(doc, emp))
        self.assertEqual(doc.subject_user_id, emp)

    def test_skips_project_scoped_docs(self):
        from app.routes.document_signature_requests import link_standalone_doc_to_employee_subject

        emp = uuid.uuid4()
        doc = MagicMock()
        doc.project_id = uuid.uuid4()
        doc.subject_user_id = None
        self.assertFalse(link_standalone_doc_to_employee_subject(doc, emp))
        self.assertIsNone(doc.subject_user_id)

    def test_skips_when_no_employee(self):
        from app.routes.document_signature_requests import link_standalone_doc_to_employee_subject

        doc = MagicMock()
        doc.project_id = None
        doc.subject_user_id = None
        self.assertFalse(link_standalone_doc_to_employee_subject(doc, None))


if __name__ == "__main__":
    unittest.main()

