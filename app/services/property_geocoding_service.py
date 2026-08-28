"""Geocode property addresses via Google Geocoding API (shared with projects)."""
from __future__ import annotations

import logging
from typing import Optional

from ..models.models import Property
from .project_geocoding_service import geocode_address_string, is_valid_coordinate

logger = logging.getLogger(__name__)

_PROPERTY_ADDRESS_FIELDS = (
    "address_line1",
    "address_line2",
    "city",
    "province",
    "postal_code",
    "country",
)


def normalize_property_address(prop: Property) -> str:
    parts: list[str] = []
    for field in _PROPERTY_ADDRESS_FIELDS:
        val = getattr(prop, field, None)
        if val and str(val).strip():
            parts.append(str(val).strip())
    return ", ".join(parts)


def snapshot_property_address(prop: Property) -> dict:
    return {f: getattr(prop, f, None) for f in _PROPERTY_ADDRESS_FIELDS}


def _address_changed(payload: dict, before: dict) -> bool:
    for field in _PROPERTY_ADDRESS_FIELDS:
        if field in payload and payload.get(field) != before.get(field):
            return True
    return False


def apply_property_geocoding_on_save(
    prop: Property,
    payload: dict,
    *,
    before: Optional[dict] = None,
    is_create: bool = False,
) -> None:
    """Fill lat/lng from address when coordinates were not sent in the payload."""
    if "lat" in payload or "lng" in payload:
        return

    if before is not None:
        if not _address_changed(payload, before) and is_valid_coordinate(prop.lat, prop.lng):
            return
    elif is_create and is_valid_coordinate(prop.lat, prop.lng):
        return

    address = normalize_property_address(prop)
    if not address:
        return

    lat, lng, _formatted, err = geocode_address_string(address)
    if lat is not None and lng is not None:
        prop.lat = lat
        prop.lng = lng
        logger.info("property_geocoding_success", extra={"property_id": str(prop.id)})
    elif err:
        logger.info("property_geocoding_failed", extra={"property_id": str(prop.id), "error": err[:200]})
