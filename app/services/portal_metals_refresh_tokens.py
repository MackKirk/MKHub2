"""Persisted refresh tokens for Mack Kirk Metals website users."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import jwt
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..auth.metals_portal_security import (
    METALS_PORTAL_PRINCIPAL,
    create_metals_access_token,
    create_metals_refresh_token,
    metals_user_session_version,
)
from ..config import settings
from ..models.models import PortalMetalsRefreshToken, PortalMetalsUser


def _decode_metals_refresh(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def clear_metals_refresh_tokens(db: Session, metals_user_id: uuid.UUID) -> None:
    db.query(PortalMetalsRefreshToken).filter(PortalMetalsRefreshToken.metals_user_id == metals_user_id).delete()


def persist_metals_refresh_token(db: Session, metals_user_id: uuid.UUID, refresh_token_jwt: str) -> None:
    p = _decode_metals_refresh(refresh_token_jwt)
    if p.get("type") != "metals_portal_refresh" or p.get("principal") != METALS_PORTAL_PRINCIPAL:
        raise HTTPException(status_code=400, detail="Invalid refresh token")
    jti = p.get("jti")
    if not jti:
        raise HTTPException(status_code=400, detail="Invalid refresh token")
    exp_ts = p.get("exp")
    exp = datetime.fromtimestamp(int(exp_ts), tz=timezone.utc)
    db.add(PortalMetalsRefreshToken(metals_user_id=metals_user_id, jti=str(jti), expires_at=exp))


def validate_and_rotate_metals_refresh(db: Session, old_jwt: str) -> tuple[str, str]:
    p = _decode_metals_refresh(old_jwt)
    if p.get("type") != "metals_portal_refresh" or p.get("principal") != METALS_PORTAL_PRINCIPAL:
        raise HTTPException(status_code=400, detail="Invalid refresh token")
    jti = str(p.get("jti") or "")
    if not jti:
        raise HTTPException(status_code=400, detail="Invalid refresh token")
    uid = uuid.UUID(str(p["sub"]))
    row = db.query(PortalMetalsRefreshToken).filter(PortalMetalsRefreshToken.jti == jti).first()
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

    user = db.query(PortalMetalsUser).filter(PortalMetalsUser.id == uid).first()
    if user is None or not user.is_active:
        db.delete(row)
        db.commit()
        raise HTTPException(status_code=401, detail="Refresh token invalid or revoked")

    db.delete(row)
    db.flush()
    access = create_metals_access_token(str(uid), session_version=metals_user_session_version(user))
    new_refresh = create_metals_refresh_token(str(uid))
    persist_metals_refresh_token(db, uid, new_refresh)
    db.commit()
    return access, new_refresh


def bump_metals_session_and_revoke(db: Session, metals_user_id: uuid.UUID, refresh_jwt: str | None = None) -> None:
    user = db.query(PortalMetalsUser).filter(PortalMetalsUser.id == metals_user_id).first()
    if user:
        user.session_version = int(getattr(user, "session_version", 0) or 0) + 1
    clear_metals_refresh_tokens(db, metals_user_id)
    if refresh_jwt:
        try:
            p = _decode_metals_refresh(refresh_jwt)
            jti = str(p.get("jti") or "")
            if jti:
                db.query(PortalMetalsRefreshToken).filter(PortalMetalsRefreshToken.jti == jti).delete()
        except Exception:
            pass
    db.commit()
