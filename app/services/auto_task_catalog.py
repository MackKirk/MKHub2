"""Coded catalog of auto-task triggers. Admins route recipients; they do not create triggers."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class AutoTaskTriggerDef:
    key: str
    category: str
    category_label: str
    name: str
    description: str
    when: str
    task_title_template: str
    task_description_template: str
    # Not fired from an invite checkbox; created when the Starts-after task is done.
    chain_only: bool = False
    # Prefill in Settings when no route has been saved yet. Engine uses the saved route.
    default_starts_after_key: Optional[str] = None


ONBOARDING_CATEGORY = "onboarding"

AUTO_TASK_TRIGGERS: tuple[AutoTaskTriggerDef, ...] = (
    AutoTaskTriggerDef(
        key="onboarding.needs_email",
        category=ONBOARDING_CATEGORY,
        category_label="Onboarding",
        name="Company email account",
        description="IT should provision a company email account for the new hire.",
        when="When an invite is sent with “This user will need an email account” checked.",
        task_title_template="Provision company email for {name}",
        task_description_template=(
            "Provision a company email account before this person starts.\n\n"
            "Invite email: {email}\n"
            "Job title: {job_title}\n"
            "Hire date: {hire_date}"
        ),
    ),
    AutoTaskTriggerDef(
        key="onboarding.needs_business_card",
        category=ONBOARDING_CATEGORY,
        category_label="Onboarding",
        name="Business cards",
        description="Business cards should be ordered before the start date.",
        when="When an invite is sent with “This user will need business cards” checked.",
        task_title_template="Order business cards for {name}",
        task_description_template=(
            "Order business cards before this person starts.\n\n"
            "Invite email: {email}\n"
            "Job title: {job_title}\n"
            "Hire date: {hire_date}"
        ),
    ),
    AutoTaskTriggerDef(
        key="onboarding.needs_phone",
        category=ONBOARDING_CATEGORY,
        category_label="Onboarding",
        name="Company phone",
        description="A company phone or mobile line should be assigned.",
        when="When an invite is sent with “This user will need a phone” checked.",
        task_title_template="Assign company phone for {name}",
        task_description_template=(
            "Assign a company phone or mobile line before this person starts.\n\n"
            "Invite email: {email}\n"
            "Job title: {job_title}\n"
            "Hire date: {hire_date}"
        ),
    ),
    AutoTaskTriggerDef(
        key="onboarding.needs_vehicle",
        category=ONBOARDING_CATEGORY,
        category_label="Onboarding",
        name="Company vehicle",
        description="This employee will receive a company vehicle.",
        when="When an invite is sent with “This user will receive a vehicle” checked.",
        task_title_template="Assign company vehicle for {name}",
        task_description_template=(
            "Assign a company vehicle before this person starts.\n\n"
            "Invite email: {email}\n"
            "Job title: {job_title}\n"
            "Hire date: {hire_date}"
        ),
    ),
    AutoTaskTriggerDef(
        key="onboarding.needs_equipment",
        category=ONBOARDING_CATEGORY,
        category_label="Onboarding",
        name="Equipment or tools",
        description="Special equipment or tools should be prepared before day one.",
        when="When an invite is sent with “This user will need equipment or tools” checked.",
        task_title_template="Prepare equipment for {name}",
        task_description_template=(
            "Prepare equipment or tools before this person starts.\n\n"
            "Invite email: {email}\n"
            "Job title: {job_title}\n"
            "Hire date: {hire_date}\n\n"
            "Equipment list:\n{equipment_list}"
        ),
    ),
    AutoTaskTriggerDef(
        key="onboarding.wrap_vehicle",
        category=ONBOARDING_CATEGORY,
        category_label="Onboarding",
        name="Vehicle wrap",
        description="The assigned company vehicle should be wrapped after it is ready.",
        when="After the company vehicle task for this hire is completed. Not an invite checkbox.",
        task_title_template="Wrap company vehicle for {name}",
        task_description_template=(
            "Wrap the company vehicle assigned to this person.\n\n"
            "Invite email: {email}\n"
            "Job title: {job_title}\n"
            "Hire date: {hire_date}"
        ),
        chain_only=True,
        default_starts_after_key="onboarding.needs_vehicle",
    ),
)

TRIGGER_BY_KEY = {t.key: t for t in AUTO_TASK_TRIGGERS}

ONBOARDING_FLAG_TO_TRIGGER = {
    "needs_email": "onboarding.needs_email",
    "needs_business_card": "onboarding.needs_business_card",
    "needs_phone": "onboarding.needs_phone",
    "needs_vehicle": "onboarding.needs_vehicle",
    "needs_equipment": "onboarding.needs_equipment",
}


def get_trigger(key: str) -> Optional[AutoTaskTriggerDef]:
    return TRIGGER_BY_KEY.get(key)


class _SafeMap(dict):
    def __missing__(self, key: str) -> str:
        return ""


def render_template(template: str, context: dict) -> str:
    try:
        return template.format_map(_SafeMap(context)).strip()
    except (ValueError, IndexError):
        return (template or "").strip()


def starts_after_would_cycle(
    trigger_key: str,
    new_parent: Optional[str],
    starts_after: dict[str, Optional[str]],
) -> bool:
    if not new_parent:
        return False
    if new_parent == trigger_key:
        return True
    mapping = dict(starts_after)
    mapping[trigger_key] = new_parent
    seen: set[str] = set()
    current: Optional[str] = new_parent
    while current:
        if current == trigger_key:
            return True
        if current in seen:
            return True
        seen.add(current)
        current = mapping.get(current)
    return False


def sort_keys_by_starts_after(keys: list[str], starts_after: dict[str, Optional[str]]) -> list[str]:
    """Stable topological order so prerequisites fire before dependents on the same invite."""
    ordered_unique = list(dict.fromkeys(keys))
    remaining = set(ordered_unique)
    ordered: list[str] = []
    while remaining:
        ready = [
            key
            for key in ordered_unique
            if key in remaining and starts_after.get(key) not in remaining
        ]
        if not ready:
            ordered.extend(key for key in ordered_unique if key in remaining)
            break
        for key in ready:
            ordered.append(key)
            remaining.remove(key)
    return ordered
