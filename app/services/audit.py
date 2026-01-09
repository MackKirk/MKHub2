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


# Entity type to section mapping for filtering
SECTION_ENTITY_TYPES = {
    "reports": ["report"],
    "files": ["project_file"],
    "proposal": ["proposal", "proposal_draft"],
    "estimate": ["estimate", "estimate_item"],
    "orders": ["order", "order_item"],
    "workload": ["shift"],
    "timesheet": ["attendance", "timesheet_entry"],
    "general": ["project"],
}


def _resolve_user_name(db: Session, user_id: str) -> Optional[str]:
    """Helper to resolve user ID to full name."""
    from ..models.models import User, EmployeeProfile
    try:
        result = db.query(User, EmployeeProfile).outerjoin(
            EmployeeProfile, EmployeeProfile.user_id == User.id
        ).filter(User.id == user_id).first()
        if result:
            user, profile = result
            if profile:
                return f"{profile.first_name or ''} {profile.last_name or ''}".strip() or user.username
            return user.username
    except Exception:
        pass
    return None


def _resolve_project_name(db: Session, project_id: str) -> Optional[str]:
    """Helper to resolve project ID to name."""
    from ..models.models import Project
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            return project.name
    except Exception:
        pass
    return None


def get_project_audit_logs(
    db: Session,
    project_id: str,
    section: Optional[str] = None,
    month: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
) -> list:
    """
    Get audit logs for a specific project with optional section filtering.
    
    Args:
        db: Database session
        project_id: Project ID to filter by
        section: Section to filter (reports|files|proposal|estimate|orders|workload|timesheet|general)
        month: Month to filter (YYYY-MM format)
        limit: Maximum number of results
        offset: Offset for pagination
    
    Returns:
        List of AuditLog objects with user info and resolved names
    """
    from sqlalchemy import or_, extract
    from ..models.models import User, EmployeeProfile
    
    query = db.query(AuditLog)
    
    # Filter by project_id in context OR entity_id (for project entity type)
    # We use JSON path query for context->project_id
    query = query.filter(
        or_(
            AuditLog.context.op('->>')('project_id') == str(project_id),
            (AuditLog.entity_type == 'project') & (AuditLog.entity_id == project_id)
        )
    )
    
    # Filter by section (entity types)
    if section and section in SECTION_ENTITY_TYPES:
        entity_types = SECTION_ENTITY_TYPES[section]
        query = query.filter(AuditLog.entity_type.in_(entity_types))
    
    # Filter by month
    if month:
        try:
            year, month_num = month.split('-')
            query = query.filter(
                extract('year', AuditLog.timestamp_utc) == int(year),
                extract('month', AuditLog.timestamp_utc) == int(month_num)
            )
        except (ValueError, AttributeError):
            pass
    
    # Order by timestamp descending (most recent first)
    query = query.order_by(AuditLog.timestamp_utc.desc())
    query = query.limit(limit).offset(offset)
    
    logs = query.all()
    
    # Cache for resolved names to avoid repeated queries
    user_name_cache: Dict[str, Optional[str]] = {}
    project_name_cache: Dict[str, Optional[str]] = {}
    
    def get_user_name(uid: str) -> Optional[str]:
        if uid not in user_name_cache:
            user_name_cache[uid] = _resolve_user_name(db, uid)
        return user_name_cache.get(uid)
    
    def get_project_name(pid: str) -> Optional[str]:
        if pid not in project_name_cache:
            project_name_cache[pid] = _resolve_project_name(db, pid)
        return project_name_cache.get(pid)
    
    # Enrich with user info and resolved names
    result = []
    for log in logs:
        context = log.context or {}
        changes = log.changes_json or {}
        
        # Get actor info
        actor_name = None
        actor_avatar = None
        if log.actor_id:
            actor = db.query(User, EmployeeProfile).outerjoin(
                EmployeeProfile, EmployeeProfile.user_id == User.id
            ).filter(User.id == log.actor_id).first()
            if actor:
                user, profile = actor
                if profile:
                    actor_name = f"{profile.first_name or ''} {profile.last_name or ''}".strip() or user.username
                    actor_avatar = str(profile.profile_photo_file_id) if profile.profile_photo_file_id else None
                else:
                    actor_name = user.username
        
        # Get affected user info - prefer context name, fall back to ID resolution
        affected_user_id = context.get('affected_user_id')
        affected_user_name = context.get('affected_user_name')
        if affected_user_id and not affected_user_name:
            affected_user_name = get_user_name(affected_user_id)
        
        # Get project name - prefer context name, fall back to ID resolution
        ctx_project_id = context.get('project_id')
        project_name = context.get('project_name')
        if ctx_project_id and not project_name:
            project_name = get_project_name(ctx_project_id)
        
        # Resolve worker_id to name if present in context
        worker_id = context.get('worker_id')
        worker_name = context.get('worker_name')
        if worker_id and not worker_name:
            worker_name = get_user_name(worker_id)
        
        # Resolve approved_by to name if present in changes
        approved_by_id = None
        approved_by_name = None
        if changes.get('after') and isinstance(changes['after'], dict):
            approved_by_id = changes['after'].get('approved_by')
        if not approved_by_id and changes.get('approved_by'):
            approved_by_id = changes.get('approved_by')
        if approved_by_id:
            approved_by_name = get_user_name(str(approved_by_id))
        
        # Build enriched context with resolved names
        enriched_context = dict(context)
        if affected_user_name:
            enriched_context['affected_user_name'] = affected_user_name
        if project_name:
            enriched_context['project_name'] = project_name
        if worker_name:
            enriched_context['worker_name'] = worker_name
        if approved_by_name:
            enriched_context['approved_by_name'] = approved_by_name
        
        result.append({
            "id": str(log.id),
            "timestamp": log.timestamp_utc.isoformat() if log.timestamp_utc else None,
            "entity_type": log.entity_type,
            "entity_id": str(log.entity_id) if log.entity_id else None,
            "action": log.action,
            "actor_id": str(log.actor_id) if log.actor_id else None,
            "actor_name": actor_name,
            "actor_avatar_file_id": actor_avatar,
            "actor_role": log.actor_role,
            "source": log.source,
            "changes": changes,
            "context": enriched_context,
            "affected_user_id": affected_user_id,
            "affected_user_name": affected_user_name,
            "project_name": project_name,
            "worker_name": worker_name,
        })
    
    return result




