"""Persisted refresh tokens for Hub customer portal users."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import jwt
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..auth.portal_security import (
    PORTAL_PRINCIPAL,
    create_portal_access_token,
    create_portal_refresh_token,
    portal_user_session_version,
)
from ..config import settings
from ..models.models import PortalHubRefreshToken, PortalHubUser


def _decode_portal_refresh(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def clear_portal_refresh_tokens(db: Session, portal_user_id: uuid.UUID) -> None:
    db.query(PortalHubRefreshToken).filter(PortalHubRefreshToken.portal_user_id == portal_user_id).delete()


def persist_portal_refresh_token(db: Session, portal_user_id: uuid.UUID, refresh_token_jwt: str) -> None:
    p = _decode_portal_refresh(refresh_token_jwt)
    if p.get("type") != "portal_refresh" or p.get("principal") != PORTAL_PRINCIPAL:
        raise HTTPException(status_code=400, detail="Invalid refresh token")
    jti = p.get("jti")
    if not jti:
        raise HTTPException(status_code=400, detail="Invalid refresh token")
    exp_ts = p.get("exp")
    exp = datetime.fromtimestamp(int(exp_ts), tz=timezone.utc)
    db.add(PortalHubRefreshToken(portal_user_id=portal_user_id, jti=str(jti), expires_at=exp))


def validate_and_rotate_portal_refresh(db: Session, old_jwt: str) -> tuple[str, str]:
    p = _decode_portal_refresh(old_jwt)
    if p.get("type") != "portal_refresh" or p.get("principal") != PORTAL_PRINCIPAL:
        raise HTTPException(status_code=400, detail="Invalid refresh token")
    jti = str(p.get("jti") or "")
    if not jti:
        raise HTTPException(status_code=400, detail="Invalid refresh token")
    uid = uuid.UUID(str(p["sub"]))
    row = db.query(PortalHubRefreshToken).filter(PortalHubRefreshToken.jti == jti).first()
    if not row:
        raise HTTPException(status_code=401, detail="Refresh token invalid or revoked")
    now = datetime.now(timezone.utc)
    exp = row.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now:
        db.delete(row)
        db.commit()
        raise HTTPException(status_code=401, detail="Token expired")

    user = db.query(PortalHubUser).filter(PortalHubUser.id == uid).first()
    if user is None or not user.is_active:
        db.delete(row)
        db.commit()
        raise HTTPException(status_code=401, detail="Refresh token invalid or revoked")

    db.delete(row)
    db.flush()
    access = create_portal_access_token(str(uid), session_version=portal_user_session_version(user))
    new_refresh = create_portal_refresh_token(str(uid))
    persist_portal_refresh_token(db, uid, new_refresh)
    db.commit()
    return access, new_refresh


def bump_portal_session_and_revoke(db: Session, portal_user_id: uuid.UUID, refresh_jwt: str | None = None) -> None:
    user = db.query(PortalHubUser).filter(PortalHubUser.id == portal_user_id).first()
    if user:
        user.session_version = int(getattr(user, "session_version", 0) or 0) + 1
    clear_portal_refresh_tokens(db, portal_user_id)
    if refresh_jwt:
        try:
            p = _decode_portal_refresh(refresh_jwt)
            jti = str(p.get("jti") or "")
            if jti:
                db.query(PortalHubRefreshToken).filter(PortalHubRefreshToken.jti == jti).delete()
        except Exception:
            pass
    db.commit()
