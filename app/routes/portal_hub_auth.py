"""Hub customer portal auth: invite accept, login, refresh, me."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.portal_security import (
    create_portal_access_token,
    create_portal_refresh_token,
    get_current_portal_user,
    get_password_hash,
    http_bearer,
    portal_user_session_version,
    verify_password,
)
from ..db import get_db
from ..models.models import Client, PortalHubInvite, PortalHubMembership, PortalHubUser
from ..services.portal_hub_project_access import client_display_name
from ..services.portal_hub_refresh_tokens import (
    bump_portal_session_and_revoke,
    clear_portal_refresh_tokens,
    persist_portal_refresh_token,
    validate_and_rotate_portal_refresh,
)

router = APIRouter(prefix="/portal/hub/auth", tags=["portal-hub-auth"])

INVITE_TTL_DAYS = 14


class PortalLoginRequest(BaseModel):
    email: EmailStr
    password: str


class PortalAcceptInviteRequest(BaseModel):
    token: str
    password: str = Field(min_length=8)
    name: Optional[str] = None


class PortalRefreshRequest(BaseModel):
    refresh_token: str = ""


class PortalTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _issue_tokens(db: Session, user: PortalHubUser) -> PortalTokenResponse:
    access = create_portal_access_token(str(user.id), session_version=portal_user_session_version(user))
    refresh = create_portal_refresh_token(str(user.id))
    clear_portal_refresh_tokens(db, user.id)
    persist_portal_refresh_token(db, user.id, refresh)
    db.commit()
    return PortalTokenResponse(access_token=access, refresh_token=refresh)


def _serialize_me(db: Session, user: PortalHubUser) -> dict:
    memberships = (
        db.query(PortalHubMembership)
        .filter(PortalHubMembership.portal_user_id == user.id, PortalHubMembership.status == "active")
        .all()
    )
    clients = []
    for m in memberships:
        clients.append(
            {
                "membership_id": str(m.id),
                "client_id": str(m.client_id),
                "role": m.role,
                "name": client_display_name(db, m.client_id),
            }
        )
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "memberships": clients,
    }


def _get_pending_invite(db: Session, token: str) -> PortalHubInvite:
    inv = db.query(PortalHubInvite).filter(PortalHubInvite.token == token).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invite not found")
    if inv.status == "revoked":
        raise HTTPException(status_code=400, detail="Invite revoked")
    if inv.status == "accepted":
        raise HTTPException(status_code=400, detail="Invite already used")
    now = datetime.now(timezone.utc)
    exp = inv.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if inv.status == "expired" or exp < now:
        if inv.status == "pending":
            inv.status = "expired"
            db.commit()
        raise HTTPException(status_code=400, detail="Invite expired")
    if inv.status != "pending":
        raise HTTPException(status_code=400, detail="Invite not available")
    return inv


@router.get("/invite/{token}")
def validate_portal_invite(token: str, db: Session = Depends(get_db)):
    inv = _get_pending_invite(db, token)
    client = db.query(Client).filter(Client.id == inv.client_id, Client.deleted_at.is_(None)).first()
    email = _normalize_email(inv.email)
    account_exists = (
        db.query(PortalHubUser.id).filter(func.lower(PortalHubUser.email) == email).first() is not None
    )
    return {
        "email": inv.email,
        "client_id": str(inv.client_id),
        "client_name": (client.display_name or client.name) if client else None,
        "expires_at": inv.expires_at.isoformat() if inv.expires_at else None,
        "account_exists": account_exists,
    }


@router.post("/accept-invite", response_model=PortalTokenResponse)
def accept_portal_invite(req: PortalAcceptInviteRequest, db: Session = Depends(get_db)):
    inv = _get_pending_invite(db, req.token)
    email = _normalize_email(inv.email)
    user = db.query(PortalHubUser).filter(func.lower(PortalHubUser.email) == email).first()
    if user is None:
        user = PortalHubUser(
            email=email,
            password_hash=get_password_hash(req.password),
            name=(req.name or "").strip() or None,
            is_active=True,
        )
        db.add(user)
        db.flush()
    else:
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account deactivated")
        # Existing account: verify they know the password OR allow setting if joining new company?
        # Plan: add membership only. Require correct password for existing users.
        if not verify_password(req.password, user.password_hash):
            raise HTTPException(
                status_code=400,
                detail="An account with this email already exists. Enter your existing password to join this company.",
            )
        if req.name and not user.name:
            user.name = req.name.strip()

    existing = (
        db.query(PortalHubMembership)
        .filter(
            PortalHubMembership.portal_user_id == user.id,
            PortalHubMembership.client_id == inv.client_id,
        )
        .first()
    )
    if existing:
        existing.status = "active"
        existing.revoked_at = None
        existing.role = existing.role or "member"
    else:
        db.add(
            PortalHubMembership(
                portal_user_id=user.id,
                client_id=inv.client_id,
                role="member",
                status="active",
            )
        )

    inv.status = "accepted"
    inv.accepted_at = datetime.now(timezone.utc)
    user.last_login_at = datetime.now(timezone.utc)
    db.flush()
    return _issue_tokens(db, user)


@router.post("/login", response_model=PortalTokenResponse)
def portal_login(req: PortalLoginRequest, db: Session = Depends(get_db)):
    email = _normalize_email(str(req.email))
    user = db.query(PortalHubUser).filter(func.lower(PortalHubUser.email) == email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")
    user.last_login_at = datetime.now(timezone.utc)
    return _issue_tokens(db, user)


@router.post("/refresh", response_model=PortalTokenResponse)
def portal_refresh(req: PortalRefreshRequest, db: Session = Depends(get_db)):
    access, refresh = validate_and_rotate_portal_refresh(db, req.refresh_token)
    return PortalTokenResponse(access_token=access, refresh_token=refresh)


@router.post("/logout")
def portal_logout(
    req: PortalRefreshRequest,
    db: Session = Depends(get_db),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
):
    user_id: Optional[uuid.UUID] = None
    if creds and creds.credentials:
        try:
            from ..auth.security import decode_token

            payload = decode_token(creds.credentials)
            if payload.get("principal") == "hub_portal":
                user_id = uuid.UUID(str(payload.get("sub")))
        except Exception:
            pass
    if user_id:
        bump_portal_session_and_revoke(db, user_id, req.refresh_token or None)
    return {"ok": True}


@router.get("/me")
def portal_me(user: PortalHubUser = Depends(get_current_portal_user), db: Session = Depends(get_db)):
    return _serialize_me(db, user)
