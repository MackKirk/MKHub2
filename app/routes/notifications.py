from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from ..db import get_db
from ..models.models import Notification, User, Attendance, Project, EmployeeProfile
from ..auth.security import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/pending-attendance")
def get_pending_attendance_notifications(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Get pending attendance notifications for the current user (supervisor).
    These are notifications where a worker has a pending attendance that needs approval.
    """
    # Get all push notifications for this user with template_key "attendance_pending"
    notifications = db.query(Notification).filter(
        Notification.user_id == user.id,
        Notification.channel == "push",
        Notification.template_key == "attendance_pending",
        Notification.status.in_(["pending", "sent"])  # Include both pending and sent notifications
    ).order_by(Notification.created_at.desc()).limit(50).all()
    
    # Extract attendance data from notifications and verify they're still pending
    result = []
    for notif in notifications:
        payload = notif.payload_json or {}
        attendance_data = payload.get("attendance", {})
        attendance_id = attendance_data.get("id")
        
        if not attendance_id:
            continue
        
        # Verify attendance is still pending
        attendance = db.query(Attendance).filter(Attendance.id == attendance_id).first()
        if not attendance or attendance.status != "pending":
            continue
        
        # Get worker info
        worker = db.query(User).filter(User.id == attendance_data.get("worker_id")).first()
        worker_name = worker.username if worker else "Unknown"
        
        # Get project info
        project = None
        if attendance_data.get("project_id"):
            project = db.query(Project).filter(Project.id == attendance_data.get("project_id")).first()
        project_name = project.name if project else "Unknown Project"
        
        result.append({
            "id": str(notif.id),
            "notification_id": str(notif.id),
            "attendance_id": attendance_id,
            "worker_id": attendance_data.get("worker_id"),
            "worker_name": worker_name,
            "shift_id": attendance_data.get("shift_id"),
            "project_id": attendance_data.get("project_id"),
            "project_name": project_name,
            "type": attendance_data.get("type"),  # "in" or "out"
            "time_selected_utc": attendance_data.get("time_selected_utc"),
            "created_at": notif.created_at.isoformat() if notif.created_at else None,
        })
    
    return result


@router.get("")
def list_notifications(
    limit: Optional[int] = 50,
    unread_only: Optional[bool] = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    List notifications for the current user.
    Converts old format notifications to new format on-the-fly.
    """
    query = db.query(Notification).filter(Notification.user_id == user.id)
    
    notifications = query.order_by(Notification.created_at.desc()).limit(limit or 50).all()
    
    result = []
    for notif in notifications:
        payload = notif.payload_json or {}
        is_read = payload.get("read", False)
        
        if unread_only and is_read:
            continue
        
        # Convert old format to new format
        title = payload.get("title")
        message = payload.get("message")
        notif_type = payload.get("type", "default")
        link = payload.get("link")
        
        # If it's an old format notification (has template_key but no title/message)
        if not title and notif.template_key:
            # Convert based on template_key
            if notif.template_key.startswith("shift_"):
                shift_data = payload.get("shift", {})
                # Get shift_type from payload type or extract from template_key
                shift_type = payload.get("type")
                if not shift_type:
                    # Extract from template_key (e.g., "shift_created" -> "created")
                    shift_type = notif.template_key.replace("shift_", "") if notif.template_key.startswith("shift_") else "created"
                
                if shift_type == "created":
                    project_id = shift_data.get("project_id", "")
                    date_str = shift_data.get("date", "")
                    start_time = shift_data.get("start_time", "")
                    end_time = shift_data.get("end_time", "")
                    
                    # Get project name
                    project = None
                    if project_id:
                        project = db.query(Project).filter(Project.id == project_id).first()
                    project_name = project.name if project else "a project"
                    
                    title = "New Shift Assigned"
                    message = f"You have been assigned to work on {project_name}"
                    if date_str:
                        try:
                            date_obj = datetime.fromisoformat(date_str.split('T')[0])
                            date_formatted = date_obj.strftime("%B %d, %Y")
                            message += f" on {date_formatted}"
                        except:
                            pass
                    if start_time and end_time:
                        message += f" from {start_time} to {end_time}"
                    
                    notif_type = "shift"
                    link = "/schedule" if project_id else None
                    
                elif shift_type == "updated":
                    title = "Shift Updated"
                    message = "Your shift has been updated"
                    notif_type = "shift"
                    link = "/schedule" if project_id else None
                elif shift_type == "cancelled":
                    title = "Shift Cancelled"
                    message = "Your shift has been cancelled"
                    notif_type = "shift"
                    link = "/schedule" if project_id else None
                else:
                    title = "Shift Notification"
                    message = "You have a shift notification"
                    notif_type = "shift"
                    link = "/schedule" if project_id else None
                    
            elif notif.template_key.startswith("attendance_"):
                attendance_type = payload.get("type", notif.template_key.replace("attendance_", ""))
                if attendance_type == "approved":
                    title = "Attendance Approved"
                    message = "Your attendance has been approved"
                elif attendance_type == "rejected":
                    title = "Attendance Rejected"
                    message = "Your attendance has been rejected"
                elif attendance_type == "pending":
                    title = "Attendance Pending"
                    message = "You have a pending attendance request"
                else:
                    title = "Attendance Notification"
                    message = "You have an attendance notification"
                notif_type = "attendance"
            else:
                # Generic fallback
                title = "Notification"
                message = "You have a new notification"
        
        # If still no title/message, use defaults
        if not title:
            title = "Notification"
        if not message:
            message = "You have a new notification"
            
        result.append({
            "id": str(notif.id),
            "title": title,
            "message": message,
            "type": notif_type,
            "read": is_read,
            "created_at": notif.created_at.isoformat() if notif.created_at else None,
            "link": link,
            "metadata": payload.get("metadata") or payload,
        })
    
    return result


@router.get("/unread-count")
def get_unread_count(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Get count of unread notifications for the current user.
    """
    notifications = db.query(Notification).filter(Notification.user_id == user.id).all()
    
    unread_count = 0
    for notif in notifications:
        payload = notif.payload_json or {}
        # Old format notifications are considered unread if they don't have "read" field
        # New format notifications have explicit "read" field
        if not payload.get("read", False):
            unread_count += 1
    
    return {"count": unread_count}


@router.post("")
def create_notification(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Create a new notification.
    Required: user_id, title, message
    Optional: type, link, metadata
    """
    target_user_id = payload.get("user_id")
    if not target_user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    
    try:
        target_user_uuid = uuid.UUID(str(target_user_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id format")
    
    # Verify target user exists
    target_user = db.query(User).filter(User.id == target_user_uuid).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Target user not found")
    
    title = payload.get("title", "").strip()
    message = payload.get("message", "").strip()
    
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    if not message:
        raise HTTPException(status_code=400, detail="message is required")
    
    notification = Notification(
        user_id=target_user_uuid,
        channel="push",
        template_key=payload.get("type", "default"),
        payload_json={
            "title": title,
            "message": message,
            "type": payload.get("type", "default"),
            "link": payload.get("link"),
            "metadata": payload.get("metadata"),
            "read": False,
        },
        status="pending",
        created_at=datetime.now(timezone.utc),
    )
    
    db.add(notification)
    db.commit()
    db.refresh(notification)
    
    return {
        "id": str(notification.id),
        "user_id": str(notification.user_id),
        "title": title,
        "message": message,
        "type": payload.get("type", "default"),
        "read": False,
        "created_at": notification.created_at.isoformat() if notification.created_at else None,
    }


@router.post("/{notification_id}/read")
def mark_notification_as_read(
    notification_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Mark a notification as read.
    """
    try:
        notif_uuid = uuid.UUID(str(notification_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notification_id format")
    
    notification = db.query(Notification).filter(
        Notification.id == notif_uuid,
        Notification.user_id == user.id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    # Update read status in payload_json
    from sqlalchemy.orm.attributes import flag_modified
    
    payload = dict(notification.payload_json) if notification.payload_json else {}
    payload["read"] = True
    # Create a new dict to ensure SQLAlchemy detects the change
    notification.payload_json = dict(payload)
    # Force SQLAlchemy to detect the change in JSON field
    flag_modified(notification, "payload_json")
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update notification: {str(e)}")
    
    return {"success": True, "id": str(notification.id)}


@router.post("/mark-all-read")
def mark_all_as_read(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Mark all notifications as read for the current user.
    """
    from sqlalchemy.orm.attributes import flag_modified
    
    notifications = db.query(Notification).filter(Notification.user_id == user.id).all()
    
    updated_count = 0
    for notif in notifications:
        # Get current payload or create new dict
        payload = dict(notif.payload_json) if notif.payload_json else {}
        if not payload.get("read", False):
            payload["read"] = True
            # Create a new dict to ensure SQLAlchemy detects the change
            notif.payload_json = dict(payload)
            # Force SQLAlchemy to detect the change in JSON field
            flag_modified(notif, "payload_json")
            updated_count += 1
    
    if updated_count > 0:
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to update notifications: {str(e)}")
    
    return {"success": True, "updated_count": updated_count}


@router.delete("/cleanup-empty")
def cleanup_empty_notifications(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Delete notifications that have no useful information (old format without title/message).
    This is a cleanup endpoint to remove old test/empty notifications.
    """
    notifications = db.query(Notification).filter(Notification.user_id == user.id).all()
    
    deleted_count = 0
    for notif in notifications:
        payload = notif.payload_json or {}
        # Check if notification has no title/message and no useful template_key conversion
        has_title = bool(payload.get("title"))
        has_message = bool(payload.get("message"))
        has_template = bool(notif.template_key)
        
        # If it has neither title/message nor a template_key we can convert, delete it
        if not has_title and not has_message and not has_template:
            db.delete(notif)
            deleted_count += 1
    
    db.commit()
    
    return {"success": True, "deleted_count": deleted_count}


@router.post("/delete-multiple")
def delete_multiple_notifications(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Delete multiple notifications for the current user.
    """
    notification_ids = payload.get("notification_ids", [])
    if not notification_ids or not isinstance(notification_ids, list):
        raise HTTPException(status_code=400, detail="notification_ids must be a non-empty list")
    
    deleted_count = 0
    for notif_id_str in notification_ids:
        try:
            notif_uuid = uuid.UUID(str(notif_id_str))
        except Exception:
            continue  # Skip invalid UUIDs
        
        notification = db.query(Notification).filter(
            Notification.id == notif_uuid,
            Notification.user_id == user.id
        ).first()
        
        if notification:
            db.delete(notification)
            deleted_count += 1
    
    db.commit()
    
    return {"success": True, "deleted_count": deleted_count}


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Delete a notification for the current user.
    """
    try:
        notif_uuid = uuid.UUID(str(notification_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notification_id format")
    
    notification = db.query(Notification).filter(
        Notification.id == notif_uuid,
        Notification.user_id == user.id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    db.delete(notification)
    db.commit()
    
    return {"success": True, "id": str(notification_id)}

