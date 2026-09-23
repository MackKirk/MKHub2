"""Tests for invite-driven onboarding document filtering."""
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services.onboarding_assign import (
    is_additional_package_role,
    is_hiring_package_role,
    normalize_invite_document_ids,
    normalize_package_role,
    resolve_onboarding_document_filter,
)


class _FakeProfile:
    def __init__(self, onboarding_document_ids):
        self.onboarding_document_ids = onboarding_document_ids


class TestPackageRoleHelpers(unittest.TestCase):
    def test_normalize(self):
        self.assertEqual(normalize_package_role(None), "hiring_package")
        self.assertEqual(normalize_package_role(""), "hiring_package")
        self.assertEqual(normalize_package_role("Hiring_Package"), "hiring_package")
        self.assertEqual(normalize_package_role("additional"), "additional")
        self.assertEqual(normalize_package_role("  ADDITIONAL  "), "additional")

    def test_predicates(self):
        self.assertTrue(is_hiring_package_role(None))
        self.assertTrue(is_hiring_package_role("hiring_package"))
        self.assertFalse(is_hiring_package_role("additional"))
        self.assertTrue(is_additional_package_role("additional"))
        self.assertFalse(is_additional_package_role("hiring_package"))


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

    def test_empty_list_means_assign_none(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = _FakeProfile([])
        subject_id = uuid.uuid4()
        result = resolve_onboarding_document_filter(db, subject_id)
        self.assertEqual(result, set())


class TestNormalizeInviteDocumentIds(unittest.TestCase):
    def test_none_returns_none(self):
        db = MagicMock()
        self.assertIsNone(normalize_invite_document_ids(db, None))

    def test_empty_defaults_to_none_all_docs(self):
        db = MagicMock()
        self.assertIsNone(normalize_invite_document_ids(db, []))

    def test_empty_with_flag_returns_empty_list(self):
        db = MagicMock()
        self.assertEqual(normalize_invite_document_ids(db, [], empty_means_none=True), [])

    def test_invalid_ids_raise(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = []
        with self.assertRaises(ValueError):
            normalize_invite_document_ids(db, [str(uuid.uuid4())])

    def test_valid_hiring_package_ids_returned(self):
        doc_id = uuid.uuid4()
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [
            SimpleNamespace(id=doc_id, package_role="hiring_package"),
        ]
        result = normalize_invite_document_ids(db, [str(doc_id)])
        self.assertEqual(result, [str(doc_id)])

    def test_rejects_additional_role_only(self):
        doc_id = uuid.uuid4()
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [
            SimpleNamespace(id=doc_id, package_role="additional"),
        ]
        with self.assertRaises(ValueError):
            normalize_invite_document_ids(db, [str(doc_id)])

    def test_filters_out_additional_keeps_hiring(self):
        hire_id = uuid.uuid4()
        add_id = uuid.uuid4()
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [
            SimpleNamespace(id=hire_id, package_role="hiring_package"),
            SimpleNamespace(id=add_id, package_role="additional"),
        ]
        result = normalize_invite_document_ids(db, [str(hire_id), str(add_id)])
        self.assertEqual(result, [str(hire_id)])


class TestApplySkipsAdditionalRole(unittest.TestCase):
    @patch("app.services.onboarding_assign.fire_invite_additional_documents", create=True)
    @patch("app.services.onboarding_assign.is_onboarding_document_delivery_enabled", return_value=True)
    @patch("app.services.onboarding_assign.ensure_assignment_items_for_base_doc")
    @patch("app.services.onboarding_assign.resolve_onboarding_document_filter", return_value=None)
    @patch("app.services.onboarding_assign.get_or_create_system_package")
    @patch("app.services.onboarding_assign.hire_anchor_start")
    def test_apply_only_hiring_package(
        self,
        mock_hire_start,
        mock_pkg,
        mock_filter,
        mock_ensure,
        mock_delivery,
        _mock_fire_unused,
    ):
        from datetime import datetime, timezone

        from app.services.onboarding_assign import apply_onboarding_after_profile_complete

        subject = uuid.uuid4()
        hire_doc = SimpleNamespace(id=uuid.uuid4(), package_role="hiring_package", name="A", sort_order=0)
        add_doc = SimpleNamespace(id=uuid.uuid4(), package_role="additional", name="B", sort_order=1)
        user = SimpleNamespace(id=subject)
        ep = SimpleNamespace(hire_date=None, invited_by_user_id=None, user_id=subject)
        pkg = SimpleNamespace(id=uuid.uuid4())

        mock_hire_start.return_value = datetime.now(timezone.utc)
        mock_pkg.return_value = pkg

        db = MagicMock()

        def query_side_effect(model):
            m = MagicMock()
            name = getattr(model, "__name__", str(model))
            if "User" in name:
                m.filter.return_value.first.return_value = user
            elif "EmployeeProfile" in name:
                m.filter.return_value.first.return_value = ep
            elif "OnboardingBaseDocument" in name:
                m.order_by.return_value.all.return_value = [hire_doc, add_doc]
            else:
                m.filter.return_value.first.return_value = None
            return m

        db.query.side_effect = query_side_effect

        with patch(
            "app.services.invite_additional_documents.fire_invite_additional_documents"
        ) as mock_fire:
            apply_onboarding_after_profile_complete(db, subject)

        self.assertEqual(mock_ensure.call_count, 1)
        self.assertEqual(mock_ensure.call_args.kwargs["bd"], hire_doc)
        mock_fire.assert_called_once()


class TestForceDeliveryOnNoneMode(unittest.TestCase):
    @patch("app.services.onboarding_assign._assignment_item_exists", return_value=False)
    @patch("app.services.onboarding_assign._get_or_create_assignment")
    def test_force_delivery_creates_when_mode_none(self, mock_asn, mock_exists):
        from datetime import datetime, timezone

        from app.services.onboarding_assign import ensure_assignment_items_for_base_doc

        now = datetime.now(timezone.utc)
        subject = uuid.uuid4()
        pkg = uuid.uuid4()
        bd = SimpleNamespace(
            id=uuid.uuid4(),
            name="07. Something",
            display_name="07. Something",
            employee_visible=True,
            assignee_type="employee",
            assignee_user_ids=None,
            assignee_user_id=None,
            delivery_mode="none",
            signing_deadline_days=7,
            default_deadline_days=7,
            notification_message=None,
            required=True,
            requires_signature=True,
        )
        asn = SimpleNamespace(id=uuid.uuid4())
        mock_asn.return_value = asn
        db = MagicMock()

        created = ensure_assignment_items_for_base_doc(
            db,
            bd=bd,
            subject_user_id=subject,
            package_id=pkg,
            hire_start=now,
            now=now,
            force_delivery=False,
        )
        self.assertEqual(created, 0)
        self.assertEqual(db.add.call_count, 0)

        created = ensure_assignment_items_for_base_doc(
            db,
            bd=bd,
            subject_user_id=subject,
            package_id=pkg,
            hire_start=now,
            now=now,
            force_delivery=True,
        )
        self.assertEqual(created, 1)
        self.assertEqual(db.add.call_count, 1)


class TestForceEmployeeAssignee(unittest.TestCase):
    @patch("app.services.onboarding_assign._assignment_item_exists", return_value=False)
    @patch("app.services.onboarding_assign._get_or_create_assignment")
    def test_force_employee_overrides_user_assignee(self, mock_asn, mock_exists):
        from datetime import datetime, timezone

        from app.services.onboarding_assign import ensure_assignment_items_for_base_doc

        now = datetime.now(timezone.utc)
        subject = uuid.uuid4()
        company_user = uuid.uuid4()
        pkg = uuid.uuid4()
        bd = SimpleNamespace(
            id=uuid.uuid4(),
            name="13. Payroll Hours Policy 2026",
            display_name=None,
            employee_visible=True,
            assignee_type="user",
            assignee_user_ids=[str(company_user)],
            assignee_user_id=company_user,
            delivery_mode="on_hire",
            signing_deadline_days=7,
            default_deadline_days=7,
            notification_message=None,
            required=True,
            requires_signature=True,
        )
        asn = SimpleNamespace(id=uuid.uuid4())
        mock_asn.return_value = asn
        db = MagicMock()

        # Without force: assigns to company user
        created = ensure_assignment_items_for_base_doc(
            db,
            bd=bd,
            subject_user_id=subject,
            package_id=pkg,
            hire_start=now,
            now=now,
        )
        self.assertEqual(created, 1)
        mock_asn.assert_called_with(db, company_user, pkg, now)

        mock_asn.reset_mock()
        db.reset_mock()
        mock_asn.return_value = asn

        # With force: assigns to hire
        created = ensure_assignment_items_for_base_doc(
            db,
            bd=bd,
            subject_user_id=subject,
            package_id=pkg,
            hire_start=now,
            now=now,
            force_employee_assignee=True,
        )
        self.assertEqual(created, 1)
        mock_asn.assert_called_with(db, subject, pkg, now)


if __name__ == "__main__":
    unittest.main()
