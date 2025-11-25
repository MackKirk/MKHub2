"""
Time rules and validation service.
Handles 5-minute rounding, ±30min tolerance, and timezone conversions.
"""
from datetime import datetime, time, timedelta
from typing import Optional
import pytz
from ..config import settings


def round_to_5_minutes(dt: datetime) -> datetime:
    """
    Round datetime to nearest 5-minute increment.
    
    Args:
        dt: Datetime to round
    
    Returns:
        Rounded datetime
    """
    minutes = dt.minute
    rounded_minutes = (minutes // 5) * 5
    if minutes % 5 >= 3:  # Round up if >= 3 minutes
        rounded_minutes += 5
        if rounded_minutes >= 60:
            rounded_minutes = 0
            dt = dt + timedelta(hours=1)
    
    return dt.replace(minute=rounded_minutes, second=0, microsecond=0)


def is_within_tolerance(
    actual_time: datetime,
    expected_time: datetime,
    tolerance_minutes: Optional[int] = None
) -> bool:
    """
    Check if actual time is within tolerance window of expected time.
    
    Args:
        actual_time: Actual time (UTC, timezone-aware or naive)
        expected_time: Expected time (UTC, timezone-aware or naive)
        tolerance_minutes: Tolerance in minutes (default from settings)
    
    Returns:
        True if within tolerance
    """
    if tolerance_minutes is None:
        tolerance_minutes = settings.tolerance_window_min
    
    # Ensure both are timezone-aware for comparison
    if actual_time.tzinfo is None:
        actual_time = actual_time.replace(tzinfo=pytz.UTC)
    if expected_time.tzinfo is None:
        expected_time = expected_time.replace(tzinfo=pytz.UTC)
    
    diff = abs((actual_time - expected_time).total_seconds() / 60)
    return diff <= tolerance_minutes


def is_same_day(
    time1: datetime,
    time2: datetime,
    timezone_str: str
) -> bool:
    """
    Check if two times are on the same day in the given timezone.
    
    Args:
        time1: First time (UTC, timezone-aware or naive)
        time2: Second time (UTC, timezone-aware or naive)
        timezone_str: Timezone string to use for day comparison
    
    Returns:
        True if both times are on the same day
    """
    # Ensure both are timezone-aware
    if time1.tzinfo is None:
        time1 = time1.replace(tzinfo=pytz.UTC)
    if time2.tzinfo is None:
        time2 = time2.replace(tzinfo=pytz.UTC)
    
    # Convert to local timezone for day comparison
    tz = pytz.timezone(timezone_str)
    local1 = time1.astimezone(tz)
    local2 = time2.astimezone(tz)
    
    # Compare dates (year, month, day)
    return (local1.year == local2.year and 
            local1.month == local2.month and 
            local1.day == local2.day)


def local_to_utc(local_datetime: datetime, timezone_str: str) -> datetime:
    """
    Convert local datetime to UTC.
    
    Args:
        local_datetime: Local datetime (naive)
        timezone_str: Timezone string (e.g., "America/Vancouver")
    
    Returns:
        UTC datetime (timezone-aware)
    """
    try:
        tz = pytz.timezone(timezone_str)
        # Localize to the timezone
        if local_datetime.tzinfo is None:
            local_dt = tz.localize(local_datetime)
        else:
            local_dt = local_datetime.astimezone(tz)
        # Convert to UTC
        return local_dt.astimezone(pytz.UTC)
    except Exception:
        # Fallback to UTC if timezone is invalid
        return local_datetime.replace(tzinfo=pytz.UTC)


def utc_to_local(utc_datetime: datetime, timezone_str: str) -> datetime:
    """
    Convert UTC datetime to local timezone.
    
    Args:
        utc_datetime: UTC datetime (timezone-aware)
        timezone_str: Timezone string (e.g., "America/Vancouver")
    
    Returns:
        Local datetime (timezone-aware)
    """
    try:
        tz = pytz.timezone(timezone_str)
        if utc_datetime.tzinfo is None:
            utc_dt = utc_datetime.replace(tzinfo=pytz.UTC)
        else:
            utc_dt = utc_datetime.astimezone(pytz.UTC)
        return utc_dt.astimezone(tz)
    except Exception:
        return utc_datetime


def combine_date_time(date_val, time_val, timezone_str: str) -> datetime:
    """
    Combine date and time into a timezone-aware datetime, then convert to UTC.
    
    Args:
        date_val: Date object
        time_val: Time object
        timezone_str: Timezone string
    
    Returns:
        UTC datetime (timezone-aware)
    """
    naive_dt = datetime.combine(date_val, time_val)
    utc_dt = local_to_utc(naive_dt, timezone_str)
    # Ensure it's timezone-aware
    if utc_dt.tzinfo is None:
        utc_dt = utc_dt.replace(tzinfo=pytz.UTC)
    return utc_dt

