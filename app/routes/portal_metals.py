"""Portal APIs for MK Metals customer accounts (self-register + submissions)."""
from __future__ import annotations

import logging
import secrets
import smtplib
import uuid
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func, or_
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
from ..config import settings
from ..db import get_db
from ..models.models import (
    MetalsWebsiteSubmission,
    PortalHubUser,
    PortalMetalsMembership,
    PortalPasswordReset,
)
from ..services.metals_website import (
    active_metals_client_ids,
    claim_submissions_for_user,
    find_or_create_metals_client,
    metals_client_display_name,
    normalize_email,
    serialize_submission,
    submission_query,
)
from ..services.portal_hub_refresh_tokens import (
    bump_portal_session_and_revoke,
    clear_portal_refresh_tokens,
    persist_portal_refresh_token,
    validate_and_rotate_portal_refresh,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portal/metals", tags=["portal-metals"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = Field(min_length=1)
    company_name: Optional[str] = None
    phone: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _name_trim(cls, v: str) -> str:
        name = (v or "").strip()
        if not name:
            raise ValueError("Name is required")
        return name


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class RefreshRequest(BaseModel):
    refresh_token: str = ""


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


def _metals_website_base_url() -> str:
    custom = (settings.metals_website_public_url or "").strip().rstrip("/")
    if custom:
        return custom
    return f"{settings.public_base_url.rstrip('/')}/website"


def _send_metals_password_reset_email(*, to_email: str, reset_link: str) -> bool:
    if not settings.smtp_host or not settings.mail_from:
        logger.warning("metals_password_reset_email_skipped: SMTP not configured")
        return False
    subject = "Reset your Mack Kirk Metals password"
    text_content = f"""Password Reset Request

You requested to reset your password for Mack Kirk Metals.

Open this link to choose a new password:
{reset_link}

This link expires in 1 hour. If you did not request a reset, you can ignore this email.

Mack Kirk Metals
"""
    html_content = f"""<!DOCTYPE html>
<html><body style="font-family:sans-serif;line-height:1.5;color:#1c1e22">
  <p>You requested to reset your password for <strong>Mack Kirk Metals</strong>.</p>
  <p><a href="{reset_link}" style="display:inline-block;padding:10px 16px;background:#d11616;color:#fff;text-decoration:none;border-radius:2px">Reset password</a></p>
  <p style="font-size:13px;color:#555">Or paste this link into your browser:<br/>{reset_link}</p>
  <p style="font-size:13px;color:#555">This link expires in 1 hour. If you did not request a reset, ignore this email.</p>
</body></html>"""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.mail_from
    msg["To"] = to_email
    msg.attach(MIMEText(text_content, "plain"))
    msg.attach(MIMEText(html_content, "html"))
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as s:
            if settings.smtp_tls:
                s.starttls()
            if settings.smtp_username and settings.smtp_password:
                s.login(settings.smtp_username, settings.smtp_password)
            s.send_message(msg)
        logger.info("metals_password_reset_email_sent to=%s", to_email)
        return True
    except Exception:
        logger.exception("metals_password_reset_email_failed to=%s", to_email)
        return False


def _issue_tokens(db: Session, user: PortalHubUser) -> TokenResponse:
    access = create_portal_access_token(str(user.id), session_version=portal_user_session_version(user))
    refresh = create_portal_refresh_token(str(user.id))
    clear_portal_refresh_tokens(db, user.id)
    persist_portal_refresh_token(db, user.id, refresh)
    db.commit()
    return TokenResponse(access_token=access, refresh_token=refresh)


def _serialize_me(db: Session, user: PortalHubUser) -> dict:
    memberships = (
        db.query(PortalMetalsMembership)
        .filter(
            PortalMetalsMembership.portal_user_id == user.id,
            PortalMetalsMembership.status == "active",
        )
        .all()
    )
    clients = []
    for m in memberships:
        clients.append(
            {
                "membership_id": str(m.id),
                "metals_client_id": str(m.metals_client_id),
                "role": m.role,
                "name": metals_client_display_name(db, m.metals_client_id),
            }
        )
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "memberships": clients,
    }


@router.post("/auth/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    email = normalize_email(str(req.email))
    existing = db.query(PortalHubUser).filter(func.lower(PortalHubUser.email) == email).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="An account with this email already exists. Please sign in.",
        )

    name = req.name.strip()
    company = (req.company_name or "").strip() or None
    phone = (req.phone or "").strip() or None

    user = PortalHubUser(
        email=email,
        password_hash=get_password_hash(req.password),
        name=name,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.flush()

    client = find_or_create_metals_client(
        db,
        email=email,
        company_name=company,
        contact_name=name,
        phone=phone,
    )
    db.add(
        PortalMetalsMembership(
            portal_user_id=user.id,
            metals_client_id=client.id,
            role="admin",
            status="active",
            created_at=datetime.now(timezone.utc),
        )
    )
    claim_submissions_for_user(db, user, client.id)
    user.last_login_at = datetime.now(timezone.utc)
    db.flush()
    return _issue_tokens(db, user)


@router.post("/auth/forgot-password")
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Always returns ok to avoid email enumeration."""
    email = normalize_email(str(req.email))
    user = db.query(PortalHubUser).filter(func.lower(PortalHubUser.email) == email).first()
    if user and user.is_active:
        token = secrets.token_urlsafe(32)
        db.add(
            PortalPasswordReset(
                portal_user_id=user.id,
                token=token,
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            )
        )
        db.commit()
        link = f"{_metals_website_base_url()}/reset-password?token={token}"
        _send_metals_password_reset_email(to_email=user.email, reset_link=link)
    return {"status": "ok"}


@router.post("/auth/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    pr = db.query(PortalPasswordReset).filter(PortalPasswordReset.token == req.token).first()
    if not pr:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    now_utc = datetime.now(timezone.utc)
    expires_at = pr.expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    used_at = pr.used_at
    if used_at and used_at.tzinfo is None:
        used_at = used_at.replace(tzinfo=timezone.utc)
    if used_at is not None or (expires_at and expires_at < now_utc):
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    user = db.query(PortalHubUser).filter(PortalHubUser.id == pr.portal_user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    user.password_hash = get_password_hash(req.new_password)
    pr.used_at = now_utc
    bump_portal_session_and_revoke(db, user.id, None)
    db.commit()
    return {"status": "ok"}


@router.post("/auth/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    email = normalize_email(str(req.email))
    user = db.query(PortalHubUser).filter(func.lower(PortalHubUser.email) == email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    # Ensure metals membership exists (Hub-only portal users can gain Metals access)
    has_membership = (
        db.query(PortalMetalsMembership.id)
        .filter(
            PortalMetalsMembership.portal_user_id == user.id,
            PortalMetalsMembership.status == "active",
        )
        .first()
        is not None
    )
    if not has_membership:
        client = find_or_create_metals_client(
            db,
            email=email,
            company_name=None,
            contact_name=user.name or email,
            phone=None,
        )
        db.add(
            PortalMetalsMembership(
                portal_user_id=user.id,
                metals_client_id=client.id,
                role="admin",
                status="active",
                created_at=datetime.now(timezone.utc),
            )
        )
        claim_submissions_for_user(db, user, client.id)

    user.last_login_at = datetime.now(timezone.utc)
    return _issue_tokens(db, user)


@router.post("/auth/refresh", response_model=TokenResponse)
def refresh(req: RefreshRequest, db: Session = Depends(get_db)):
    access, refresh_tok = validate_and_rotate_portal_refresh(db, req.refresh_token)
    return TokenResponse(access_token=access, refresh_token=refresh_tok)


@router.post("/auth/logout")
def logout(
    req: RefreshRequest,
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
def me(user: PortalHubUser = Depends(get_current_portal_user), db: Session = Depends(get_db)):
    return _serialize_me(db, user)


@router.get("/submissions")
def list_submissions(
    kind: Optional[str] = None,
    status: Optional[str] = None,
    user: PortalHubUser = Depends(get_current_portal_user),
    db: Session = Depends(get_db),
):
    client_ids = active_metals_client_ids(db, user)
    email = normalize_email(user.email)
    clauses = [
        MetalsWebsiteSubmission.portal_user_id == user.id,
        func.lower(MetalsWebsiteSubmission.contact_email) == email,
    ]
    if client_ids:
        clauses.append(MetalsWebsiteSubmission.metals_client_id.in_(client_ids))
    q = submission_query(db).filter(or_(*clauses))

    if kind:
        q = q.filter(MetalsWebsiteSubmission.kind == kind)
    if status:
        q = q.filter(MetalsWebsiteSubmission.status == status)
    rows = q.order_by(MetalsWebsiteSubmission.created_at.desc()).limit(200).all()
    return {"items": [serialize_submission(r) for r in rows], "total": len(rows)}


@router.get("/submissions/{submission_id}")
def get_submission(
    submission_id: str,
    user: PortalHubUser = Depends(get_current_portal_user),
    db: Session = Depends(get_db),
):
    try:
        sid = uuid.UUID(submission_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    row = submission_query(db).filter(MetalsWebsiteSubmission.id == sid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    client_ids = set(active_metals_client_ids(db, user))
    email = normalize_email(user.email)
    allowed = (
        row.portal_user_id == user.id
        or (row.metals_client_id in client_ids)
        or normalize_email(row.contact_email) == email
    )
    if not allowed:
        raise HTTPException(status_code=404, detail="Not found")
    return serialize_submission(row)
