"""Signature compliance — aggregates onboarding + Document Builder without merging models."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from ..config import settings
from ..models.models import (
    DocumentSignatureParticipant,
    DocumentSignatureRequest,
    OnboardingAssignment,
    OnboardingAssignmentItem,
    User,
)
from ..services.onboarding_assign import promote_scheduled_assignment_items
from ..services.task_service import get_user_display


class ComplianceCheckError(Exception):
    """Compliance query failed — enforcement boundary may fail-open."""


@dataclass
class SourceCounts:
    pending_count: int = 0
    overdue_count: int = 0
    blocking_count: int = 0


@dataclass
class ComplianceResult:
    has_pending: bool
    pending_count: int
    overdue_count: int
    blocked: bool
    earliest_deadline: Optional[datetime]
    sources: Dict[str, SourceCounts]
    blockers: List[Dict[str, Any]] = field(default_factory=list)
    action_required_count: int = 0


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _onboarding_my_items(db: Session, user_id: UUID) -> List[OnboardingAssignmentItem]:
    return (
        db.query(OnboardingAssignmentItem)
        .join(OnboardingAssignment, OnboardingAssignment.id == OnboardingAssignmentItem.assignment_id)
        .filter(
            OnboardingAssignment.user_id == user_id,
            OnboardingAssignmentItem.employee_visible.is_(True),
            OnboardingAssignmentItem.status.in_(["pending", "signed"]),
        )
        .order_by(OnboardingAssignmentItem.deadline_at.asc())
        .all()
    )


def get_onboarding_compliance_slice(db: Session, user_id: UUID) -> Dict[str, Any]:
    """Mirror of GET /auth/me/onboarding/status logic — for parity tests only."""
    promote_scheduled_assignment_items(db, user_id)
    items = _onboarding_my_items(db, user_id)
    now = _now_utc()
    pending_required = [i for i in items if i.status == "pending" and i.required]
    has_pending = len(pending_required) > 0
    past_deadline = False
    earliest = None
    for i in pending_required:
        d = _aware(i.deadline_at)
        if d and d < now:
            past_deadline = True
        if d and (earliest is None or d < earliest):
            earliest = d
    return {
        "has_pending": has_pending,
        "past_deadline": past_deadline and has_pending,
        "pending_count": len(pending_required),
        "earliest_deadline": earliest.isoformat() if earliest else None,
    }


def _onboarding_blockers(db: Session, user_id: UUID, now: datetime) -> tuple[List[Dict], SourceCounts]:
    promote_scheduled_assignment_items(db, user_id)
    items = _onboarding_my_items(db, user_id)
    blockers: List[Dict] = []
    src = SourceCounts()
    for it in items:
        if it.status != "pending":
            continue
        if not it.required:
            continue
        src.pending_count += 1
        deadline = _aware(it.deadline_at)
        overdue = deadline is not None and deadline < now
        if overdue:
            src.overdue_count += 1
            src.blocking_count += 1
            blockers.append(
                {
                    "source": "onboarding",
                    "id": str(it.id),
                    "title": (it.display_name or "").strip() or "Onboarding document",
                    "deadline_at": deadline.isoformat() if deadline else None,
                }
            )
    return blockers, src


def _builder_blockers(db: Session, user_id: UUID, now: datetime) -> tuple[List[Dict], SourceCounts]:
    blockers: List[Dict] = []
    src = SourceCounts()
    if not settings.signature_builder_blocking_enabled:
        # Still count pending for inbox; blocking only when flag enabled
        parts = (
            db.query(DocumentSignatureParticipant)
            .join(
                DocumentSignatureRequest,
                DocumentSignatureRequest.id == DocumentSignatureParticipant.request_id,
            )
            .filter(
                DocumentSignatureParticipant.signer_user_id == user_id,
                DocumentSignatureParticipant.status == "ready",
                DocumentSignatureRequest.status.in_(["pending", "in_progress"]),
            )
            .all()
        )
        src.pending_count = len(parts)
        return blockers, src

    parts = (
        db.query(DocumentSignatureParticipant, DocumentSignatureRequest)
        .join(
            DocumentSignatureRequest,
            DocumentSignatureRequest.id == DocumentSignatureParticipant.request_id,
        )
        .filter(
            DocumentSignatureParticipant.signer_user_id == user_id,
            DocumentSignatureParticipant.status == "ready",
            DocumentSignatureRequest.status.in_(["pending", "in_progress"]),
            DocumentSignatureRequest.block_hub_access.is_(True),
        )
        .all()
    )
    for part, req in parts:
        src.pending_count += 1
        deadline = _aware(part.deadline_at)
        overdue = deadline is not None and deadline < now
        if overdue:
            src.overdue_count += 1
            src.blocking_count += 1
            blockers.append(
                {
                    "source": "document_builder",
                    "id": str(req.id),
                    "title": req.display_name or "Document",
                    "deadline_at": deadline.isoformat() if deadline else None,
                }
            )
    return blockers, src


def get_signature_compliance(db: Session, user_id: UUID) -> ComplianceResult:
    try:
        now = _now_utc()
        ob_blockers, ob_src = _onboarding_blockers(db, user_id, now)
        bb_blockers, bb_src = _builder_blockers(db, user_id, now)
        all_blockers = ob_blockers + bb_blockers
        blocked = len(all_blockers) > 0

        ob_pending = sum(
            1
            for it in _onboarding_my_items(db, user_id)
            if it.status == "pending" and it.required
        )
        bb_pending = (
            db.query(DocumentSignatureParticipant)
            .join(
                DocumentSignatureRequest,
                DocumentSignatureRequest.id == DocumentSignatureParticipant.request_id,
            )
            .filter(
                DocumentSignatureParticipant.signer_user_id == user_id,
                DocumentSignatureParticipant.status == "ready",
                DocumentSignatureRequest.status.in_(["pending", "in_progress"]),
            )
            .count()
        )
        pending_count = ob_pending + bb_pending

        overdue_count = ob_src.overdue_count + bb_src.overdue_count

        action_required_count = ob_pending + bb_pending

        earliest: Optional[datetime] = None
        for it in _onboarding_my_items(db, user_id):
            if it.status == "pending" and it.required:
                d = _aware(it.deadline_at)
                if d and (earliest is None or d < earliest):
                    earliest = d
        ready_parts = (
            db.query(DocumentSignatureParticipant)
            .join(
                DocumentSignatureRequest,
                DocumentSignatureRequest.id == DocumentSignatureParticipant.request_id,
            )
            .filter(
                DocumentSignatureParticipant.signer_user_id == user_id,
                DocumentSignatureParticipant.status == "ready",
                DocumentSignatureRequest.status.in_(["pending", "in_progress"]),
            )
            .all()
        )
        for p in ready_parts:
            d = _aware(p.deadline_at)
            if d and (earliest is None or d < earliest):
                earliest = d

        return ComplianceResult(
            has_pending=pending_count > 0,
            pending_count=pending_count,
            overdue_count=overdue_count,
            blocked=blocked,
            earliest_deadline=earliest,
            sources={
                "onboarding": ob_src,
                "document_builder": bb_src,
            },
            blockers=all_blockers,
            action_required_count=action_required_count,
        )
    except ComplianceCheckError:
        raise
    except Exception as exc:
        raise ComplianceCheckError(str(exc)) from exc


def compliance_result_to_status_dict(result: ComplianceResult) -> dict:
    return {
        "has_pending": result.has_pending,
        "pending_count": result.pending_count,
        "action_required_count": result.action_required_count,
        "overdue_count": result.overdue_count,
        "blocked": result.blocked,
        "status_available": True,
        "earliest_deadline": result.earliest_deadline.isoformat() if result.earliest_deadline else None,
        "sources": {
            "onboarding": {
                "pending_count": result.sources["onboarding"].pending_count,
                "overdue_count": result.sources["onboarding"].overdue_count,
                "blocking_count": result.sources["onboarding"].blocking_count,
            },
            "document_builder": {
                "pending_count": result.sources["document_builder"].pending_count,
                "overdue_count": result.sources["document_builder"].overdue_count,
                "blocking_count": result.sources["document_builder"].blocking_count,
            },
        },
    }


def _inbox_status_onboarding(it: OnboardingAssignmentItem, now: datetime) -> str:
    if it.status == "signed":
        return "signed"
    return "action_required"


def _inbox_status_builder(part: DocumentSignatureParticipant, req: DocumentSignatureRequest) -> str:
    if req.status == "cancelled":
        return "cancelled"
    if part.status == "signed" or req.status == "completed":
        return "signed"
    if part.status == "ready":
        return "action_required"
    return "waiting"


def get_user_signature_inbox(
    db: Session,
    user_id: UUID,
    *,
    include_completed_limit: int = 20,
) -> dict:
    now = _now_utc()
    items: List[dict] = []
    sections = {"action_required": 0, "waiting": 0, "completed": 0}

    promote_scheduled_assignment_items(db, user_id)
    for it in _onboarding_my_items(db, user_id):
        deadline = _aware(it.deadline_at)
        overdue = it.status == "pending" and deadline is not None and deadline < now
        block_on_overdue = bool(it.required)
        is_access_blocker = block_on_overdue and overdue and it.status == "pending" and it.required
        status = _inbox_status_onboarding(it, now)
        if status == "action_required":
            sections["action_required"] += 1
        elif status == "signed":
            sections["completed"] += 1
        row = {
            "id": str(it.id),
            "source": "onboarding",
            "title": (it.display_name or "").strip() or "Onboarding document",
            "status": status,
            "available_at": _aware(it.available_at).isoformat() if it.available_at else None,
            "deadline_at": deadline.isoformat() if deadline else None,
            "is_overdue": overdue,
            "block_on_overdue": block_on_overdue,
            "is_access_blocker": is_access_blocker,
            "required": it.required,
            "requested_by_name": None,
            "created_at": _aware(it.available_at).isoformat() if it.available_at else None,
            "my_role_label": None,
            "participant_status": None,
            "subject_label": None,
            "user_message": it.user_message,
            "signed_at": it.signed_at.isoformat() if it.signed_at else None,
            "signed_file_id": str(it.signed_file_id) if it.signed_file_id else None,
        }
        if getattr(it, "subject_user_id", None):
            from ..models.models import EmployeeProfile

            su = db.query(User).filter(User.id == it.subject_user_id).first()
            sep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == it.subject_user_id).first()
            if sep and (sep.first_name or sep.last_name):
                row["subject_label"] = f"{(sep.first_name or '').strip()} {(sep.last_name or '').strip()}".strip()
            elif su:
                row["subject_label"] = su.username
        items.append(row)

    parts = (
        db.query(DocumentSignatureParticipant)
        .filter(DocumentSignatureParticipant.signer_user_id == user_id)
        .order_by(DocumentSignatureParticipant.created_at.desc())
        .limit(200)
        .all()
    )
    by_req: dict = {}
    for p in parts:
        prev = by_req.get(p.request_id)
        if prev is None:
            by_req[p.request_id] = p
            continue
        if p.status == "ready" and prev.status != "ready":
            by_req[p.request_id] = p

    for p in by_req.values():
        req = db.query(DocumentSignatureRequest).filter(DocumentSignatureRequest.id == p.request_id).first()
        if not req:
            continue
        deadline = _aware(p.deadline_at)
        overdue = (
            p.status == "ready"
            and req.status in ("pending", "in_progress")
            and deadline is not None
            and deadline < now
        )
        block_on_overdue = bool(req.block_hub_access)
        is_access_blocker = (
            block_on_overdue
            and overdue
            and settings.signature_builder_blocking_enabled
            and req.status in ("pending", "in_progress")
        )
        status = _inbox_status_builder(p, req)
        if status == "action_required":
            sections["action_required"] += 1
        elif status == "waiting":
            sections["waiting"] += 1
        elif status == "signed":
            sections["completed"] += 1
        items.append(
            {
                "id": str(req.id),
                "source": "document_builder",
                "title": req.display_name or "Document",
                "status": status,
                "available_at": _aware(p.available_at).isoformat() if p.available_at else None,
                "deadline_at": deadline.isoformat() if deadline else None,
                "is_overdue": overdue,
                "block_on_overdue": block_on_overdue,
                "is_access_blocker": is_access_blocker,
                "required": None,
                "requested_by_name": get_user_display(db, req.requested_by_id) if req.requested_by_id else None,
                "created_at": req.created_at.isoformat() if req.created_at else None,
                "my_role_label": p.role_label or p.role,
                "participant_status": p.status,
                "subject_label": None,
                "user_message": req.message_to_signers,
                "signed_at": p.signed_at.isoformat() if p.signed_at else None,
                "signed_file_id": str(req.signed_file_id) if req.signed_file_id else None,
            }
        )

    def sort_key(row: dict) -> tuple:
        priority = {"action_required": 0, "waiting": 1, "signed": 2, "cancelled": 3}.get(row["status"], 9)
        return (priority, row.get("deadline_at") or "", row.get("created_at") or "")

    items.sort(key=sort_key)

    completed = [i for i in items if i["status"] == "signed"]
    non_completed = [i for i in items if i["status"] != "signed"]
    out_items = non_completed + completed[:include_completed_limit]

    return {"items": out_items, "sections": sections}


def set_participant_turn_deadline(
    participant: DocumentSignatureParticipant,
    request: DocumentSignatureRequest,
    *,
    now: Optional[datetime] = None,
) -> None:
    """Set available_at/deadline_at when participant becomes ready."""
    t = now or _now_utc()
    participant.available_at = t
    days = request.signing_deadline_days
    if days is not None and int(days) >= 1:
        participant.deadline_at = t + timedelta(days=int(days))
    else:
        participant.deadline_at = None
