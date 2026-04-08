from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from ..auth.security import get_current_user
from ..config import settings
from ..db import engine
from ..models.models import User


router = APIRouter(prefix="/integrations", tags=["integrations"])


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
        with httpx.Client(timeout=15.0) as client:
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
    params = {
        "place_id": place_id,
        "fields": "address_component,formatted_address,geometry,name,place_id",
        "key": settings.google_places_api_key,
    }
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.get(
                "https://maps.googleapis.com/maps/api/place/details/json",
                params=params,
            )
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Places details unavailable")
    st = data.get("status")
    if st == "ZERO_RESULTS":
        raise HTTPException(status_code=404, detail="Place not found")
    if st != "OK":
        raise HTTPException(status_code=400, detail=st or "Place details error")
    return data

