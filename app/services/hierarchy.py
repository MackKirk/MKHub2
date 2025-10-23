from __future__ import annotations

import uuid
from typing import List, Optional, Set
from sqlalchemy.orm import Session

from ..models.models import EmployeeProfile


def get_manager_chain(user_id: str, db: Session, max_depth: int = 8) -> List[str]:
    """Return list of manager user_ids from direct to top for the given user."""
    try:
        uid = uuid.UUID(str(user_id))
    except Exception:
        return []
    chain: List[str] = []
    visited: Set[str] = set()
    current = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == uid).first()
    depth = 0
    while current and getattr(current, 'manager_user_id', None) and depth < max_depth:
        mid = str(getattr(current, 'manager_user_id'))
        if not mid or mid in visited:
            break
        chain.append(mid)
        visited.add(mid)
        depth += 1
        current = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == getattr(current, 'manager_user_id')).first()
    return chain


def get_direct_reports(manager_id: str, db: Session, limit: int = 500) -> List[str]:
    try:
        mid = uuid.UUID(str(manager_id))
    except Exception:
        return []
    rows = db.query(EmployeeProfile).filter(EmployeeProfile.manager_user_id == mid).limit(limit).all()
    return [str(r.user_id) for r in rows]


def is_in_chain(manager_id: str, user_id: str, db: Session) -> bool:
    return str(manager_id) in set(get_manager_chain(user_id, db))



