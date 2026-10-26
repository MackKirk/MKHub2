"""Auth helpers for Hub customer portal (isolated from staff User JWT)."""
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
from ..models.models import PortalHubUser
from .security import decode_token, get_password_hash, verify_password

PORTAL_PRINCIPAL = "hub_portal"
http_bearer = HTTPBearer(auto_error=False)


def create_portal_access_token(portal_user_id: str, session_version: int = 0) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": portal_user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=settings.jwt_ttl_seconds)).timestamp()),
        "jti": str(uuid.uuid4()),
        "principal": PORTAL_PRINCIPAL,
        "sv": int(session_version or 0),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_portal_refresh_token(portal_user_id: str) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": portal_user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=settings.refresh_ttl_seconds)).timestamp()),
        "jti": str(uuid.uuid4()),
        "principal": PORTAL_PRINCIPAL,
        "type": "portal_refresh",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def portal_user_session_version(user: PortalHubUser) -> int:
    return int(getattr(user, "session_version", 0) or 0)


def _portal_user_from_access_payload(db: Session, payload: dict) -> PortalHubUser:
    if payload.get("principal") != PORTAL_PRINCIPAL:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if payload.get("type") in ("refresh", "portal_refresh"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    try:
        user_uuid = uuid.UUID(str(payload.get("sub")))
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid subject")
    user = db.query(PortalHubUser).filter(PortalHubUser.id == user_uuid).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not active")
    try:
        token_sv = int(payload.get("sv", 0) or 0)
    except (TypeError, ValueError):
        token_sv = 0
    if token_sv != portal_user_session_version(user):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    return user


def get_current_portal_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
    db: Session = Depends(get_db),
) -> PortalHubUser:
    if creds is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(creds.credentials)
    return _portal_user_from_access_payload(db, payload)


# Re-export password helpers for portal routes
__all__ = [
    "PORTAL_PRINCIPAL",
    "create_portal_access_token",
    "create_portal_refresh_token",
    "get_current_portal_user",
    "get_password_hash",
    "portal_user_session_version",
    "verify_password",
]
