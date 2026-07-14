"""Record SPA page views for user activity (system_logs.category = page_view)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import uuid

from sqlalchemy.orm import Session

from ..models.models import SystemLog

PAGE_VIEW_CATEGORY = "page_view"
PAGE_VIEW_DEDUPE_MINUTES = 10

_EXACT_LABELS: Dict[str, str] = {
    "/home": "Home",
    "/overview": "Overview",
    "/profile": "Profile",
    "/schedule": "Schedule",
    "/clock-in-out": "Clock in / out",
    "/task-requests": "Task requests",
    "/tasks": "Tasks",
    "/customers": "Customers",
    "/customers/new": "New customer",
    "/inventory": "Inventory",
    "/inventory/suppliers": "Inventory · Suppliers",
    "/inventory/products": "Inventory · Products",
    "/proposals": "Proposals",
    "/proposals/new": "New proposal",
    "/quotes": "Quotes",
    "/quotes/new": "New quote",
    "/projects": "Projects",
    "/projects/new": "New project",
    "/opportunities": "Opportunities",
    "/rm-opportunities": "RM · Opportunities",
    "/rm-projects": "RM · Projects",
    "/rm-projects/new": "RM · New project",
    "/rm-business": "RM · Business dashboard",
    "/business": "Business dashboard",
    "/business/subcontractors": "Subcontractors",
    "/business/subcontractors/scan": "Subcontractors · Scan",
    "/settings": "Settings",
    "/company-files": "Company files",
    "/documents/create": "Document creator",
    "/log-hours": "Log hours",
    "/users": "Users",
    "/human-resources/overview": "HR · Data quality",
    "/human-resources/offboarding": "HR · Offboarding",
    "/settings/attendance": "Attendance",
    "/community": "Community",
    "/community/groups": "Community · Groups",
    "/community/insights": "Community · Insights",
    "/community/new-post": "Community · New post",
    "/reviews/admin": "Employee reviews · Admin",
    "/reviews/cycles": "Employee reviews · Cycles",
    "/reviews/form-templates": "Employee reviews · Form templates",
    "/reviews/compare": "Employee reviews · Compare",
    "/reviews/my": "My reviews",
    "/reviews/director-meetings": "Director meetings",
    "/safety/inspections": "Safety · Inspections",
    "/safety/calendar": "Safety · Calendar",
    "/safety/form-templates": "Safety · Form templates",
    "/safety/form-custom-lists": "Safety · Custom lists",
    "/fleet": "Fleet",
    "/fleet/assets": "Fleet · Assets",
    "/fleet/vehicles": "Fleet · Vehicles",
    "/fleet/heavy-machinery": "Fleet · Heavy machinery",
    "/fleet/other-assets": "Fleet · Other assets",
    "/fleet/assets/new": "Fleet · New asset",
    "/fleet/calendar": "Fleet · Calendar",
    "/fleet/work-orders": "Work orders",
    "/fleet/work-orders/new": "New work order",
    "/fleet/inspections": "Fleet · Inspections",
    "/fleet/inspections/new": "New inspection",
    "/company-assets/equipment": "Company assets · Equipment",
    "/company-assets/equipment/new": "New equipment",
    "/company-assets/credit-cards": "Company assets · Credit cards",
    "/company-assets/credit-cards/new": "New credit card",
    "/training": "Training",
    "/training/dashboard": "Training · Dashboard",
    "/training/admin": "Training · Admin",
    "/training/admin/new": "Training · New course",
    "/logs": "System logs",
    "/notifications": "Notifications",
}

_PREFIX_LABELS: tuple[tuple[str, str], ...] = (
    ("/customers/", "Customer"),
    ("/projects/", "Project"),
    ("/opportunities/", "Opportunity"),
    ("/rm-opportunities/", "RM · Opportunity"),
    ("/rm-projects/", "RM · Project"),
    ("/proposals/", "Proposal"),
    ("/quotes/", "Quote"),
    ("/users/", "User profile"),
    ("/human-resources/offboarding/", "Offboarding case"),
    ("/community/posts/", "Community · Edit post"),
    ("/reviews/cycles/", "Review cycle"),
    ("/reviews/form-templates/", "Review form template"),
    ("/safety/sign/", "Safety · Sign inspection"),
    ("/safety/form-templates/", "Safety form template"),
    ("/fleet/assets/", "Fleet asset"),
    ("/fleet/work-orders/", "Work order"),
    ("/fleet/inspections/", "Fleet inspection"),
    ("/company-assets/equipment/", "Equipment"),
    ("/company-assets/credit-cards/", "Credit card"),
    ("/training/admin/", "Training course edit"),
    ("/training/", "Training course"),
    ("/documents/create/", "Document creator"),
    ("/business/subcontractors/companies/", "Subcontractor company"),
    ("/business/subcontractors/workers/", "Subcontractor worker"),
)


def normalize_page_view_path(path: str) -> Optional[str]:
    raw = (path or "").strip()
    if not raw or not raw.startswith("/"):
        return None
    if len(raw) > 512:
        raw = raw[:512]
    if raw != "/" and raw.endswith("/"):
        raw = raw.rstrip("/")
    return raw


def page_view_label(path: str) -> str:
    normalized = normalize_page_view_path(path) or path
    if normalized in _EXACT_LABELS:
        return _EXACT_LABELS[normalized]
    for prefix, label in _PREFIX_LABELS:
        if normalized.startswith(prefix):
            return label
    segment = normalized.strip("/").split("/")[0] if normalized else "Page"
    return segment.replace("-", " ").title() if segment else "Page"


def page_view_module(path: str) -> str:
    normalized = normalize_page_view_path(path) or path
    parts = [p for p in normalized.strip("/").split("/") if p]
    return parts[0] if parts else "app"


def _recent_duplicate(db: Session, user_id: uuid.UUID, path: str) -> bool:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=PAGE_VIEW_DEDUPE_MINUTES)
    return (
        db.query(SystemLog.id)
        .filter(
            SystemLog.user_id == user_id,
            SystemLog.category == PAGE_VIEW_CATEGORY,
            SystemLog.path == path,
            SystemLog.timestamp_utc >= cutoff,
        )
        .first()
        is not None
    )


def record_user_page_view(db: Session, user_id: uuid.UUID, path: str) -> Dict[str, Any]:
    """Append a page view unless the same path was logged within the dedupe window."""
    normalized = normalize_page_view_path(path)
    if not normalized:
        return {"recorded": False, "reason": "invalid_path"}

    if _recent_duplicate(db, user_id, normalized):
        return {"recorded": False, "reason": "deduped"}

    label = page_view_label(normalized)
    entry = SystemLog(
        level="info",
        category=PAGE_VIEW_CATEGORY,
        message=label,
        path=normalized,
        method="GET",
        user_id=user_id,
        extra={"module": page_view_module(normalized)},
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {
        "recorded": True,
        "id": str(entry.id),
        "path": normalized,
        "label": label,
    }


def page_view_row_to_dict(row: SystemLog) -> Dict[str, Any]:
    extra = row.extra if isinstance(row.extra, dict) else {}
    return {
        "id": str(row.id),
        "timestamp_utc": row.timestamp_utc.isoformat() if row.timestamp_utc else "",
        "title": row.message or page_view_label(row.path or ""),
        "path": row.path,
        "module": extra.get("module"),
    }
