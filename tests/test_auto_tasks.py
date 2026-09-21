import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from app.auth.settings_permissions import settings_permissions_payload
from app.schemas.auth import InviteRequest, RequirementNotes
from app.services.auto_task_catalog import (
    ALWAYS_ON_ONBOARDING_KEYS,
    AUTO_TASK_TRIGGERS,
    ONBOARDING_FLAG_TO_TRIGGER,
    get_trigger,
    render_template,
    sort_keys_by_starts_after,
    starts_after_would_cycle,
)
from app.services.auto_task_service import (
    compute_due_date,
    invite_context,
    requirement_notes_map,
    resolve_due_anchor,
    resolve_due_in_days,
)
from tests.test_settings_permissions import _user_with


class TestAutoTaskCatalog(unittest.TestCase):
    def test_onboarding_invite_triggers(self):
        flag_keys = list(ONBOARDING_FLAG_TO_TRIGGER.values())
        self.assertEqual(
            flag_keys,
            [
                "onboarding.needs_email",
                "onboarding.needs_business_card",
                "onboarding.needs_phone",
                "onboarding.needs_computer",
                "onboarding.needs_vehicle",
                "onboarding.needs_equipment",
            ],
        )
        catalog_keys = [t.key for t in AUTO_TASK_TRIGGERS]
        self.assertEqual(
            catalog_keys,
            flag_keys
            + ["onboarding.wrap_vehicle"]
            + [
                "onboarding.benefits_setup",
                "onboarding.probation_evaluation",
                "onboarding.safety_review_3mo",
            ],
        )
        wrap = get_trigger("onboarding.wrap_vehicle")
        self.assertIsNotNone(wrap)
        self.assertTrue(wrap.chain_only)
        self.assertEqual(wrap.default_starts_after_key, "onboarding.needs_vehicle")
        self.assertFalse(any(t.chain_only for t in AUTO_TASK_TRIGGERS if t.key != wrap.key))

    def test_always_on_triggers(self):
        self.assertEqual(
            ALWAYS_ON_ONBOARDING_KEYS,
            [
                "onboarding.benefits_setup",
                "onboarding.probation_evaluation",
                "onboarding.safety_review_3mo",
            ],
        )
        for key in ALWAYS_ON_ONBOARDING_KEYS:
            t = get_trigger(key)
            self.assertIsNotNone(t)
            self.assertTrue(t.always_on)
            self.assertFalse(t.chain_only)
            self.assertEqual(t.default_due_anchor, "hire_date")
            self.assertIsNotNone(t.default_due_in_days)

        probation = get_trigger("onboarding.probation_evaluation")
        safety = get_trigger("onboarding.safety_review_3mo")
        benefits = get_trigger("onboarding.benefits_setup")
        self.assertEqual(probation.default_due_in_days, 77)
        self.assertEqual(safety.default_due_in_days, 77)
        self.assertEqual(benefits.default_due_in_days, 60)

    def test_render_template_fills_and_missing_keys(self):
        title = render_template("Order business cards for {name}", {"name": "Ada"})
        self.assertEqual(title, "Order business cards for Ada")
        self.assertEqual(render_template("Hello {missing}", {}), "Hello")

    def test_unknown_trigger(self):
        self.assertIsNone(get_trigger("not.a.trigger"))


class TestAutoTaskDueAnchor(unittest.TestCase):
    def test_resolve_defaults_from_catalog(self):
        trigger = get_trigger("onboarding.probation_evaluation")
        self.assertEqual(resolve_due_anchor(trigger, None), "hire_date")
        self.assertEqual(resolve_due_in_days(trigger, None), 77)

    def test_resolve_saved_route_wins(self):
        trigger = get_trigger("onboarding.benefits_setup")
        route = MagicMock()
        route.due_anchor = "invite_sent"
        route.due_in_days = 3
        self.assertEqual(resolve_due_anchor(trigger, route), "invite_sent")
        self.assertEqual(resolve_due_in_days(trigger, route), 3)

    def test_compute_due_from_hire_date(self):
        due = compute_due_date(
            due_anchor="hire_date",
            due_in_days=77,
            context={"hire_date_iso": "2026-01-01"},
            trigger_key="onboarding.probation_evaluation",
        )
        self.assertIsNotNone(due)
        expected = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(days=77)
        self.assertEqual(due, expected)

    def test_compute_due_hire_date_zero(self):
        due = compute_due_date(
            due_anchor="hire_date",
            due_in_days=0,
            context={"hire_date_iso": "2026-03-15"},
            trigger_key="onboarding.benefits_setup",
        )
        self.assertEqual(due, datetime(2026, 3, 15, tzinfo=timezone.utc))

    def test_compute_due_missing_hire_falls_back(self):
        before = datetime.now(timezone.utc)
        due = compute_due_date(
            due_anchor="hire_date",
            due_in_days=10,
            context={"hire_date_iso": ""},
            trigger_key="onboarding.safety_review_3mo",
        )
        after = datetime.now(timezone.utc)
        self.assertIsNotNone(due)
        self.assertGreaterEqual(due, before + timedelta(days=9))
        self.assertLessEqual(due, after + timedelta(days=11))


class TestInviteContext(unittest.TestCase):
    def test_invite_context_basic(self):
        req = InviteRequest(
            email_personal="ada@example.com",
            job_title="Estimator",
            hire_date="2026-04-01",
            phone="555-0100",
            pay_rate="50",
            pay_type="hourly",
            division_ids=[],
            project_division_ids=[],
        )
        ctx = invite_context(req)
        self.assertEqual(ctx["email"], "ada@example.com")
        self.assertEqual(ctx["job_title"], "Estimator")
        self.assertEqual(ctx["hire_date"], "2026-04-01")
        self.assertEqual(ctx["hire_date_iso"], "2026-04-01")
        self.assertEqual(ctx["phone"], "555-0100")
        self.assertIn("50", ctx["pay"])
        self.assertIn("hourly", ctx["pay"])

    def test_requirement_notes_map_and_templates(self):
        req = InviteRequest(
            email_personal="ada@example.com",
            needs_phone=True,
            needs_equipment=True,
            equipment_list="legacy drill",
            requirement_notes=RequirementNotes(
                phone="prefers iPhone",
                equipment="laptop + PPE",
            ),
        )
        notes = requirement_notes_map(req)
        self.assertEqual(notes["phone"], "prefers iPhone")
        self.assertEqual(notes["equipment"], "laptop + PPE")

        phone_tpl = get_trigger("onboarding.needs_phone").task_description_template
        with_notes = render_template(
            phone_tpl,
            {
                "name": "Ada",
                "email": "ada@example.com",
                "phone": "—",
                "job_title": "—",
                "hire_date": "—",
                "supervisor": "—",
                "departments": "—",
                "project_divisions": "—",
                "pay": "—",
                "notes_block": "\n\nNotes:\nprefers iPhone",
            },
        )
        self.assertIn("Notes:\nprefers iPhone", with_notes)
        without = render_template(
            phone_tpl,
            {
                "name": "Ada",
                "email": "ada@example.com",
                "phone": "—",
                "job_title": "—",
                "hire_date": "—",
                "supervisor": "—",
                "departments": "—",
                "project_divisions": "—",
                "pay": "—",
                "notes_block": "",
            },
        )
        self.assertNotIn("Notes:", without)

        legacy = InviteRequest(
            email_personal="bob@example.com",
            equipment_list="only legacy",
        )
        self.assertEqual(requirement_notes_map(legacy)["equipment"], "only legacy")
        ctx = invite_context(
            InviteRequest(
                email_personal="c@example.com",
                requirement_notes=RequirementNotes(equipment="from notes"),
            )
        )
        self.assertEqual(ctx["equipment_list"], "from notes")


class TestAutoTaskPermissions(unittest.TestCase):
    def test_payload_includes_auto_tasks_flags(self):
        empty = settings_permissions_payload(_user_with({}))
        self.assertFalse(empty["can_view_auto_tasks"])
        self.assertFalse(empty["can_edit_auto_tasks"])
        self.assertFalse(empty["can_access_settings"])

        reader = settings_permissions_payload(_user_with({"settings:auto_tasks:read": True}))
        self.assertTrue(reader["can_view_auto_tasks"])
        self.assertFalse(reader["can_edit_auto_tasks"])
        self.assertTrue(reader["can_access_settings"])

        writer = settings_permissions_payload(_user_with({"settings:auto_tasks:write": True}))
        self.assertTrue(writer["can_view_auto_tasks"])
        self.assertTrue(writer["can_edit_auto_tasks"])
        self.assertTrue(writer["can_access_settings"])


class TestAutoTaskStartsAfter(unittest.TestCase):
    def test_sort_prereq_before_dependent(self):
        keys = ["onboarding.needs_business_card", "onboarding.needs_email"]
        ordered = sort_keys_by_starts_after(
            keys,
            {"onboarding.needs_business_card": "onboarding.needs_email"},
        )
        self.assertEqual(ordered, ["onboarding.needs_email", "onboarding.needs_business_card"])

    def test_sort_skips_missing_prereq(self):
        keys = ["onboarding.needs_business_card"]
        ordered = sort_keys_by_starts_after(
            keys,
            {"onboarding.needs_business_card": "onboarding.needs_email"},
        )
        self.assertEqual(ordered, ["onboarding.needs_business_card"])

    def test_cycle_self_and_loop(self):
        self.assertTrue(starts_after_would_cycle("a", "a", {}))
        self.assertFalse(starts_after_would_cycle("a", "b", {}))
        self.assertTrue(starts_after_would_cycle("a", "b", {"b": "a"}))
        self.assertFalse(starts_after_would_cycle("a", None, {"a": "b"}))


if __name__ == "__main__":
    unittest.main()
