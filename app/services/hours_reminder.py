"""6 PM reminder for workers who have not logged hours today."""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

import pytz
import structlog
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from ..config import settings
from ..models.models import Attendance, DevicePushToken, EmployeeProfile, HoursReminderEvent, Notification, User
from ..services.expo_push import send_expo_push
from ..services.hours_registration import employee_should_register_hours
from ..services.notifications import should_send_notification
from ..services.time_rules import local_to_utc

logger = structlog.get_logger()

REMINDER_HOUR = 18
TITLE = "Log your hours"
BODY = "It's 6 PM — don't forget to log today's hours in MK Hub."
BLAIR_USERNAME = "bbennett"
BLAIR_TITLE = "Blair, have you logged your hours today?"
HOURS_LINK = "/home?open=hours"


def hours_reminder_copy(username: str | None) -> tuple[str, str]:
    if (username or "").strip().lower() == BLAIR_USERNAME:
        return BLAIR_TITLE, BODY
    return TITLE, BODY


def _company_now() -> datetime:
    tz = pytz.timezone(settings.tz_default)
    return datetime.now(tz)


def is_weekday(local_dt: datetime) -> bool:
    return local_dt.weekday() < 5


def is_reminder_window(local_dt: datetime) -> bool:
    return is_weekday(local_dt) and local_dt.hour == REMINDER_HOUR


def user_logged_hours_on(db: Session, user_id, local_date) -> bool:
    date_start = local_to_utc(datetime.combine(local_date, time.min), settings.tz_default)
    date_end = local_to_utc(
        datetime.combine(local_date + timedelta(days=1), time.min),
        settings.tz_default,
    )
    row = (
        db.query(Attendance.id)
        .filter(
            Attendance.worker_id == user_id,
            Attendance.status != "rejected",
            or_(
                and_(
                    Attendance.clock_in_time.isnot(None),
                    Attendance.clock_in_time >= date_start,
                    Attendance.clock_in_time < date_end,
                ),
                and_(
                    Attendance.clock_out_time.isnot(None),
                    Attendance.clock_out_time >= date_start,
                    Attendance.clock_out_time < date_end,
                ),
            ),
        )
        .first()
    )
    return row is not None


def hours_reminder_payload(username: str | None, reminder_date) -> dict:
    title, body = hours_reminder_copy(username)
    return {
        "title": title,
        "message": body,
        "type": "hours_reminder",
        "link": HOURS_LINK,
        "read": False,
        "metadata": {"reminder_date": reminder_date.isoformat()},
    }


def process_hours_reminders(db: Session, *, force: bool = False) -> int:
    """6 PM reminder for people who must log hours and have not logged today.

    Writes the web bell item for every eligible user. Phone push is extra, and
    only when that user has a device token.
    """
    now = _company_now()
    if not force and not is_reminder_window(now):
        return 0

    local_date = now.date()
    users = db.query(User).filter(User.is_active.is_(True)).all()
    if not users:
        return 0

    user_ids = [user.id for user in users]
    tokens_by_user: dict = {}
    for device in db.query(DevicePushToken).filter(DevicePushToken.user_id.in_(user_ids)).all():
        tokens_by_user.setdefault(device.user_id, []).append(device.token)

    already_sent = {
        row.user_id
        for row in db.query(HoursReminderEvent.user_id)
        .filter(HoursReminderEvent.reminder_date == local_date)
        .all()
    }

    profiles = {
        row.user_id: row
        for row in db.query(EmployeeProfile)
        .filter(EmployeeProfile.user_id.in_(user_ids))
        .all()
    }

    sent = 0
    stale_tokens: list[str] = []
    for user in users:
        try:
            if user.status and str(user.status).lower() not in ("active", ""):
                continue
            if user.id in already_sent:
                continue
            if not employee_should_register_hours(profile=profiles.get(user.id)):
                continue
            if user_logged_hours_on(db, user.id, local_date):
                continue

            title, body = hours_reminder_copy(user.username)
            db.add(
                Notification(
                    user_id=user.id,
                    channel="push",
                    template_key="hours_reminder",
                    payload_json=hours_reminder_payload(user.username, local_date),
                    status="sent",
                    created_at=datetime.now(timezone.utc),
                )
            )
            tokens = tokens_by_user.get(user.id) or []
            if tokens and settings.enable_push and should_send_notification(db, user.id, "push", settings.tz_default):
                stale = send_expo_push(
                    tokens,
                    title=title,
                    body=body,
                    data={"screen": "Clock", "type": "hours_reminder"},
                )
                stale_tokens.extend(stale)
            db.add(
                HoursReminderEvent(
                    user_id=user.id,
                    reminder_date=local_date,
                )
            )
            sent += 1
        except Exception as exc:
            logger.warning(
                "hours_reminder_user_failed",
                user_id=str(user.id),
                error=str(exc),
            )

    if stale_tokens:
        db.query(DevicePushToken).filter(DevicePushToken.token.in_(stale_tokens)).delete(
            synchronize_session=False
        )

    if sent or stale_tokens:
        db.commit()
        logger.info("hours_reminders_processed", sent=sent, stale_tokens=len(stale_tokens))
    return sent
