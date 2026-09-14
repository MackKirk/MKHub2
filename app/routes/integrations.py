from typing import Optional
import time
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..auth.security import _has_permission, get_current_user
from ..config import settings
from ..db import engine, get_db
from ..models.models import Attendance, User
from ..services.sage_export import apply_sage_ack, sage_queue_payload, sage_response_fields


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


@router.get("/sage/queue")
def sage_export_queue(
    urgent_only: bool = Query(False),
    limit: int = Query(200, ge=1, le=1000),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Windows companion pulls this. Persist queued/error only — no historical backfill."""
    if not _can_read_sage_queue(user):
        raise HTTPException(status_code=403, detail="Access denied")
    q = db.query(Attendance).filter(Attendance.sage_state.in_(["queued", "error"]))
    if urgent_only:
        q = q.filter(Attendance.sage_urgent.is_(True))
    rows = q.order_by(Attendance.sage_urgent.desc()).limit(limit).all()
    return [sage_queue_payload(att) for att in rows]


@router.post("/sage/ack")
def sage_export_ack(
    payload: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Companion reports sent / paid / error / queued after talking to Sage."""
    if not _can_ack_sage(user):
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

