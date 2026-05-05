import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import Optional, List, Dict, Any

from ..db import get_db
from ..models.models import User, EmployeeProfile, user_divisions, SettingItem
from ..auth.security import get_current_user
from ..services.hierarchy import get_manager_chain, get_direct_reports


router = APIRouter(prefix="/employees", tags=["employees"])


def _divisions_for_user(db: Session, user_id: uuid.UUID) -> List[Dict[str, str]]:
    rows = (
        db.query(user_divisions.c.user_id, SettingItem.id, SettingItem.label)
        .join(SettingItem, SettingItem.id == user_divisions.c.division_id)
        .filter(user_divisions.c.user_id == user_id)
        .all()
    )
    return [{"id": str(div_id), "label": (label or "").strip()} for _, div_id, label in rows]


def _employee_directory_payload(u: User, ep: Optional[EmployeeProfile], divisions: List[Dict[str, str]]) -> Dict[str, Any]:
    name = (getattr(ep, "preferred_name", None) or "").strip() if ep else ""
    if not name:
        first = (getattr(ep, "first_name", None) or "").strip() if ep else ""
        last = (getattr(ep, "last_name", None) or "").strip() if ep else ""
        name = " ".join([x for x in [first, last] if x])
    if not name:
        name = u.username

    dept_from_divisions = ", ".join(d["label"] for d in divisions if d.get("label")) if divisions else None
    department = dept_from_divisions or ((getattr(ep, "division", None) or "").strip() or None if ep else None)

    phone = None
    work_phone = None
    work_email = None
    if ep:
        phone = (getattr(ep, "phone", None) or "").strip() or None
        mobile = (getattr(ep, "mobile_phone", None) or "").strip() or None
        if not phone and mobile:
            phone = mobile
        elif mobile and phone != mobile:
            phone = f"{phone} · {mobile}" if phone else mobile
        wp = (getattr(ep, "work_phone", None) or "").strip() or None
        work_phone = wp or None
        work_email = (getattr(ep, "work_email", None) or "").strip() or None

    pdivs = list(getattr(ep, "project_division_ids", None) or []) if ep else []
    corp = (getattr(u, "email_corporate", None) or "").strip() or None

    hire_iso = None
    if ep and getattr(ep, "hire_date", None):
        try:
            hire_iso = ep.hire_date.isoformat()
        except Exception:
            hire_iso = None

    return {
        "id": str(u.id),
        "username": u.username,
        "name": name,
        "hire_date": hire_iso,
        "first_name": (getattr(ep, "first_name", None) or "").strip() if ep else None,
        "last_name": (getattr(ep, "last_name", None) or "").strip() if ep else None,
        "email": u.email_personal,
        "email_corporate": corp,
        "work_email": work_email,
        "phone": phone,
        "work_phone": work_phone,
        "department": department,
        "divisions": divisions,
        "project_division_ids": [str(x) for x in pdivs if x is not None],
        "job_title": getattr(ep, "job_title", None) if ep else None,
        "profile_photo_file_id": str(getattr(ep, "profile_photo_file_id"))
        if (ep and getattr(ep, "profile_photo_file_id", None))
        else None,
        "roles": [r.name for r in getattr(u, "roles", [])] if hasattr(u, "roles") else [],
    }


@router.get("")
def list_employees(q: Optional[str] = None, db: Session = Depends(get_db), _=Depends(get_current_user)):
    # Join users with employee profile when available (no joinedload to avoid holding connection long)
    query = db.query(User, EmployeeProfile).outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)
    if q:
        like = f"%{q}%"
        query = query.filter((User.username.ilike(like)) | (EmployeeProfile.first_name.ilike(like)) | (EmployeeProfile.last_name.ilike(like)) | (EmployeeProfile.preferred_name.ilike(like)))
    rows = query.order_by(User.created_at.desc()).limit(200).all()

    # Load divisions in one batch query to avoid N+1 and heavy joinedload
    user_ids = [u.id for u, _ in rows]
    divisions_by_user: dict = defaultdict(list)
    if user_ids:
        div_rows = (
            db.query(user_divisions.c.user_id, SettingItem.id, SettingItem.label)
            .join(SettingItem, SettingItem.id == user_divisions.c.division_id)
            .filter(user_divisions.c.user_id.in_(user_ids))
            .all()
        )
        for uid, div_id, label in div_rows:
            divisions_by_user[str(uid)].append({"id": str(div_id), "label": (label or "").strip()})

    out: List[dict] = []
    for u, ep in rows:
        divisions = divisions_by_user.get(str(u.id), [])
        row = _employee_directory_payload(u, ep, divisions)
        # Build formatted address from profile (list view only)
        address = None
        if ep:
            parts = []
            if getattr(ep, "address_line1", None):
                parts.append((ep.address_line1 or "").strip())
            if getattr(ep, "address_line2", None):
                parts.append((ep.address_line2 or "").strip())
            city = (getattr(ep, "city", None) or "").strip()
            province = (getattr(ep, "province", None) or "").strip()
            postal = (getattr(ep, "postal_code", None) or "").strip()
            country = (getattr(ep, "country", None) or "").strip()
            locality = ", ".join([x for x in [city, province] if x])
            if locality:
                parts.append(locality)
            if postal:
                parts.append(postal)
            if country:
                parts.append(country)
            address = ", ".join(parts) if parts else None
        row["address"] = address
        # Match previous list shape: single "phone" field (primary + mobile collapsed)
        if ep:
            primary = (getattr(ep, "phone", None) or "").strip() or None
            mobile = (getattr(ep, "mobile_phone", None) or "").strip() or None
            row["phone"] = primary or mobile
        out.append(row)
    return out


@router.get("/reports")
def employee_reports(manager_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return get_direct_reports(manager_id, db)


@router.get("/{user_id}/directory-card")
def employee_directory_card(user_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Directory-style profile for one user (e.g. community @mention peek). Authenticated employees only."""
    try:
        uid = uuid.UUID(str(user_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")
    u = db.query(User).options(joinedload(User.roles)).filter(User.id == uid).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == uid).first()
    divisions = _divisions_for_user(db, u.id)
    return _employee_directory_payload(u, ep, divisions)


@router.get("/{user_id}/hierarchy")
def employee_hierarchy(user_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    chain = get_manager_chain(user_id, db)
    return {
        "manager_chain": chain,
        "direct_reports": get_direct_reports(user_id, db),
    }

