"""Warranty and claim alert processing with idempotent notification tracking."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional, Set

from sqlalchemy.orm import Session

from ..models.models import Project, ProjectWarranty, WarrantyAlertEvent, WarrantyClaim
from .notifications import create_notification
from .warranty import (
    CLAIM_ASSESSMENT_PENDING_DAYS,
    CLAIM_FOLLOW_UP_WARNING_DAYS,
    CLAIM_OPEN_TOO_LONG_DAYS,
    EXPIRATION_ALERT_DAYS,
    MAINTENANCE_ALERT_DAYS,
    PENDING_WARRANTY_STATUSES,
    TERMINAL_WARRANTY_STATUSES,
    apply_warranty_status_transitions,
)


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _already_sent(db: Session, entity_type: str, entity_id: uuid.UUID, alert_key: str) -> bool:
    return (
        db.query(WarrantyAlertEvent.id)
        .filter(
            WarrantyAlertEvent.entity_type == entity_type,
            WarrantyAlertEvent.entity_id == entity_id,
            WarrantyAlertEvent.alert_key == alert_key,
        )
        .first()
        is not None
    )


def _record_sent(db: Session, entity_type: str, entity_id: uuid.UUID, alert_key: str) -> None:
    if _already_sent(db, entity_type, entity_id, alert_key):
        return
    db.add(
        WarrantyAlertEvent(
            entity_type=entity_type,
            entity_id=entity_id,
            alert_key=alert_key,
        )
    )


def _notify_users(
    db: Session,
    user_ids: Set[uuid.UUID],
    template_key: str,
    payload: dict,
) -> None:
    for uid in user_ids:
        if not uid:
            continue
        try:
            create_notification(db, str(uid), "push", template_key, payload_json=payload)
        except Exception:
            pass


def _warranty_recipients(warranty: ProjectWarranty, project: Project) -> Set[uuid.UUID]:
    ids: Set[uuid.UUID] = set()
    if warranty.internal_responsible_user_id:
        ids.add(warranty.internal_responsible_user_id)
    if project.project_admin_id:
        ids.add(project.project_admin_id)
    return ids


def process_warranty_alerts(db: Session) -> int:
    """Run status transitions and send due alerts. Returns count of new notifications attempted."""
    today = _today()
    sent = 0

    warranties = db.query(ProjectWarranty).filter(ProjectWarranty.cancelled_at.is_(None)).all()
    for w in warranties:
        if apply_warranty_status_transitions(w, today):
            w.updated_at = datetime.now(timezone.utc)

    db.flush()

    project_cache: dict = {}

    for w in warranties:
        status = (w.status or "").lower()
        if status in TERMINAL_WARRANTY_STATUSES:
            continue
        project = project_cache.get(w.project_id)
        if not project:
            project = db.query(Project).filter(Project.id == w.project_id).first()
            project_cache[w.project_id] = project
        if not project:
            continue
        recipients = _warranty_recipients(w, project)

        if w.end_date:
            days_until = (w.end_date - today).days
            for threshold in EXPIRATION_ALERT_DAYS:
                key = f"expiration_{threshold}_days" if threshold > 0 else "expiration_date"
                if days_until == threshold and not _already_sent(db, "warranty", w.id, key):
                    _record_sent(db, "warranty", w.id, key)
                    if threshold > 0:
                        msg = f"{w.name} expires in {threshold} days."
                    else:
                        msg = f"{w.name} expires today."
                    _notify_users(
                        db,
                        recipients,
                        "warranty_expiration",
                        {
                            "message": msg,
                            "warranty_id": str(w.id),
                            "project_id": str(w.project_id),
                            "expiration_date": w.end_date.isoformat(),
                        },
                    )
                    sent += 1

        if w.maintenance_required and w.next_maintenance_due_date:
            days_until = (w.next_maintenance_due_date - today).days
            if days_until < 0:
                key = f"maintenance_overdue_{abs(days_until)}"
                if days_until >= -30 and not _already_sent(db, "warranty", w.id, "maintenance_overdue"):
                    _record_sent(db, "warranty", w.id, "maintenance_overdue")
                    _notify_users(
                        db,
                        recipients,
                        "warranty_maintenance_overdue",
                        {
                            "message": f"Required warranty maintenance is overdue by {abs(days_until)} days.",
                            "warranty_name": w.name,
                            "due_date": w.next_maintenance_due_date.isoformat(),
                            "project_id": str(w.project_id),
                            "warranty_id": str(w.id),
                        },
                    )
                    sent += 1
            else:
                for threshold in MAINTENANCE_ALERT_DAYS:
                    key = f"maintenance_{threshold}_days" if threshold > 0 else "maintenance_due_date"
                    if days_until == threshold and not _already_sent(db, "warranty", w.id, key):
                        _record_sent(db, "warranty", w.id, key)
                        if threshold > 0:
                            msg = f"Required warranty maintenance is due in {threshold} days."
                        else:
                            msg = "Required warranty maintenance is due today."
                        _notify_users(
                            db,
                            recipients,
                            "warranty_maintenance_due",
                            {
                                "message": msg,
                                "warranty_name": w.name,
                                "due_date": w.next_maintenance_due_date.isoformat(),
                                "project_id": str(w.project_id),
                                "warranty_id": str(w.id),
                            },
                        )
                        sent += 1

        if status == "pending_documents":
            key = "pending_documents"
            if not _already_sent(db, "warranty", w.id, key):
                _record_sent(db, "warranty", w.id, key)
                _notify_users(
                    db,
                    recipients,
                    "warranty_pending_documents",
                    {"message": f"{w.name} is pending documents.", "warranty_id": str(w.id), "project_id": str(w.project_id)},
                )
                sent += 1

        if status == "pending_registration":
            key = "pending_registration"
            if not _already_sent(db, "warranty", w.id, key):
                _record_sent(db, "warranty", w.id, key)
                _notify_users(
                    db,
                    recipients,
                    "warranty_pending_registration",
                    {"message": f"{w.name} is pending registration.", "warranty_id": str(w.id), "project_id": str(w.project_id)},
                )
                sent += 1

        if w.document_required:
            from ..models.models import ClientFile

            doc_count = (
                db.query(ClientFile)
                .filter(
                    ClientFile.related_warranty_id == w.id,
                    ClientFile.category == "warranty",
                    ClientFile.deleted_at.is_(None),
                )
                .count()
            )
            if doc_count == 0 and not _already_sent(db, "warranty", w.id, "document_required_missing"):
                _record_sent(db, "warranty", w.id, "document_required_missing")
                _notify_users(
                    db,
                    recipients,
                    "warranty_document_required",
                    {"message": f"{w.name} requires a document but none has been uploaded.", "warranty_id": str(w.id)},
                )
                sent += 1

        if w.registration_required and not (w.certificate_or_registration_number or "").strip():
            if not _already_sent(db, "warranty", w.id, "registration_number_missing"):
                _record_sent(db, "warranty", w.id, "registration_number_missing")
                _notify_users(
                    db,
                    recipients,
                    "warranty_registration_required",
                    {"message": f"{w.name} requires a certificate or registration number.", "warranty_id": str(w.id)},
                )
                sent += 1

    open_statuses = ["reported", "under_review", "site_visit_required", "scheduled", "in_progress"]
    claims = (
        db.query(WarrantyClaim)
        .filter(WarrantyClaim.cancelled_at.is_(None), WarrantyClaim.status.in_(open_statuses))
        .all()
    )
    for c in claims:
        project = project_cache.get(c.project_id)
        if not project:
            project = db.query(Project).filter(Project.id == c.project_id).first()
            project_cache[c.project_id] = project
        recipients: Set[uuid.UUID] = set()
        if project and project.project_admin_id:
            recipients.add(project.project_admin_id)
        if c.assigned_user_id:
            recipients.add(c.assigned_user_id)

        if c.severity == "emergency" and not _already_sent(db, "claim", c.id, "emergency_created"):
            _record_sent(db, "claim", c.id, "emergency_created")
            if project and project.project_admin_id:
                _notify_users(
                    db,
                    {project.project_admin_id},
                    "warranty_claim_emergency",
                    {"message": f"Emergency warranty claim {c.claim_number} was reported.", "claim_id": str(c.id)},
                )
                sent += 1

        if not c.assigned_user_id and not _already_sent(db, "claim", c.id, "unassigned"):
            _record_sent(db, "claim", c.id, "unassigned")
            if project and project.project_admin_id:
                _notify_users(
                    db,
                    {project.project_admin_id},
                    "warranty_claim_unassigned",
                    {"message": f"Claim {c.claim_number} requires assignment.", "claim_id": str(c.id)},
                )
                sent += 1

        if c.coverage_decision == "pending_assessment" and c.reported_date:
            days_open = (today - c.reported_date).days
            if days_open >= CLAIM_ASSESSMENT_PENDING_DAYS and not _already_sent(db, "claim", c.id, "assessment_pending"):
                _record_sent(db, "claim", c.id, "assessment_pending")
                _notify_users(
                    db,
                    recipients,
                    "warranty_claim_assessment_pending",
                    {"message": f"Claim {c.claim_number} has been awaiting assessment for {days_open} days.", "claim_id": str(c.id)},
                )
                sent += 1

        if c.reported_date:
            days_open = (today - c.reported_date).days
            if days_open >= CLAIM_OPEN_TOO_LONG_DAYS and not _already_sent(db, "claim", c.id, "open_too_long"):
                _record_sent(db, "claim", c.id, "open_too_long")
                _notify_users(
                    db,
                    recipients,
                    "warranty_claim_open_long",
                    {"message": f"Claim {c.claim_number} has been open for {days_open} days.", "claim_id": str(c.id)},
                )
                sent += 1

        if c.coverage_decision not in ("pending_assessment", None) and not c.customer_notified_date:
            if not _already_sent(db, "claim", c.id, "customer_not_notified"):
                _record_sent(db, "claim", c.id, "customer_not_notified")
                _notify_users(
                    db,
                    recipients,
                    "warranty_claim_customer_not_notified",
                    {"message": f"Customer has not been notified for claim {c.claim_number}.", "claim_id": str(c.id)},
                )
                sent += 1

        if c.follow_up_required and c.follow_up_date:
            days_until = (c.follow_up_date - today).days
            if days_until == CLAIM_FOLLOW_UP_WARNING_DAYS and not _already_sent(db, "claim", c.id, "follow_up_soon"):
                _record_sent(db, "claim", c.id, "follow_up_soon")
                _notify_users(
                    db,
                    recipients,
                    "warranty_claim_follow_up_soon",
                    {"message": f"Follow-up for claim {c.claim_number} is due in {days_until} days.", "claim_id": str(c.id)},
                )
                sent += 1
            if days_until < 0 and not _already_sent(db, "claim", c.id, "follow_up_overdue"):
                _record_sent(db, "claim", c.id, "follow_up_overdue")
                _notify_users(
                    db,
                    recipients,
                    "warranty_claim_follow_up_overdue",
                    {"message": f"Follow-up for claim {c.claim_number} is overdue.", "claim_id": str(c.id)},
                )
                sent += 1

    db.commit()
    return sent
