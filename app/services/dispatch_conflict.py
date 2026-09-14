"""
Dispatch conflict detection service.

Overlaps for the same worker are advisory: callers should surface a warning
but still allow create/update.
"""
from datetime import date, time, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from ..models.models import Project, Shift


def has_overlap(
    db: Session,
    worker_id: str,
    date_val: date,
    start_time: time,
    end_time: time,
    exclude_shift_id: Optional[str] = None,
) -> bool:
    """Return True if the worker already has a scheduled overlapping shift."""
    return bool(
        get_conflicting_shifts(
            db,
            worker_id,
            date_val,
            start_time,
            end_time,
            exclude_shift_id=exclude_shift_id,
        )
    )


def _times_overlap(start1: time, end1: time, start2: time, end2: time) -> bool:
    """Check if two time intervals overlap (same-day or cross-day)."""

    def time_to_minutes(t: time) -> int:
        return t.hour * 60 + t.minute

    def time_to_minutes_crossday(t: time) -> int:
        if t.hour < 12:
            return 24 * 60 + time_to_minutes(t)
        return time_to_minutes(t)

    s1_min = time_to_minutes(start1)
    e1_min = time_to_minutes(end1) if end1 >= start1 else time_to_minutes_crossday(end1)
    s2_min = time_to_minutes(start2)
    e2_min = time_to_minutes(end2) if end2 >= start2 else time_to_minutes_crossday(end2)

    return s1_min < e2_min and s2_min < e1_min


def get_conflicting_shifts(
    db: Session,
    worker_id: str,
    date_val: date,
    start_time: time,
    end_time: time,
    exclude_shift_id: Optional[str] = None,
) -> List[Shift]:
    """Return scheduled shifts that overlap the proposed interval for this worker."""
    conflicts: List[Shift] = []
    seen_ids = set()

    def _consider(shift: Shift) -> None:
        if shift.id in seen_ids:
            return
        if _times_overlap(start_time, end_time, shift.start_time, shift.end_time):
            seen_ids.add(shift.id)
            conflicts.append(shift)

    def _query_day(day: date) -> List[Shift]:
        query = db.query(Shift).filter(
            Shift.worker_id == worker_id,
            Shift.date == day,
            Shift.status == "scheduled",
        )
        if exclude_shift_id:
            query = query.filter(Shift.id != exclude_shift_id)
        return query.all()

    for shift in _query_day(date_val):
        _consider(shift)

    # Adjacent-day heuristics for cross-day proposed shifts (aligned with prior has_overlap).
    if end_time < start_time:
        for shift in _query_day(date_val - timedelta(days=1)):
            if shift.end_time > shift.start_time:
                if shift.end_time > time(23, 0):
                    if shift.id not in seen_ids:
                        seen_ids.add(shift.id)
                        conflicts.append(shift)
            elif _times_overlap(start_time, end_time, shift.start_time, shift.end_time):
                _consider(shift)

        for shift in _query_day(date_val + timedelta(days=1)):
            if shift.start_time < shift.end_time:
                if shift.start_time < time(1, 0):
                    if shift.id not in seen_ids:
                        seen_ids.add(shift.id)
                        conflicts.append(shift)
            elif _times_overlap(start_time, end_time, shift.start_time, shift.end_time):
                _consider(shift)

    return conflicts


def serialize_conflicts(db: Session, shifts: List[Shift]) -> List[Dict[str, Any]]:
    """JSON-friendly conflict rows, including project_name when available."""
    if not shifts:
        return []

    project_ids = {s.project_id for s in shifts if s.project_id}
    names: Dict[Any, str] = {}
    if project_ids:
        for project in db.query(Project).filter(Project.id.in_(project_ids)).all():
            names[project.id] = project.name

    return [
        {
            "id": str(s.id),
            "date": s.date.isoformat(),
            "start_time": s.start_time.isoformat(),
            "end_time": s.end_time.isoformat(),
            "project_id": str(s.project_id) if s.project_id else None,
            "project_name": names.get(s.project_id),
        }
        for s in shifts
    ]
