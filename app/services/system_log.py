"""
System logging service for application and error logs (admin panel).
Do not log passwords, tokens, or API keys.
"""
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session

from ..models.models import SystemLog


def write_system_log(
    db: Session,
    level: str,
    category: str,
    message: str,
    *,
    request_id: Optional[str] = None,
    path: Optional[str] = None,
    method: Optional[str] = None,
    user_id: Optional[str] = None,
    status_code: Optional[int] = None,
    detail: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> SystemLog:
    """
    Write an entry to system_logs. Use for request errors, auth events, integrations, uploads, etc.
    level: info | warning | error
    category: request_error | auth | integration | upload | db | background
    """
    entry = SystemLog(
        level=level,
        category=category,
        message=message,
        request_id=request_id,
        path=path,
        method=method,
        user_id=user_id,
        status_code=status_code,
        detail=detail[:2000] if detail and len(detail) > 2000 else detail,
        extra=extra,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
