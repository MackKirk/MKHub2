"""6 PM reminder for workers who have not logged hours today."""
from __future__ import annotations

from datetime import datetime, time, timedelta

import pytz
import structlog
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from ..config import settings
from ..models.models import Attendance, DevicePushToken, HoursReminderEvent, User
from ..services.expo_push import send_expo_push
from ..services.notifications import should_send_notification
from ..services.time_rules import local_to_utc

logger = structlog.get_logger()

REMINDER_HOUR = 18
TITLE = "Log your hours"
BODY = "It's 6 PM — don't forget to log today's hours in MK Hub."


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


def process_hours_reminders(db: Session, *, force: bool = False) -> int:
    """Send a 6 PM hours reminder to mobile users who have not logged today."""
    if not settings.enable_push:
        return 0

    now = _company_now()
    if not force and not is_reminder_window(now):
        return 0

    local_date = now.date()
    tokens = (
        db.query(DevicePushToken, User)
        .join(User, User.id == DevicePushToken.user_id)
        .filter(User.is_active.is_(True))
        .all()
    )
    if not tokens:
        return 0

    already_sent = {
        row.user_id
        for row in db.query(HoursReminderEvent.user_id)
        .filter(HoursReminderEvent.reminder_date == local_date)
        .all()
    }

    sent = 0
    stale_tokens: list[str] = []
    grouped: dict = {}
    for device, user in tokens:
        if user.status and str(user.status).lower() not in ("active", ""):
            continue
        grouped.setdefault(user.id, {"user": user, "tokens": []})
        grouped[user.id]["tokens"].append(device.token)

    for user_id, bundle in grouped.items():
        try:
            if user_id in already_sent:
                continue
            if not should_send_notification(db, user_id, "push", settings.tz_default):
                continue
            if user_logged_hours_on(db, user_id, local_date):
                continue

            stale = send_expo_push(
                bundle["tokens"],
                title=TITLE,
                body=BODY,
                data={"screen": "Clock", "type": "hours_reminder"},
            )
            stale_tokens.extend(stale)
            db.add(
                HoursReminderEvent(
                    user_id=user_id,
                    reminder_date=local_date,
                )
            )
            sent += 1
        except Exception as exc:
            logger.warning(
                "hours_reminder_user_failed",
                user_id=str(user_id),
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
