"""Invite Step 2: additional documents validation helpers and fire idempotency."""
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.schemas.auth import AdditionalDocumentRef, InviteRequest
from app.services.document_template_categories import is_employee_contract_category
from app.services.invite_additional_documents import (
    _build_hire_assignments,
    fire_invite_additional_documents,
    validate_invite_additional_documents,
)
from app.services.document_signer_roles import LEGACY_STABLE_IDS
from app.services.onboarding_assign import normalize_invite_document_ids
from fastapi import HTTPException


class TestAdditionalDocumentRef(unittest.TestCase):
    def test_document_type(self):
        a = AdditionalDocumentRef(source="document_type", id=str(uuid.uuid4()), name="A")
        self.assertEqual(a.source, "document_type")

    def test_onboarding_base(self):
        a = AdditionalDocumentRef(source="onboarding_base", id=str(uuid.uuid4()))
        self.assertEqual(a.source, "onboarding_base")

    def test_rejects_signature_template(self):
        with self.assertRaises(Exception):
            AdditionalDocumentRef(source="signature_template", id=str(uuid.uuid4()))

    def test_invalid_source(self):
        with self.assertRaises(Exception):
            AdditionalDocumentRef(source="other", id=str(uuid.uuid4()))


class TestEmployeeContractCategory(unittest.TestCase):
    def test_canonical(self):
        self.assertTrue(is_employee_contract_category("Employee Contract"))
        self.assertTrue(is_employee_contract_category("employee contract"))
        self.assertTrue(is_employee_contract_category("  EMPLOYEE CONTRACT  "))
        self.assertFalse(is_employee_contract_category("Employee Contracts"))
        self.assertFalse(is_employee_contract_category("Commercial proposal"))
        self.assertFalse(is_employee_contract_category(None))
        self.assertFalse(is_employee_contract_category(""))


class TestValidateInviteAdditionalDocuments(unittest.TestCase):
    def test_accepts_employee_contract(self):
        tid = uuid.uuid4()
        row = SimpleNamespace(id=tid, name="Roofer Contract", category="Employee Contract")
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = row
        refs = [AdditionalDocumentRef(source="document_type", id=str(tid), name=None)]
        out = validate_invite_additional_documents(db, refs)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["source"], "document_type")
        self.assertEqual(out[0]["id"], str(tid))
        self.assertEqual(out[0]["name"], "Roofer Contract")

    def test_accepts_onboarding_base_additional(self):
        tid = uuid.uuid4()
        row = SimpleNamespace(
            id=tid,
            name="Direct Deposit",
            display_name=None,
            employee_visible=True,
            package_role="additional",
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = row
        refs = [AdditionalDocumentRef(source="onboarding_base", id=str(tid))]
        out = validate_invite_additional_documents(db, refs)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["source"], "onboarding_base")
        self.assertEqual(out[0]["name"], "Direct Deposit")

    def test_rejects_onboarding_base_hiring_package(self):
        tid = uuid.uuid4()
        row = SimpleNamespace(
            id=tid,
            name="Handbook",
            display_name=None,
            employee_visible=True,
            package_role="hiring_package",
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = row
        refs = [AdditionalDocumentRef(source="onboarding_base", id=str(tid))]
        with self.assertRaises(HTTPException) as ctx:
            validate_invite_additional_documents(db, refs)
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("additional", str(ctx.exception.detail))

    def test_rejects_onboarding_base_inactive(self):
        tid = uuid.uuid4()
        row = SimpleNamespace(
            id=tid,
            name="X",
            display_name=None,
            employee_visible=False,
            package_role="additional",
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = row
        refs = [AdditionalDocumentRef(source="onboarding_base", id=str(tid))]
        with self.assertRaises(HTTPException) as ctx:
            validate_invite_additional_documents(db, refs)
        self.assertEqual(ctx.exception.status_code, 422)

    def test_rejects_wrong_category(self):
        tid = uuid.uuid4()
        row = SimpleNamespace(id=tid, name="Proposal", category="Commercial proposal")
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = row
        refs = [AdditionalDocumentRef(source="document_type", id=str(tid))]
        with self.assertRaises(HTTPException) as ctx:
            validate_invite_additional_documents(db, refs)
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("Employee Contract", str(ctx.exception.detail))

    def test_rejects_missing_type(self):
        tid = uuid.uuid4()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        refs = [AdditionalDocumentRef(source="document_type", id=str(tid))]
        with self.assertRaises(HTTPException) as ctx:
            validate_invite_additional_documents(db, refs)
        self.assertEqual(ctx.exception.status_code, 422)

    def test_dedupes_by_source_and_id(self):
        tid = uuid.uuid4()
        row = SimpleNamespace(id=tid, name="C", category="employee contract")
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = row
        refs = [
            AdditionalDocumentRef(source="document_type", id=str(tid), name="A"),
            AdditionalDocumentRef(source="document_type", id=str(tid), name="B"),
        ]
        out = validate_invite_additional_documents(db, refs)
        self.assertEqual(len(out), 1)


class TestInviteRequestPackageFields(unittest.TestCase):
    def test_defaults(self):
        req = InviteRequest(
            email_personal="a@b.com",
            job_title="Roofer",
            division_ids=[str(uuid.uuid4())],
            project_division_ids=[str(uuid.uuid4())],
        )
        self.assertTrue(req.include_onboarding_package)
        self.assertIsNone(req.additional_documents)


class TestNormalizeEmptyMeansNone(unittest.TestCase):
    def test_flag(self):
        db = MagicMock()
        self.assertEqual(normalize_invite_document_ids(db, [], empty_means_none=True), [])
        self.assertIsNone(normalize_invite_document_ids(db, []))


class TestBuildHireAssignments(unittest.TestCase):
    def test_employee_and_company(self):
        subject = uuid.uuid4()
        inviter = uuid.uuid4()
        roles = [LEGACY_STABLE_IDS["employee"], LEGACY_STABLE_IDS["company"]]
        result = _build_hire_assignments(roles, subject_user_id=subject, requested_by_id=inviter)
        self.assertEqual(result[LEGACY_STABLE_IDS["employee"]], subject)
        self.assertEqual(result[LEGACY_STABLE_IDS["company"]], inviter)


class TestFireInviteAdditionalDocuments(unittest.TestCase):
    def _profile_first(self, db, ep):
        """Wire MagicMock for EmployeeProfile .filter().with_for_update().first()."""
        locked = MagicMock()
        locked.first.return_value = ep
        db.query.return_value.filter.return_value.with_for_update.return_value = locked
        return locked

    def test_idempotent_when_already_applied(self):
        subject = uuid.uuid4()
        ep = SimpleNamespace(
            invite_additional_documents_applied_at="already",
            invite_additional_documents=[{"source": "document_type", "id": str(uuid.uuid4())}],
            invited_by_user_id=uuid.uuid4(),
        )
        db = MagicMock()
        self._profile_first(db, ep)
        fire_invite_additional_documents(db, subject_user_id=subject)
        db.commit.assert_not_called()

    def test_empty_list_marks_applied(self):
        subject = uuid.uuid4()
        inviter = uuid.uuid4()
        ep = SimpleNamespace(
            invite_additional_documents_applied_at=None,
            invite_additional_documents=[],
            invited_by_user_id=inviter,
        )
        inviter_user = SimpleNamespace(id=inviter)

        db = MagicMock()
        self._profile_first(db, ep)
        # Inviter lookup: query(User).filter(...).first() — no with_for_update
        db.query.return_value.filter.return_value.first.return_value = inviter_user
        fire_invite_additional_documents(db, subject_user_id=subject, requested_by_id=inviter)
        self.assertIsNotNone(ep.invite_additional_documents_applied_at)
        db.commit.assert_called()

    @patch("app.services.invite_additional_documents._send_document_type")
    def test_skips_failed_item_and_marks_applied(self, mock_send):
        mock_send.side_effect = ValueError("no fields")
        subject = uuid.uuid4()
        inviter = uuid.uuid4()
        doc_id = str(uuid.uuid4())
        ep = SimpleNamespace(
            invite_additional_documents_applied_at=None,
            invite_additional_documents=[{"source": "document_type", "id": doc_id, "name": "X"}],
            invited_by_user_id=inviter,
        )
        inviter_user = SimpleNamespace(id=inviter)
        db = MagicMock()
        self._profile_first(db, ep)
        db.query.return_value.filter.return_value.first.return_value = inviter_user
        fire_invite_additional_documents(db, subject_user_id=subject, requested_by_id=inviter)
        self.assertIsNotNone(ep.invite_additional_documents_applied_at)
        mock_send.assert_called_once()

    @patch("app.services.invite_additional_documents._send_onboarding_base")
    @patch("app.services.invite_additional_documents._send_document_type")
    def test_fires_onboarding_base(self, mock_dt, mock_ob):
        subject = uuid.uuid4()
        inviter = uuid.uuid4()
        doc_id = str(uuid.uuid4())
        ep = SimpleNamespace(
            invite_additional_documents_applied_at=None,
            invite_additional_documents=[{"source": "onboarding_base", "id": doc_id, "name": "Form"}],
            invited_by_user_id=inviter,
        )
        inviter_user = SimpleNamespace(id=inviter)
        db = MagicMock()
        self._profile_first(db, ep)
        db.query.return_value.filter.return_value.first.return_value = inviter_user
        fire_invite_additional_documents(db, subject_user_id=subject, requested_by_id=inviter)
        mock_ob.assert_called_once()
        mock_dt.assert_not_called()
        self.assertIsNotNone(ep.invite_additional_documents_applied_at)

    @patch("app.services.invite_additional_documents._send_document_type")
    @patch("app.services.invite_additional_documents._send_signature_template")
    def test_skips_legacy_signature_template(self, mock_sig, mock_dt):
        subject = uuid.uuid4()
        inviter = uuid.uuid4()
        doc_id = str(uuid.uuid4())
        ep = SimpleNamespace(
            invite_additional_documents_applied_at=None,
            invite_additional_documents=[
                {"source": "signature_template", "id": doc_id, "name": "Old"},
            ],
            invited_by_user_id=inviter,
        )
        inviter_user = SimpleNamespace(id=inviter)
        db = MagicMock()
        self._profile_first(db, ep)
        db.query.return_value.filter.return_value.first.return_value = inviter_user
        fire_invite_additional_documents(db, subject_user_id=subject, requested_by_id=inviter)
        self.assertIsNotNone(ep.invite_additional_documents_applied_at)
        mock_sig.assert_not_called()
        mock_dt.assert_not_called()

    @patch("app.services.invite_additional_documents._send_document_type")
    def test_second_call_skips_after_claim(self, mock_send):
        subject = uuid.uuid4()
        inviter = uuid.uuid4()
        doc_id = str(uuid.uuid4())
        ep = SimpleNamespace(
            invite_additional_documents_applied_at=None,
            invite_additional_documents=[{"source": "document_type", "id": doc_id, "name": "X"}],
            invited_by_user_id=inviter,
        )
        inviter_user = SimpleNamespace(id=inviter)
        db = MagicMock()
        self._profile_first(db, ep)
        db.query.return_value.filter.return_value.first.return_value = inviter_user
        fire_invite_additional_documents(db, subject_user_id=subject, requested_by_id=inviter)
        mock_send.assert_called_once()
        mock_send.reset_mock()
        fire_invite_additional_documents(db, subject_user_id=subject, requested_by_id=inviter)
        mock_send.assert_not_called()


class TestActiveSignatureExistsForDocumentType(unittest.TestCase):
    def test_true_when_row_found(self):
        from app.services.invite_additional_documents import _active_signature_exists_for_document_type

        db = MagicMock()
        db.query.return_value.join.return_value.filter.return_value.first.return_value = (uuid.uuid4(),)
        self.assertTrue(
            _active_signature_exists_for_document_type(
                db, type_id=uuid.uuid4(), subject_user_id=uuid.uuid4()
            )
        )

    def test_false_when_missing(self):
        from app.services.invite_additional_documents import _active_signature_exists_for_document_type

        db = MagicMock()
        db.query.return_value.join.return_value.filter.return_value.first.return_value = None
        self.assertFalse(
            _active_signature_exists_for_document_type(
                db, type_id=uuid.uuid4(), subject_user_id=uuid.uuid4()
            )
        )

if __name__ == "__main__":
    unittest.main()
