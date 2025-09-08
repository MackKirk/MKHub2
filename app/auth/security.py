import uuid
import time
from datetime import datetime, timedelta, timezone
from typing import Optional, List

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models.models import User


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
http_bearer = HTTPBearer(auto_error=False)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


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
    def _dep(user: User = Depends(get_current_user)):
        # Admin role bypass
        if any(getattr(r, 'name', None) == 'admin' for r in user.roles):
            return user
        # Combine role permissions and user overrides, honoring truthy values only
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
        granted = {k for k, v in perm_map.items() if v}
        if not set(required_permissions).issubset(granted):
            raise HTTPException(status_code=403, detail="Forbidden")
        return user

    return _dep

