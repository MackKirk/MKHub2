import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Body
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
    RegisterPayload,
    EmployeeProfileInput,
    LoginRequest,
    TokenResponse,
    MeResponse,
)
from .security import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_user,
    require_roles,
)
from ..logging import structlog
import smtplib
from email.message import EmailMessage
import secrets


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


# Admin utilities for testing/resetting
@router.delete("/admin/users/by-email")
def admin_delete_user_by_email(
    email: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
):
    u = db.query(User).filter(User.email_personal == email).first()
    if not u:
        return {"deleted": False}
    db.delete(u)
    db.commit()
    return {"deleted": True}


@router.delete("/admin/invites/by-email")
def admin_delete_invites_by_email(
    email: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
):
    count = db.query(Invite).filter(Invite.email_personal == email).delete()
    db.commit()
    return {"deleted": int(count)}


@router.delete("/admin/invites/by-token")
def admin_delete_invite_by_token(
    token: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
):
    count = db.query(Invite).filter(Invite.token == token).delete()
    db.commit()
    return {"deleted": int(count)}


@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterPayload, db: Session = Depends(get_db)):
    inv: Optional[Invite] = db.query(Invite).filter(Invite.token == payload.invite_token).first()
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
    if payload.first_name and payload.last_name:
        base_username = compute_username(payload.first_name, payload.last_name)
    else:
        base_username = inv.suggested_username or slugify(inv.email_personal.split("@")[0])
    # ensure unique
    username = base_username
    i = 1
    while db.query(User).filter(User.username == username).first():
        username = f"{base_username}{i}"
        i += 1

    # Enforce personal email as the invited email (cannot be changed at registration)
    email_personal = inv.email_personal
    # If the email is already registered, fail early with a clear message
    existing = db.query(User).filter(User.email_personal == email_personal).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered. Please log in or ask admin to reset this user.")
    user = User(
        username=username,
        email_personal=email_personal,
        password_hash=get_password_hash(payload.password),
        is_active=True,
    )
    db.add(user)
    inv.accepted_at = datetime.now(timezone.utc)
    db.commit()

    # Create or update profile with provided details (non-breaking if omitted)
    from ..models.models import EmployeeProfile

    def _parse_dt(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        for fmt in ("%Y-%m-%d", "%Y%m%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S%z"):
            try:
                dt = datetime.strptime(value, fmt)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except Exception:
                continue
        return None

    if payload.profile:
        try:
            ep = EmployeeProfile(user_id=user.id)
            data = payload.profile.dict(exclude_unset=True)
            # Convert date-like fields
            for k in ("date_of_birth", "hire_date", "termination_date"):
                if k in data:
                    data[k] = _parse_dt(data.get(k))
            # Convert manager id to UUID if provided
            if data.get("manager_user_id"):
                try:
                    data["manager_user_id"] = uuid.UUID(str(data["manager_user_id"]))
                except Exception:
                    data["manager_user_id"] = None
            for field, value in data.items():
                setattr(ep, field, value)
            db.add(ep)
            db.commit()
        except Exception as e:
            structlog.get_logger().warning("profile_create_failed", error=str(e))
            db.rollback()

    access = create_access_token(str(user.id), roles=[r.name for r in user.roles])
    refresh = create_refresh_token(str(user.id))
    # Send username email if SMTP configured
    try:
        if settings.smtp_host and settings.mail_from:
            msg = EmailMessage()
            msg["Subject"] = f"Your {settings.app_name} account"
            msg["From"] = settings.mail_from
            msg["To"] = email_personal
            msg.set_content(f"Your account is ready. Username: {username}")
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
        structlog.get_logger().warning("username_email_failed", error=str(e))
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


# Self-profile read/update
@router.get("/me/profile")
def my_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from ..models.models import EmployeeProfile

    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user.id).first()
    data = {
        "user": {
            "id": str(user.id),
            "username": user.username,
            "email": user.email_personal,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
            "roles": [r.name for r in user.roles],
        },
        "profile": None,
    }
    if ep:
        def _dt(x):
            return x.isoformat() if x else None
        data["profile"] = {
            "first_name": ep.first_name,
            "last_name": ep.last_name,
            "preferred_name": ep.preferred_name,
            "gender": ep.gender,
            "date_of_birth": _dt(ep.date_of_birth),
            "marital_status": ep.marital_status,
            "nationality": ep.nationality,
            "phone": ep.phone,
            "mobile_phone": ep.mobile_phone,
            "address_line1": ep.address_line1,
            "address_line2": ep.address_line2,
            "city": ep.city,
            "province": ep.province,
            "postal_code": ep.postal_code,
            "country": ep.country,
            "hire_date": _dt(ep.hire_date),
            "termination_date": _dt(ep.termination_date),
            "job_title": ep.job_title,
            "division": ep.division,
            "work_email": ep.work_email,
            "work_phone": ep.work_phone,
        }
    return data


@router.put("/me/profile")
def update_my_profile(payload: EmployeeProfileInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from ..models.models import EmployeeProfile

    def _parse_dt(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        for fmt in ("%Y-%m-%d", "%Y%m%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S%z"):
            try:
                dt = datetime.strptime(value, fmt)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except Exception:
                continue
        return None

    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user.id).first()
    if not ep:
        ep = EmployeeProfile(user_id=user.id)
        db.add(ep)

    data = payload.dict(exclude_unset=True)
    for k in ("date_of_birth", "hire_date", "termination_date"):
        if k in data:
            data[k] = _parse_dt(data.get(k))

    for field, value in data.items():
        setattr(ep, field, value)
    ep.updated_at = datetime.now(timezone.utc)
    ep.updated_by = user.id
    db.commit()
    return {"status": "ok"}


# Password reset
@router.post("/password/forgot")
def password_forgot(identifier: str, db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .filter((User.username == identifier) | (User.email_personal == identifier) | (User.email_corporate == identifier))
        .first()
    )
    if not user:
        return {"status": "ok"}
    from ..models.models import PasswordReset
    token = secrets.token_urlsafe(32)
    pr = PasswordReset(user_id=user.id, token=token, expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
    db.add(pr)
    db.commit()
    # email link
    try:
        if settings.smtp_host and settings.mail_from and settings.public_base_url:
            link = f"{settings.public_base_url}/ui/password-reset?token={token}"
            msg = EmailMessage()
            msg["Subject"] = f"Reset your {settings.app_name} password"
            msg["From"] = settings.mail_from
            msg["To"] = user.email_personal
            msg.set_content(f"Click to reset your password: {link}")
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as s:
                if settings.smtp_tls:
                    s.starttls()
                if settings.smtp_username and settings.smtp_password:
                    s.login(settings.smtp_username, settings.smtp_password)
                s.send_message(msg)
    except Exception as e:
        structlog.get_logger().warning("password_reset_email_failed", error=str(e))
    return {"status": "ok"}


@router.post("/password/reset")
def password_reset(token: str, new_password: str, db: Session = Depends(get_db)):
    from ..models.models import PasswordReset
    pr = db.query(PasswordReset).filter(PasswordReset.token == token).first()
    if not pr:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    # Normalize datetimes to UTC-aware before comparison
    now_utc = datetime.now(timezone.utc)
    expires_at = pr.expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    used_at = pr.used_at
    if used_at and used_at.tzinfo is None:
        used_at = used_at.replace(tzinfo=timezone.utc)
    if used_at is not None or (expires_at and expires_at < now_utc):
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    user = db.query(User).filter(User.id == pr.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid token")
    user.password_hash = get_password_hash(new_password)
    pr.used_at = now_utc
    db.commit()
    return {"status": "ok"}

