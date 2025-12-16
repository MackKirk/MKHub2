import uuid
import time
from datetime import datetime, timedelta, timezone
from typing import Optional, List

import jwt
from fastapi import Depends, HTTPException, status
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
                if area == 'business' and (perm.startswith('business:customers:') or perm.startswith('business:projects:')):
                    # Skip area access check for business customers/projects permissions
                    pass
                # Special case: inventory:products:* and inventory:suppliers:* don't require inventory:access
                # They are standalone permissions
                elif area == 'inventory' and (perm.startswith('inventory:products:') or perm.startswith('inventory:suppliers:')):
                    # Skip area access check for inventory products/suppliers permissions
                    pass
                else:
                    # Check if area access is explicitly denied (False in override)
                    if area_access_key in perm_map and not perm_map.get(area_access_key):
                        return False
                    # Check if area access is granted
                    if area_access_key not in perm_map or not perm_map.get(area_access_key):
                        # Area access not granted, deny all sub-permissions
                        return False
    
    # Check the specific permission
    return bool(perm_map.get(perm))


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