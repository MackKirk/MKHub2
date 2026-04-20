import uuid
import time
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Literal, Any

import jwt
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
import re
try:
    import bcrypt as _bcrypt
except Exception:
    _bcrypt = None
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models.models import User
from ..services.business_line import (
    BUSINESS_LINE_CONSTRUCTION,
    BUSINESS_LINE_REPAIRS_MAINTENANCE,
    normalize_business_line,
)


pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
http_bearer = HTTPBearer(auto_error=False)


def get_password_hash(password: str) -> str:
    # Use pbkdf2_sha256 to avoid native bcrypt backend issues
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    # Fast-path legacy bcrypt ($2a$/$2b$/$2y$) using the bcrypt module directly to avoid passlib backend init quirks
    if hashed.startswith("$2a$") or hashed.startswith("$2b$") or hashed.startswith("$2y$"):
        if not _bcrypt:
            return False
        try:
            pb = plain.encode("utf-8")
        except Exception:
            pb = plain.encode()
        if len(pb) > 72:
            pb = pb[:72]
        try:
            return _bcrypt.checkpw(pb, hashed.encode("utf-8"))
        except Exception:
            return False
    # Otherwise, verify using pbkdf2_sha256 (current scheme)
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


def _create_token(sub: str, ttl_seconds: int, extra: Optional[dict] = None) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": sub,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl_seconds)).timestamp()),
        "jti": str(uuid.uuid4()),
    }
    if extra:
        payload.update(extra)
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token


def create_access_token(user_id: str, roles: Optional[List[str]] = None) -> str:
    return _create_token(user_id, settings.jwt_ttl_seconds, extra={"roles": roles or []})


def create_refresh_token(user_id: str) -> str:
    return _create_token(user_id, settings.refresh_ttl_seconds, extra={"type": "refresh"})


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
    db: Session = Depends(get_db),
):
    if creds is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(creds.credentials)
    user_id_raw = payload.get("sub")
    try:
        user_uuid = uuid.UUID(str(user_id_raw))
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid subject")
    user = db.query(User).filter(User.id == user_uuid).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not active")
    return user


def get_current_user_bearer_or_query_token(
    access_token: Optional[str] = Query(None, description="JWT when Authorization header is unavailable (e.g. img src)"),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
    db: Session = Depends(get_db),
):
    """Same as get_current_user but also accepts ?access_token= for <img> and similar."""
    raw = (creds.credentials if creds else None) or (access_token or "").strip() or None
    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(raw)
    user_id_raw = payload.get("sub")
    try:
        user_uuid = uuid.UUID(str(user_id_raw))
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid subject")
    user = db.query(User).filter(User.id == user_uuid).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not active")
    return user


def require_roles(*required_roles: str):
    def _dep(user: User = Depends(get_current_user)):
        role_names = {r.name for r in user.roles}
        if not set(required_roles).issubset(role_names):
            raise HTTPException(status_code=403, detail="Forbidden")
        return user

    return _dep


def require_permissions(*required_permissions: str):
    """
    Require at least one of the specified permissions (OR logic).
    If multiple permissions are provided, user needs at least one.
    """
    def _dep(user: User = Depends(get_current_user)):
        # Admin role bypass
        if any((getattr(r, 'name', None) or '').lower() == 'admin' for r in user.roles):
            return user
        
        # Check if user has at least one of the required permissions
        has_any = any(_has_permission(user, perm) for perm in required_permissions)
        if not has_any:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user

    return _dep


def _get_user_permission_map(user: User) -> dict:
    """Get combined permission map from roles and user overrides"""
    perm_map = {}
    for r in user.roles:
        if getattr(r, 'permissions', None):
            try:
                perm_map.update(r.permissions)
            except Exception:
                pass
    if getattr(user, 'permissions_override', None):
        try:
            perm_map.update(user.permissions_override)
        except Exception:
            pass
    return perm_map


def _fleet_area_unlocked(perm_map: dict) -> bool:
    """True if user may use Fleet & Equipment scoped permissions (UI + legacy keys)."""
    if perm_map.get("fleet:access") or perm_map.get("fleet:read"):
        return True
    return bool(
        perm_map.get("fleet:vehicles:read")
        or perm_map.get("fleet:vehicles:write")
        or perm_map.get("fleet:equipment:read")
        or perm_map.get("fleet:equipment:write")
    )


def _perm_matches_map(perm_map: dict, perm: str) -> bool:
    """Whether perm_map grants `perm`, including granular Fleet & Equipment aliases."""
    if perm_map.get(perm):
        return True
    if perm == "fleet:access":
        return _fleet_area_unlocked(perm_map)
    if perm == "fleet:read":
        return bool(perm_map.get("fleet:vehicles:read"))
    if perm == "fleet:write":
        return bool(perm_map.get("fleet:vehicles:write"))
    if perm == "equipment:read":
        return bool(perm_map.get("fleet:equipment:read") and _fleet_area_unlocked(perm_map))
    if perm == "equipment:write":
        return bool(perm_map.get("fleet:equipment:write") and _fleet_area_unlocked(perm_map))
    # Work orders & inspections live under Fleet in the UI; fleet tab permissions imply access here.
    # (There is no work_orders:access / inspections:access in the permission seed.)
    if perm == "work_orders:read":
        return _fleet_area_unlocked(perm_map)
    if perm == "work_orders:write":
        return bool(
            perm_map.get("fleet:write")
            or perm_map.get("fleet:vehicles:write")
            or perm_map.get("fleet:equipment:write")
        )
    if perm == "work_orders:assign":
        return bool(
            perm_map.get("work_orders:assign")
            or perm_map.get("work_orders:write")
            or perm_map.get("fleet:write")
            or perm_map.get("fleet:vehicles:write")
            or perm_map.get("fleet:equipment:write")
        )
    if perm == "inspections:read":
        return _fleet_area_unlocked(perm_map)
    if perm == "inspections:write":
        return bool(
            perm_map.get("fleet:write")
            or perm_map.get("fleet:vehicles:write")
            or perm_map.get("fleet:equipment:write")
        )
    if perm == "company_cards:read":
        return bool(perm_map.get("company_cards:read"))
    if perm == "company_cards:write":
        return bool(perm_map.get("company_cards:write"))
    return False


def _has_permission(user: User, perm: str) -> bool:
    # Admin role bypass
    if any((getattr(r, 'name', None) or '').lower() == 'admin' for r in user.roles):
        return True
    
    perm_map = _get_user_permission_map(user)
    
    # Check hierarchical permissions: if permission belongs to an area, check area access first
    # Format: area:sub:permission (e.g., hr:users:read)
    # Area access permission format: area:access (e.g., hr:access)
    # Exception: business:customers:* and business:projects:* don't require business:access
    if ':' in perm:
        parts = perm.split(':')
        if len(parts) >= 2:
            area = parts[0]
            area_access_key = f"{area}:access"
            
            # If this is not the area access permission itself, check area access first
            if perm != area_access_key:
                # Special case: business:customers:* and business:projects:* don't require business:access
                # They are standalone permissions
                if area == 'business' and (
                    perm.startswith('business:customers:')
                    or perm.startswith('business:projects:')
                    or perm.startswith('business:construction:projects:')
                    or perm.startswith('business:rm:projects:')
                ):
                    # Skip area access check for business customers/projects permissions
                    pass
                # Special case: inventory:products:* and inventory:suppliers:* don't require inventory:access
                # They are standalone permissions
                elif area == 'inventory' and (perm.startswith('inventory:products:') or perm.startswith('inventory:suppliers:')):
                    # Skip area access check for inventory products/suppliers permissions
                    pass
                # Fleet: allow granular tab permissions without a stored fleet:access row (legacy UI gap)
                elif area == 'fleet' and perm != 'fleet:access':
                    if area_access_key in perm_map and not perm_map.get(area_access_key):
                        return False
                    if not _fleet_area_unlocked(perm_map):
                        return False
                # Equipment API uses equipment:read/write; those are granted via fleet:equipment:* + fleet area
                elif area == 'equipment' and perm in ('equipment:read', 'equipment:write'):
                    pass
                elif area == 'company_cards' and perm in ('company_cards:read', 'company_cards:write'):
                    pass
                # No work_orders:access / inspections:access in product; rules are in _perm_matches_map
                elif area == 'work_orders':
                    pass
                elif area == 'inspections':
                    pass
                else:
                    # Check if area access is explicitly denied (False in override)
                    if area_access_key in perm_map and not perm_map.get(area_access_key):
                        return False
                    # Check if area access is granted
                    if area_access_key not in perm_map or not perm_map.get(area_access_key):
                        # Area access not granted, deny all sub-permissions
                        return False
    
    return _perm_matches_map(perm_map, perm)


def can_access_business_line(user: User, line: Optional[str]) -> bool:
    """Whether user may view resources for this business line (Construction vs R&M)."""
    if any((getattr(r, "name", None) or "").lower() == "admin" for r in user.roles):
        return True
    ln = normalize_business_line(line)
    pm = _get_user_permission_map(user)
    if pm.get("business:projects:read"):
        return True
    if ln == BUSINESS_LINE_CONSTRUCTION:
        return bool(pm.get("business:construction:projects:read") or pm.get("business:construction:projects:write"))
    if ln == BUSINESS_LINE_REPAIRS_MAINTENANCE:
        return bool(pm.get("business:rm:projects:read") or pm.get("business:rm:projects:write"))
    return False


def can_write_business_line(user: User, line: Optional[str]) -> bool:
    """Whether user may create/update/delete resources for this business line."""
    if any((getattr(r, "name", None) or "").lower() == "admin" for r in user.roles):
        return True
    ln = normalize_business_line(line)
    pm = _get_user_permission_map(user)
    if pm.get("business:projects:write"):
        return True
    if ln == BUSINESS_LINE_CONSTRUCTION:
        return bool(pm.get("business:construction:projects:write"))
    if ln == BUSINESS_LINE_REPAIRS_MAINTENANCE:
        return bool(pm.get("business:rm:projects:write"))
    return False


def has_project_permission(user: User, project: Any, perm: str) -> bool:
    """
    Granular project permission AND business-line access.
    `project` must have .business_line (Construction vs R&M).
    """
    if not _has_permission(user, perm):
        return False
    line = getattr(project, "business_line", None)
    return can_access_business_line(user, line)


def has_any_project_permission(user: User, project: Any, *perms: str) -> bool:
    return any(has_project_permission(user, project, p) for p in perms if p)


def has_project_files_category_permission(
    user: User,
    category_id: Optional[str],
    action: Literal["read", "write"] = "read",
    project: Optional[Any] = None,
) -> bool:
    """
    Category-level access control for Project > Files.

    Rules:
    - Requires macro permission:
      - read: business:projects:files:read OR business:projects:files:write
      - write: business:projects:files:write
    - If allow-list config exists in permissions_override, category must be included.
    - If allow-list config is missing, it means "all categories allowed" (default / compatibility).

    Notes:
    - Uncategorized files use `None` category; we treat it as "uncategorized" when comparing.
    - If `project` is passed, business-line access is checked.
    """
    if project is not None and not can_access_business_line(user, getattr(project, "business_line", None)):
        return False
    if action not in ("read", "write"):
        return False

    if action == "write":
        if not _has_permission(user, "business:projects:files:write"):
            return False
    else:
        if not (_has_permission(user, "business:projects:files:read") or _has_permission(user, "business:projects:files:write")):
            return False

    perm_map = _get_user_permission_map(user)
    cfg_key = f"business:projects:files:categories:{action}"
    allow_list = perm_map.get(cfg_key, None)

    # Missing config => allow all categories
    if not isinstance(allow_list, list):
        return True

    cat = (category_id or "uncategorized").strip() or "uncategorized"
    return cat in [str(x) for x in allow_list if isinstance(x, str)]


def can_approve_timesheet(approver: User, target_user_id: str, db: Session) -> bool:
    """Returns True if approver can approve target user's timesheet.
    Criteria: has timesheet:approve OR is in the manager chain of target (direct or indirect).
    """
    # Permission path
    if _has_permission(approver, "hr:timesheet:approve") or _has_permission(approver, "timesheet:approve"):
        return True
    # Supervisor chain path
    try:
        import uuid as _uuid
        from ..models.models import EmployeeProfile
        target = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == _uuid.UUID(str(target_user_id))).first()
        visited = set()
        depth = 0
        while target and getattr(target, 'manager_user_id', None) and depth < 8:
            mgr_id = str(getattr(target, 'manager_user_id'))
            if not mgr_id or mgr_id in visited:
                break
            if str(approver.id) == mgr_id:
                return True
            visited.add(mgr_id)
            depth += 1
            target = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == _uuid.UUID(mgr_id)).first()
    except Exception:
        return False
    return False