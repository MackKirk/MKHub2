from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import Optional, List
import uuid

from ..db import get_db
from ..models.models import User, Role, EmployeeProfile, UserHomeDashboard
from ..auth.security import require_permissions, get_current_user


router = APIRouter(prefix="/users", tags=["users"])


# ---------- Home dashboard (must be before /{user_id}) ----------

@router.get("/me/home-dashboard")
def get_my_home_dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Get current user's home dashboard layout and widgets. Returns null if not set (frontend uses default)."""
    row = db.query(UserHomeDashboard).filter(UserHomeDashboard.user_id == user.id).first()
    if not row:
        return None
    return {"layout": row.layout or [], "widgets": row.widgets or []}


@router.put("/me/home-dashboard")
def put_my_home_dashboard(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create or update current user's home dashboard layout and widgets."""
    layout = payload.get("layout")
    widgets = payload.get("widgets")
    if layout is None:
        layout = []
    if widgets is None:
        widgets = []
    row = db.query(UserHomeDashboard).filter(UserHomeDashboard.user_id == user.id).first()
    if row:
        row.layout = layout
        row.widgets = widgets
        row.updated_at = datetime.now(timezone.utc)
    else:
        row = UserHomeDashboard(user_id=user.id, layout=layout, widgets=widgets)
        db.add(row)
    db.commit()
    return {"layout": row.layout, "widgets": row.widgets}


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
        "job_title": getattr(ep, 'job_title', None) if ep else None,
        "phone": getattr(ep, 'phone', None) if ep else None,
        "mobile_phone": getattr(ep, 'mobile_phone', None) if ep else None,
    }


@router.get("")
def list_users(
    q: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("hr:users:read", "users:read"))  # New HR permission or legacy
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
def get_user(user_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Get user details. All users can view their own data."""
    from ..auth.security import _has_permission
    
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    
    # Check if user has permission to view other users, or if viewing own data
    has_permission = _has_permission(user, "hr:users:read") or _has_permission(user, "users:read")
    is_own_data = str(user.id) == str(user_id)
    
    if not has_permission and not is_own_data:
        raise HTTPException(status_code=403, detail="You can only view your own user data")
    
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == u.id).first()
    return _user_to_dict(u, ep)


@router.get("/roles/all")
def list_roles(db: Session = Depends(get_db), _=Depends(require_permissions("hr:users:read", "users:read"))):  # New HR permission or legacy
    rows = db.query(Role).order_by(Role.name.asc()).all()
    return [{"id": str(r.id), "name": r.name} for r in rows]


@router.patch("/{user_id}")
def update_user(user_id: str, payload: dict, db: Session = Depends(get_db), _=Depends(require_permissions("hr:users:write", "users:write"))):  # New HR permission or legacy
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


# =====================
# TEMPORARY: BambooHR Sync All (to be removed later)
# =====================

@router.post("/sync-bamboohr-all")
def sync_all_users_from_bamboohr(
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("hr:users:write", "users:write"))
):
    """
    TEMPORARY ENDPOINT - Sync all employees from BambooHR
    
    This endpoint will:
    1. Fetch all employees from BambooHR
    2. Create or update users in the system
    3. Sync photos, visas, and emergency contacts
    
    This is a temporary endpoint and should be removed in the future.
    """
    import sys
    import importlib.util
    from pathlib import Path
    
    # Get the scripts directory
    current_file = Path(__file__)
    project_root = current_file.parent.parent.parent
    script_dir = project_root / "scripts"
    sys.path.insert(0, str(script_dir))
    
    try:
        # Import the sync function
        spec = importlib.util.spec_from_file_location("sync_bamboohr_employees", script_dir / "sync_bamboohr_employees.py")
        if spec is None or spec.loader is None:
            raise HTTPException(status_code=500, detail="Could not load sync module")
        sync_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(sync_module)
        sync_employees = sync_module.sync_employees
        
        # Get parameters from payload
        update_existing = payload.get("update_existing", True)
        include_photos = payload.get("include_photos", True)
        force_update_photos = payload.get("force_update_photos", False)
        limit = payload.get("limit")  # Optional limit for testing
        
        # Run the sync (this will use its own database session)
        sync_employees(
            dry_run=False,
            update_existing=update_existing,
            limit=limit,
            include_photos=include_photos,
            force_update_photos=force_update_photos
        )
        
        return {
            "status": "success",
            "message": "BambooHR sync completed. Check server logs for details."
        }
        
    except Exception as e:
        import traceback
        error_msg = str(e)
        traceback_str = traceback.format_exc()
        print(f"[ERROR] Error during BambooHR sync: {error_msg}")
        print(f"[ERROR] Traceback: {traceback_str}")
        raise HTTPException(status_code=500, detail=f"Error during sync: {error_msg}")


