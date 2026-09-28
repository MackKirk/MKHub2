"""Onboarding template-driven signers: validation + envelope builder."""
import unittest
import uuid
from unittest.mock import MagicMock, patch

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import io


def _minimal_pdf() -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    c.drawString(72, 720, "Onboarding test")
    c.showPage()
    c.save()
    return buf.getvalue()


class TestValidateAssigneeUserId(unittest.TestCase):
    def test_user_requires_assignee_user_id_when_flag_set(self):
        from app.services.onboarding_signature_template import validate_and_normalize_template
        from fastapi import HTTPException

        fid = str(uuid.uuid4())
        tmpl = {
            "version": 1,
            "fields": [
                {
                    "id": fid,
                    "type": "signature",
                    "page_index": 0,
                    "rect": {"x": 72, "y": 100, "width": 150, "height": 40},
                    "field_name": "Sig",
                    "required": True,
                    "assignee": "user",
                }
            ],
        }
        with self.assertRaises(HTTPException) as ctx:
            validate_and_normalize_template(tmpl, _minimal_pdf(), require_user_assignee_ids=True)
        self.assertIn("assignee_user_id", str(ctx.exception.detail))

    def test_user_with_id_persists(self):
        from app.services.onboarding_signature_template import validate_and_normalize_template

        fid = str(uuid.uuid4())
        uid = str(uuid.uuid4())
        emp_fid = str(uuid.uuid4())
        tmpl = {
            "version": 1,
            "fields": [
                {
                    "id": emp_fid,
                    "type": "signature",
                    "page_index": 0,
                    "rect": {"x": 72, "y": 200, "width": 150, "height": 40},
                    "field_name": "Hire",
                    "required": True,
                    "assignee": "employee",
                },
                {
                    "id": fid,
                    "type": "signature",
                    "page_index": 0,
                    "rect": {"x": 72, "y": 100, "width": 150, "height": 40},
                    "field_name": "Mgr",
                    "required": True,
                    "assignee": "user",
                    "assignee_user_id": uid,
                },
            ],
        }
        out = validate_and_normalize_template(tmpl, _minimal_pdf(), require_user_assignee_ids=True)
        user_f = next(f for f in out["fields"] if f["assignee"] == "user")
        self.assertEqual(user_f["assignee_user_id"], uid)

    def test_signing_without_new_hire_rejected(self):
        from app.services.onboarding_signature_template import validate_and_normalize_template
        from fastapi import HTTPException

        fid = str(uuid.uuid4())
        uid = str(uuid.uuid4())
        tmpl = {
            "version": 1,
            "fields": [
                {
                    "id": fid,
                    "type": "signature",
                    "page_index": 0,
                    "rect": {"x": 72, "y": 100, "width": 150, "height": 40},
                    "field_name": "Mgr",
                    "required": True,
                    "assignee": "user",
                    "assignee_user_id": uid,
                }
            ],
        }
        with self.assertRaises(HTTPException) as ctx:
            validate_and_normalize_template(tmpl, _minimal_pdf(), require_user_assignee_ids=True)
        self.assertIn("New Hire", str(ctx.exception.detail))

    def test_generic_mode_allows_user_without_id(self):
        from app.services.onboarding_signature_template import validate_and_normalize_template

        fid = str(uuid.uuid4())
        tmpl = {
            "version": 1,
            "fields": [
                {
                    "id": fid,
                    "type": "signature",
                    "page_index": 0,
                    "rect": {"x": 72, "y": 100, "width": 150, "height": 40},
                    "field_name": "Sig",
                    "required": True,
                    "assignee": "user",
                }
            ],
        }
        out = validate_and_normalize_template(tmpl, _minimal_pdf(), require_user_assignee_ids=False)
        self.assertEqual(out["fields"][0]["assignee"], "user")
        self.assertNotIn("assignee_user_id", out["fields"][0])


class TestFilterFieldsForSigner(unittest.TestCase):
    def test_ignores_assignee_type_user_on_base_doc(self):
        from app.services.onboarding_signature_template import filter_fields_for_signer

        tmpl = {
            "fields": [
                {"id": "1", "type": "signature", "assignee": "employee"},
                {"id": "2", "type": "signature", "assignee": "user", "assignee_user_id": str(uuid.uuid4())},
            ]
        }
        bd = MagicMock()
        bd.assignee_type = "user"
        out = filter_fields_for_signer(tmpl, bd)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["assignee"], "employee")


class TestBuildEnvelopeRoles(unittest.TestCase):
    def test_employee_only_one_role(self):
        from app.services.onboarding_envelope import _build_envelope_roles_and_template
        from app.services.document_signer_roles import LEGACY_STABLE_IDS

        hire = uuid.uuid4()
        tmpl = {
            "version": 1,
            "fields": [
                {
                    "id": str(uuid.uuid4()),
                    "type": "signature",
                    "assignee": "employee",
                    "page_index": 0,
                    "rect": {"x": 1, "y": 1, "width": 10, "height": 10},
                    "field_name": "S",
                    "required": True,
                }
            ],
        }
        db = MagicMock()
        roles, normalized, assignments, required, labels = _build_envelope_roles_and_template(
            db, tmpl, subject_user_id=hire
        )
        emp = LEGACY_STABLE_IDS["employee"]
        self.assertEqual(required, [emp])
        self.assertEqual(assignments[emp], hire)
        self.assertEqual(normalized["fields"][0]["assignee"], emp)

    def test_employee_then_two_users_order(self):
        from app.services.onboarding_envelope import _build_envelope_roles_and_template, _user_role_id
        from app.services.document_signer_roles import LEGACY_STABLE_IDS

        hire = uuid.uuid4()
        u1 = uuid.uuid4()
        u2 = uuid.uuid4()
        tmpl = {
            "version": 1,
            "fields": [
                {
                    "id": str(uuid.uuid4()),
                    "type": "signature",
                    "assignee": "employee",
                    "page_index": 0,
                    "rect": {"x": 1, "y": 1, "width": 10, "height": 10},
                    "field_name": "H",
                    "required": True,
                },
                {
                    "id": str(uuid.uuid4()),
                    "type": "signature",
                    "assignee": "user",
                    "assignee_user_id": str(u1),
                    "page_index": 0,
                    "rect": {"x": 1, "y": 50, "width": 10, "height": 10},
                    "field_name": "A",
                    "required": True,
                },
                {
                    "id": str(uuid.uuid4()),
                    "type": "signature",
                    "assignee": "user",
                    "assignee_user_id": str(u2),
                    "page_index": 0,
                    "rect": {"x": 1, "y": 90, "width": 10, "height": 10},
                    "field_name": "B",
                    "required": True,
                },
            ],
        }
        db = MagicMock()
        with patch("app.services.onboarding_envelope.get_user_display", side_effect=lambda _db, uid: f"User-{uid}"):
            roles, normalized, assignments, required, labels = _build_envelope_roles_and_template(
                db, tmpl, subject_user_id=hire
            )
        emp = LEGACY_STABLE_IDS["employee"]
        r1 = _user_role_id(u1)
        r2 = _user_role_id(u2)
        self.assertEqual(required, [emp, r1, r2])
        self.assertEqual(assignments[emp], hire)
        self.assertEqual(assignments[r1], u1)
        self.assertEqual(assignments[r2], u2)


class TestOnboardingBaseShouldUseEnvelope(unittest.TestCase):
    def test_gated_by_signing_fields_only(self):
        from app.services.onboarding_envelope import onboarding_base_should_use_envelope

        bd = MagicMock()
        bd.requires_signature = False  # stale flag ignored
        bd.signature_template = {
            "fields": [{"type": "signature", "assignee": "employee"}],
        }
        self.assertTrue(onboarding_base_should_use_envelope(bd))

        bd.requires_signature = True
        bd.signature_template = {"fields": [{"type": "text", "assignee": "employee"}]}
        self.assertFalse(onboarding_base_should_use_envelope(bd))

        bd.signature_template = None
        self.assertFalse(onboarding_base_should_use_envelope(bd))


class TestEnvelopeDedupe(unittest.TestCase):
    def test_second_send_skips_when_active_exists(self):
        from app.services.onboarding_envelope import send_onboarding_base_as_envelope

        bd = MagicMock()
        bd.id = uuid.uuid4()
        bd.requires_signature = True
        bd.signature_template = {
            "fields": [{"type": "signature", "assignee": "employee"}],
        }
        hire = uuid.uuid4()
        db = MagicMock()
        with patch(
            "app.services.onboarding_envelope._active_onboarding_base_signature",
            return_value=True,
        ) as active:
            result = send_onboarding_base_as_envelope(db, bd=bd, subject_user_id=hire)
        self.assertIsNone(result)
        active.assert_called_once()


class TestPrefsClearAssignee(unittest.TestCase):
    def test_prefs_save_forces_employee_and_clears_ids(self):
        from app.routes.onboarding import _apply_base_document_preferences

        bd = MagicMock()
        bd.assignee_type = "user"
        bd.assignee_user_id = uuid.uuid4()
        bd.assignee_user_ids = [str(uuid.uuid4())]
        bd.required = True
        bd.signing_deadline_days = 7
        bd.delivery_mode = "on_hire"
        _apply_base_document_preferences(
            bd,
            {
                "block_hub_access": True,
                "signing_deadline_days": 7,
                "assignee_type": "user",
                "assignee_user_ids": [str(uuid.uuid4())],
            },
        )
        self.assertEqual(bd.assignee_type, "employee")
        self.assertIsNone(bd.assignee_user_id)
        self.assertIsNone(bd.assignee_user_ids)
        self.assertTrue(bd.required)

    def test_prefs_save_clears_even_without_assignee_keys(self):
        from app.routes.onboarding import _apply_base_document_preferences

        bd = MagicMock()
        bd.assignee_type = "user"
        bd.assignee_user_ids = ["x"]
        bd.required = True
        bd.signing_deadline_days = 7
        bd.delivery_mode = "on_hire"
        _apply_base_document_preferences(bd, {"employee_visible": True})
        self.assertEqual(bd.assignee_type, "employee")
        self.assertIsNone(bd.assignee_user_ids)

    def test_block_hub_access_aliases_required(self):
        from app.routes.onboarding import _apply_base_document_preferences, _base_document_dict

        bd = MagicMock()
        bd.assignee_type = "employee"
        bd.assignee_user_id = None
        bd.assignee_user_ids = None
        bd.required = True
        bd.signing_deadline_days = 7
        bd.delivery_mode = "on_hire"
        bd.employee_visible = True
        bd.package_role = "hiring_package"
        bd.sort_order = 0
        bd.display_name = None
        bd.notification_message = None
        bd.delivery_amount = None
        bd.delivery_unit = None
        bd.delivery_direction = None
        bd.requires_signature = True
        bd.notification_policy = None
        bd.id = uuid.uuid4()
        bd.name = "Doc"
        bd.file_id = uuid.uuid4()
        bd.content_hash = None
        bd.sign_placement = None
        bd.default_deadline_days = 7
        bd.signature_template = None

        _apply_base_document_preferences(
            bd, {"block_hub_access": False, "signing_deadline_days": 5}
        )
        self.assertFalse(bd.required)
        self.assertEqual(bd.signing_deadline_days, 5)

        # requires_signature in payload is ignored
        bd.requires_signature = True
        _apply_base_document_preferences(
            bd, {"requires_signature": False, "block_hub_access": True, "signing_deadline_days": 3}
        )
        self.assertTrue(bd.required)
        self.assertTrue(bd.requires_signature)  # unchanged by prefs

        out = _base_document_dict(bd)
        self.assertEqual(out["required"], out["block_hub_access"])
        self.assertTrue(out["block_hub_access"])

    def test_block_hub_requires_deadline(self):
        from app.routes.onboarding import _apply_base_document_preferences
        from fastapi import HTTPException

        bd = MagicMock()
        bd.assignee_type = "employee"
        bd.assignee_user_id = None
        bd.assignee_user_ids = None
        bd.required = False
        bd.signing_deadline_days = None
        bd.delivery_mode = "on_hire"
        with self.assertRaises(HTTPException) as ctx:
            _apply_base_document_preferences(bd, {"block_hub_access": True})
        self.assertIn("signing_deadline_days", str(ctx.exception.detail))


class TestDeliverOnlyWithoutSigningFields(unittest.TestCase):
    def test_ensure_items_auto_complete_without_signing_fields(self):
        from app.services.onboarding_assign import ensure_assignment_items_for_base_doc
        from datetime import datetime, timezone

        bd = MagicMock()
        bd.id = uuid.uuid4()
        bd.employee_visible = True
        bd.assignee_type = "employee"
        bd.delivery_mode = "on_hire"
        bd.signing_deadline_days = 7
        bd.default_deadline_days = 7
        bd.display_name = "Handbook"
        bd.name = "Handbook"
        bd.notification_message = None
        bd.required = False
        bd.signature_template = {"fields": [{"type": "text", "assignee": "employee"}]}
        bd.requires_signature = True  # stale — should still deliver-only

        hire = uuid.uuid4()
        now = datetime.now(timezone.utc)
        db = MagicMock()
        asn = MagicMock()
        asn.id = uuid.uuid4()

        with patch(
            "app.services.onboarding_assign._get_or_create_assignment", return_value=asn
        ), patch(
            "app.services.onboarding_assign._assignment_item_exists", return_value=False
        ), patch(
            "app.services.onboarding_assign.compute_available_at", return_value=now
        ):
            created = ensure_assignment_items_for_base_doc(
                db,
                bd=bd,
                subject_user_id=hire,
                package_id=uuid.uuid4(),
                hire_start=now,
                now=now,
            )
        self.assertEqual(created, 1)
        added = db.add.call_args[0][0]
        self.assertEqual(added.status, "signed")


if __name__ == "__main__":
    unittest.main()
