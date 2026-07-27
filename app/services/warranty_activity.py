"""Warranty activity log helper."""

from __future__ import annotations

import uuid
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from ..models.models import WarrantyActivityLog


def log_warranty_activity(
    db: Session,
    *,
    project_id: uuid.UUID,
    action: str,
    created_by: Optional[uuid.UUID] = None,
    warranty_id: Optional[uuid.UUID] = None,
    claim_id: Optional[uuid.UUID] = None,
    details: Optional[Dict[str, Any]] = None,
) -> WarrantyActivityLog:
    row = WarrantyActivityLog(
        project_id=project_id,
        warranty_id=warranty_id,
        claim_id=claim_id,
        action=action,
        details=details or {},
        created_by=created_by,
    )
    db.add(row)
    return row
