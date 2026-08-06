"""Lightweight map points for Projects Map View."""
from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..models.models import Client, ClientSite, EmployeeProfile, Project, SettingItem, SettingList, User
from .map_address_format import format_map_address
from .project_geocoding_service import is_valid_coordinate
from .project_list_filters import (
    BusinessProjectListFilters,
    apply_bounding_box_filter,
    build_business_projects_query,
)

logger = logging.getLogger(__name__)


def _format_map_address(project: Project, site: Optional[ClientSite]) -> dict[str, Optional[str]]:
    if site and getattr(project, "site_id", None):
        return format_map_address(
            address_line1=getattr(site, "site_address_line1", None),
            address_line2=getattr(site, "site_address_line2", None),
            city=getattr(site, "site_city", None),
            province=getattr(site, "site_province", None),
            postal_code=getattr(site, "site_postal_code", None),
        )
    return format_map_address(
        address_line1=getattr(project, "address", None),
        address_line2=None,
        city=getattr(project, "address_city", None),
        province=getattr(project, "address_province", None),
        postal_code=getattr(project, "address_postal_code", None),
    )


def _user_display_payload(user_row: User, ep: Optional[EmployeeProfile]) -> dict[str, Any]:
    name = (getattr(ep, "preferred_name", None) or "").strip() if ep else ""
    if not name:
        first = (getattr(ep, "first_name", None) or "").strip() if ep else ""
        last = (getattr(ep, "last_name", None) or "").strip() if ep else ""
        name = " ".join([x for x in [first, last] if x])
    if not name:
        name = getattr(user_row, "name", None) or getattr(user_row, "email", None) or str(user_row.id)
    avatar_file_id = (
        str(getattr(ep, "profile_photo_file_id", None))
        if ep and getattr(ep, "profile_photo_file_id", None)
        else None
    )
    return {
        "id": str(user_row.id),
        "name": name,
        "avatar_file_id": avatar_file_id,
    }


def _load_users_map(db: Session, user_ids: list) -> dict[str, dict[str, Any]]:
    users_map: dict[str, dict[str, Any]] = {}
    if not user_ids:
        return users_map
    rows = (
        db.query(User, EmployeeProfile)
        .outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)
        .filter(User.id.in_(user_ids))
        .all()
    )
    for user_row, ep in rows:
        users_map[str(user_row.id)] = _user_display_payload(user_row, ep)
    return users_map


def _estimator_ids_for_project(project: Project) -> list[str]:
    ids = getattr(project, "estimator_ids", None) or []
    if isinstance(ids, list) and ids:
        return [str(eid) for eid in ids if eid]
    estimator_id = getattr(project, "estimator_id", None)
    return [str(estimator_id)] if estimator_id else []


def _division_names_map(db: Session) -> dict[str, str]:
    out: dict[str, str] = {}
    divisions_list = db.query(SettingList).filter(SettingList.name == "project_divisions").first()
    if not divisions_list:
        return out
    items = db.query(SettingItem).filter(SettingItem.list_id == divisions_list.id).all()
    for item in items:
        out[str(item.id)] = item.label or str(item.id)
    return out


def _resolve_division_names(project: Project, div_map: dict[str, str]) -> list[str]:
    ids = getattr(project, "project_division_ids", None) or getattr(project, "division_ids", None) or []
    names: list[str] = []
    if isinstance(ids, list):
        for div_id in ids:
            label = div_map.get(str(div_id))
            if label and label not in names:
                names.append(label)
    return names


def get_project_map_points(
    db: Session,
    user: User,
    business_line: Optional[str],
    filters: BusinessProjectListFilters,
    *,
    is_bidding: bool = False,
    north: Optional[float] = None,
    south: Optional[float] = None,
    east: Optional[float] = None,
    west: Optional[float] = None,
    zoom: Optional[float] = None,
) -> dict[str, Any]:
    base_query = build_business_projects_query(
        db, user, business_line, filters, is_bidding=is_bidding,
    )
    if base_query is None:
        return {"items": [], "mapped_count": 0, "unmapped_count": 0, "total_matching": 0}

    all_matching = base_query.all()
    total_matching = len(all_matching)

    mapped_projects = []
    unmapped_count = 0
    for p in all_matching:
        lat = getattr(p, "lat", None)
        lng = getattr(p, "lng", None)
        if is_valid_coordinate(lat, lng):
            mapped_projects.append(p)
        else:
            unmapped_count += 1

    mapped_count = len(mapped_projects)

    viewport_query = apply_bounding_box_filter(
        base_query,
        north=north,
        south=south,
        east=east,
        west=west,
    )
    if north is not None and south is not None and east is not None and west is not None:
        projects = viewport_query.all()
    else:
        projects = mapped_projects

    site_ids = list({getattr(p, "site_id", None) for p in projects if getattr(p, "site_id", None)})
    sites_map: dict[str, ClientSite] = {}
    if site_ids:
        for site in db.query(ClientSite).filter(ClientSite.id.in_(site_ids)).all():
            sites_map[str(site.id)] = site

    client_ids = list({getattr(p, "client_id", None) for p in projects if getattr(p, "client_id", None)})
    clients_map: dict[str, Client] = {}
    if client_ids:
        for client in db.query(Client).filter(Client.id.in_(client_ids)).all():
            clients_map[str(client.id)] = client

    user_ids: set[str] = set()
    for p in projects:
        admin_id = getattr(p, "project_admin_id", None)
        if admin_id:
            user_ids.add(str(admin_id))
        for estimator_id in _estimator_ids_for_project(p):
            user_ids.add(estimator_id)
    users_map = _load_users_map(db, list(user_ids))

    div_map = _division_names_map(db)

    items = []
    for p in projects:
        lat = getattr(p, "lat", None)
        lng = getattr(p, "lng", None)
        if not is_valid_coordinate(lat, lng):
            continue

        site = sites_map.get(str(p.site_id)) if getattr(p, "site_id", None) else None
        client = clients_map.get(str(p.client_id)) if getattr(p, "client_id", None) else None
        admin_payload = (
            users_map.get(str(p.project_admin_id))
            if getattr(p, "project_admin_id", None)
            else None
        )
        estimator_ids = _estimator_ids_for_project(p)
        estimator_payload = users_map.get(estimator_ids[0]) if estimator_ids else None

        customer_name = None
        if client:
            customer_name = getattr(client, "display_name", None) or getattr(client, "name", None)

        address_fields = _format_map_address(p, site)
        status_label = (getattr(p, "status_label", None) or "").strip()
        start = getattr(p, "date_start", None)
        end = getattr(p, "date_end", None)

        items.append(
            {
                "id": str(p.id),
                "code": p.code,
                "name": p.name,
                "customer_name": customer_name,
                "address": address_fields.get("address"),
                "address_street": address_fields.get("address_street"),
                "address_city_line": address_fields.get("address_city_line"),
                "latitude": float(lat),
                "longitude": float(lng),
                "status": status_label.lower(),
                "status_label": status_label or None,
                "division_names": _resolve_division_names(p, div_map),
                "estimator": estimator_payload,
                "project_admin": admin_payload,
                "start_date": start.date().isoformat() if start else None,
                "end_date": end.date().isoformat() if end else None,
            }
        )

    if zoom is not None:
        logger.debug("map_points_query", extra={"zoom": zoom, "items": len(items), "total": total_matching})

    return {
        "items": items,
        "mapped_count": mapped_count,
        "unmapped_count": unmapped_count,
        "total_matching": total_matching,
    }
