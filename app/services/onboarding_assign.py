"""Apply onboarding base documents to users; HR Documents folder helper."""
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy.orm import Session

from ..models.models import (
    HR_DOCUMENTS_FOLDER_NAME,
    EmployeeDocument,
    EmployeeFolder,
    EmployeeProfile,
    Notification,
    OnboardingAssignment,
    OnboardingAssignmentItem,
    OnboardingBaseDocument,
    OnboardingPackage,
    User,
)
from .onboarding_delivery import compute_available_at, hire_anchor_start, item_initial_status
from .profile_complete import is_profile_complete

SYSTEM_ONBOARDING_PACKAGE_NAME = "HR Onboarding"


def get_or_create_system_package(db: Session) -> OnboardingPackage:
    p = (
        db.query(OnboardingPackage)
        .filter(OnboardingPackage.name == SYSTEM_ONBOARDING_PACKAGE_NAME)
        .first()
    )
    if not p:
        p = OnboardingPackage(
            name=SYSTEM_ONBOARDING_PACKAGE_NAME,
            description="System package for onboarding base documents",
            active=True,
        )
        db.add(p)
        db.flush()
    return p


def get_or_create_hr_documents_folder(db: Session, user_id: UUID, created_by: Optional[UUID] = None) -> EmployeeFolder:
    f = (
        db.query(EmployeeFolder)
        .filter(EmployeeFolder.user_id == user_id, EmployeeFolder.name == HR_DOCUMENTS_FOLDER_NAME, EmployeeFolder.parent_id.is_(None))
        .first()
    )
    if f:
        return f
    f = EmployeeFolder(user_id=user_id, name=HR_DOCUMENTS_FOLDER_NAME, parent_id=None, created_by=created_by)
    db.add(f)
    db.flush()
    return f


def _assignment_item_exists(
    db: Session,
    assignment_id: UUID,
    base_document_id: UUID,
    subject_user_id: Optional[UUID],
) -> bool:
    q = db.query(OnboardingAssignmentItem).filter(
        OnboardingAssignmentItem.assignment_id == assignment_id,
        OnboardingAssignmentItem.base_document_id == base_document_id,
    )
    if subject_user_id is None:
        q = q.filter(OnboardingAssignmentItem.subject_user_id.is_(None))
    else:
        q = q.filter(OnboardingAssignmentItem.subject_user_id == subject_user_id)
    return q.first() is not None


def _get_or_create_assignment(db: Session, user_id: UUID, package_id: UUID, now: datetime) -> OnboardingAssignment:
    a = (
        db.query(OnboardingAssignment)
        .filter(OnboardingAssignment.user_id == user_id, OnboardingAssignment.package_id == package_id)
        .first()
    )
    if a:
        return a
    a = OnboardingAssignment(user_id=user_id, package_id=package_id, assigned_at=now, assigned_by_id=None)
    db.add(a)
    db.flush()
    return a


def maybe_apply_onboarding_after_profile_complete(db: Session, user_id: UUID) -> None:
    """If profile just became complete, run onboarding assignment once (idempotent per user)."""
    if not is_profile_complete(db, user_id):
        return
    apply_onboarding_after_profile_complete(db, user_id)


def apply_onboarding_after_profile_complete(db: Session, subject_user_id: UUID) -> None:
    """
    Assign all onboarding base documents according to each document's preferences.
    `subject_user_id` is the user who completed the profile wizard (the new hire).
    """
    user = db.query(User).filter(User.id == subject_user_id).first()
    if not user:
        return
    now = datetime.now(timezone.utc)
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == subject_user_id).first()
    hire_dt = ep.hire_date if ep else None
    hire_start = hire_anchor_start(hire_dt, now)

    pkg = get_or_create_system_package(db)
    # Ensure assignment row exists for the new hire (system package); items deduped per (doc, subject) below
    _get_or_create_assignment(db, subject_user_id, pkg.id, now)

    base_docs = (
        db.query(OnboardingBaseDocument).order_by(OnboardingBaseDocument.sort_order.asc(), OnboardingBaseDocument.name.asc()).all()
    )

    for bd in base_docs:
        if not getattr(bd, "employee_visible", True):
            continue
        assignee_type = (getattr(bd, "assignee_type", None) or "employee").lower()
        if assignee_type == "employee":
            assignee_targets: List[tuple[UUID, Optional[UUID]]] = [(subject_user_id, None)]
        else:
            raw_ids = getattr(bd, "assignee_user_ids", None)
            uid_list: List[UUID] = []
            if isinstance(raw_ids, list):
                seen = set()
                for x in raw_ids:
                    try:
                        u = UUID(str(x))
                        if u not in seen:
                            seen.add(u)
                            uid_list.append(u)
                    except Exception:
                        continue
            if not uid_list and getattr(bd, "assignee_user_id", None):
                uid_list = [bd.assignee_user_id]
            if not uid_list:
                continue
            assignee_targets = [(u, subject_user_id) for u in uid_list]

        available_at = compute_available_at(bd, hire_start, now)
        if available_at is None:
            continue

        sd = getattr(bd, "signing_deadline_days", None)
        signing_days = sd if isinstance(sd, int) and sd >= 1 else (bd.default_deadline_days or 7)
        deadline = available_at + timedelta(days=signing_days)
        disp = (getattr(bd, "display_name", None) or "").strip() or bd.name
        msg = (getattr(bd, "notification_message", None) or "").strip() or None
        req = getattr(bd, "required", True)
        sig_req = getattr(bd, "requires_signature", True)

        if not sig_req:
            st = "signed" if available_at <= now else "scheduled"
        else:
            st = item_initial_status(available_at, now)

        for target_uid, subject_uid in assignee_targets:
            asn = _get_or_create_assignment(db, target_uid, pkg.id, now)
            if _assignment_item_exists(db, asn.id, bd.id, subject_uid):
                continue
            db.add(
                OnboardingAssignmentItem(
                    assignment_id=asn.id,
                    base_document_id=bd.id,
                    required=req,
                    employee_visible=bool(getattr(bd, "employee_visible", True)),
                    available_at=available_at,
                    deadline_at=deadline,
                    status=st,
                    display_name=disp,
                    user_message=msg,
                    subject_user_id=subject_uid,
                )
            )
    db.commit()


def create_resend_assignment_items(
    db: Session,
    base_document_id: UUID,
    user_ids: List[UUID],
    assigned_by_id: Optional[UUID],
) -> int:
    """Create new pending items for users."""
    now = datetime.now(timezone.utc)
    bd = db.query(OnboardingBaseDocument).filter(OnboardingBaseDocument.id == base_document_id).first()
    if not bd:
        return 0
    days = bd.default_deadline_days or 7
    pkg = get_or_create_system_package(db)
    disp = (getattr(bd, "display_name", None) or "").strip() or bd.name
    count = 0
    for uid in user_ids:
        asn = (
            db.query(OnboardingAssignment)
            .filter(OnboardingAssignment.user_id == uid, OnboardingAssignment.package_id == pkg.id)
            .first()
        )
        if not asn:
            asn = OnboardingAssignment(user_id=uid, package_id=pkg.id, assigned_at=now, assigned_by_id=assigned_by_id)
            db.add(asn)
            db.flush()
        db.add(
            OnboardingAssignmentItem(
                assignment_id=asn.id,
                base_document_id=base_document_id,
                required=True,
                employee_visible=True,
                available_at=now,
                deadline_at=now + timedelta(days=days),
                status="pending",
                display_name=disp,
                user_message=None,
                subject_user_id=None,
            )
        )
        db.add(
            Notification(
                user_id=uid,
                channel="push",
                template_key="onboarding_signature_pending",
                payload_json={
                    "title": "Document to sign",
                    "message": f'"{disp}" is waiting for your signature.',
                    "type": "default",
                    "link": "/onboarding/documents",
                    "read": False,
                },
                status="pending",
                created_at=now,
            )
        )
        count += 1
    db.commit()
    return count


def promote_scheduled_assignment_items(db: Session, user_id: UUID) -> None:
    """Flip scheduled items to pending (or signed if no signature required) when available_at has passed."""
    now = datetime.now(timezone.utc)
    q = (
        db.query(OnboardingAssignmentItem)
        .join(OnboardingAssignment, OnboardingAssignment.id == OnboardingAssignmentItem.assignment_id)
        .filter(
            OnboardingAssignment.user_id == user_id,
            OnboardingAssignmentItem.status == "scheduled",
            OnboardingAssignmentItem.available_at <= now,
        )
    )
    for it in q.all():
        bd = db.query(OnboardingBaseDocument).filter(OnboardingBaseDocument.id == it.base_document_id).first()
        if bd and not getattr(bd, "requires_signature", True):
            it.status = "signed"
        else:
            it.status = "pending"
    db.commit()
