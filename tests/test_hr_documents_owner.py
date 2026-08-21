"""HR Documents folder owner for completed Document Builder envelopes."""
import unittest
import uuid
from types import SimpleNamespace


class TestHrDocumentsOwnerUserId(unittest.TestCase):
    def test_prefers_fills_employee_tokens_role(self):
        from app.services.document_signer_roles import hr_documents_owner_user_id

        emp_role = str(uuid.uuid4())
        other_role = str(uuid.uuid4())
        emp_uid = uuid.uuid4()
        other_uid = uuid.uuid4()
        parts = [
            SimpleNamespace(role=other_role, role_label="Other", signer_user_id=other_uid, sort_order=0),
            SimpleNamespace(role=emp_role, role_label="Staff", signer_user_id=emp_uid, sort_order=1),
        ]
        catalog = [
            {"id": other_role, "label": "Other", "sortOrder": 0, "fillsEmployeeTokens": False},
            {"id": emp_role, "label": "Staff", "sortOrder": 1, "fillsEmployeeTokens": True},
        ]
        self.assertEqual(hr_documents_owner_user_id(parts, catalog), emp_uid)

    def test_prefers_employee_label(self):
        from app.services.document_signer_roles import hr_documents_owner_user_id

        a, b = str(uuid.uuid4()), str(uuid.uuid4())
        emp_uid = uuid.uuid4()
        company_uid = uuid.uuid4()
        parts = [
            SimpleNamespace(role=a, role_label="Company", signer_user_id=company_uid, sort_order=0),
            SimpleNamespace(role=b, role_label="Employee", signer_user_id=emp_uid, sort_order=1),
        ]
        self.assertEqual(hr_documents_owner_user_id(parts, None), emp_uid)

    def test_employee_label_case_insensitive(self):
        from app.services.document_signer_roles import hr_documents_owner_user_id

        rid = str(uuid.uuid4())
        uid = uuid.uuid4()
        parts = [
            SimpleNamespace(role=rid, role_label="  employee  ", signer_user_id=uid, sort_order=0),
        ]
        self.assertEqual(hr_documents_owner_user_id(parts), uid)

    def test_fallback_first_sort_order(self):
        from app.services.document_signer_roles import hr_documents_owner_user_id

        a, b = str(uuid.uuid4()), str(uuid.uuid4())
        first_uid = uuid.uuid4()
        second_uid = uuid.uuid4()
        parts = [
            SimpleNamespace(role=b, role_label="Other2", signer_user_id=second_uid, sort_order=2),
            SimpleNamespace(role=a, role_label="Other", signer_user_id=first_uid, sort_order=0),
        ]
        self.assertEqual(hr_documents_owner_user_id(parts, []), first_uid)

    def test_empty_participants(self):
        from app.services.document_signer_roles import hr_documents_owner_user_id

        self.assertIsNone(hr_documents_owner_user_id([]))


if __name__ == "__main__":
    unittest.main()
