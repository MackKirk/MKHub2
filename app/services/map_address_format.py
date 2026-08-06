"""Address formatting helpers for map popups (aligned with frontend addressUtils)."""
from __future__ import annotations

import re
from typing import Optional

_HERO_POSTAL_RE = re.compile(r"\b([A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d)\b")

_HERO_COUNTRY_SEGMENTS = frozenset({
    "canada",
    "usa",
    "us",
    "united states",
    "united states of america",
})

_HERO_PROVINCE_CODES = frozenset({
    "ab", "bc", "mb", "nb", "nl", "ns", "nt", "nu", "on", "pe", "qc", "sk", "yt",
})

_HERO_PROVINCE_NAMES = frozenset({
    "alberta",
    "british columbia",
    "manitoba",
    "new brunswick",
    "newfoundland and labrador",
    "northwest territories",
    "nova scotia",
    "nunavut",
    "ontario",
    "prince edward island",
    "quebec",
    "saskatchewan",
    "yukon",
})


def _normalize_hero_postal(value: str) -> str:
    compact = value.upper().replace(" ", "")
    if len(compact) == 6:
        return f"{compact[:3]} {compact[3:]}"
    return value.upper().strip()


def _extract_hero_postal(text: str) -> Optional[str]:
    match = _HERO_POSTAL_RE.search(text)
    return _normalize_hero_postal(match.group(1)) if match else None


def _is_hero_country_segment(segment: str) -> bool:
    return segment.strip().lower() in _HERO_COUNTRY_SEGMENTS


def _is_hero_province_segment(segment: str) -> bool:
    normalized = segment.strip().lower()
    if not normalized:
        return False
    return normalized in _HERO_PROVINCE_CODES or normalized in _HERO_PROVINCE_NAMES


def _parse_full_address_for_map(line1: str) -> dict[str, Optional[str]]:
    segments = [part.strip() for part in line1.split(",") if part.strip()]
    if not segments:
        return {"street": "", "city": None, "province": None, "postal": None}

    street = segments[0]
    city: Optional[str] = None
    province: Optional[str] = None
    postal: Optional[str] = None

    for segment in segments[1:]:
        if _is_hero_country_segment(segment):
            continue

        segment_postal = _extract_hero_postal(segment)
        if segment_postal:
            postal = postal or segment_postal
            remainder = segment.replace(segment_postal, "").strip().rstrip(",").strip()
            if remainder and _is_hero_province_segment(remainder) and not province:
                province = remainder
            continue

        if _is_hero_province_segment(segment):
            province = province or segment.strip()
            continue

        if not city:
            city = segment

    return {"street": street, "city": city, "province": province, "postal": postal}


def _province_code(province: Optional[str]) -> Optional[str]:
    if not province:
        return None
    normalized = province.strip()
    if len(normalized) <= 3:
        return normalized.upper()
    lower = normalized.lower()
    name_to_code = {
        "alberta": "AB",
        "british columbia": "BC",
        "manitoba": "MB",
        "new brunswick": "NB",
        "newfoundland and labrador": "NL",
        "northwest territories": "NT",
        "nova scotia": "NS",
        "nunavut": "NU",
        "ontario": "ON",
        "prince edward island": "PE",
        "quebec": "QC",
        "saskatchewan": "SK",
        "yukon": "YT",
    }
    return name_to_code.get(lower, normalized)


def _build_city_line(
    city: Optional[str],
    province: Optional[str],
    postal: Optional[str],
) -> Optional[str]:
    parts: list[str] = []
    if city:
        prov_code = _province_code(province)
        if prov_code:
            parts.append(f"{city}, {prov_code}")
        else:
            parts.append(city)
    elif province:
        parts.append(_province_code(province) or province)
    if postal:
        parts.append(postal)
    return " ".join(parts) if parts else None


def format_map_address(
    *,
    address_line1: Optional[str] = None,
    address_line2: Optional[str] = None,
    city: Optional[str] = None,
    province: Optional[str] = None,
    postal_code: Optional[str] = None,
) -> dict[str, Optional[str]]:
    """Return deduplicated street + city line for map popup display."""
    l1 = (address_line1 or "").strip()
    l2 = (address_line2 or "").strip()
    city_field = (city or "").strip()
    province_field = (province or "").strip()
    postal_field = (postal_code or "").strip()

    if not l1 and not l2 and not city_field and not postal_field:
        return {"address_street": None, "address_city_line": None, "address": None}

    if l1 and "," in l1:
        parsed = _parse_full_address_for_map(l1)
        street = parsed["street"] or None
        city_line = _build_city_line(parsed["city"], parsed["province"], parsed["postal"])
        address = ", ".join(p for p in [street, city_line] if p) or None
        return {"address_street": street, "address_city_line": city_line, "address": address}

    street_parts: list[str] = []
    if l1 and l2:
        street_parts.append(f"{l1} / {l2}")
    elif l1:
        street_parts.append(l1)
    elif l2:
        street_parts.append(l2)

    street = street_parts[0] if street_parts else None
    city_line = _build_city_line(city_field or None, province_field or None, postal_field or None)
    address = ", ".join(p for p in [street, city_line] if p) or None
    return {"address_street": street, "address_city_line": city_line, "address": address}
