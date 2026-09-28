"""Phase 1 invite hire basics: required fields and profile copy."""
import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

from app.schemas.auth import InviteRequest
from app.services.invite_hire import (
    apply_invite_fields_to_profile,
    invite_display_name,
    parse_invite_date,
    resolve_invite_org_and_title,
)


class TestResolveInviteOrgAndTitle(unittest.TestCase):
    def _req(self, **kwargs):
        base = {
            "email_personal": "newhire@example.com",
            "job_title": "Estimator",
            "division_ids": [str(uuid.uuid4())],
            "project_division_ids": [str(uuid.uuid4())],
        }
        base.update(kwargs)
        return InviteRequest(**base)

    def test_minimal_required_ok(self):
        dept = str(uuid.uuid4())
        proj = str(uuid.uuid4())
        req = self._req(division_ids=[dept], project_division_ids=[proj])
        division_ids, project_ids, title = resolve_invite_org_and_title(req)
        self.assertEqual(division_ids, [dept])
        self.assertEqual(project_ids, [proj])
        self.assertEqual(title, "Estimator")

    def test_optional_name_phone_hire_ok(self):
        req = self._req(first_name=None, last_name=None, phone=None, hire_date=None, pay_rate=None)
        resolve_invite_org_and_title(req)  # should not raise

    def test_missing_job_title(self):
        req = self._req(job_title="  ")
        with self.assertRaises(ValueError) as ctx:
            resolve_invite_org_and_title(req)
        self.assertIn("job_title", str(ctx.exception))

    def test_missing_departments(self):
        req = self._req(division_ids=[])
        with self.assertRaises(ValueError) as ctx:
            resolve_invite_org_and_title(req)
        self.assertIn("department", str(ctx.exception).lower())

    def test_missing_project_divisions(self):
        req = self._req(project_division_ids=None)
        with self.assertRaises(ValueError) as ctx:
            resolve_invite_org_and_title(req)
        self.assertIn("project division", str(ctx.exception).lower())

    def test_legacy_single_division_id(self):
        dept = str(uuid.uuid4())
        proj = str(uuid.uuid4())
        req = self._req(division_ids=None, division_id=dept, project_division_ids=[proj])
        division_ids, _, _ = resolve_invite_org_and_title(req)
        self.assertEqual(division_ids, [dept])


class TestInviteDisplayName(unittest.TestCase):
    def test_uses_full_name_when_present(self):
        req = InviteRequest(
            email_personal="a@b.com",
            first_name="Ada",
            last_name="Lovelace",
            job_title="Engineer",
            division_ids=["d1"],
            project_division_ids=["p1"],
        )
        self.assertEqual(invite_display_name(req), "Ada Lovelace")

    def test_falls_back_to_email(self):
        req = InviteRequest(
            email_personal="a@b.com",
            job_title="Engineer",
            division_ids=["d1"],
            project_division_ids=["p1"],
        )
        self.assertEqual(invite_display_name(req), "a@b.com")


class TestApplyInviteFieldsToProfile(unittest.TestCase):
    def test_copies_hire_fields_and_project_divisions(self):
        dept_proj = [str(uuid.uuid4()), str(uuid.uuid4())]
        mgr = str(uuid.uuid4())
        inv = SimpleNamespace(
            first_name="Sam",
            last_name="Hire",
            phone="555-0100",
            job_title="Superintendent",
            hire_date="2026-10-01",
            pay_rate="45",
            pay_type="hourly",
            employment_type="full-time",
            work_email="sam.work@mk.com",
            work_phone="555-0200",
            manager_user_id=mgr,
            project_division_ids=dept_proj,
            document_ids=["doc-1"],
            created_from_ip="203.0.113.50",
            created_by=None,
        )
        ep = SimpleNamespace()
        apply_invite_fields_to_profile(ep, inv, payload_first_name="RegisterFirst", payload_last_name=None)

        self.assertEqual(ep.first_name, "RegisterFirst")
        self.assertEqual(ep.last_name, "Hire")
        self.assertEqual(ep.phone, "555-0100")
        self.assertEqual(ep.job_title, "Superintendent")
        self.assertIsInstance(ep.hire_date, datetime)
        self.assertEqual(ep.hire_date.date().isoformat(), "2026-10-01")
        self.assertEqual(ep.pay_rate, "45")
        self.assertEqual(ep.pay_type, "hourly")
        self.assertEqual(ep.employment_type, "full-time")
        self.assertEqual(ep.work_email, "sam.work@mk.com")
        self.assertEqual(ep.work_phone, "555-0200")
        self.assertEqual(ep.manager_user_id, uuid.UUID(mgr))
        self.assertEqual(ep.project_division_ids, dept_proj)
        self.assertEqual(ep.onboarding_document_ids, ["doc-1"])
        self.assertEqual(ep.invited_from_ip, "203.0.113.50")

    def test_parse_invite_date(self):
        dt = parse_invite_date("2026-09-15")
        self.assertIsNotNone(dt)
        self.assertEqual(dt.tzinfo, timezone.utc)
        self.assertIsNone(parse_invite_date(""))
        self.assertIsNone(parse_invite_date(None))


if __name__ == "__main__":
    unittest.main()
