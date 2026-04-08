"""Persisted refresh tokens (rotation + revoke on logout)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import jwt
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..config import settings
from ..models.models import RefreshToken


def _decode_refresh_payload(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def clear_refresh_tokens_for_user(db: Session, user_id: uuid.UUID) -> None:
    db.query(RefreshToken).filter(RefreshToken.user_id == user_id).delete()


def persist_refresh_token_for_user(db: Session, user_id: uuid.UUID, refresh_token_jwt: str) -> None:
    p = _decode_refresh_payload(refresh_token_jwt)
    if p.get("type") != "refresh":
        raise HTTPException(status_code=400, detail="Invalid refresh token")
    jti = p.get("jti")
    if not jti:
        raise HTTPException(status_code=400, detail="Invalid refresh token")
    exp_ts = p.get("exp")
    exp = datetime.fromtimestamp(int(exp_ts), tz=timezone.utc)
    db.add(RefreshToken(user_id=user_id, jti=str(jti), expires_at=exp))


def validate_and_rotate_refresh(db: Session, old_jwt: str) -> tuple[str, str]:
    p = _decode_refresh_payload(old_jwt)
    if p.get("type") != "refresh":
        raise HTTPException(status_code=400, detail="Invalid refresh token")
    jti = str(p.get("jti") or "")
    if not jti:
        raise HTTPException(status_code=400, detail="Invalid refresh token")
    uid = uuid.UUID(str(p["sub"]))
    row = db.query(RefreshToken).filter(RefreshToken.jti == jti).first()
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

    from ..auth.security import create_access_token, create_refresh_token

    db.delete(row)
    db.flush()
    access = create_access_token(str(uid))
    new_refresh = create_refresh_token(str(uid))
    persist_refresh_token_for_user(db, uid, new_refresh)
    db.commit()
    return access, new_refresh


def revoke_refresh_token(db: Session, refresh_jwt: str) -> None:
    try:
        p = _decode_refresh_payload(refresh_jwt)
    except HTTPException:
        return
    if p.get("type") != "refresh":
        return
    jti = str(p.get("jti") or "")
    if not jti:
        return
    row = db.query(RefreshToken).filter(RefreshToken.jti == jti).first()
    if row:
        db.delete(row)
        db.commit()
