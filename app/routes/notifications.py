from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone

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

