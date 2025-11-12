"""
Dispatch conflict detection service.
HARD STOP rule: Do not allow overlapping shifts for the same worker.
"""
from datetime import date, time, datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from ..models.models import Shift
from ..config import settings


def has_overlap(
    db: Session,
    worker_id: str,
    date_val: date,
    start_time: time,
    end_time: time,
    exclude_shift_id: Optional[str] = None
) -> bool:
    """
    Check if a worker has an overlapping shift.
    
    Args:
        db: Database session
        worker_id: Worker user ID
        date_val: Shift date (local)
        start_time: Shift start time (local)
        end_time: Shift end time (local)
        exclude_shift_id: Optional shift ID to exclude from check (for updates)
    
    Returns:
        True if there's an overlap, False otherwise
    """
    # Convert time to datetime for comparison
    # For same-day shifts, we compare times directly
    # For cross-day shifts, we need to handle day transitions
    
    # Query existing shifts for this worker on this date
    query = db.query(Shift).filter(
        Shift.worker_id == worker_id,
        Shift.date == date_val,
        Shift.status == "scheduled"
    )
    
    if exclude_shift_id:
        query = query.filter(Shift.id != exclude_shift_id)
    
    existing_shifts = query.all()
    
    # Check for time overlaps
    for shift in existing_shifts:
        # Check if times overlap
        # Two time intervals overlap if:
        # start1 < end2 AND start2 < end1
        if _times_overlap(start_time, end_time, shift.start_time, shift.end_time):
            return True
    
    # Also check previous and next day for cross-day shifts
    # If current shift ends after midnight or starts before midnight
    if end_time < start_time:  # Cross-day shift
        # Check previous day
        prev_date = date_val - timedelta(days=1)
        prev_shifts = db.query(Shift).filter(
            Shift.worker_id == worker_id,
            Shift.date == prev_date,
            Shift.status == "scheduled"
        ).all()
        
        for shift in prev_shifts:
            # If previous day's shift ends after midnight, it overlaps
            if shift.end_time > shift.start_time:  # Normal shift
                # Check if it extends past midnight
                if shift.end_time > time(23, 0):  # Ends late, might overlap
                    # Simplified: if shift ends after 23:00, consider overlap
                    return True
            else:  # Cross-day shift on previous day
                # Both are cross-day, check overlap
                if _times_overlap(start_time, end_time, shift.start_time, shift.end_time):
                    return True
        
        # Check next day
        next_date = date_val + timedelta(days=1)
        next_shifts = db.query(Shift).filter(
            Shift.worker_id == worker_id,
            Shift.date == next_date,
            Shift.status == "scheduled"
        ).all()
        
        for shift in next_shifts:
            # If next day's shift starts before midnight, it overlaps
            if shift.start_time < shift.end_time:  # Normal shift
                # Check if it starts early
                if shift.start_time < time(1, 0):  # Starts early, might overlap
                    return True
            else:  # Cross-day shift on next day
                if _times_overlap(start_time, end_time, shift.start_time, shift.end_time):
                    return True
    
    return False


def _times_overlap(start1: time, end1: time, start2: time, end2: time) -> bool:
    """
    Check if two time intervals overlap.
    Handles both same-day and cross-day intervals.
    
    Args:
        start1: First interval start
        end1: First interval end
        start2: Second interval start
        end2: Second interval end
    
    Returns:
        True if intervals overlap
    """
    # Convert times to minutes since midnight for easier comparison
    def time_to_minutes(t: time) -> int:
        return t.hour * 60 + t.minute
    
    def time_to_minutes_crossday(t: time) -> int:
        # For cross-day, end time is next day
        if t.hour < 12:  # Assume ends next day if before noon
            return 24 * 60 + time_to_minutes(t)
        return time_to_minutes(t)
    
    s1_min = time_to_minutes(start1)
    e1_min = time_to_minutes(end1) if end1 >= start1 else time_to_minutes_crossday(end1)
    s2_min = time_to_minutes(start2)
    e2_min = time_to_minutes(end2) if end2 >= start2 else time_to_minutes_crossday(end2)
    
    # Two intervals overlap if: start1 < end2 AND start2 < end1
    return s1_min < e2_min and s2_min < e1_min


def get_conflicting_shifts(
    db: Session,
    worker_id: str,
    date_val: date,
    start_time: time,
    end_time: time,
    exclude_shift_id: Optional[str] = None
) -> list:
    """
    Get list of conflicting shifts for a worker.
    
    Returns:
        List of Shift objects that conflict
    """
    conflicts = []
    
    # Check same day
    query = db.query(Shift).filter(
        Shift.worker_id == worker_id,
        Shift.date == date_val,
        Shift.status == "scheduled"
    )
    
    if exclude_shift_id:
        query = query.filter(Shift.id != exclude_shift_id)
    
    existing_shifts = query.all()
    
    for shift in existing_shifts:
        if _times_overlap(start_time, end_time, shift.start_time, shift.end_time):
            conflicts.append(shift)
    
    return conflicts


