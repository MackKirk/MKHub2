"""
Audit logging service.
Append-only audit log with integrity hashing.
"""
import hashlib
import json
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session

from ..models.models import AuditLog
from ..config import settings


def create_audit_log(
    db: Session,
    entity_type: str,
    entity_id: str,
    action: str,
    actor_id: Optional[str] = None,
    actor_role: Optional[str] = None,
    source: Optional[str] = None,
    changes_json: Optional[Dict] = None,
    context: Optional[Dict] = None,
    integrity_secret: Optional[str] = None
) -> AuditLog:
    """
    Create an append-only audit log entry.
    
    Args:
        db: Database session
        entity_type: Type of entity (shift|attendance|project|user)
        entity_id: Entity ID
        action: Action performed (CREATE|UPDATE|APPROVE|REJECT|DELETE|CLOCK_IN|CLOCK_OUT)
        actor_id: User ID who performed the action
        actor_role: Role of the actor (admin|supervisor|worker|system)
        source: Source of the action (app|supervisor|kiosk|system|api)
        changes_json: Before/after diff
        context: Additional context (project_id, worker_id, GPS data, etc.)
        integrity_secret: Secret for integrity hash (defaults to JWT_SECRET)
    
    Returns:
        Created AuditLog object
    """
    timestamp_utc = datetime.utcnow().replace(tzinfo=None)
    
    # Calculate integrity hash
    integrity_hash = None
    if integrity_secret is None:
        integrity_secret = settings.jwt_secret
    
    if integrity_secret:
        # Create canonical JSON representation
        canonical_data = {
            "entity_type": entity_type,
            "entity_id": str(entity_id),
            "action": action,
            "actor_id": str(actor_id) if actor_id else None,
            "actor_role": actor_role,
            "source": source,
            "timestamp_utc": timestamp_utc.isoformat(),
            "changes": changes_json,
            "context": context,
        }
        
        # Remove None values and sort keys for consistency
        canonical_data = {k: v for k, v in canonical_data.items() if v is not None}
        canonical_json = json.dumps(canonical_data, sort_keys=True, default=str)
        
        # Calculate SHA256 hash
        hash_input = f"{canonical_json}:{integrity_secret}"
        integrity_hash = hashlib.sha256(hash_input.encode()).hexdigest()
    
    audit_log = AuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        actor_id=actor_id,
        actor_role=actor_role,
        source=source or "system",
        changes_json=changes_json,
        timestamp_utc=timestamp_utc,
        context=context,
        integrity_hash=integrity_hash,
    )
    
    db.add(audit_log)
    db.commit()
    db.refresh(audit_log)
    
    return audit_log


def get_audit_logs(
    db: Session,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
) -> list:
    """
    Get audit logs with optional filtering.
    
    Args:
        db: Database session
        entity_type: Filter by entity type
        entity_id: Filter by entity ID
        limit: Maximum number of results
        offset: Offset for pagination
    
    Returns:
        List of AuditLog objects
    """
    query = db.query(AuditLog)
    
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)
    
    query = query.order_by(AuditLog.timestamp_utc.desc())
    query = query.limit(limit).offset(offset)
    
    return query.all()


def compute_diff(before: Dict, after: Dict) -> Dict:
    """
    Compute a diff between two dictionaries.
    
    Args:
        before: Before state
        after: After state
    
    Returns:
        Dict with before/after values for changed fields
    """
    diff = {}
    all_keys = set(before.keys()) | set(after.keys())
    
    for key in all_keys:
        before_val = before.get(key)
        after_val = after.get(key)
        
        if before_val != after_val:
            diff[key] = {
                "before": before_val,
                "after": after_val,
            }
    
    return diff




