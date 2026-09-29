"""Follow-up reminders for open opportunities.

Sent to Customer: one reminder at 30, 60, and 90 days from the first time
that status was set. If several milestones are due at once, only the latest
is notified and the earlier keys are recorded so they do not fire later.

Prospecting: one reminder after 30 days in the current status.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Optional, Set

import pytz
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from ..models.models import OpportunityAlertEvent, Project
from ..services.business_line import BUSINESS_LINE_REPAIRS_MAINTENANCE
from ..services.notifications import create_notification

COMPANY_TZ = "America/Vancouver"
SENT_LABEL = "sent to customer"
PROSPECTING_LABEL = "prospecting"
SENT_MILESTONES = (30, 60, 90)
PROSPECTING_DAYS = 30


def _norm_label(label: Optional[str]) -> str:
    return (label or "").strip().lower()


def unsent_sent_milestones(days: int, already: Set[str]) -> list[int]:
    """Milestones that are due and have not been recorded yet, ascending."""
    return [n for n in SENT_MILESTONES if days >= n and f"sent_{n}" not in already]


def prospecting_reminder_due(days: int, already: Set[str]) -> bool:
    return days >= PROSPECTING_DAYS and "prospecting_30" not in already


def _local_date(value: datetime) -> date:
    tz = pytz.timezone(COMPANY_TZ)
    if value.tzinfo is None:
        value = pytz.utc.localize(value)
    return value.astimezone(tz).date()


def _today() -> date:
    return datetime.now(pytz.timezone(COMPANY_TZ)).date()


def _days_since(anchor: datetime, today: date) -> int:
    return (today - _local_date(anchor)).days


def _as_uuid(value) -> Optional[uuid.UUID]:
    if not value:
        return None
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


def _recipients(project: Project) -> Set[uuid.UUID]:
    ids: Set[uuid.UUID] = set()
    creator = _as_uuid(getattr(project, "created_by_user_id", None))
    if creator:
        ids.add(creator)
    estimator_ids = getattr(project, "estimator_ids", None) or []
    if isinstance(estimator_ids, list) and len(estimator_ids) > 0:
        for raw in estimator_ids:
            parsed = _as_uuid(raw)
            if parsed:
                ids.add(parsed)
    else:
        estimator = _as_uuid(getattr(project, "estimator_id", None))
        if estimator:
            ids.add(estimator)
    return ids


def _opportunity_link(project: Project) -> str:
    line = getattr(project, "business_line", None) or ""
    prefix = "/rm-opportunities" if line == BUSINESS_LINE_REPAIRS_MAINTENANCE else "/opportunities"
    return f"{prefix}/{project.id}"


def _display_name(project: Project) -> str:
    name = (getattr(project, "name", None) or "").strip()
    if name:
        return name
    code = (getattr(project, "code", None) or "").strip()
    return code or "This opportunity"


def sent_reminder_copy(name: str, days: int) -> tuple[str, str]:
    return (
        "Bid pricing follow-up",
        (
            f"{name} has been with the client for {days} days and the price is no longer held. "
            "Follow up so pricing can be revised if the work is still going ahead."
        ),
    )


def prospecting_reminder_copy(name: str) -> tuple[str, str]:
    return (
        "Prospecting follow-up",
        f"{name} has been in Prospecting for {PROSPECTING_DAYS} days.",
    )


def _already(sent_keys: Set[tuple], project_id: uuid.UUID) -> Set[str]:
    return {key for pid, key in sent_keys if pid == project_id}


def _record(db: Session, project_id: uuid.UUID, alert_key: str, sent_keys: Set[tuple]) -> None:
    if (project_id, alert_key) in sent_keys:
        return
    db.add(
        OpportunityAlertEvent(
            project_id=project_id,
            alert_key=alert_key,
            sent_at=datetime.now(timezone.utc),
        )
    )
    sent_keys.add((project_id, alert_key))


def _notify(db: Session, project: Project, title: str, message: str) -> int:
    recipients = _recipients(project)
    if not recipients:
        return 0
    payload = {
        "title": title,
        "message": message,
        "type": "opportunity",
        "link": _opportunity_link(project),
        "metadata": {"project_id": str(project.id)},
    }
    sent = 0
    for uid in recipients:
        try:
            created = create_notification(db, str(uid), "push", "opportunity_follow_up", payload_json=payload)
            if created is not None:
                sent += 1
        except Exception:
            pass
    return sent


def process_opportunity_alerts(db: Session) -> int:
    """Send due opportunity reminders. Returns how many notifications were created."""
    today = _today()
    label = func.lower(func.trim(Project.status_label))
    projects = (
        db.query(Project)
        .filter(
            Project.is_bidding.is_(True),
            Project.deleted_at.is_(None),
            or_(
                and_(label == SENT_LABEL, Project.sent_to_customer_at.isnot(None)),
                and_(label == PROSPECTING_LABEL, Project.status_changed_at.isnot(None)),
            ),
        )
        .all()
    )
    if not projects:
        return 0

    rows = (
        db.query(OpportunityAlertEvent.project_id, OpportunityAlertEvent.alert_key)
        .filter(OpportunityAlertEvent.project_id.in_([p.id for p in projects]))
        .all()
    )
    sent_keys = {(row.project_id, row.alert_key) for row in rows}
    created = 0

    for project in projects:
        status = _norm_label(getattr(project, "status_label", None))
        if status == SENT_LABEL and getattr(project, "sent_to_customer_at", None):
            days = _days_since(project.sent_to_customer_at, today)
            due = unsent_sent_milestones(days, _already(sent_keys, project.id))
            if not due:
                continue
            for milestone in due:
                _record(db, project.id, f"sent_{milestone}", sent_keys)
            title, message = sent_reminder_copy(_display_name(project), max(due))
            created += _notify(db, project, title, message)
            continue

        if status == PROSPECTING_LABEL and getattr(project, "status_changed_at", None):
            days = _days_since(project.status_changed_at, today)
            if not prospecting_reminder_due(days, _already(sent_keys, project.id)):
                continue
            _record(db, project.id, "prospecting_30", sent_keys)
            title, message = prospecting_reminder_copy(_display_name(project))
            created += _notify(db, project, title, message)

    db.commit()
    return created
