"""Staff APIs: invite / list / revoke Hub customer portal access for a Client."""
from __future__ import annotations

import secrets
import smtplib
import uuid
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.portal_invite_permission import require_portal_invite_permission
from ..config import settings
from ..db import get_db
from ..models.models import (
    Client,
    ClientFile,
    EmployeeProfile,
    PortalHubInvite,
    PortalHubMembership,
    PortalHubUser,
    Proposal,
    Quote,
    User,
)
from ..services.portal_hub_invite_email import portal_invite_email_html, portal_invite_email_text
from ..services.portal_hub_project_access import client_display_name

log = structlog.get_logger()

router = APIRouter(prefix="/clients", tags=["portal-hub-staff"])

INVITE_TTL_DAYS = 14


class PortalInviteCreate(BaseModel):
    email: EmailStr


class CustomerVisibleBody(BaseModel):
    customer_visible: bool


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _get_client_or_404(db: Session, client_id: str) -> Client:
    try:
        cid = uuid.UUID(client_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Customer not found")
    client = db.query(Client).filter(Client.id == cid, Client.deleted_at.is_(None)).first()
    if not client:
        raise HTTPException(status_code=404, detail="Customer not found")
    return client


def _send_portal_invite_email(
    *,
    to_email: str,
    invite_link: str,
    client_name: str,
    inviter_name: str,
    inviter_email: str,
) -> bool:
    """Send portal invite email. Returns True if sent, False if skipped/failed."""
    if not (settings.smtp_host and settings.mail_from and settings.public_base_url):
        log.warning(
            "portal_invite_email_skipped",
            reason="SMTP_HOST, MAIL_FROM, or PUBLIC_BASE_URL not configured",
        )
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"You're invited to the {settings.app_name} customer portal"
        msg["From"] = settings.mail_from
        msg["To"] = to_email
        msg.attach(
            MIMEText(
                portal_invite_email_text(
                    invitee_email=to_email,
                    invite_link=invite_link,
                    client_name=client_name,
                    inviter_name=inviter_name,
                    app_name=settings.app_name,
                    expires_days=INVITE_TTL_DAYS,
                ),
                "plain",
            )
        )
        msg.attach(
            MIMEText(
                portal_invite_email_html(
                    invitee_email=to_email,
                    invite_link=invite_link,
                    client_name=client_name,
                    inviter_name=inviter_name,
                    inviter_email=inviter_email,
                    app_name=settings.app_name,
                    public_base_url=settings.public_base_url,
                    expires_days=INVITE_TTL_DAYS,
                ),
                "html",
            )
        )
        if settings.smtp_tls:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as s:
                s.starttls()
                if settings.smtp_username and settings.smtp_password:
                    s.login(settings.smtp_username, settings.smtp_password)
                s.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as s:
                if settings.smtp_username and settings.smtp_password:
                    s.login(settings.smtp_username, settings.smtp_password)
                s.send_message(msg)
        return True
    except Exception as e:
        log.warning("portal_invite_email_failed", error=str(e))
        return False


@router.get("/{client_id}/portal-access")
def list_portal_access(
    client_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_portal_invite_permission),
):
    client = _get_client_or_404(db, client_id)
    invites = (
        db.query(PortalHubInvite)
        .filter(PortalHubInvite.client_id == client.id)
        .order_by(PortalHubInvite.created_at.desc())
        .all()
    )
    memberships = (
        db.query(PortalHubMembership, PortalHubUser)
        .join(PortalHubUser, PortalHubUser.id == PortalHubMembership.portal_user_id)
        .filter(PortalHubMembership.client_id == client.id)
        .all()
    )
    return {
        "client_id": str(client.id),
        "invites": [
            {
                "id": str(i.id),
                "email": i.email,
                "status": i.status,
                "expires_at": i.expires_at.isoformat() if i.expires_at else None,
                "accepted_at": i.accepted_at.isoformat() if i.accepted_at else None,
                "created_at": i.created_at.isoformat() if i.created_at else None,
            }
            for i in invites
        ],
        "memberships": [
            {
                "id": str(m.id),
                "portal_user_id": str(u.id),
                "email": u.email,
                "name": u.name,
                "role": m.role,
                "status": m.status,
                "created_at": m.created_at.isoformat() if m.created_at else None,
                "revoked_at": m.revoked_at.isoformat() if m.revoked_at else None,
            }
            for m, u in memberships
        ],
    }


@router.post("/{client_id}/portal-invites")
def create_portal_invite(
    client_id: str,
    body: PortalInviteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_portal_invite_permission),
):
    client = _get_client_or_404(db, client_id)
    email = _normalize_email(str(body.email))
    if not email:
        raise HTTPException(status_code=400, detail="Email required")

    # Revoke prior pending invites for same email+client
    pending = (
        db.query(PortalHubInvite)
        .filter(
            PortalHubInvite.client_id == client.id,
            func.lower(PortalHubInvite.email) == email,
            PortalHubInvite.status == "pending",
        )
        .all()
    )
    for inv in pending:
        inv.status = "revoked"

    token = secrets.token_urlsafe(32)
    inv = PortalHubInvite(
        token=token,
        email=email,
        client_id=client.id,
        invited_by_user_id=user.id,
        status="pending",
        expires_at=datetime.now(timezone.utc) + timedelta(days=INVITE_TTL_DAYS),
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)

    client_name = client_display_name(db, client.id) or client.name or "your company"
    inviter_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user.id).first()
    inviter_name = user.username
    if inviter_profile:
        if inviter_profile.first_name and inviter_profile.last_name:
            inviter_name = f"{inviter_profile.first_name} {inviter_profile.last_name}"
        elif inviter_profile.preferred_name:
            inviter_name = inviter_profile.preferred_name
    inviter_email = (
        user.email_personal
        or user.email_corporate
        or settings.mail_from
        or "noreply@example.com"
    )

    base = (settings.public_base_url or "").rstrip("/")
    invite_link = f"{base}/portal/accept-invite?token={token}"
    email_sent = _send_portal_invite_email(
        to_email=email,
        invite_link=invite_link,
        client_name=client_name,
        inviter_name=inviter_name,
        inviter_email=inviter_email,
    )

    return {
        "id": str(inv.id),
        "email": inv.email,
        "status": inv.status,
        "expires_at": inv.expires_at.isoformat() if inv.expires_at else None,
        "invite_link": invite_link,
        "email_sent": email_sent,
    }


@router.post("/{client_id}/portal-invites/{invite_id}/revoke")
def revoke_portal_invite(
    client_id: str,
    invite_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_portal_invite_permission),
):
    client = _get_client_or_404(db, client_id)
    try:
        iid = uuid.UUID(invite_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Invite not found")
    inv = (
        db.query(PortalHubInvite)
        .filter(PortalHubInvite.id == iid, PortalHubInvite.client_id == client.id)
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invite not found")
    if inv.status == "pending":
        inv.status = "revoked"
        db.commit()
    return {"ok": True, "status": inv.status}


@router.post("/{client_id}/portal-memberships/{membership_id}/revoke")
def revoke_portal_membership(
    client_id: str,
    membership_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_portal_invite_permission),
):
    client = _get_client_or_404(db, client_id)
    try:
        mid = uuid.UUID(membership_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Membership not found")
    m = (
        db.query(PortalHubMembership)
        .filter(PortalHubMembership.id == mid, PortalHubMembership.client_id == client.id)
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Membership not found")
    m.status = "revoked"
    m.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.patch("/{client_id}/files/{file_id}/portal-visibility")
def set_client_file_portal_visibility(
    client_id: str,
    file_id: str,
    body: CustomerVisibleBody,
    db: Session = Depends(get_db),
    user: User = Depends(require_portal_invite_permission),
):
    client = _get_client_or_404(db, client_id)
    try:
        fid = uuid.UUID(file_id)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    cf = (
        db.query(ClientFile)
        .filter(ClientFile.id == fid, ClientFile.client_id == client.id, ClientFile.deleted_at.is_(None))
        .first()
    )
    if not cf:
        raise HTTPException(status_code=404, detail="File not found")
    cf.customer_visible = bool(body.customer_visible)
    db.commit()
    return {"id": str(cf.id), "customer_visible": cf.customer_visible}


share_router = APIRouter(tags=["portal-hub-staff-share"])


@share_router.post("/proposals/{proposal_id}/share-with-customer")
def share_proposal_with_customer(
    proposal_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_portal_invite_permission),
):
    try:
        pid = uuid.UUID(proposal_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Proposal not found")
    p = db.query(Proposal).filter(Proposal.id == pid, Proposal.deleted_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    p.customer_visible = True
    p.shared_with_customer_at = datetime.now(timezone.utc)
    db.commit()
    return {
        "id": str(p.id),
        "customer_visible": True,
        "shared_with_customer_at": p.shared_with_customer_at.isoformat(),
    }


@share_router.post("/proposals/{proposal_id}/unshare-with-customer")
def unshare_proposal_with_customer(
    proposal_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_portal_invite_permission),
):
    try:
        pid = uuid.UUID(proposal_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Proposal not found")
    p = db.query(Proposal).filter(Proposal.id == pid, Proposal.deleted_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    p.customer_visible = False
    db.commit()
    return {"id": str(p.id), "customer_visible": False}


@share_router.post("/quotes/{quote_id}/share-with-customer")
def share_quote_with_customer(
    quote_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_portal_invite_permission),
):
    try:
        qid = uuid.UUID(quote_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Quote not found")
    q = db.query(Quote).filter(Quote.id == qid, Quote.deleted_at.is_(None)).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    q.customer_visible = True
    q.shared_with_customer_at = datetime.now(timezone.utc)
    db.commit()
    return {
        "id": str(q.id),
        "customer_visible": True,
        "shared_with_customer_at": q.shared_with_customer_at.isoformat(),
    }


@share_router.post("/quotes/{quote_id}/unshare-with-customer")
def unshare_quote_with_customer(
    quote_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_portal_invite_permission),
):
    try:
        qid = uuid.UUID(quote_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Quote not found")
    q = db.query(Quote).filter(Quote.id == qid, Quote.deleted_at.is_(None)).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    q.customer_visible = False
    db.commit()
    return {"id": str(q.id), "customer_visible": False}
