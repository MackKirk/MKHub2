"""Server-side geocoding for project site addresses."""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal
from ..models.models import ClientSite, Project

logger = logging.getLogger(__name__)

GEOCODING_STATUS_PENDING = "pending"
GEOCODING_STATUS_SUCCESS = "success"
GEOCODING_STATUS_FAILED = "failed"
GEOCODING_STATUS_MANUAL = "manual"

_ADDRESS_FIELDS = (
    "address",
    "address_city",
    "address_province",
    "address_country",
)

_geocoding_client: httpx.Client | None = None


def _get_geocoding_client() -> httpx.Client:
    global _geocoding_client
    if _geocoding_client is None:
        _geocoding_client = httpx.Client(
            timeout=httpx.Timeout(10.0, connect=3.0),
            limits=httpx.Limits(max_keepalive_connections=4, max_connections=8),
        )
    return _geocoding_client


def is_valid_coordinate(lat: Any, lng: Any) -> bool:
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        return False
    if lat_f != lat_f or lng_f != lng_f:
        return False
    if lat_f < -90 or lat_f > 90 or lng_f < -180 or lng_f > 180:
        return False
    if abs(lat_f) < 1e-9 and abs(lng_f) < 1e-9:
        return False
    return True


def normalize_project_address(project: Project, site: Optional[ClientSite] = None) -> str:
    parts: list[str] = []
    for field in _ADDRESS_FIELDS:
        val = getattr(project, field, None)
        if val and str(val).strip():
            parts.append(str(val).strip())
    if site:
        for field in ("site_address_line1", "site_address_line2", "site_city", "site_province", "site_postal_code", "site_country"):
            val = getattr(site, field, None)
            if val and str(val).strip():
                s = str(val).strip()
                if s not in parts:
                    parts.append(s)
    return ", ".join(parts)


def address_fields_changed(payload: dict, before: Optional[dict] = None) -> bool:
    keys = set(_ADDRESS_FIELDS) | {"site_id"}
    if before:
        for k in keys:
            if k in payload and payload.get(k) != before.get(k):
                return True
        return False
    return any(k in payload for k in keys)


def mark_manual_geocoding(project: Project) -> None:
    project.geocoding_status = GEOCODING_STATUS_MANUAL
    project.geocoded_at = datetime.now(timezone.utc)
    project.geocoding_error = None


def geocode_address_string(address: str) -> tuple[Optional[float], Optional[float], Optional[str], Optional[str]]:
    """Returns (lat, lng, formatted_address, error_message)."""
    if not address or not address.strip():
        return None, None, None, "Empty address"
    api_key = settings.google_places_api_key
    if not api_key:
        return None, None, None, "Geocoding API key not configured"
    try:
        client = _get_geocoding_client()
        r = client.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": address.strip(), "key": api_key},
        )
        r.raise_for_status()
        data = r.json()
    except httpx.HTTPError as exc:
        logger.warning("geocoding_http_error", extra={"error": str(exc)})
        return None, None, None, f"HTTP error: {exc}"

    status = data.get("status")
    if status != "OK":
        err = data.get("error_message") or status or "Geocoding failed"
        logger.info("geocoding_failed", extra={"status": status, "address_len": len(address)})
        return None, None, None, str(err)[:500]

    results = data.get("results") or []
    if not results:
        return None, None, None, "No results"

    top = results[0]
    loc = (top.get("geometry") or {}).get("location") or {}
    lat = loc.get("lat")
    lng = loc.get("lng")
    formatted = top.get("formatted_address")
    if not is_valid_coordinate(lat, lng):
        return None, None, None, "Invalid coordinates returned"
    return float(lat), float(lng), formatted, None


def geocode_project_sync(db: Session, project_id: str, *, force: bool = False) -> bool:
    project = db.query(Project).filter(Project.id == project_id, Project.deleted_at.is_(None)).first()
    if not project:
        return False

    status = getattr(project, "geocoding_status", None)
    if status == GEOCODING_STATUS_MANUAL and not force:
        if is_valid_coordinate(project.lat, project.lng):
            return True

    site = None
    if getattr(project, "site_id", None):
        site = db.query(ClientSite).filter(ClientSite.id == project.site_id).first()

    address = normalize_project_address(project, site)
    if not address:
        return False

    project.geocoding_status = GEOCODING_STATUS_PENDING
    project.geocoding_error = None
    db.commit()

    lat, lng, formatted, err = geocode_address_string(address)
    if lat is not None and lng is not None:
        project.lat = lat
        project.lng = lng
        project.geocoded_address = formatted
        project.geocoding_status = GEOCODING_STATUS_SUCCESS
        project.geocoded_at = datetime.now(timezone.utc)
        project.geocoding_error = None
        db.commit()
        logger.info("geocoding_success", extra={"project_id": str(project_id)})
        return True

    project.geocoding_status = GEOCODING_STATUS_FAILED
    project.geocoding_error = (err or "Unknown error")[:500]
    project.geocoded_at = datetime.now(timezone.utc)
    db.commit()
    logger.warning("geocoding_failed_project", extra={"project_id": str(project_id), "error": project.geocoding_error})
    return False


def _geocode_project_background(project_id: str) -> None:
    db = SessionLocal()
    try:
        geocode_project_sync(db, project_id)
    except Exception as exc:
        logger.exception("geocoding_background_error", extra={"project_id": project_id, "error": str(exc)})
    finally:
        db.close()


def schedule_project_geocoding(project_id: str) -> None:
    thread = threading.Thread(
        target=_geocode_project_background,
        args=(str(project_id),),
        daemon=True,
        name=f"geocode-project-{project_id}",
    )
    thread.start()


def schedule_geocoding_for_site_projects(db: Session, site_id: str) -> None:
    projects = (
        db.query(Project.id)
        .filter(Project.site_id == site_id, Project.deleted_at.is_(None))
        .all()
    )
    for (pid,) in projects:
        schedule_project_geocoding(str(pid))


def maybe_schedule_geocoding_after_project_save(
    db: Session,
    project: Project,
    payload: dict,
    *,
    before_address: Optional[dict] = None,
    coordinates_changed: bool = False,
) -> None:
    if coordinates_changed and ("lat" in payload or "lng" in payload):
        mark_manual_geocoding(project)
        db.commit()
        return

    if not address_fields_changed(payload, before_address):
        return

    has_coords = is_valid_coordinate(project.lat, project.lng)
    status = getattr(project, "geocoding_status", None)
    if status == GEOCODING_STATUS_MANUAL and has_coords:
        return

    schedule_project_geocoding(str(project.id))
