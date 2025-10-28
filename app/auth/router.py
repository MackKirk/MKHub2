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
    require_permissions,
)
from ..logging import structlog
import smtplib
from email.message import EmailMessage
import secrets
from sqlalchemy import and_
import random


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
def invite_user(req: InviteRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Allow if user has admin role OR invite:send permission
    has_admin = any(r.name == "admin" for r in user.roles)
    has_perm = False
    try:
        perm_map = {}
        for r in user.roles:
            if getattr(r, 'permissions', None):
                perm_map.update(r.permissions)
        if getattr(user, 'permissions_override', None):
            perm_map.update(user.permissions_override)
        has_perm = bool(perm_map.get("invite:send"))
    except Exception:
        has_perm = False
    if not (has_admin or has_perm):
        raise HTTPException(status_code=403, detail="Forbidden")
    token = str(uuid.uuid4())
    suggested = find_available_username(db, req.email_personal.split("@")[0], "user")
    inv = Invite(
        email_personal=req.email_personal,
        token=token,
        suggested_username=suggested,
        created_by=user.id,
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
            link = f"{settings.public_base_url}/ui/register.html?token={token}"
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

    try:
        ep = None
        if payload.profile:
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
            # Always persist names from payload
            if payload.first_name:
                data["first_name"] = payload.first_name
            if payload.last_name:
                data["last_name"] = payload.last_name
            for field, value in data.items():
                setattr(ep, field, value)
            db.add(ep)
            db.commit()
        else:
            # Create minimal profile with names so UI can display them
            ep = EmployeeProfile(user_id=user.id, first_name=payload.first_name, last_name=payload.last_name)
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
    # Resolve permissions from roles + user overrides (keys indicate granted perms)
    perm_map = {}
    for r in user.roles:
        if getattr(r, 'permissions', None):
            try:
                perm_map.update(r.permissions)
            except Exception:
                pass
    if getattr(user, 'permissions_override', None):
        try:
            perm_map.update(user.permissions_override)
        except Exception:
            pass
    granted = sorted([k for k,v in perm_map.items() if v])
    return MeResponse(
        id=str(user.id),
        username=user.username,
        email_personal=user.email_personal,
        email_corporate=user.email_corporate,
        roles=[r.name for r in user.roles],
        permissions=granted,
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
            "first_name": None,
            "last_name": None,
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
            "manager_user_id": str(ep.manager_user_id) if getattr(ep, "manager_user_id", None) else None,
            "pay_rate": ep.pay_rate,
            "pay_type": ep.pay_type,
            "employment_type": ep.employment_type,
            "sin_number": ep.sin_number,
            "work_permit_status": ep.work_permit_status,
            "visa_status": ep.visa_status,
            "profile_photo_file_id": str(ep.profile_photo_file_id) if getattr(ep, 'profile_photo_file_id', None) else None,
            "emergency_contact_name": ep.emergency_contact_name,
            "emergency_contact_relationship": ep.emergency_contact_relationship,
            "emergency_contact_phone": ep.emergency_contact_phone,
        }
    # Try to surface first/last name from profile for convenience
    if ep:
        data["user"]["first_name"] = ep.first_name
        data["user"]["last_name"] = ep.last_name
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

    # Allow self to update only personal/emergency contact fields, not job/company controlled fields
    allowed_keys = {
        "preferred_name","phone","mobile_phone","gender","marital_status","date_of_birth","nationality",
        "address_line1","address_line2","city","province","postal_code","country",
        "sin_number","work_permit_status","visa_status",
        "emergency_contact_name","emergency_contact_relationship","emergency_contact_phone",
        "profile_photo_file_id",
    }
    incoming = payload.dict(exclude_unset=True)
    data = { k: v for k, v in incoming.items() if k in allowed_keys }
    if "date_of_birth" in data:
        data["date_of_birth"] = _parse_dt(data.get("date_of_birth"))

    for field, value in data.items():
        setattr(ep, field, value)
    ep.updated_at = datetime.now(timezone.utc)
    ep.updated_by = user.id
    db.commit()
    return {"status": "ok"}


@router.get("/users/options")
def users_options(q: Optional[str] = None, limit: int = 100, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = db.query(User)
    if q:
        like = f"%{q}%"
        query = query.filter((User.username.ilike(like)) | (User.email_personal.ilike(like)))
    rows = query.limit(limit).all()
    return [{"id": str(u.id), "username": u.username, "email": u.email_personal} for u in rows]


@router.get("/users")
def list_users(q: Optional[str] = None, limit: int = 100, db: Session = Depends(get_db), _=Depends(require_permissions("users:read"))):
    query = db.query(User)
    if q:
        like = f"%{q}%"
        query = query.filter((User.username.ilike(like)) | (User.email_personal.ilike(like)))
    rows = query.limit(limit).all()
    return [{
        "id": str(u.id),
        "username": u.username,
        "email": u.email_personal,
        "active": u.is_active,
        "roles": [r.name for r in u.roles],
        "permissions_override": list((u.permissions_override or {}).keys())
    } for u in rows]


@router.get("/users/{user_id}")
def get_user(user_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("users:read"))):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    return {
        "id": str(u.id),
        "username": u.username,
        "email": u.email_personal,
        "active": u.is_active,
        "roles": [r.name for r in u.roles],
        "permissions_override": u.permissions_override or {},
    }


@router.get("/users/{user_id}/profile")
def get_user_profile(user_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    # Allow self or users:read/admin
    can_read = False
    try:
        if str(me.id) == str(user_id):
            can_read = True
        else:
            # emulate require_permissions("users:read")
            if any((getattr(r, 'name', None) or '').lower() == 'admin' for r in me.roles):
                can_read = True
            else:
                perm_map = {}
                for r in me.roles:
                    if getattr(r, 'permissions', None):
                        try: perm_map.update(r.permissions)
                        except Exception: pass
                if getattr(me, 'permissions_override', None):
                    try: perm_map.update(me.permissions_override)
                    except Exception: pass
                can_read = bool(perm_map.get('users:read'))
    except Exception:
        can_read = False
    if not can_read:
        raise HTTPException(status_code=403, detail="Forbidden")
    from ..models.models import EmployeeProfile
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == u.id).first()
    return {
        "user": {
            "id": str(u.id),
            "username": u.username,
            "email": u.email_personal,
            "is_active": u.is_active,
        },
        "profile": {
            k: getattr(ep, k)
            for k in [
                "first_name","last_name","preferred_name","gender","date_of_birth","marital_status","nationality",
                "phone","mobile_phone","address_line1","address_line2","city","province","postal_code","country",
                "hire_date","termination_date","job_title","division","work_email","work_phone","manager_user_id",
                "pay_rate","pay_type","employment_type","sin_number","work_permit_status","visa_status","profile_photo_file_id",
                "emergency_contact_name","emergency_contact_relationship","emergency_contact_phone",
            ]
        } if ep else None,
    }


@router.put("/users/{user_id}/profile")
def update_user_profile(user_id: str, payload: EmployeeProfileInput, db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    from ..models.models import EmployeeProfile
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == u.id).first()
    if not ep:
        ep = EmployeeProfile(user_id=u.id)
        db.add(ep)
    # Admin/editor can update all fields. Keep behavior, but normalize dates
    data = payload.dict(exclude_unset=True)
    for k in ("date_of_birth","hire_date","termination_date"):
        if k in data and isinstance(data[k], str):
            try:
                dt = datetime.strptime(data[k], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                data[k] = dt
            except Exception:
                data[k] = None
    for k,v in data.items(): setattr(ep,k,v)
    db.commit()
    return {"status":"ok"}


# Role and permission management
@router.post("/users/{user_id}/roles")
def set_user_roles(user_id: str, roles: list[str] = Body(...), db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    # Load role records, create if missing
    role_rows = db.query(Role).filter(Role.name.in_(roles)).all()
    have = {r.name for r in role_rows}
    missing = [r for r in roles if r not in have]
    for name in missing:
        r = Role(name=name, description=name.title())
        db.add(r)
        role_rows.append(r)
    u.roles = role_rows
    db.commit()
    return {"status":"ok", "roles":[r.name for r in u.roles]}


@router.put("/users/{user_id}/permissions")
def update_user_permissions(user_id: str, permissions: dict = Body(...), db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    base = u.permissions_override or {}
    base.update(permissions)
    u.permissions_override = base
    db.commit()
    return {"status":"ok", "permissions": u.permissions_override}


# ----- Multi-record CRUD -----
@router.get("/users/{user_id}/passports")
def list_passports(user_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("users:read"))):
    from ..models.models import EmployeePassport
    rows = db.query(EmployeePassport).filter(EmployeePassport.user_id == user_id).all()
    def _row(p):
        return {
            "id": str(p.id),
            "passport_number": p.passport_number,
            "issuing_country": p.issuing_country,
            "issued_date": p.issued_date.isoformat() if p.issued_date else None,
            "expiry_date": p.expiry_date.isoformat() if p.expiry_date else None,
        }
    return [_row(p) for p in rows]


@router.post("/users/{user_id}/passports")
def create_passport(user_id: str, payload: dict = Body(...), db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    from ..models.models import EmployeePassport
    p = EmployeePassport(user_id=user_id)
    p.passport_number = payload.get("passport_number")
    p.issuing_country = payload.get("issuing_country")
    from datetime import datetime, timezone
    def _dt(s):
        if not s:
            return None
        try:
            return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except Exception:
            return None
    p.issued_date = _dt(payload.get("issued_date"))
    p.expiry_date = _dt(payload.get("expiry_date"))
    db.add(p)
    db.commit()
    return {"id": str(p.id)}


@router.delete("/users/{user_id}/passports/{pid}")
def delete_passport(user_id: str, pid: str, db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    from ..models.models import EmployeePassport
    db.query(EmployeePassport).filter(and_(EmployeePassport.user_id == user_id, EmployeePassport.id == pid)).delete()
    db.commit()
    return {"status": "ok"}


# --- Admin: bulk create users for testing ---
@router.post("/admin/users/bulk-create")
def admin_bulk_create_users(
    count: int = 10,
    prefix: str = "testuser",
    role: str | None = None,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_permissions("users:write")),
):
    from ..models.models import Role as RoleModel, EmployeeProfile as EP
    created = []
    # Ensure role exists if provided
    role_row = None
    if role:
        role_row = db.query(RoleModel).filter(RoleModel.name == role).first()
        if not role_row:
            role_row = RoleModel(name=role, description=role.title())
            db.add(role_row)
            db.flush()
    base = prefix.strip() or "testuser"
    first_names = ["Liam","Olivia","Noah","Emma","Oliver","Ava","Elijah","Sophia","James","Isabella","Benjamin","Mia","Lucas","Charlotte","Henry","Amelia","Alexander","Harper","Ethan","Evelyn"]
    last_names = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin"]
    job_titles = ["Estimator","Project Manager","Site Supervisor","Coordinator","Technician","Engineer","Analyst","Administrator","Operator","Specialist"]
    divisions = ["Construction","Service","Maintenance","Electrical","Mechanical","Operations","Logistics"]
    provinces = ["British Columbia","Alberta","Ontario","Quebec","Manitoba","Saskatchewan","Nova Scotia"]
    cities = ["Vancouver","Burnaby","Surrey","Richmond","Coquitlam","North Vancouver","Langley","Victoria","Kelowna","Abbotsford"]
    phones = ["604-555-{:04d}".format(n) for n in range(1000, 9999)]
    for i in range(1, max(1, int(count)) + 1):
        # Generate unique username
        idx = i
        while True:
            username = f"{base}{idx}"
            exists = db.query(User).filter((User.username == username) | (User.email_personal == f"{username}@example.com")).first()
            if not exists:
                break
            idx += 1
        email = f"{username}@example.com"
        user = User(
            username=username,
            email_personal=email,
            password_hash=get_password_hash("TestUser123!"),
            is_active=True,
            created_at=datetime.now(timezone.utc),
        )
        db.add(user)
        db.flush()
        # Attach role if provided
        if role_row:
            user.roles = [role_row]
        # Minimal profile
        fname = random.choice(first_names)
        lname = random.choice(last_names)
        city = random.choice(cities)
        prov = random.choice(provinces)
        phone = random.choice(phones)
        job = random.choice(job_titles)
        division = random.choice(divisions)
        # Random recent hire date within last 3 years
        try:
            days = random.randint(0, 365 * 3)
            hire_dt = datetime.now(timezone.utc) - timedelta(days=days)
        except Exception:
            hire_dt = None
        ep = EP(
            user_id=user.id,
            first_name=fname,
            last_name=lname,
            preferred_name=fname,
            phone=phone,
            mobile_phone=phone,
            address_line1=f"{random.randint(10,999)} {random.choice(['Main','Oak','Pine','Maple','Cedar'])} St",
            city=city,
            province=prov,
            postal_code=f"V{random.randint(1,9)}{random.randint(0,9)}{random.choice(['A','B','C','D','E','F'])} {random.randint(1,9)}{random.randint(0,9)}{random.choice(['A','B','C','D','E','F'])}",
            country="Canada",
            hire_date=hire_dt,
            job_title=job,
            division=division,
            work_email=f"{username}@example.com",
            work_phone=phone,
        )
        db.add(ep)
        db.flush()
        created.append({
            "id": str(user.id),
            "username": username,
            "email": email,
            "password": "TestUser123!",
            "role": role_row.name if role_row else None,
            "first_name": fname,
            "last_name": lname,
            "job_title": job,
            "city": city,
            "province": prov,
        })
    db.commit()
    return {"created": created}


@router.get("/users/{user_id}/education")
def list_education(user_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("users:read"))):
    from ..models.models import EmployeeEducation
    rows = db.query(EmployeeEducation).filter(EmployeeEducation.user_id == user_id).all()
    def _row(e):
        return {
            "id": str(e.id),
            "college_institution": e.college_institution,
            "degree": e.degree,
            "major_specialization": e.major_specialization,
            "gpa": e.gpa,
            "start_date": e.start_date.isoformat() if e.start_date else None,
            "end_date": e.end_date.isoformat() if e.end_date else None,
        }
    return [_row(e) for e in rows]


@router.post("/users/{user_id}/education")
def create_education(user_id: str, payload: dict = Body(...), db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    from ..models.models import EmployeeEducation
    from datetime import datetime, timezone
    def _dt(s):
        if not s:
            return None
        try:
            return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except Exception:
            return None
    e = EmployeeEducation(user_id=user_id)
    e.college_institution = payload.get("college_institution")
    e.degree = payload.get("degree")
    e.major_specialization = payload.get("major_specialization")
    e.gpa = payload.get("gpa")
    e.start_date = _dt(payload.get("start_date"))
    e.end_date = _dt(payload.get("end_date"))
    db.add(e)
    db.commit()
    return {"id": str(e.id)}


@router.delete("/users/{user_id}/education/{eid}")
def delete_education(user_id: str, eid: str, db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    from ..models.models import EmployeeEducation
    db.query(EmployeeEducation).filter(and_(EmployeeEducation.user_id == user_id, EmployeeEducation.id == eid)).delete()
    db.commit()
    return {"status": "ok"}


@router.get("/users/{user_id}/documents")
def list_documents(user_id: str, folder_id: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_permissions("users:read"))):
    from ..models.models import EmployeeDocument
    q = db.query(EmployeeDocument).filter(EmployeeDocument.user_id == user_id)
    if folder_id:
        # Backward-compatible: store folder relation in doc_type as tag 'folder:<id>'
        tag = f"folder:{folder_id}"
        q = q.filter(EmployeeDocument.doc_type == tag)
    rows = q.all()
    def _row(d):
        # Derive folder id from doc_type tag if present
        fid = None
        try:
            if (d.doc_type or '').startswith('folder:'):
                fid = d.doc_type.split(':',1)[1]
        except Exception:
            fid = None
        return {
            "id": str(d.id),
            "folder_id": fid,
            "doc_type": d.doc_type,
            "title": d.title,
            "number": d.number,
            "issuing_country": d.issuing_country,
            "issued_date": d.issued_date.isoformat() if d.issued_date else None,
            "expiry_date": d.expiry_date.isoformat() if d.expiry_date else None,
            "notes": d.notes,
            "file_id": str(d.file_id) if getattr(d, 'file_id', None) else None,
            "created_at": d.created_at.isoformat() if getattr(d, 'created_at', None) else None,
        }
    return [_row(d) for d in rows]


@router.post("/users/{user_id}/documents")
def create_document(user_id: str, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from ..models.models import EmployeeDocument
    from datetime import datetime, timezone
    def _dt(s):
        if not s:
            return None
        try:
            return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except Exception:
            return None
    # Save folder link as doc_type tag for compatibility without migrations
    folder_id = payload.get("folder_id")
    d = EmployeeDocument(
        user_id=user_id,
        doc_type=(f"folder:{folder_id}" if folder_id else (payload.get("doc_type") or "other")),
        title=payload.get("title"),
        number=payload.get("number"),
        issuing_country=payload.get("issuing_country"),
        issued_date=_dt(payload.get("issued_date")),
        expiry_date=_dt(payload.get("expiry_date")),
        notes=payload.get("notes"),
        file_id=payload.get("file_id"),
        created_by=user.id,
    )
    db.add(d)
    db.commit()
    return {"id": str(d.id)}


@router.delete("/users/{user_id}/documents/{doc_id}")
def delete_document(user_id: str, doc_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    from ..models.models import EmployeeDocument
    db.query(EmployeeDocument).filter(and_(EmployeeDocument.user_id == user_id, EmployeeDocument.id == doc_id)).delete()
    db.commit()
    return {"status": "ok"}


# ===== Employee Folders =====
@router.get("/users/{user_id}/folders")
def list_folders(user_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("users:read"))):
    from ..models.models import EmployeeFolder
    rows = db.query(EmployeeFolder).filter(EmployeeFolder.user_id == user_id).order_by(EmployeeFolder.sort_index.asc(), EmployeeFolder.name.asc()).all()
    return [{
        "id": str(f.id),
        "name": f.name,
        "parent_id": str(f.parent_id) if getattr(f, 'parent_id', None) else None,
        "sort_index": f.sort_index,
    } for f in rows]


@router.post("/users/{user_id}/folders")
def create_folder(user_id: str, name: str = Body(...), parent_id: Optional[str] = Body(None), db: Session = Depends(get_db), user: User = Depends(require_permissions("users:write"))):
    from ..models.models import EmployeeFolder
    fid = None
    try:
        fid = uuid.UUID(parent_id) if parent_id else None
    except Exception:
        fid = None
    f = EmployeeFolder(user_id=user_id, name=(name or "").strip(), parent_id=fid, created_by=user.id)
    if not f.name:
        raise HTTPException(status_code=400, detail="Folder name required")
    db.add(f)
    db.commit()
    return {"id": str(f.id)}


@router.delete("/users/{user_id}/folders/{folder_id}")
def delete_folder(user_id: str, folder_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    from ..models.models import EmployeeFolder, EmployeeDocument
    try:
        fid = uuid.UUID(folder_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid folder")
    # prevent delete if documents exist (doc_type carries folder tag)
    tag = f"folder:{folder_id}"
    has_docs = db.query(EmployeeDocument).filter(EmployeeDocument.user_id == user_id, EmployeeDocument.doc_type == tag).first()
    if has_docs:
        raise HTTPException(status_code=400, detail="Folder not empty")
    db.query(EmployeeFolder).filter(and_(EmployeeFolder.user_id == user_id, EmployeeFolder.id == fid)).delete()
    db.commit()
    return {"status":"ok"}


@router.put("/users/{user_id}/folders/{folder_id}")
def update_folder(user_id: str, folder_id: str, name: str = Body(None), parent_id: Optional[str] = Body(None), db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    from ..models.models import EmployeeFolder
    try:
        fid = uuid.UUID(folder_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid folder")
    f = db.query(EmployeeFolder).filter(and_(EmployeeFolder.user_id == user_id, EmployeeFolder.id == fid)).first()
    if not f:
        raise HTTPException(status_code=404, detail="Not found")
    if name is not None:
        f.name = (name or "").strip()
        if not f.name:
            raise HTTPException(status_code=400, detail="Folder name required")
    if parent_id is not None:
        try:
            f.parent_id = uuid.UUID(parent_id) if parent_id else None
        except Exception:
            f.parent_id = None
    db.commit()
    return {"status": "ok"}


@router.put("/users/{user_id}/documents/{doc_id}")
def update_document(user_id: str, doc_id: str, payload: dict = Body(...), db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    from ..models.models import EmployeeDocument
    d = db.query(EmployeeDocument).filter(and_(EmployeeDocument.user_id == user_id, EmployeeDocument.id == doc_id)).first()
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    # only allow safe fields update here
    if "folder_id" in payload:
        fid = payload.get("folder_id")
        d.doc_type = f"folder:{fid}" if fid else (d.doc_type or None)
    if "title" in payload:
        d.title = payload.get("title")
    if "notes" in payload:
        d.notes = payload.get("notes")
    db.commit()
    return {"status": "ok"}


# ===== Employee Notes =====
@router.get("/users/{user_id}/notes")
def list_notes(user_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("users:read"))):
    from ..models.models import EmployeeNote
    rows = db.query(EmployeeNote).filter(EmployeeNote.user_id == user_id).order_by(EmployeeNote.created_at.desc()).all()
    return [{
        "id": str(n.id),
        "category": n.category,
        "text": n.text,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "created_by": str(n.created_by) if n.created_by else None,
        "updated_at": n.updated_at.isoformat() if n.updated_at else None,
        "updated_by": str(n.updated_by) if n.updated_by else None,
    } for n in rows]


@router.post("/users/{user_id}/notes")
def create_note(user_id: str, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from ..models.models import EmployeeNote
    n = EmployeeNote(
        user_id=user_id,
        category=payload.get("category"),
        text=(payload.get("text") or "").strip(),
        created_by=user.id,
    )
    if not n.text:
        raise HTTPException(status_code=400, detail="Note text is required")
    db.add(n)
    db.commit()
    return {"id": str(n.id)}


@router.delete("/users/{user_id}/notes/{note_id}")
def delete_note(user_id: str, note_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    from ..models.models import EmployeeNote
    db.query(EmployeeNote).filter(and_(EmployeeNote.user_id == user_id, EmployeeNote.id == note_id)).delete()
    db.commit()
    return {"status": "ok"}

@router.get("/users/{user_id}/emergency-contacts")
def list_emergency_contacts(user_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("users:read"))):
    from ..models.models import EmployeeEmergencyContact
    rows = db.query(EmployeeEmergencyContact).filter(EmployeeEmergencyContact.user_id == user_id).all()
    def _row(e):
        return {
            "id": str(e.id),
            "name": e.name,
            "relationship": e.relationship,
            "is_primary": e.is_primary,
            "work_phone": e.work_phone,
            "home_phone": e.home_phone,
            "mobile_phone": e.mobile_phone,
            "email": e.email,
            "address": e.address,
        }
    return [_row(e) for e in rows]


@router.post("/users/{user_id}/emergency-contacts")
def create_emergency_contact(user_id: str, payload: dict = Body(...), db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    from ..models.models import EmployeeEmergencyContact
    e = EmployeeEmergencyContact(
        user_id=user_id,
        name=payload.get("name"),
        relationship=payload.get("relationship"),
        is_primary=bool(payload.get("is_primary")),
        work_phone=payload.get("work_phone"),
        home_phone=payload.get("home_phone"),
        mobile_phone=payload.get("mobile_phone"),
        email=payload.get("email"),
        address=payload.get("address"),
    )
    db.add(e)
    db.commit()
    return {"id": str(e.id)}


@router.delete("/users/{user_id}/emergency-contacts/{eid}")
def delete_emergency_contact(user_id: str, eid: str, db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    from ..models.models import EmployeeEmergencyContact
    db.query(EmployeeEmergencyContact).filter(and_(EmployeeEmergencyContact.user_id == user_id, EmployeeEmergencyContact.id == eid)).delete()
    db.commit()
    return {"status": "ok"}


# Basic user management
@router.put("/users/{user_id}")
def update_user(user_id: str, email_personal: Optional[str] = None, username: Optional[str] = None, is_active: Optional[bool] = None, db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    if email_personal is not None:
        u.email_personal = email_personal
    if username is not None:
        u.username = username
    if is_active is not None:
        u.is_active = bool(is_active)
    db.commit()
    return {"status":"ok"}


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
            link = f"{settings.public_base_url}/ui/password-reset.html?token={token}"
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

