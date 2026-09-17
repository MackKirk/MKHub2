from typing import Optional
import time
import uuid
import secrets
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy import or_, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..auth.security import (
    _has_permission,
    _user_from_access_payload,
    decode_token,
    get_current_user,
    http_bearer,
)
from fastapi.security import HTTPAuthorizationCredentials
from ..config import settings
from ..db import engine, get_db
from ..models.models import Attendance, EmployeeProfile, User, WorkType
from ..services.sage_export import (
    SOURCE_VERICLOCK,
    apply_sage_ack,
    refresh_sage_export_state,
    sage_queue_payload,
    sage_response_fields,
    worker_display_name,
)


router = APIRouter(prefix="/integrations", tags=["integrations"])

# Reuse connections to Google (avoid TLS handshake per keystroke).
_places_client: httpx.Client | None = None
_place_details_cache: dict[str, tuple[float, dict]] = {}
_PLACE_DETAILS_TTL_SEC = 3600.0
_PLACE_DETAILS_CACHE_MAX = 300


def _get_places_client() -> httpx.Client:
    global _places_client
    if _places_client is None:
        _places_client = httpx.Client(
            timeout=httpx.Timeout(8.0, connect=2.0),
            limits=httpx.Limits(max_keepalive_connections=8, max_connections=16),
        )
    return _places_client


def _cached_place_details(place_id: str) -> dict:
    now = time.time()
    cached = _place_details_cache.get(place_id)
    if cached and (now - cached[0]) < _PLACE_DETAILS_TTL_SEC:
        return cached[1]
    params = {
        "place_id": place_id,
        "fields": "address_component,formatted_address,geometry,name,place_id",
        "key": settings.google_places_api_key,
    }
    client = _get_places_client()
    r = client.get("https://maps.googleapis.com/maps/api/place/details/json", params=params)
    r.raise_for_status()
    data = r.json()
    if len(_place_details_cache) >= _PLACE_DETAILS_CACHE_MAX:
        oldest_key = min(_place_details_cache, key=lambda k: _place_details_cache[k][0])
        _place_details_cache.pop(oldest_key, None)
    _place_details_cache[place_id] = (now, data)
    return data


@router.get("/status")
def status():
    # DB health
    db_ok = True
    try:
        with engine.connect() as conn:
            conn.execute(text("select 1"))
    except SQLAlchemyError:
        db_ok = False

    # Other integrations are placeholders for now
    return {
        "db": db_ok,
        "blob": False,
        "graph": False,
        "bamboohr": False,
        "dataforma": False,
    }


@router.get("/places/autocomplete")
def places_autocomplete(
    q: str = Query(..., min_length=1, max_length=200),
    types: str = Query("address", max_length=64),
    components: Optional[str] = Query(None, max_length=120),
    user: User = Depends(get_current_user),
):
    """Proxy Google Places Autocomplete (server-side key; never exposed to browser)."""
    if not settings.google_places_api_key:
        return {"predictions": [], "status": "REQUEST_DENIED"}
    params: dict = {
        "input": q,
        "key": settings.google_places_api_key,
        "types": types,
    }
    if components:
        params["components"] = components
    try:
        client = _get_places_client()
        r = client.get(
            "https://maps.googleapis.com/maps/api/place/autocomplete/json",
            params=params,
        )
        r.raise_for_status()
        return r.json()
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Places autocomplete unavailable")


@router.get("/places/details")
def places_details(
    place_id: str = Query(..., min_length=2, max_length=512),
    user: User = Depends(get_current_user),
):
    """Proxy Google Place Details for a place_id from autocomplete."""
    if not settings.google_places_api_key:
        raise HTTPException(status_code=503, detail="Places API not configured")
    try:
        data = _cached_place_details(place_id)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Places details unavailable")
    st = data.get("status")
    if st == "ZERO_RESULTS":
        raise HTTPException(status_code=404, detail="Place not found")
    if st != "OK":
        raise HTTPException(status_code=400, detail=st or "Place details error")
    return data


def _can_read_sage_queue(user: User) -> bool:
    return (
        _has_permission(user, "hr:attendance:read")
        or _has_permission(user, "hr:attendance:write")
        or _has_permission(user, "hr:users:view:timesheet")
        or _has_permission(user, "users:read")
    )


def _can_ack_sage(user: User) -> bool:
    return (
        _has_permission(user, "hr:attendance:write")
        or _has_permission(user, "hr:users:edit:timesheet")
        or _has_permission(user, "users:write")
    )


def _sage_companion_or_user(
    request: Request,
    db: Session = Depends(get_db),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
    x_secret: Optional[str] = Header(default=None, alias="X-Sage-Companion-Secret"),
) -> Optional[User]:
    """Companion secret, or an HR JWT. None means the Windows companion."""
    expected = (settings.sage_companion_secret or "").strip()
    provided = (x_secret or "").strip()
    if expected:
        if provided and secrets.compare_digest(provided, expected):
            return None
        auth = request.headers.get("authorization") or ""
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
            if token and secrets.compare_digest(token, expected):
                return None
    if creds is None:
        if not expected:
            raise HTTPException(status_code=503, detail="Sage companion secret is not configured")
        raise HTTPException(status_code=401, detail="Unauthorized")
    return _user_from_access_payload(db, decode_token(creds.credentials))


def _worker_names_by_id(db: Session, worker_ids: list) -> dict[str, str]:
    if not worker_ids:
        return {}
    users = {str(u.id): u for u in db.query(User).filter(User.id.in_(worker_ids)).all()}
    profiles = {
        str(p.user_id): p
        for p in db.query(EmployeeProfile).filter(EmployeeProfile.user_id.in_(worker_ids)).all()
    }
    out: dict[str, str] = {}
    for wid in worker_ids:
        key = str(wid)
        out[key] = worker_display_name(profiles.get(key), users.get(key))
    return out


def _items_by_work_type(db: Session, rows: list) -> dict[str, Optional[str]]:
    ids = [att.work_type_id for att in rows if getattr(att, "work_type_id", None)]
    if not ids:
        return {}
    types = {str(wt.id): wt for wt in db.query(WorkType).filter(WorkType.id.in_(ids)).all()}
    out: dict[str, Optional[str]] = {}
    for att in rows:
        wt_id = getattr(att, "work_type_id", None)
        if not wt_id:
            continue
        wt = types.get(str(wt_id))
        code = (getattr(wt, "sage_service_id", None) or "").strip()
        out[str(att.id)] = code or None
    return out


@router.get("/sage/queue")
def sage_export_queue(
    urgent_only: bool = Query(False),
    limit: int = Query(200, ge=1, le=1000),
    since_days: int = Query(21, ge=1, le=90),
    principal: Optional[User] = Depends(_sage_companion_or_user),
    db: Session = Depends(get_db),
):
    """Windows companion pulls this. Recently eligible approved hours are persisted as queued."""
    if principal is not None and not _can_read_sage_queue(principal):
        raise HTTPException(status_code=403, detail="Access denied")
    cutoff = datetime.now(timezone.utc) - timedelta(days=since_days)
    pending = (
        db.query(Attendance)
        .filter(Attendance.status == "approved")
        .filter(Attendance.sage_state == "none")
        .filter(or_(Attendance.source.is_(None), Attendance.source != SOURCE_VERICLOCK))
        .filter(
            or_(
                Attendance.clock_in_time >= cutoff,
                Attendance.clock_out_time >= cutoff,
            )
        )
        .limit(400)
        .all()
    )
    dirty = False
    for att in pending:
        before = (att.sage_state or "none")
        refresh_sage_export_state(att)
        if (att.sage_state or "none") != before or att.sage_source_key:
            dirty = True
    if dirty:
        db.commit()

    q = db.query(Attendance).filter(Attendance.sage_state.in_(["queued", "error"]))
    if urgent_only:
        q = q.filter(Attendance.sage_urgent.is_(True))
    rows = q.order_by(Attendance.sage_urgent.desc()).limit(limit).all()
    names = _worker_names_by_id(db, [att.worker_id for att in rows])
    items = _items_by_work_type(db, rows)
    tz_name = settings.tz_default or "America/Vancouver"
    return [
        sage_queue_payload(
            att,
            worker_name=names.get(str(att.worker_id)),
            sage_item=items.get(str(att.id)),
            tz_name=tz_name,
        )
        for att in rows
    ]


@router.post("/sage/ack")
def sage_export_ack(
    payload: dict,
    principal: Optional[User] = Depends(_sage_companion_or_user),
    db: Session = Depends(get_db),
):
    """Companion reports sent / paid / error / queued after talking to Sage."""
    if principal is not None and not _can_ack_sage(principal):
        raise HTTPException(status_code=403, detail="Access denied")
    attendance_id = payload.get("attendance_id")
    state = payload.get("state")
    if not attendance_id or not state:
        raise HTTPException(status_code=400, detail="attendance_id and state are required")
    try:
        attendance_uuid = uuid.UUID(str(attendance_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid attendance_id")
    attendance = db.query(Attendance).filter(Attendance.id == attendance_uuid).first()
    if not attendance:
        raise HTTPException(status_code=404, detail="Attendance not found")
    try:
        apply_sage_ack(
            attendance,
            state=str(state),
            sage_rec_id=payload.get("sage_rec_id"),
            error=payload.get("error"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.commit()
    db.refresh(attendance)
    return sage_response_fields(attendance)

