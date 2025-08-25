import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from slugify import slugify

from ..db import get_db
from ..config import settings
from ..models.models import User, Role, Invite, UsernameReservation
from ..schemas.auth import (
    UsernameSuggestRequest,
    UsernameSuggestResponse,
    InviteRequest,
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    MeResponse,
)
from .security import get_password_hash, verify_password, create_access_token, create_refresh_token, get_current_user
from ..logging import structlog
import smtplib
from email.message import EmailMessage


router = APIRouter(prefix="/auth", tags=["auth"])


def compute_username(first_name: str, last_name: str, suffix: Optional[int] = None) -> str:
    last = slugify(last_name, lowercase=True, separator="", regex_pattern=r"[^A-Za-z0-9]")
    first_initial = slugify(first_name[:1], lowercase=True, separator="", regex_pattern=r"[^A-Za-z0-9]")
    base = f"{last}{first_initial}"
    return f"{base}{suffix}" if suffix else base


def find_available_username(db: Session, first_name: str, last_name: str) -> str:
    candidate = compute_username(first_name, last_name)
    i = 0
    while True:
        name = f"{candidate}{i}" if i > 0 else candidate
        exists = db.query(User).filter(User.username == name).first() or db.query(UsernameReservation).filter(UsernameReservation.username == name).first()
        if not exists:
            return name
        i += 1


@router.post("/username/suggest", response_model=UsernameSuggestResponse)
def username_suggest(req: UsernameSuggestRequest, reserve: bool = False, db: Session = Depends(get_db)):
    name = find_available_username(db, req.first_name, req.last_name)
    if reserve:
        expires = datetime.now(timezone.utc) + timedelta(minutes=15)
        db.add(UsernameReservation(username=name, email_personal="reserved@local", expires_at=expires))
        db.commit()
    return UsernameSuggestResponse(suggested=name, available=True)


@router.post("/invite")
def invite_user(req: InviteRequest, db: Session = Depends(get_db), admin: User = Depends(get_current_user)):
    # Basic check: require at least one role named 'admin'
    if not any(r.name == "admin" for r in admin.roles):
        raise HTTPException(status_code=403, detail="Admin required")
    token = str(uuid.uuid4())
    suggested = find_available_username(db, req.email_personal.split("@")[0], "user")
    inv = Invite(
        email_personal=req.email_personal,
        token=token,
        suggested_username=suggested,
        created_by=admin.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(inv)
    db.commit()
    # Email if SMTP is configured
    try:
        if settings.smtp_host and settings.mail_from and settings.public_base_url:
            msg = EmailMessage()
            msg["Subject"] = f"You're invited to {settings.app_name}"
            msg["From"] = settings.mail_from
            msg["To"] = req.email_personal
            link = f"{settings.public_base_url}/ui/register?token={token}"
            msg.set_content(f"Click to register: {link}")
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
    except Exception as e:
        structlog.get_logger().warning("invite_email_failed", error=str(e))
    return {"invite_token": token}


@router.get("/invite/{token}")
def invite_validate(token: str, db: Session = Depends(get_db)):
    inv: Optional[Invite] = db.query(Invite).filter(Invite.token == token).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invalid invite")
    now_utc = datetime.now(timezone.utc)
    expires_at = inv.expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if inv.accepted_at is not None or (expires_at and expires_at < now_utc):
        raise HTTPException(status_code=400, detail="Invalid or expired invite")
    return {"email_personal": inv.email_personal, "suggested_username": inv.suggested_username}


@router.post("/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    inv: Optional[Invite] = db.query(Invite).filter(Invite.token == req.invite_token).first()
    if not inv:
        raise HTTPException(status_code=400, detail="Invalid or expired invite")
    # Handle naive datetimes from SQLite by assuming UTC
    now_utc = datetime.now(timezone.utc)
    expires_at = inv.expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if inv.accepted_at is not None or (expires_at and expires_at < now_utc):
        raise HTTPException(status_code=400, detail="Invalid or expired invite")
    # If user provided names, compute username lastName + first initial, else use suggested/email local part
    if req.first_name and req.last_name:
        base_username = compute_username(req.first_name, req.last_name)
    else:
        base_username = inv.suggested_username or slugify(inv.email_personal.split("@")[0])
    # ensure unique
    username = base_username
    i = 1
    while db.query(User).filter(User.username == username).first():
        username = f"{base_username}{i}"
        i += 1

    email_personal = req.email_personal or inv.email_personal
    user = User(
        username=username,
        email_personal=email_personal,
        password_hash=get_password_hash(req.password),
        is_active=True,
    )
    db.add(user)
    inv.accepted_at = datetime.now(timezone.utc)
    db.commit()

    access = create_access_token(str(user.id), roles=[r.name for r in user.roles])
    refresh = create_refresh_token(str(user.id))
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    q = db.query(User).filter(
        (User.username == req.identifier)
        | (User.email_personal == req.identifier)
        | (User.email_corporate == req.identifier)
    )
    user = q.first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    access = create_access_token(str(user.id), roles=[r.name for r in user.roles])
    refresh = create_refresh_token(str(user.id))
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenResponse)
def refresh(token: str):
    # Trust refresh token signature and type; for simplicity we do not persist/rotate here initially
    from .security import decode_token

    payload = decode_token(token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=400, detail="Invalid refresh token")
    user_id = payload["sub"]
    access = create_access_token(user_id)
    refresh = create_refresh_token(user_id)
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user)):
    return MeResponse(
        id=str(user.id),
        username=user.username,
        email_personal=user.email_personal,
        email_corporate=user.email_corporate,
        roles=[r.name for r in user.roles],
        permissions=[],
    )


@router.post("/link-corporate")
def link_corporate(email_corporate: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    user.email_corporate = email_corporate
    db.commit()
    return {"status": "linked"}


@router.post("/outlook/connect")
def outlook_connect(user: User = Depends(get_current_user)):
    return {"status": "not_implemented", "detail": "Delegated Graph connect will be added"}


@router.delete("/outlook/connect")
def outlook_disconnect(user: User = Depends(get_current_user)):
    return {"status": "not_implemented"}

