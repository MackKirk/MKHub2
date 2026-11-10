"""Auth helpers for Mack Kirk Metals website accounts (isolated from Hub portal)."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models.models import PortalMetalsUser
from .security import decode_token, get_password_hash, verify_password

METALS_PORTAL_PRINCIPAL = "metals_portal"
http_bearer = HTTPBearer(auto_error=False)


def create_metals_access_token(metals_user_id: str, session_version: int = 0) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": metals_user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=settings.jwt_ttl_seconds)).timestamp()),
        "jti": str(uuid.uuid4()),
        "principal": METALS_PORTAL_PRINCIPAL,
        "sv": int(session_version or 0),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_metals_refresh_token(metals_user_id: str) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": metals_user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=settings.refresh_ttl_seconds)).timestamp()),
        "jti": str(uuid.uuid4()),
        "principal": METALS_PORTAL_PRINCIPAL,
        "type": "metals_portal_refresh",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def metals_user_session_version(user: PortalMetalsUser) -> int:
    return int(getattr(user, "session_version", 0) or 0)


def _metals_user_from_access_payload(db: Session, payload: dict) -> PortalMetalsUser:
    if payload.get("principal") != METALS_PORTAL_PRINCIPAL:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if payload.get("type") in ("refresh", "portal_refresh", "metals_portal_refresh"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    try:
        user_uuid = uuid.UUID(str(payload.get("sub")))
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid subject")
    user = db.query(PortalMetalsUser).filter(PortalMetalsUser.id == user_uuid).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not active")
    try:
        token_sv = int(payload.get("sv", 0) or 0)
    except (TypeError, ValueError):
        token_sv = 0
    if token_sv != metals_user_session_version(user):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    return user


def get_current_metals_portal_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
    db: Session = Depends(get_db),
) -> PortalMetalsUser:
    if creds is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(creds.credentials)
    return _metals_user_from_access_payload(db, payload)


def get_optional_metals_portal_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
    db: Session = Depends(get_db),
) -> Optional[PortalMetalsUser]:
    if creds is None or not creds.credentials:
        return None
    try:
        payload = decode_token(creds.credentials)
        return _metals_user_from_access_payload(db, payload)
    except Exception:
        return None


__all__ = [
    "METALS_PORTAL_PRINCIPAL",
    "create_metals_access_token",
    "create_metals_refresh_token",
    "get_current_metals_portal_user",
    "get_optional_metals_portal_user",
    "get_password_hash",
    "metals_user_session_version",
    "verify_password",
]
