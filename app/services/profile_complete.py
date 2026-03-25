"""Detect when employee profile matches the same rules as AppShell isProfileComplete."""
from uuid import UUID

from sqlalchemy.orm import Session

from ..models.models import EmployeeEmergencyContact, EmployeeProfile


def is_profile_complete(db: Session, user_id: UUID) -> bool:
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first()
    if not ep:
        return False
    req = [
        "gender",
        "date_of_birth",
        "marital_status",
        "nationality",
        "phone",
        "address_line1",
        "city",
        "province",
        "postal_code",
        "country",
        "sin_number",
    ]
    for k in req:
        if not str(getattr(ep, k, None) or "").strip():
            return False
    wes = getattr(ep, "work_permit_status", None) or getattr(ep, "work_eligibility_status", None)
    if not str(wes or "").strip():
        return False
    ec = (
        db.query(EmployeeEmergencyContact)
        .filter(EmployeeEmergencyContact.user_id == user_id)
        .first()
    )
    if not ec:
        return False
    return True
