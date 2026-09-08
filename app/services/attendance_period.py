"""Dual-read / dual-write for Attendance project + Work Type + hours-only fields.

Phase 1 still writes JOB_TYPE / SERVICE_ITEM / HOURS_WORKED markers in reason_text
while also storing structured columns.
"""
from __future__ import annotations

import uuid
from typing import Any, Dict, Optional, Tuple

from sqlalchemy.orm import Session

from ..models.models import Attendance, WorkType
from .attendance_job_labels import (
    PREDEFINED_JOBS_DICT,
    compose_reason_text,
    parse_reason_markers,
)
from .work_types import DEFAULT_CODE, get_default_work_type, resolve_work_type

ENTRY_KIND_CLOCK = "clock"
ENTRY_KIND_HOURS_ONLY = "hours_only"


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, TypeError, AttributeError):
        return False


def split_job_ref(job_type: Optional[str]) -> Tuple[Optional[uuid.UUID], Optional[str]]:
    """Return (project_id, predefined_job_code) from a clock job_type string."""
    if not job_type:
        return None, None
    s = str(job_type).strip()
    if not s:
        return None, None
    if s in PREDEFINED_JOBS_DICT:
        return None, s
    if _is_uuid(s):
        return uuid.UUID(s), None
    return None, s


def effective_job_type(att: Attendance) -> Optional[str]:
    project_id = getattr(att, "project_id", None)
    if project_id:
        return str(project_id)
    code = getattr(att, "predefined_job_code", None)
    if code:
        return str(code)
    return parse_reason_markers(att.reason_text).get("job_type")


def effective_entry_kind(att: Attendance) -> str:
    kind = (getattr(att, "entry_kind", None) or "").strip()
    if kind:
        return kind
    hours = parse_reason_markers(att.reason_text).get("hours_worked")
    if hours:
        return ENTRY_KIND_HOURS_ONLY
    return ENTRY_KIND_CLOCK


def effective_declared_hours(att: Attendance) -> Optional[float]:
    raw = getattr(att, "declared_hours", None)
    if raw is not None:
        try:
            return float(raw)
        except (TypeError, ValueError):
            pass
    marker = parse_reason_markers(att.reason_text).get("hours_worked")
    if marker:
        try:
            return float(marker)
        except (TypeError, ValueError):
            return None
    return None


def effective_service_item(att: Attendance, work_type: Optional[WorkType] = None) -> Optional[str]:
    if work_type is not None:
        return work_type.code
    wt_id = getattr(att, "work_type_id", None)
    if wt_id is None:
        return parse_reason_markers(att.reason_text).get("service_item") or DEFAULT_CODE
    return parse_reason_markers(att.reason_text).get("service_item") or DEFAULT_CODE


def period_response_fields(att: Attendance, work_type: Optional[WorkType] = None) -> Dict[str, Any]:
    job_type = effective_job_type(att)
    declared = effective_declared_hours(att)
    kind = effective_entry_kind(att)
    wt_id = getattr(att, "work_type_id", None)
    service_item = None
    if work_type is not None:
        service_item = work_type.code
        wt_id = work_type.id
    else:
        service_item = parse_reason_markers(att.reason_text).get("service_item") or DEFAULT_CODE
    return {
        "job_type": job_type,
        "project_id": str(att.project_id) if getattr(att, "project_id", None) else None,
        "predefined_job_code": getattr(att, "predefined_job_code", None),
        "work_type_id": str(wt_id) if wt_id else None,
        "service_item": service_item,
        "entry_kind": kind,
        "declared_hours": declared,
    }


def apply_attendance_period_fields(
    db: Session,
    attendance: Attendance,
    payload: Optional[dict] = None,
    *,
    job_type: Optional[str] = None,
    update_notes: bool = True,
) -> Optional[WorkType]:
    """Set structured columns and dual-write reason_text markers. Returns resolved Work Type."""
    payload = payload or {}
    markers = parse_reason_markers(attendance.reason_text)

    resolved_job = job_type
    if resolved_job is None:
        resolved_job = payload.get("job_type") or payload.get("predefined_job_code")
    if not resolved_job and payload.get("project_id"):
        resolved_job = str(payload.get("project_id"))
    if not resolved_job:
        resolved_job = effective_job_type(attendance)

    project_id, predefined = split_job_ref(resolved_job)
    attendance.project_id = project_id
    attendance.predefined_job_code = predefined

    hours_raw = payload.get("declared_hours")
    if hours_raw is None and payload.get("hours_worked") is not None:
        hours_raw = payload.get("hours_worked")
    if hours_raw is None:
        hours_raw = markers.get("hours_worked")
    declared = None
    if hours_raw is not None and str(hours_raw).strip() != "":
        try:
            declared = float(hours_raw)
        except (TypeError, ValueError):
            declared = None
    attendance.declared_hours = declared

    kind = (payload.get("entry_kind") or "").strip()
    if not kind:
        if declared is not None:
            kind = ENTRY_KIND_HOURS_ONLY
        else:
            kind = effective_entry_kind(attendance)
    attendance.entry_kind = kind or ENTRY_KIND_CLOCK

    raw_wt = payload.get("work_type_id") or payload.get("work_type") or payload.get("service_item")
    if raw_wt is None or str(raw_wt).strip() == "":
        raw_wt = markers.get("service_item")
    wt = resolve_work_type(db, str(raw_wt) if raw_wt is not None else None)
    if wt is None and raw_wt:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Invalid service item")
    if wt is None:
        wt = get_default_work_type(db)
    attendance.work_type_id = wt.id

    notes = markers.get("notes") or ""
    if update_notes and "reason_text" in payload:
        incoming = payload.get("reason_text")
        if incoming is not None:
            incoming_markers = parse_reason_markers(str(incoming))
            notes = incoming_markers.get("notes") or ""
            if not resolved_job and incoming_markers.get("job_type"):
                resolved_job = incoming_markers["job_type"]
                project_id, predefined = split_job_ref(resolved_job)
                attendance.project_id = project_id
                attendance.predefined_job_code = predefined
            if incoming_markers.get("hours_worked") and declared is None:
                try:
                    attendance.declared_hours = float(incoming_markers["hours_worked"])
                    attendance.entry_kind = ENTRY_KIND_HOURS_ONLY
                except (TypeError, ValueError):
                    pass

    hours_marker = None
    if attendance.declared_hours is not None:
        hours_marker = (
            str(int(attendance.declared_hours))
            if float(attendance.declared_hours).is_integer()
            else str(attendance.declared_hours)
        )

    attendance.reason_text = compose_reason_text(
        job_type=resolved_job,
        service_item=wt.code,
        hours_worked=hours_marker,
        notes=notes,
    )
    return wt
