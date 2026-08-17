"""Granular System Settings permissions."""
from __future__ import annotations

from typing import Literal

from ..models.models import User
from .security import _get_user_permission_map, _has_permission, _legacy_full_settings_access, _user_is_admin

SETTINGS_ACCESS = "settings:access"

LOOKUP_LISTS_READ = "settings:lookup_lists:read"
LOOKUP_LISTS_WRITE = "settings:lookup_lists:write"
FILES_ASSETS_READ = "settings:files_assets:read"
FILES_ASSETS_WRITE = "settings:files_assets:write"
PERMISSION_TEMPLATES_READ = "settings:permission_templates:read"
PERMISSION_TEMPLATES_WRITE = "settings:permission_templates:write"
TERMS_TEMPLATES_READ = "settings:terms_templates:read"
TERMS_TEMPLATES_WRITE = "settings:terms_templates:write"
DOCUMENT_BACKGROUNDS_READ = "settings:document_backgrounds:read"
DOCUMENT_BACKGROUNDS_WRITE = "settings:document_backgrounds:write"
DOCUMENT_TEMPLATES_READ = "settings:document_templates:read"
DOCUMENT_TEMPLATES_WRITE = "settings:document_templates:write"
AUTO_TASKS_READ = "settings:auto_tasks:read"
AUTO_TASKS_WRITE = "settings:auto_tasks:write"

# Lists managed under Files & assets tab (SettingsFilesAssetsPanel).
FILES_ASSETS_LIST_NAMES = frozenset(
    {
        "departments",
        "standard_file_categories",
        "organization_logos",
        "certificate_backgrounds",
    }
)

# Lists excluded from Lookup lists panel (SettingsLookupListsPanel EXCLUDED_LISTS).
LOOKUP_LISTS_EXCLUDED = frozenset(
    {
        "google_places_api_key",
        "terms-templates",
        "branding",
        "departments",
        "standard_file_categories",
        "organization_logos",
        "certificate_backgrounds",
    }
)

TERMS_TEMPLATES_LIST_NAME = "terms-templates"

# Lookup lists exposed in GET /settings for business dropdowns (not full Settings admin).
DROPDOWN_SETTINGS_LIST_NAMES = frozenset(
    {
        "client_types",
        "client_statuses",
        "payment_terms",
        "divisions",
        "project_statuses",
        "lead_sources",
        "report_categories",
        "timesheet",
    }
)

SETTINGS_CHILD_READ_KEYS = frozenset(
    {
        LOOKUP_LISTS_READ,
        FILES_ASSETS_READ,
        PERMISSION_TEMPLATES_READ,
        TERMS_TEMPLATES_READ,
        DOCUMENT_BACKGROUNDS_READ,
        DOCUMENT_TEMPLATES_READ,
        AUTO_TASKS_READ,
    }
)

SETTINGS_CHILD_WRITE_KEYS = frozenset(
    {
        LOOKUP_LISTS_WRITE,
        FILES_ASSETS_WRITE,
        PERMISSION_TEMPLATES_WRITE,
        TERMS_TEMPLATES_WRITE,
        DOCUMENT_BACKGROUNDS_WRITE,
        DOCUMENT_TEMPLATES_WRITE,
        AUTO_TASKS_WRITE,
    }
)

SETTINGS_CHILD_KEYS = SETTINGS_CHILD_READ_KEYS | SETTINGS_CHILD_WRITE_KEYS


def has_settings_access(user: User) -> bool:
    """Legacy helper only. Runtime authorization should use granular settings:* keys."""
    if _user_is_admin(user):
        return True
    return _legacy_full_settings_access(_get_user_permission_map(user))


def has_any_settings_permission(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return any(_has_permission(user, key) for key in SETTINGS_CHILD_KEYS)


def can_read_lookup_lists(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return (
        _has_permission(user, LOOKUP_LISTS_READ)
        or _has_permission(user, LOOKUP_LISTS_WRITE)
    )


def can_write_lookup_lists(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return _has_permission(user, LOOKUP_LISTS_WRITE)


def can_read_files_assets(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return (
        _has_permission(user, FILES_ASSETS_READ)
        or _has_permission(user, FILES_ASSETS_WRITE)
    )


def can_write_files_assets(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return _has_permission(user, FILES_ASSETS_WRITE)


def can_read_permission_templates(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return (
        _has_permission(user, PERMISSION_TEMPLATES_READ)
        or _has_permission(user, PERMISSION_TEMPLATES_WRITE)
    )


def can_write_permission_templates(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return _has_permission(user, PERMISSION_TEMPLATES_WRITE)


def can_read_terms_templates(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return (
        _has_permission(user, TERMS_TEMPLATES_READ)
        or _has_permission(user, TERMS_TEMPLATES_WRITE)
    )


def can_write_terms_templates(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return _has_permission(user, TERMS_TEMPLATES_WRITE)


def can_read_document_backgrounds(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return (
        _has_permission(user, DOCUMENT_BACKGROUNDS_READ)
        or _has_permission(user, DOCUMENT_BACKGROUNDS_WRITE)
    )


def can_write_document_backgrounds(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return _has_permission(user, DOCUMENT_BACKGROUNDS_WRITE)


def can_read_document_templates(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return (
        _has_permission(user, DOCUMENT_TEMPLATES_READ)
        or _has_permission(user, DOCUMENT_TEMPLATES_WRITE)
    )


def can_write_document_templates(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return _has_permission(user, DOCUMENT_TEMPLATES_WRITE)


def can_read_auto_tasks(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return (
        _has_permission(user, AUTO_TASKS_READ)
        or _has_permission(user, AUTO_TASKS_WRITE)
    )


def can_write_auto_tasks(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return _has_permission(user, AUTO_TASKS_WRITE)


def _list_area(list_name: str) -> Literal["lookup", "files", "terms", "unknown"]:
    if list_name == TERMS_TEMPLATES_LIST_NAME:
        return "terms"
    if list_name in FILES_ASSETS_LIST_NAMES:
        return "files"
    if list_name in LOOKUP_LISTS_EXCLUDED:
        return "unknown"
    return "lookup"


def can_read_setting_list(user: User, list_name: str) -> bool:
    area = _list_area(list_name)
    if area == "lookup":
        return can_read_lookup_lists(user)
    if area == "files":
        return can_read_files_assets(user)
    if area == "terms":
        return can_read_terms_templates(user)
    return False


def can_read_list_in_settings_bundle(user: User, list_name: str) -> bool:
    """Whether a list may appear in GET /settings (admin lists or app dropdown subsets)."""
    if can_read_setting_list(user, list_name):
        return True
    if list_name not in DROPDOWN_SETTINGS_LIST_NAMES:
        return False
    if list_name == "timesheet":
        return (
            _has_permission(user, "hr:users:edit:timesheet")
            or _has_permission(user, "hr:users:view:timesheet")
            or _has_permission(user, "hr:attendance:write")
            or _has_permission(user, "hr:attendance:read")
        )
    return (
        _has_permission(user, "business:customers:read")
        or _has_permission(user, "business:projects:read")
    )


def _has_timesheet_hr_exception(user: User, list_name: str, label: str | None = None) -> bool:
    if list_name != "timesheet":
        return False
    if label == "break_eligible_employees":
        return (
            _has_permission(user, "hr:users:edit:timesheet")
            or _has_permission(user, "hr:attendance:write")
        )
    return False


def can_write_setting_list(
    user: User,
    list_name: str,
    label: str | None = None,
) -> bool:
    if _user_is_admin(user):
        return True
    if _has_timesheet_hr_exception(user, list_name, label):
        return True

    area = _list_area(list_name)
    if area == "lookup":
        return can_write_lookup_lists(user)
    if area == "files":
        return can_write_files_assets(user)
    if area == "terms":
        return can_write_terms_templates(user)
    return False


def settings_permissions_payload(user: User) -> dict[str, bool]:
    can_view_lookup = can_read_lookup_lists(user)
    can_edit_lookup = can_write_lookup_lists(user)
    can_view_files = can_read_files_assets(user)
    can_edit_files = can_write_files_assets(user)
    can_view_permission_templates_card = can_read_permission_templates(user)
    can_edit_permission_templates_card = can_write_permission_templates(user)
    can_view_terms_card = can_read_terms_templates(user)
    can_edit_terms_card = can_write_terms_templates(user)
    can_view_backgrounds_card = can_read_document_backgrounds(user)
    can_edit_backgrounds_card = can_write_document_backgrounds(user)
    can_view_document_templates_card = can_read_document_templates(user)
    can_edit_document_templates_card = can_write_document_templates(user)
    can_view_auto_tasks = can_read_auto_tasks(user)
    can_edit_auto_tasks = can_write_auto_tasks(user)
    can_view_templates_tab = any(
        (
            can_view_permission_templates_card,
            can_view_terms_card,
            can_view_backgrounds_card,
            can_view_document_templates_card,
        )
    )
    return {
        "can_access_settings": can_view_lookup or can_view_files or can_view_templates_tab or can_view_auto_tasks,
        "has_legacy_full_settings_access": False,
        "can_view_lookup_lists": can_view_lookup,
        "can_edit_lookup_lists": can_edit_lookup,
        "can_view_files_assets": can_view_files,
        "can_edit_files_assets": can_edit_files,
        "can_view_permission_templates": can_view_permission_templates_card,
        "can_edit_permission_templates": can_edit_permission_templates_card,
        "can_view_terms_templates": can_view_terms_card,
        "can_edit_terms_templates": can_edit_terms_card,
        "can_view_document_backgrounds": can_view_backgrounds_card,
        "can_edit_document_backgrounds": can_edit_backgrounds_card,
        "can_view_document_templates": can_view_document_templates_card,
        "can_edit_document_templates": can_edit_document_templates_card,
        "can_view_templates_tab": can_view_templates_tab,
        "can_view_auto_tasks": can_view_auto_tasks,
        "can_edit_auto_tasks": can_edit_auto_tasks,
    }
