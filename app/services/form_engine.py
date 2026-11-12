"""
Shared Form Engine catalog: template categories, domain ACL helpers, and
Fieldwork file-policy constants (enforced in later PRs).

Domains:
  - Safety: inspection, follow_up
  - HR: employee_review
  - Fieldwork (R&M): site_assessment, work_report

Photo classification for R&M technical folders: Needs Classification is enforced
in Project Files (PR5) for images in FIELDWORK_TECHNICAL_PHOTO_FOLDER_NAMES that
lack a PhotoObservation. PhotoObservation remains the sole source of truth for
approved phrases; Files surfaces them as derived read-only metadata.
"""
from __future__ import annotations

from typing import Optional

# --- Template categories (FormTemplate.category) ---
INSPECTION_CATEGORY = "inspection"
FOLLOW_UP_CATEGORY = "follow_up"
EMPLOYEE_REVIEW_CATEGORY = "employee_review"
SITE_ASSESSMENT_CATEGORY = "site_assessment"
WORK_REPORT_CATEGORY = "work_report"

SAFETY_TEMPLATE_CATEGORIES = frozenset({INSPECTION_CATEGORY, FOLLOW_UP_CATEGORY})
FIELDWORK_TEMPLATE_CATEGORIES = frozenset({SITE_ASSESSMENT_CATEGORY, WORK_REPORT_CATEGORY})
ALL_TEMPLATE_CATEGORIES = SAFETY_TEMPLATE_CATEGORIES | {EMPLOYEE_REVIEW_CATEGORY} | FIELDWORK_TEMPLATE_CATEGORIES

# R&M Pictures folder names (see app.services.rm_pictures_folders)
FIELDWORK_TECHNICAL_PHOTO_FOLDER_NAMES = frozenset(
    {
        "Invoice Photos",
        "Unused Extra Invoicing Photos",
        "Proposal Photos",
        "Unused Extra Proposal Photos",
        "Photos for Additional Recommendations",
    }
)

# Future ClientFile / observation classification gate (PR1+)
FIELDWORK_CLASSIFICATION_NEEDS = "needs_classification"
FIELDWORK_CLASSIFICATION_CLASSIFIED = "classified"
FIELDWORK_PHOTO_ENTRY_OBSERVATION = "observation"
FIELDWORK_PHOTO_ENTRY_WORK_PERFORMED = "work_performed"

# Form Custom List domains (FormCustomList.domain)
LIST_DOMAIN_SHARED = "shared"
LIST_DOMAIN_SAFETY = "safety"
LIST_DOMAIN_EMPLOYEE_REVIEW = "employee_review"
LIST_DOMAIN_FIELDWORK = "fieldwork"
ALL_LIST_DOMAINS = frozenset(
    {
        LIST_DOMAIN_SHARED,
        LIST_DOMAIN_SAFETY,
        LIST_DOMAIN_EMPLOYEE_REVIEW,
        LIST_DOMAIN_FIELDWORK,
    }
)


def normalized_list_domain(raw: Optional[str]) -> str:
    d = (raw or LIST_DOMAIN_SHARED).strip().lower()
    if d not in ALL_LIST_DOMAINS:
        return LIST_DOMAIN_SHARED
    return d


def normalized_template_category(raw: Optional[str]) -> str:
    """Null/empty category is treated as inspection."""
    cat = (raw or "").strip().lower()
    if not cat:
        return INSPECTION_CATEGORY
    return cat


def is_inspection_like_category(raw: Optional[str]) -> bool:
    return normalized_template_category(raw) == INSPECTION_CATEGORY


def is_safety_template_category(raw: Optional[str]) -> bool:
    return normalized_template_category(raw) in SAFETY_TEMPLATE_CATEGORIES


def is_fieldwork_template_category(raw: Optional[str]) -> bool:
    return normalized_template_category(raw) in FIELDWORK_TEMPLATE_CATEGORIES


def is_employee_review_category(raw: Optional[str]) -> bool:
    return normalized_template_category(raw) == EMPLOYEE_REVIEW_CATEGORY


def domain_for_template_category(raw: Optional[str]) -> str:
    """Return safety | employee_review | fieldwork | unknown."""
    cat = normalized_template_category(raw)
    if cat in SAFETY_TEMPLATE_CATEGORIES:
        return "safety"
    if cat == EMPLOYEE_REVIEW_CATEGORY:
        return "employee_review"
    if cat in FIELDWORK_TEMPLATE_CATEGORIES:
        return "fieldwork"
    return "unknown"


def is_known_template_category(raw: Optional[str]) -> bool:
    return normalized_template_category(raw) in ALL_TEMPLATE_CATEGORIES
