"""Portal APIs for MK Metals customer accounts (self-register + submissions)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
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
from ..db import get_db
from ..models.models import MetalsWebsiteSubmission, PortalHubUser, PortalMetalsMembership
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

router = APIRouter(prefix="/portal/metals", tags=["portal-metals"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: Optional[str] = None
    company_name: Optional[str] = None
    phone: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str = ""


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


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

    name = (req.name or "").strip() or None
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
        contact_name=name or email,
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
