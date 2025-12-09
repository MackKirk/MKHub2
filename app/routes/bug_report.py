import json
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth.security import get_current_user
from ..db import get_db
from ..models.models import EmployeeProfile, SettingItem, TaskItem, User
from ..services.task_service import get_user_display

router = APIRouter(prefix="/bug-report", tags=["bug-report"])


class BugReportRequest(BaseModel):
    title: str
    description: str
    severity: str  # Low, Medium, High
    page_url: str
    user_agent: str
    screen: Dict[str, int]  # {width: int, height: int}


@router.get("/debug/division")
def debug_user_division(
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Debug endpoint to check user's division"""
    # Check user.divisions (many-to-many relationship)
    user_divisions_from_relationship = []
    if hasattr(me, 'divisions') and me.divisions:
        user_divisions_from_relationship = [{"id": str(d.id), "label": d.label, "value": d.value} for d in me.divisions]
    
    # Check EmployeeProfile.division (legacy)
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == me.id).first()
    user_division_from_profile = profile.division if profile else None
    
    # Get the effective division (same logic as _get_viewer_division)
    effective_division = None
    if user_divisions_from_relationship:
        effective_division = user_divisions_from_relationship[0]["label"]
    elif user_division_from_profile:
        effective_division = user_division_from_profile
    
    # Check recent bug report tasks
    recent_bug_tasks = (
        db.query(TaskItem)
        .filter(TaskItem.origin_type == "bug")
        .order_by(TaskItem.created_at.desc())
        .limit(5)
        .all()
    )
    
    return {
        "user_id": str(me.id),
        "user_divisions_from_relationship": user_divisions_from_relationship,
        "user_division_from_profile": user_division_from_profile,
        "effective_division": effective_division,
        "expected_division": "Software Development",
        "matches": effective_division == "Software Development" if effective_division else False,
        "recent_bug_tasks": [
            {
                "id": str(t.id),
                "title": t.title,
                "assigned_division_label": t.assigned_division_label,
                "assigned_division_label_repr": repr(t.assigned_division_label) if t.assigned_division_label else None,
            }
            for t in recent_bug_tasks
        ],
    }


@router.post("")
def create_bug_report(
    payload: BugReportRequest,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """
    Create a bug report that automatically creates a task in the tasks module.
    """
    if not payload.title or not payload.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    
    if not payload.description or not payload.description.strip():
        raise HTTPException(status_code=400, detail="Description is required")
    
    if payload.severity not in ["Low", "Medium", "High"]:
        raise HTTPException(status_code=400, detail="Severity must be Low, Medium, or High")
    
    # Build comprehensive description with all bug report details
    # Store full metadata in description (Text field, no size limit)
    # Format it nicely for better visual organization
    severity_emoji = {"High": "🔴", "Medium": "🟡", "Low": "🟢"}.get(payload.severity, "⚪")
    reporter_name = get_user_display(db, me.id) or me.username or me.email_personal
    
    full_description = f"""{payload.description}

{'═' * 70}
🐛 BUG REPORT INFORMATION
{'═' * 70}

{severity_emoji} Severity: {payload.severity}
📄 Page URL: {payload.page_url}
💻 Screen Resolution: {payload.screen.get('width', 'N/A')} × {payload.screen.get('height', 'N/A')}
👤 Reported by: {reporter_name}

{'─' * 70}
🌐 Browser & Device Information
{'─' * 70}
{payload.user_agent}

{'─' * 70}
📋 Technical Metadata (JSON)
{'─' * 70}
{json.dumps({
    "report_page": payload.page_url,
    "report_user_agent": payload.user_agent,
    "report_screen": payload.screen,
    "report_description": payload.description,
    "severity": payload.severity,
    "reporter_user_id": str(me.id),
}, indent=2)}
"""
    
    # Store only essential compact info in origin_reference (max 255 chars)
    # Format: "severity:Medium|reporter:{user_id}"
    compact_reference = f"severity:{payload.severity}|reporter:{me.id}"
    
    # Create task with origin_type="bug"
    # Assign to Software Development division
    # Note: Make sure the division label matches exactly what's in EmployeeProfile.division
    task = TaskItem(
        title=f"[BUG] {payload.title.strip()}",
        description=full_description,
        status="accepted",  # Start as "accepted" (open)
        priority=_severity_to_priority(payload.severity),
        requested_by_id=me.id,
        requested_by_name=get_user_display(db, me.id),
        assigned_to_id=None,  # Not assigned to specific user, available to division
        assigned_division_label="Software Development",  # Assign to Software Development division
        origin_type="bug",
        origin_reference=compact_reference,  # Compact format to fit 255 char limit
        origin_id=str(uuid.uuid4()),  # Unique ID for this bug report
    )
    
    db.add(task)
    db.commit()
    db.refresh(task)
    
    # Debug: Check user's divisions to ensure it matches
    user_divisions = []
    if hasattr(me, 'divisions') and me.divisions:
        user_divisions = [d.label for d in me.divisions if hasattr(d, 'label') and d.label]
    
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == me.id).first()
    if profile and profile.division and profile.division not in user_divisions:
        user_divisions.append(profile.division)
    
    matches = task.assigned_division_label in user_divisions if user_divisions else False
    
    return {
        "success": True, 
        "task_id": str(task.id),
        "assigned_division_label": task.assigned_division_label,
        "debug": {
            "user_divisions": user_divisions,
            "task_division": task.assigned_division_label,
            "matches": matches,
        }
    }


def _severity_to_priority(severity: str) -> str:
    """Convert bug severity to task priority."""
    mapping = {
        "High": "high",
        "Medium": "normal",
        "Low": "low",
    }
    return mapping.get(severity, "normal")

