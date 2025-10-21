from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional, List

from ..db import get_db
from ..models.models import User, EmployeeProfile
from ..auth.security import get_current_user


router = APIRouter(prefix="/employees", tags=["employees"])


@router.get("")
def list_employees(q: Optional[str] = None, db: Session = Depends(get_db), _=Depends(get_current_user)):
    # Join users with employee profile when available
    query = db.query(User, EmployeeProfile).outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)
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
        out.append({
            "id": str(u.id),
            "username": u.username,
            "name": name,
            "job_title": getattr(ep, 'job_title', None) if ep else None,
            "profile_photo_file_id": str(getattr(ep, 'profile_photo_file_id')) if (ep and getattr(ep, 'profile_photo_file_id', None)) else None,
        })
    return out

