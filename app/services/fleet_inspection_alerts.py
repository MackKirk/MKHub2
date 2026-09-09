"""Fleet inspection schedule approaching / overdue alerts."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Set

from sqlalchemy.orm import Session, joinedload

from ..auth.security import has_fleet_inspections_list_permission
from ..models.models import InspectionSchedule, InspectionScheduleAlertEvent, User
from .notifications import create_notification

APPROACHING_ALERT_DAYS = (7, 3, 1, 0)
OPEN_SCHEDULE_STATUSES = ("scheduled", "in_progress")


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _already_sent(db: Session, entity_id: uuid.UUID, alert_key: str) -> bool:
    return (
        db.query(InspectionScheduleAlertEvent.id)
        .filter(
            InspectionScheduleAlertEvent.entity_type == "inspection_schedule",
            InspectionScheduleAlertEvent.entity_id == entity_id,
            InspectionScheduleAlertEvent.alert_key == alert_key,
        )
        .first()
        is not None
    )


def _record_sent(db: Session, entity_id: uuid.UUID, alert_key: str) -> None:
    if _already_sent(db, entity_id, alert_key):
        return
    db.add(
        InspectionScheduleAlertEvent(
            entity_type="inspection_schedule",
            entity_id=entity_id,
            alert_key=alert_key,
        )
    )


def _notify_users(db: Session, user_ids: Set[uuid.UUID], template_key: str, payload: dict) -> None:
    for uid in user_ids:
        if not uid:
            continue
        try:
            create_notification(db, str(uid), "push", template_key, payload_json=payload)
        except Exception:
            pass


def _fleet_inspection_recipients(db: Session) -> Set[uuid.UUID]:
    """Admins + users with fleet inspections list/read permission."""
    ids: Set[uuid.UUID] = set()
    users = db.query(User).options(joinedload(User.roles)).filter(User.is_active.is_(True)).all()
    for user in users:
        role_names = {getattr(r, "name", "") for r in (user.roles or [])}
        if "admin" in role_names or has_fleet_inspections_list_permission(user):
            ids.add(user.id)
    return ids


def process_fleet_inspection_alerts(db: Session) -> int:
    """Send idempotent approaching/overdue alerts for open inspection schedules."""
    today = _today()
    recipients = _fleet_inspection_recipients(db)
    if not recipients:
        return 0

    schedules = (
        db.query(InspectionSchedule)
        .options(joinedload(InspectionSchedule.fleet_asset))
        .filter(InspectionSchedule.status.in_(OPEN_SCHEDULE_STATUSES))
        .all()
    )

    sent = 0
    for schedule in schedules:
        scheduled = schedule.scheduled_at
        if not scheduled:
            continue
        due_date = scheduled.date() if hasattr(scheduled, "date") else scheduled
        days_until = (due_date - today).days
        asset = schedule.fleet_asset
        asset_label = (
            (asset.name if asset and asset.name else None)
            or (asset.unit_number if asset and asset.unit_number else None)
            or "Fleet asset"
        )
        link = f"/fleet/inspections/{schedule.id}"

        if days_until < 0:
            # One alert per overdue day so recurring reminders continue after due date.
            key = f"overdue_{due_date.isoformat()}"
            if _already_sent(db, schedule.id, key):
                continue
            _record_sent(db, schedule.id, key)
            days_overdue = abs(days_until)
            msg = (
                f"Inspection for {asset_label} is overdue by {days_overdue} day"
                f"{'s' if days_overdue != 1 else ''}."
            )
            _notify_users(
                db,
                recipients,
                "fleet_inspection_overdue",
                {
                    "title": "Inspection overdue",
                    "message": msg,
                    "type": "fleet_inspection_overdue",
                    "link": link,
                    "schedule_id": str(schedule.id),
                    "fleet_asset_id": str(schedule.fleet_asset_id),
                },
            )
            sent += 1
            continue

        for threshold in APPROACHING_ALERT_DAYS:
            if days_until != threshold:
                continue
            key = f"approaching_{threshold}" if threshold > 0 else "due_0"
            if _already_sent(db, schedule.id, key):
                continue
            _record_sent(db, schedule.id, key)
            if threshold > 0:
                title = "Inspection due soon"
                msg = f"Inspection for {asset_label} is due in {threshold} day{'s' if threshold != 1 else ''}."
            else:
                title = "Inspection due today"
                msg = f"Inspection for {asset_label} is due today."
            _notify_users(
                db,
                recipients,
                "fleet_inspection_approaching",
                {
                    "title": title,
                    "message": msg,
                    "type": "fleet_inspection_approaching",
                    "link": link,
                    "schedule_id": str(schedule.id),
                    "fleet_asset_id": str(schedule.fleet_asset_id),
                },
            )
            sent += 1

    if sent:
        db.commit()
    return sent
