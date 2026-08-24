"""Admin aggregation for Signature Requests dashboard — Builder + Onboarding, permission-gated."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from ..auth.security import _has_permission
from ..config import settings
from ..models.models import (
    DocumentSignatureParticipant,
    DocumentSignatureRequest,
    EmployeeProfile,
    OnboardingAssignment,
    OnboardingAssignmentItem,
    User,
)
from ..services.task_service import get_user_display


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def can_view_builder_signature_admin(user: User) -> bool:
    if any((getattr(r, "name", None) or "").lower() == "admin" for r in user.roles):
        return True
    return (
        _has_permission(user, "documents:signatures:manage")
        or _has_permission(user, "documents:read")
        or _has_permission(user, "business:projects:documents:read")
    )


def can_view_onboarding_signature_admin(user: User) -> bool:
    if any((getattr(r, "name", None) or "").lower() == "admin" for r in user.roles):
        return True
    return (
        _has_permission(user, "hr:onboarding:read")
        or _has_permission(user, "hr:onboarding:write")
        or _has_permission(user, "hr:users:read")
        or _has_permission(user, "users:read")
        or _has_permission(user, "users:write")
    )


def can_manage_builder_signature_admin(user: User) -> bool:
    if any((getattr(r, "name", None) or "").lower() == "admin" for r in user.roles):
        return True
    return _has_permission(user, "documents:signatures:manage")


def _participant_admin_dict(
    db: Session,
    p: DocumentSignatureParticipant,
    *,
    req: DocumentSignatureRequest,
    now: datetime,
) -> dict:
    deadline = _aware(p.deadline_at)
    overdue = (
        p.status == "ready"
        and req.status in ("pending", "in_progress")
        and deadline is not None
        and deadline < now
    )
    block_on_overdue = bool(getattr(req, "block_hub_access", False))
    is_access_blocker = (
        block_on_overdue
        and overdue
        and settings.signature_builder_blocking_enabled
        and req.status in ("pending", "in_progress")
    )
    return {
        "id": str(p.id),
        "name": get_user_display(db, p.signer_user_id),
        "signer_user_id": str(p.signer_user_id),
        "role": p.role,
        "role_label": getattr(p, "role_label", None) or p.role,
        "status": p.status,
        "available_at": p.available_at.isoformat() if getattr(p, "available_at", None) and p.available_at else None,
        "deadline_at": deadline.isoformat() if deadline else None,
        "signed_at": p.signed_at.isoformat() if p.signed_at else None,
        "is_overdue": overdue,
        "is_access_blocker": is_access_blocker,
    }


def _builder_admin_row(db: Session, row: DocumentSignatureRequest, now: datetime) -> dict:
    parts = (
        db.query(DocumentSignatureParticipant)
        .filter(DocumentSignatureParticipant.request_id == row.id)
        .order_by(DocumentSignatureParticipant.sort_order.asc())
        .all()
    )
    participants = [_participant_admin_dict(db, p, req=row, now=now) for p in parts]
    signed_count = sum(1 for p in parts if p.status == "signed")
    participant_count = len(parts)
    ready_part = next((p for p in parts if p.status == "ready"), None)
    relevant_deadline = _aware(ready_part.deadline_at) if ready_part else None
    is_overdue = any(p["is_overdue"] for p in participants)
    block_on_overdue = bool(getattr(row, "block_hub_access", False))
    has_access_blocker = any(p["is_access_blocker"] for p in participants)
    return {
        "id": str(row.id),
        "source": "document_builder",
        "display_name": row.display_name or "Document",
        "status": row.status,
        "requested_by_id": str(row.requested_by_id) if row.requested_by_id else None,
        "requested_by_name": get_user_display(db, row.requested_by_id) if row.requested_by_id else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "sent_at": row.created_at.isoformat() if row.created_at else None,
        "deadline_at": relevant_deadline.isoformat() if relevant_deadline else None,
        "signed_count": signed_count,
        "participant_count": participant_count,
        "is_overdue": is_overdue,
        "block_on_overdue": block_on_overdue,
        "has_access_blocker": has_access_blocker,
        "signing_deadline_days": getattr(row, "signing_deadline_days", None),
        "message_to_signers": getattr(row, "message_to_signers", None),
        "cancelled_at": row.cancelled_at.isoformat() if getattr(row, "cancelled_at", None) and row.cancelled_at else None,
        "participants": participants,
        "admin_actions_available": row.status in ("pending", "in_progress"),
    }


def _onboarding_admin_status(it: OnboardingAssignmentItem) -> str:
    if it.status == "signed":
        return "completed"
    if it.status == "scheduled":
        return "scheduled"
    return "pending"


def _onboarding_admin_row(
    db: Session,
    it: OnboardingAssignmentItem,
    assignment: OnboardingAssignment,
    now: datetime,
) -> dict:
    deadline = _aware(it.deadline_at)
    overdue = it.status == "pending" and deadline is not None and deadline < now
    block_on_overdue = bool(it.required)
    is_access_blocker = block_on_overdue and overdue and it.status == "pending" and it.required
    signer_name = get_user_display(db, assignment.user_id)
    subject_label = None
    if it.subject_user_id:
        sep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == it.subject_user_id).first()
        su = db.query(User).filter(User.id == it.subject_user_id).first()
        if sep and (sep.first_name or sep.last_name):
            subject_label = f"{(sep.first_name or '').strip()} {(sep.last_name or '').strip()}".strip()
        elif su:
            subject_label = su.username
    status = _onboarding_admin_status(it)
    signed_count = 1 if it.status == "signed" else 0
    participant = {
        "id": str(it.id),
        "name": signer_name,
        "signer_user_id": str(assignment.user_id),
        "role": "signer",
        "role_label": "Signer",
        "status": "signed" if it.status == "signed" else ("ready" if it.status == "pending" else "scheduled"),
        "available_at": it.available_at.isoformat() if it.available_at else None,
        "deadline_at": deadline.isoformat() if deadline else None,
        "signed_at": it.signed_at.isoformat() if it.signed_at else None,
        "is_overdue": overdue,
        "is_access_blocker": is_access_blocker,
        "subject_label": subject_label,
    }
    return {
        "id": str(it.id),
        "source": "onboarding",
        "display_name": (it.display_name or "").strip() or "Onboarding document",
        "status": status,
        "requested_by_id": str(assignment.assigned_by_id) if assignment.assigned_by_id else None,
        "requested_by_name": get_user_display(db, assignment.assigned_by_id) if assignment.assigned_by_id else None,
        "created_at": it.available_at.isoformat() if it.available_at else None,
        "sent_at": assignment.assigned_at.isoformat() if assignment.assigned_at else None,
        "deadline_at": deadline.isoformat() if deadline else None,
        "signed_count": signed_count,
        "participant_count": 1,
        "is_overdue": overdue,
        "block_on_overdue": block_on_overdue,
        "has_access_blocker": is_access_blocker,
        "signing_deadline_days": None,
        "message_to_signers": it.user_message,
        "cancelled_at": None,
        "subject_label": subject_label,
        "assignment_id": str(assignment.id),
        "participants": [participant],
        "admin_actions_available": False,
    }


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value or not str(value).strip():
        return None
    try:
        return _aware(datetime.fromisoformat(str(value).replace("Z", "+00:00")))
    except Exception:
        return None


def _matches_filters(row: dict, *, filters: dict, now: datetime) -> bool:
    status = (filters.get("status") or "").strip().lower()
    if status and row.get("status") != status:
        return False

    source = (filters.get("source") or "").strip().lower()
    if source and row.get("source") != source:
        return False

    if filters.get("overdue") is not None:
        want = bool(filters["overdue"])
        if bool(row.get("is_overdue")) != want:
            return False

    if filters.get("blocks_access") is not None:
        want = bool(filters["blocks_access"])
        if bool(row.get("block_on_overdue")) != want:
            return False

    requested_by = (filters.get("requested_by") or "").strip()
    if requested_by and row.get("requested_by_id") != requested_by:
        return False

    signer = (filters.get("signer") or "").strip()
    if signer:
        parts = row.get("participants") or []
        if not any(p.get("signer_user_id") == signer for p in parts):
            return False

    date_from = _parse_dt(filters.get("date_from"))
    date_to = _parse_dt(filters.get("date_to"))
    created = _parse_dt(row.get("created_at"))
    if date_from and created and created < date_from:
        return False
    if date_to and created and created > date_to:
        return False

    return True


def _matches_search(row: dict, search: Optional[str]) -> bool:
    if not search or not str(search).strip():
        return True
    needle = str(search).strip().lower()
    parts = [
        row.get("display_name") or "",
        row.get("requested_by_name") or "",
    ]
    for participant in row.get("participants") or []:
        parts.append(participant.get("name") or "")
        parts.append(participant.get("subject_label") or "")
    return any(needle in (part or "").lower() for part in parts)


def list_admin_signature_requests(
    db: Session,
    user: User,
    *,
    status: Optional[str] = None,
    source: Optional[str] = None,
    overdue: Optional[bool] = None,
    blocks_access: Optional[bool] = None,
    requested_by: Optional[str] = None,
    signer: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 500,
) -> List[dict]:
    """Unified admin list — each source included only when caller has permission."""
    include_builder = can_view_builder_signature_admin(user)
    include_onboarding = can_view_onboarding_signature_admin(user)
    if not include_builder and not include_onboarding:
        return []

    now = _now_utc()
    filters = {
        "status": status,
        "source": source,
        "overdue": overdue,
        "blocks_access": blocks_access,
        "requested_by": requested_by,
        "signer": signer,
        "date_from": date_from,
        "date_to": date_to,
    }
    rows: List[dict] = []

    if include_builder and (not source or source == "document_builder"):
        q = db.query(DocumentSignatureRequest).order_by(DocumentSignatureRequest.created_at.desc())
        if status:
            q = q.filter(DocumentSignatureRequest.status == status)
        if requested_by:
            try:
                q = q.filter(DocumentSignatureRequest.requested_by_id == UUID(requested_by))
            except Exception:
                q = q.filter(DocumentSignatureRequest.id == UUID(int=0))
        if signer:
            q = q.join(
                DocumentSignatureParticipant,
                DocumentSignatureParticipant.request_id == DocumentSignatureRequest.id,
            ).filter(DocumentSignatureParticipant.signer_user_id == UUID(signer))
        if date_from:
            dt = _parse_dt(date_from)
            if dt:
                q = q.filter(DocumentSignatureRequest.created_at >= dt)
        if date_to:
            dt = _parse_dt(date_to)
            if dt:
                q = q.filter(DocumentSignatureRequest.created_at <= dt)
        for row in q.limit(limit).all():
            built = _builder_admin_row(db, row, now)
            if _matches_filters(built, filters=filters, now=now) and _matches_search(built, search):
                rows.append(built)

    if include_onboarding and (not source or source == "onboarding"):
        ob_query = (
            db.query(OnboardingAssignmentItem, OnboardingAssignment)
            .join(OnboardingAssignment, OnboardingAssignment.id == OnboardingAssignmentItem.assignment_id)
            .order_by(OnboardingAssignmentItem.available_at.desc())
        )
        if status:
            if status == "completed":
                ob_query = ob_query.filter(OnboardingAssignmentItem.status == "signed")
            elif status == "cancelled":
                ob_query = ob_query.filter(OnboardingAssignmentItem.id == UUID(int=0))
            elif status == "scheduled":
                ob_query = ob_query.filter(OnboardingAssignmentItem.status == "scheduled")
            else:
                ob_query = ob_query.filter(OnboardingAssignmentItem.status == "pending")
        if requested_by:
            try:
                ob_query = ob_query.filter(OnboardingAssignment.assigned_by_id == UUID(requested_by))
            except Exception:
                ob_query = ob_query.filter(OnboardingAssignmentItem.id == UUID(int=0))
        if signer:
            try:
                ob_query = ob_query.filter(OnboardingAssignment.user_id == UUID(signer))
            except Exception:
                ob_query = ob_query.filter(OnboardingAssignmentItem.id == UUID(int=0))
        if date_from:
            dt = _parse_dt(date_from)
            if dt:
                ob_query = ob_query.filter(OnboardingAssignmentItem.available_at >= dt)
        if date_to:
            dt = _parse_dt(date_to)
            if dt:
                ob_query = ob_query.filter(OnboardingAssignmentItem.available_at <= dt)
        for it, assignment in ob_query.limit(limit).all():
            built = _onboarding_admin_row(db, it, assignment, now)
            if _matches_filters(built, filters=filters, now=now) and _matches_search(built, search):
                rows.append(built)

    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return rows[:limit]
