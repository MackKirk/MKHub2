"""Rules for when a worker may edit their own attendance hours."""
from __future__ import annotations

from typing import Any

from ..auth.security import _has_permission
from ..models.models import Attendance, User

HR_LOCK_MESSAGE = (
    "These hours were approved by HR and can no longer be edited. "
    "Please ask HR to make any changes."
)


def has_hr_attendance_write(user: User) -> bool:
    return (
        _has_permission(user, "users:write")
        or _has_permission(user, "hr:attendance:write")
        or _has_permission(user, "hr:users:edit:timesheet")
    )


def worker_can_edit_attendance(attendance: Attendance, user: User) -> bool:
    """Workers can edit their own hours until HR (someone else) approves/locks them."""
    if has_hr_attendance_write(user):
        return True
    if str(attendance.worker_id) != str(user.id):
        return False
    status = (getattr(attendance, "status", None) or "").strip().lower()
    approved_by = getattr(attendance, "approved_by", None)
    if status == "approved" and approved_by and str(approved_by) != str(user.id):
        return False
    return True


def attendance_edit_fields(attendance: Attendance, user: User) -> dict[str, Any]:
    return {
        "approved_by": str(attendance.approved_by) if attendance.approved_by else None,
        "can_edit": worker_can_edit_attendance(attendance, user),
    }
