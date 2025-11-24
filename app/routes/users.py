from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
import uuid

from ..db import get_db
from ..models.models import User, Role, EmployeeProfile
from ..auth.security import require_permissions


router = APIRouter(prefix="/users", tags=["users"])


def _user_to_dict(u: User, ep: Optional[EmployeeProfile]) -> dict:
    name = (getattr(ep, 'preferred_name', None) or '').strip() if ep else ''
    if not name:
        first = (getattr(ep, 'first_name', None) or '').strip() if ep else ''
        last = (getattr(ep, 'last_name', None) or '').strip() if ep else ''
        name = ' '.join([x for x in [first, last] if x])
    roles = [r.name for r in getattr(u, 'roles', [])]
    divisions = [{"id": str(d.id), "label": d.label} for d in getattr(u, 'divisions', [])]
    return {
        "id": str(u.id),
        "username": u.username,
        "email": u.email_personal,
        "is_active": u.is_active,
        "name": name or None,
        "roles": roles,
        "divisions": divisions,
        "profile_photo_file_id": str(getattr(ep, 'profile_photo_file_id')) if (ep and getattr(ep, 'profile_photo_file_id', None)) else None,
        "manager_user_id": str(ep.manager_user_id) if (ep and ep.manager_user_id) else None,
    }


@router.get("")
def list_users(
    q: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("users:read"))
):
    """
    List users with pagination
    
    Args:
        q: Search query (username, email, or name)
        page: Page number (1-indexed)
        limit: Number of items per page (default 50, max 200)
    """
    # Ensure reasonable limits
    limit = min(max(1, limit), 200)
    page = max(1, page)
    offset = (page - 1) * limit
    
    query = db.query(User, EmployeeProfile).outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)
    if q:
        like = f"%{q}%"
        query = query.filter(
            (User.username.ilike(like)) | 
            (User.email_personal.ilike(like)) | 
            (EmployeeProfile.first_name.ilike(like)) | 
            (EmployeeProfile.last_name.ilike(like)) | 
            (EmployeeProfile.preferred_name.ilike(like))
        )
    
    # Get total count for pagination
    total_count = query.count()
    
    # Get paginated results
    rows = query.order_by(User.created_at.desc()).offset(offset).limit(limit).all()
    
    return {
        "items": [_user_to_dict(u, ep) for u, ep in rows],
        "total": total_count,
        "page": page,
        "limit": limit,
        "total_pages": (total_count + limit - 1) // limit if limit > 0 else 0
    }


@router.get("/{user_id}")
def get_user(user_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("users:read"))):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == u.id).first()
    return _user_to_dict(u, ep)


@router.get("/roles/all")
def list_roles(db: Session = Depends(get_db), _=Depends(require_permissions("users:read"))):
    rows = db.query(Role).order_by(Role.name.asc()).all()
    return [{"id": str(r.id), "name": r.name} for r in rows]


@router.patch("/{user_id}")
def update_user(user_id: str, payload: dict, db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    from ..models.models import SettingList, SettingItem
    
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    roles = payload.get("roles")
    is_active = payload.get("is_active")
    divisions = payload.get("divisions")
    if roles is not None:
        # roles can be list of names
        role_rows = db.query(Role).filter(Role.name.in_(roles)).all() if roles else []
        u.roles = role_rows
    if is_active is not None:
        u.is_active = bool(is_active)
    if divisions is not None:
        # divisions can be list of division IDs (UUIDs)
        divisions_list = db.query(SettingList).filter(SettingList.name == "divisions").first()
        if divisions_list:
            division_items = db.query(SettingItem).filter(
                SettingItem.list_id == divisions_list.id,
                SettingItem.id.in_([uuid.UUID(did) for did in divisions])
            ).all() if divisions else []
            u.divisions = division_items
    db.commit()
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == u.id).first()
    return _user_to_dict(u, ep)


