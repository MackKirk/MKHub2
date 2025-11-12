"""
Notification service for push and email.
Respects user preferences and quiet hours.
"""
from datetime import datetime, time
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
import pytz

from ..models.models import Notification, UserNotificationPreference, User
from ..config import settings


def is_quiet_hours(user_pref: Optional[Dict], timezone_str: str = "America/Vancouver") -> bool:
    """
    Check if current time is within user's quiet hours.
    
    Args:
        user_pref: User notification preferences dict
        timezone_str: User's timezone
    
    Returns:
        True if within quiet hours
    """
    if not user_pref or not user_pref.get("quiet_hours"):
        return False
    
    quiet_hours = user_pref.get("quiet_hours", {})
    if not quiet_hours.get("start") or not quiet_hours.get("end"):
        return False
    
    try:
        tz = pytz.timezone(quiet_hours.get("timezone", timezone_str))
        now = datetime.now(tz)
        current_time = now.time()
        
        start_str = quiet_hours["start"]
        end_str = quiet_hours["end"]
        
        start_time = time.fromisoformat(start_str)
        end_time = time.fromisoformat(end_str)
        
        # Handle quiet hours that span midnight
        if start_time <= end_time:
            return start_time <= current_time <= end_time
        else:
            return current_time >= start_time or current_time <= end_time
    except Exception:
        return False


def should_send_notification(
    db: Session,
    user_id: str,
    channel: str,  # "push" or "email"
    timezone_str: str = "America/Vancouver"
) -> bool:
    """
    Check if notification should be sent based on user preferences and quiet hours.
    
    Args:
        db: Database session
        user_id: User ID
        channel: Notification channel (push|email)
        timezone_str: User's timezone
    
    Returns:
        True if notification should be sent
    """
    # Check if channel is enabled globally
    if channel == "push" and not settings.enable_push:
        return False
    if channel == "email" and not settings.enable_email:
        return False
    
    # Get user preferences
    user_pref = db.query(UserNotificationPreference).filter(
        UserNotificationPreference.user_id == user_id
    ).first()
    
    if user_pref:
        # Check channel preference
        if channel == "push" and not user_pref.push:
            return False
        if channel == "email" and not user_pref.email:
            return False
        
        # Check quiet hours
        if is_quiet_hours({"quiet_hours": user_pref.quiet_hours}, timezone_str):
            return False
    
    return True


def create_notification(
    db: Session,
    user_id: str,
    channel: str,
    template_key: Optional[str] = None,
    payload_json: Optional[Dict] = None,
    timezone_str: str = "America/Vancouver"
) -> Optional[Notification]:
    """
    Create a notification record.
    Only creates if user preferences allow it.
    
    Args:
        db: Database session
        user_id: User ID
        channel: Notification channel (push|email)
        template_key: Template identifier
        payload_json: Notification payload
        timezone_str: User's timezone
    
    Returns:
        Notification object if created, None if skipped
    """
    if not should_send_notification(db, user_id, channel, timezone_str):
        return None
    
    notification = Notification(
        user_id=user_id,
        channel=channel,
        template_key=template_key,
        payload_json=payload_json,
        status="pending"
    )
    
    db.add(notification)
    db.commit()
    db.refresh(notification)
    
    # TODO: Actually send the notification via push service or email service
    # For now, we just create the record
    
    return notification


def send_shift_notification(
    db: Session,
    user_id: str,
    notification_type: str,  # "created"|"updated"|"cancelled"|"reminder"
    shift_data: Dict,
    timezone_str: str = "America/Vancouver"
):
    """
    Send notification about shift changes.
    
    Args:
        db: Database session
        user_id: User ID to notify
        notification_type: Type of notification
        shift_data: Shift data for notification
        timezone_str: User's timezone
    """
    template_key = f"shift_{notification_type}"
    payload = {
        "type": notification_type,
        "shift": shift_data,
    }
    
    # Send push notification
    create_notification(db, user_id, "push", template_key, payload, timezone_str)
    
    # Send email notification
    create_notification(db, user_id, "email", template_key, payload, timezone_str)


def send_attendance_notification(
    db: Session,
    user_id: str,
    notification_type: str,  # "approved"|"rejected"|"pending"
    attendance_data: Dict,
    timezone_str: str = "America/Vancouver"
):
    """
    Send notification about attendance status changes.
    
    Args:
        db: Database session
        user_id: User ID to notify
        notification_type: Type of notification
        attendance_data: Attendance data for notification
        timezone_str: User's timezone
    """
    template_key = f"attendance_{notification_type}"
    payload = {
        "type": notification_type,
        "attendance": attendance_data,
    }
    
    # Send push notification
    create_notification(db, user_id, "push", template_key, payload, timezone_str)
    
    # Send email notification
    create_notification(db, user_id, "email", template_key, payload, timezone_str)


