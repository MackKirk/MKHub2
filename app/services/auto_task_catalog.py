"""Coded catalog of auto-task triggers. Admins route recipients; they do not create triggers."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

# Shared hire details block for onboarding task bodies.
_HIRE_DETAILS = (
    "New hire details:\n"
    "Name: {name}\n"
    "Invite email: {email}\n"
    "Phone: {phone}\n"
    "Job title: {job_title}\n"
    "Hire date: {hire_date}\n"
    "Supervisor: {supervisor}\n"
    "Departments: {departments}\n"
    "Project divisions: {project_divisions}\n"
    "Pay: {pay}"
)

_INTRO = (
    "A new team member has been invited to MK Hub and needs your attention.\n\n"
)

_ORIGIN_STEP2 = (
    "Why this task exists:\n"
    "Created when an invite was sent with the matching card selected on "
    "Invite → Step 2 (Onboarding requirements).\n\n"
)

_ORIGIN_ALWAYS = (
    "Why this task exists:\n"
    "Always-on onboarding task — created automatically on every invite send "
    "(not tied to a Step 2 requirement card).\n\n"
)

_ORIGIN_CHAIN = (
    "Why this task exists:\n"
    "Chained onboarding task — created after the prerequisite auto-task for "
    "the same hire was completed (not an invite Step 2 card).\n\n"
)


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
    # Fired on every invite send (not tied to a checkbox).
    always_on: bool = False
    # Prefill in Settings when no route has been saved yet. Engine uses the saved route.
    default_starts_after_key: Optional[str] = None
    # invite_sent | hire_date — used when route has no due_anchor saved yet.
    default_due_anchor: Optional[str] = None
    default_due_in_days: Optional[int] = None


ONBOARDING_CATEGORY = "onboarding"

AUTO_TASK_TRIGGERS: tuple[AutoTaskTriggerDef, ...] = (
    AutoTaskTriggerDef(
        key="onboarding.needs_email",
        category=ONBOARDING_CATEGORY,
        category_label="Onboarding",
        name="Company email account",
        description=(
            "IT provisions a company email for the new hire. "
            "Optional notes from the Email account card appear only on this task."
        ),
        when=(
            "Invite User → Step 2 (Onboarding requirements). "
            "Fires when Send Invite runs and the Email account card is selected."
        ),
        task_title_template="Provision company email for {name}",
        task_description_template=(
            f"{_INTRO}"
            f"{_ORIGIN_STEP2}"
            "Action required:\n"
            "Provision a company email account before this person starts. "
            "Create the mailbox, apply the standard security policies, add them to the "
            "appropriate distribution lists or groups, and share access details securely "
            "with the hire or their supervisor.\n\n"
            f"{_HIRE_DETAILS}"
            "{notes_block}"
        ),
    ),
    AutoTaskTriggerDef(
        key="onboarding.needs_business_card",
        category=ONBOARDING_CATEGORY,
        category_label="Onboarding",
        name="Business cards",
        description=(
            "Business cards should be ordered before the start date. "
            "Optional notes from the Business cards card appear only on this task."
        ),
        when=(
            "Invite User → Step 2 (Onboarding requirements). "
            "Fires when Send Invite runs and the Business cards card is selected."
        ),
        task_title_template="Order business cards for {name}",
        task_description_template=(
            f"{_INTRO}"
            f"{_ORIGIN_STEP2}"
            "Action required:\n"
            "Order business cards so they are ready by the hire date. "
            "Confirm name spelling, job title, and any branding details before placing the order. "
            "Coordinate delivery with the supervisor if needed.\n\n"
            f"{_HIRE_DETAILS}"
            "{notes_block}"
        ),
    ),
    AutoTaskTriggerDef(
        key="onboarding.needs_phone",
        category=ONBOARDING_CATEGORY,
        category_label="Onboarding",
        name="Company phone",
        description=(
            "A company phone or mobile line should be assigned. "
            "Optional notes from the Phone card appear only on this task."
        ),
        when=(
            "Invite User → Step 2 (Onboarding requirements). "
            "Fires when Send Invite runs and the Phone card is selected."
        ),
        task_title_template="Assign company phone for {name}",
        task_description_template=(
            f"{_INTRO}"
            f"{_ORIGIN_STEP2}"
            "Action required:\n"
            "Assign a company phone or mobile line before this person starts. "
            "Prepare the device or SIM, enroll it in company policies if required, "
            "and confirm the number with the hire or their supervisor.\n\n"
            f"{_HIRE_DETAILS}"
            "{notes_block}"
        ),
    ),
    AutoTaskTriggerDef(
        key="onboarding.needs_computer",
        category=ONBOARDING_CATEGORY,
        category_label="Onboarding",
        name="Computer / laptop",
        description=(
            "A company computer or laptop should be assigned. "
            "Optional notes from the Computer/Laptop card appear only on this task."
        ),
        when=(
            "Invite User → Step 2 (Onboarding requirements). "
            "Fires when Send Invite runs and the Computer/Laptop card is selected."
        ),
        task_title_template="Assign computer/laptop for {name}",
        task_description_template=(
            f"{_INTRO}"
            f"{_ORIGIN_STEP2}"
            "Action required:\n"
            "Assign a company computer or laptop before this person starts. "
            "Image or configure the device, install required software, enroll it in "
            "company management, and arrange handover with the hire or their supervisor.\n\n"
            f"{_HIRE_DETAILS}"
            "{notes_block}"
        ),
    ),
    AutoTaskTriggerDef(
        key="onboarding.needs_vehicle",
        category=ONBOARDING_CATEGORY,
        category_label="Onboarding",
        name="Company vehicle",
        description=(
            "A company vehicle should be assigned to the new hire. "
            "Optional notes from the Vehicle card appear only on this task. "
            "Completing this task can unlock Vehicle wrap when that chain is configured."
        ),
        when=(
            "Invite User → Step 2 (Onboarding requirements). "
            "Fires when Send Invite runs and the Vehicle card is selected."
        ),
        task_title_template="Assign company vehicle for {name}",
        task_description_template=(
            f"{_INTRO}"
            f"{_ORIGIN_STEP2}"
            "Action required:\n"
            "Assign a company vehicle before this person starts. "
            "Confirm availability, insurance/registration status, and keys or access. "
            "Record the assignment and notify the supervisor. Completing this task may "
            "start a follow-up Vehicle wrap task if that chain is enabled.\n\n"
            f"{_HIRE_DETAILS}"
            "{notes_block}"
        ),
    ),
    AutoTaskTriggerDef(
        key="onboarding.needs_equipment",
        category=ONBOARDING_CATEGORY,
        category_label="Onboarding",
        name="Equipment or tools",
        description=(
            "Special equipment or tools should be prepared before day one. "
            "Notes from the Equipment or tools card become the equipment list on this task."
        ),
        when=(
            "Invite User → Step 2 (Onboarding requirements). "
            "Fires when Send Invite runs and the Equipment or tools card is selected."
        ),
        task_title_template="Prepare equipment for {name}",
        task_description_template=(
            f"{_INTRO}"
            f"{_ORIGIN_STEP2}"
            "Action required:\n"
            "Prepare the equipment or tools listed below before day one. "
            "Confirm each item is available, labeled if needed, and ready for handover "
            "to the hire or their supervisor.\n\n"
            f"{_HIRE_DETAILS}\n\n"
            "Equipment list:\n{equipment_list}"
        ),
    ),
    AutoTaskTriggerDef(
        key="onboarding.wrap_vehicle",
        category=ONBOARDING_CATEGORY,
        category_label="Onboarding",
        name="Vehicle wrap",
        description=(
            "Wrap the company vehicle after it has been assigned. "
            "Not controlled by an invite Step 2 card — created when the Company vehicle "
            "task for the same hire is completed."
        ),
        when=(
            "Chained from Invite onboarding. "
            "Created after the Company vehicle auto-task for the same hire is marked done "
            "(only if that vehicle task was created)."
        ),
        task_title_template="Wrap company vehicle for {name}",
        task_description_template=(
            f"{_INTRO}"
            f"{_ORIGIN_CHAIN}"
            "Action required:\n"
            "Schedule and complete the company vehicle wrap for the vehicle assigned to "
            "this hire. Confirm graphics/specs with the supervisor if needed, then update "
            "fleet records when the wrap is finished.\n\n"
            f"{_HIRE_DETAILS}"
        ),
        chain_only=True,
        default_starts_after_key="onboarding.needs_vehicle",
    ),
    AutoTaskTriggerDef(
        key="onboarding.benefits_setup",
        category=ONBOARDING_CATEGORY,
        category_label="Onboarding",
        name="Benefits set up",
        description=(
            "Accountant completes benefits setup for the new hire (external process). "
            "No Step 2 card — fires on every successful invite send when recipients are configured. "
            "Default due: hire date + 60 days."
        ),
        when=(
            "Invite User → Send Invite (always-on). "
            "Created on every invite send; not tied to a Step 2 requirement card. "
            "Default due: hire date + 60 days."
        ),
        task_title_template="Benefits set up for {name}",
        task_description_template=(
            f"{_INTRO}"
            f"{_ORIGIN_ALWAYS}"
            "Action required:\n"
            "Complete benefits enrollment and setup for this new hire in the external "
            "benefits systems. Confirm eligibility, plan options, and effective dates with "
            "HR as needed. Default target: about 60 days after the hire date.\n\n"
            f"{_HIRE_DETAILS}"
        ),
        always_on=True,
        default_due_anchor="hire_date",
        default_due_in_days=60,
    ),
    AutoTaskTriggerDef(
        key="onboarding.probation_evaluation",
        category=ONBOARDING_CATEGORY,
        category_label="Onboarding",
        name="Probation period evaluation",
        description=(
            "HR/accountant probation evaluation for the new hire. "
            "No Step 2 card — fires on every successful invite send when recipients are configured. "
            "Default due: hire date + 77 days (~11 weeks)."
        ),
        when=(
            "Invite User → Send Invite (always-on). "
            "Created on every invite send; not tied to a Step 2 requirement card. "
            "Default due: hire date + 77 days (~11 weeks)."
        ),
        task_title_template="Probation period evaluation for {name}",
        task_description_template=(
            f"{_INTRO}"
            f"{_ORIGIN_ALWAYS}"
            "Action required:\n"
            "Complete the probation period evaluation for this new hire. "
            "Gather feedback from the supervisor, document the outcome, and follow the "
            "standard HR process. Default target: about 11 weeks (77 days) after the hire date.\n\n"
            f"{_HIRE_DETAILS}"
        ),
        always_on=True,
        default_due_anchor="hire_date",
        default_due_in_days=77,
    ),
    AutoTaskTriggerDef(
        key="onboarding.safety_review_3mo",
        category=ONBOARDING_CATEGORY,
        category_label="Onboarding",
        name="3-month safety review",
        description=(
            "Safety completes the 3-month review for the new hire. "
            "No Step 2 card — fires on every successful invite send when recipients are configured. "
            "Default due: hire date + 77 days (~11 weeks)."
        ),
        when=(
            "Invite User → Send Invite (always-on). "
            "Created on every invite send; not tied to a Step 2 requirement card. "
            "Default due: hire date + 77 days (~11 weeks)."
        ),
        task_title_template="3-month safety review for {name}",
        task_description_template=(
            f"{_INTRO}"
            f"{_ORIGIN_ALWAYS}"
            "Action required:\n"
            "Complete the 3-month safety review for this new hire. "
            "Confirm training status, review any incidents or observations, and document "
            "the outcome. Default target: about 10–11 weeks (77 days) after the hire date.\n\n"
            f"{_HIRE_DETAILS}"
        ),
        always_on=True,
        default_due_anchor="hire_date",
        default_due_in_days=77,
    ),
)

TRIGGER_BY_KEY = {t.key: t for t in AUTO_TASK_TRIGGERS}

ONBOARDING_FLAG_TO_TRIGGER = {
    "needs_email": "onboarding.needs_email",
    "needs_business_card": "onboarding.needs_business_card",
    "needs_phone": "onboarding.needs_phone",
    "needs_computer": "onboarding.needs_computer",
    "needs_vehicle": "onboarding.needs_vehicle",
    "needs_equipment": "onboarding.needs_equipment",
}

# Maps invite requirement note fields → trigger keys (per-card notes, not shared).
TRIGGER_KEY_TO_NOTE_FIELD = {
    "onboarding.needs_email": "email",
    "onboarding.needs_business_card": "business_card",
    "onboarding.needs_phone": "phone",
    "onboarding.needs_computer": "computer",
    "onboarding.needs_vehicle": "vehicle",
    "onboarding.needs_equipment": "equipment",
}

ALWAYS_ON_ONBOARDING_KEYS = [t.key for t in AUTO_TASK_TRIGGERS if t.always_on]


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
