from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from typing import Optional, List

from ..db import get_db
from ..models.models import User, EmployeeProfile
from ..auth.security import get_current_user
from ..routes.projects import require_permissions  # reuse permission dep
from ..services.hierarchy import get_manager_chain, get_direct_reports


router = APIRouter(prefix="/employees", tags=["employees"])


@router.get("")
def list_employees(q: Optional[str] = None, db: Session = Depends(get_db), _=Depends(get_current_user)):
    # Join users with employee profile when available; load User.divisions for department/estimator filter
    query = (
        db.query(User, EmployeeProfile)
        .outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)
        .options(joinedload(User.divisions))
    )
    if q:
        like = f"%{q}%"
        query = query.filter((User.username.ilike(like)) | (EmployeeProfile.first_name.ilike(like)) | (EmployeeProfile.last_name.ilike(like)) | (EmployeeProfile.preferred_name.ilike(like)))
    rows = query.order_by(User.created_at.desc()).limit(200).all()
    out: List[dict] = []
    for u, ep in rows:
        # Preferred display name
        name = (getattr(ep, 'preferred_name', None) or '').strip() if ep else ''
        if not name:
            first = (getattr(ep, 'first_name', None) or '').strip() if ep else ''
            last = (getattr(ep, 'last_name', None) or '').strip() if ep else ''
            name = ' '.join([x for x in [first, last] if x])
        if not name:
            name = u.username
        # Build formatted address from profile
        address = None
        if ep:
            parts = []
            if getattr(ep, 'address_line1', None):
                parts.append((ep.address_line1 or '').strip())
            if getattr(ep, 'address_line2', None):
                parts.append((ep.address_line2 or '').strip())
            city = (getattr(ep, 'city', None) or '').strip()
            province = (getattr(ep, 'province', None) or '').strip()
            postal = (getattr(ep, 'postal_code', None) or '').strip()
            country = (getattr(ep, 'country', None) or '').strip()
            locality = ', '.join([x for x in [city, province] if x])
            if locality:
                parts.append(locality)
            if postal:
                parts.append(postal)
            if country:
                parts.append(country)
            address = ', '.join(parts) if parts else None

        # User divisions (from Users page Departments) - list of {id, label}
        user_divisions = getattr(u, 'divisions', []) or []
        divisions = [{"id": str(d.id), "label": (d.label or '').strip()} for d in user_divisions if d and getattr(d, 'label', None)]
        # department: prefer comma-separated labels from User.divisions; fallback to EmployeeProfile.division
        dept_from_divisions = ", ".join(d["label"] for d in divisions if d["label"]) if divisions else None
        department = dept_from_divisions or ((getattr(ep, 'division', None) or '').strip() or None if ep else None)

        out.append({
            "id": str(u.id),
            "username": u.username,
            "name": name,
            "first_name": (getattr(ep, 'first_name', None) or '').strip() if ep else None,
            "last_name": (getattr(ep, 'last_name', None) or '').strip() if ep else None,
            "email": u.email_personal,
            "phone": getattr(ep, 'phone', None) or getattr(ep, 'mobile_phone', None) if ep else None,
            "address": address,
            "department": department,
            "divisions": divisions,
            "job_title": getattr(ep, 'job_title', None) if ep else None,
            "profile_photo_file_id": str(getattr(ep, 'profile_photo_file_id')) if (ep and getattr(ep, 'profile_photo_file_id', None)) else None,
            "roles": [r.name for r in getattr(u, 'roles', [])] if hasattr(u, 'roles') else [],
        })
    return out


@router.get("/{user_id}/hierarchy")
def employee_hierarchy(user_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    chain = get_manager_chain(user_id, db)
    return {
        "manager_chain": chain,
        "direct_reports": get_direct_reports(user_id, db),
    }


@router.get("/reports")
def employee_reports(manager_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return get_direct_reports(manager_id, db)

