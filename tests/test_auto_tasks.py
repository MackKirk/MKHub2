import unittest

from app.auth.settings_permissions import settings_permissions_payload
from app.services.auto_task_catalog import (
    AUTO_TASK_TRIGGERS,
    ONBOARDING_FLAG_TO_TRIGGER,
    get_trigger,
    render_template,
    sort_keys_by_starts_after,
    starts_after_would_cycle,
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
                "onboarding.needs_vehicle",
                "onboarding.needs_equipment",
            ],
        )
        catalog_keys = [t.key for t in AUTO_TASK_TRIGGERS]
        self.assertEqual(
            catalog_keys,
            flag_keys + ["onboarding.wrap_vehicle"],
        )
        wrap = get_trigger("onboarding.wrap_vehicle")
        self.assertIsNotNone(wrap)
        self.assertTrue(wrap.chain_only)
        self.assertEqual(wrap.default_starts_after_key, "onboarding.needs_vehicle")
        self.assertFalse(any(t.chain_only for t in AUTO_TASK_TRIGGERS if t.key != wrap.key))

    def test_render_template_fills_and_missing_keys(self):
        title = render_template("Order business cards for {name}", {"name": "Ada"})
        self.assertEqual(title, "Order business cards for Ada")
        self.assertEqual(render_template("Hello {missing}", {}), "Hello")

    def test_unknown_trigger(self):
        self.assertIsNone(get_trigger("not.a.trigger"))


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
