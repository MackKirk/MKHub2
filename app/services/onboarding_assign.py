"""Apply onboarding packages to users; HR Documents folder helper."""
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from ..models.models import (
    HR_DOCUMENTS_FOLDER_NAME,
    EmployeeDocument,
    EmployeeFolder,
    Invite,
    OnboardingAssignment,
    OnboardingAssignmentItem,
    OnboardingBaseDocument,
    OnboardingPackage,
    OnboardingPackageItem,
    OnboardingTrigger,
    User,
)


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


def _user_division_ids(user: User) -> List[str]:
    out = []
    try:
        for d in user.divisions or []:
            out.append(str(d.id))
    except Exception:
        pass
    return out


def trigger_matches(trigger: OnboardingTrigger, user: User, invite: Optional[Invite]) -> bool:
    ct = (trigger.condition_type or "").lower()
    cv = trigger.condition_value or {}
    if ct == "all":
        return True
    if ct == "division":
        want = cv.get("division_ids") or []
        if not want:
            return False
        udiv = set(_user_division_ids(user))
        return bool(udiv.intersection(set(str(x) for x in want)))
    if ct == "flag":
        # Optional: match invite-stored flags later
        return False
    return False


def package_applies_to_user(db: Session, pkg: OnboardingPackage, user: User, invite: Optional[Invite]) -> bool:
    triggers = (
        db.query(OnboardingTrigger)
        .filter(OnboardingTrigger.package_id == pkg.id)
        .order_by(OnboardingTrigger.sort_order.asc())
        .all()
    )
    if not triggers:
        return False
    for t in triggers:
        if trigger_matches(t, user, invite):
            return True
    return False


def apply_onboarding_for_new_user(db: Session, user_id: UUID, invite: Optional[Invite] = None) -> None:
    user = db.query(User).options(joinedload(User.divisions)).filter(User.id == user_id).first()
    if not user:
        return
    now = datetime.now(timezone.utc)
    packages = db.query(OnboardingPackage).filter(OnboardingPackage.active.is_(True)).all()
    for pkg in packages:
        if not package_applies_to_user(db, pkg, user, invite):
            continue
        existing = (
            db.query(OnboardingAssignment)
            .filter(OnboardingAssignment.user_id == user_id, OnboardingAssignment.package_id == pkg.id)
            .first()
        )
        if existing:
            continue
        asn = OnboardingAssignment(user_id=user_id, package_id=pkg.id, assigned_at=now, assigned_by_id=None)
        db.add(asn)
        db.flush()
        items = (
            db.query(OnboardingPackageItem)
            .filter(OnboardingPackageItem.package_id == pkg.id)
            .order_by(OnboardingPackageItem.sort_order.asc())
            .all()
        )
        for pi in items:
            if not pi.employee_visible:
                continue
            bd = db.query(OnboardingBaseDocument).filter(OnboardingBaseDocument.id == pi.base_document_id).first()
            if not bd:
                continue
            days = bd.default_deadline_days or 7
            deadline = now + timedelta(days=days)
            db.add(
                OnboardingAssignmentItem(
                    assignment_id=asn.id,
                    base_document_id=pi.base_document_id,
                    required=pi.required,
                    employee_visible=pi.employee_visible,
                    deadline_at=deadline,
                    status="pending",
                )
            )
    db.commit()


def create_resend_assignment_items(
    db: Session,
    base_document_id: UUID,
    user_ids: List[UUID],
    assigned_by_id: Optional[UUID],
) -> int:
    """Create new pending items for users who had this base doc in an assignment (or all users with assignments)."""
    now = datetime.now(timezone.utc)
    bd = db.query(OnboardingBaseDocument).filter(OnboardingBaseDocument.id == base_document_id).first()
    if not bd:
        return 0
    days = bd.default_deadline_days or 7
    count = 0
    for uid in user_ids:
        asn = (
            db.query(OnboardingAssignment)
            .filter(OnboardingAssignment.user_id == uid)
            .order_by(OnboardingAssignment.assigned_at.desc())
            .first()
        )
        if not asn:
            pkg = db.query(OnboardingPackage).filter(OnboardingPackage.active.is_(True)).first()
            if not pkg:
                continue
            asn = OnboardingAssignment(user_id=uid, package_id=pkg.id, assigned_at=now, assigned_by_id=assigned_by_id)
            db.add(asn)
            db.flush()
        db.add(
            OnboardingAssignmentItem(
                assignment_id=asn.id,
                base_document_id=base_document_id,
                required=True,
                employee_visible=True,
                deadline_at=now + timedelta(days=days),
                status="pending",
            )
        )
        count += 1
    db.commit()
    return count
