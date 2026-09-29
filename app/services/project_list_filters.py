"""Shared filter logic for business project list and map endpoints."""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Date as SaDate, String, and_, cast, func, or_
from sqlalchemy.orm import Query, Session

from ..models.models import Client, Project, User


@dataclass
class BusinessProjectListFilters:
    division_id: Optional[str] = None
    division_id_not: Optional[str] = None
    subdivision_id: Optional[str] = None
    status: Optional[str] = None
    status_not: Optional[str] = None
    q: Optional[str] = None
    min_value: Optional[float] = None
    client_id: Optional[str] = None
    client_id_not: Optional[str] = None
    date_start: Optional[str] = None
    date_end: Optional[str] = None
    estimator_id: Optional[str] = None
    estimator_id_not: Optional[str] = None
    eta_start: Optional[str] = None
    eta_end: Optional[str] = None
    value_min: Optional[int] = None
    value_max: Optional[int] = None
    related_to_me: bool = False


def as_str_list(value: Any) -> list[str]:
    """Accept a single query value or repeated query values."""
    if value is None:
        return []
    if isinstance(value, str):
        text = value.strip()
        return [text] if text else []
    out: list[str] = []
    for item in value:
        if item is None:
            continue
        text = str(item).strip()
        if text:
            out.append(text)
    return out


def filters_from_query_params(**kwargs: Any) -> BusinessProjectListFilters:
    related = kwargs.get("related_to_me")
    if isinstance(related, str):
        related_active = related.lower() in ("1", "true", "yes")
    else:
        related_active = bool(related)
    return BusinessProjectListFilters(
        division_id=kwargs.get("division_id"),
        division_id_not=kwargs.get("division_id_not"),
        subdivision_id=kwargs.get("subdivision_id"),
        status=kwargs.get("status"),
        status_not=kwargs.get("status_not"),
        q=kwargs.get("q"),
        min_value=kwargs.get("min_value"),
        client_id=kwargs.get("client_id"),
        client_id_not=kwargs.get("client_id_not"),
        date_start=kwargs.get("date_start"),
        date_end=kwargs.get("date_end"),
        estimator_id=kwargs.get("estimator_id"),
        estimator_id_not=kwargs.get("estimator_id_not"),
        eta_start=kwargs.get("eta_start"),
        eta_end=kwargs.get("eta_end"),
        value_min=kwargs.get("value_min"),
        value_max=kwargs.get("value_max"),
        related_to_me=related_active,
    )


def build_business_projects_query(
    db: Session,
    user: User,
    business_line: Optional[str],
    filters: BusinessProjectListFilters,
    *,
    is_bidding: bool = False,
) -> Optional[Query]:
    from ..routes.projects import _dashboard_business_line_clause, _project_related_to_user_filter

    bl_clause = _dashboard_business_line_clause(user, business_line)
    if bl_clause is None:
        return None

    query = (
        db.query(Project)
        .filter(
            Project.is_bidding == is_bidding,
            Project.deleted_at.is_(None),
        )
        .filter(bl_clause)
    )

    if filters.related_to_me:
        query = query.filter(_project_related_to_user_filter(user.id))

    query = apply_any_clients(query, filters.client_id)
    query = apply_excluded_clients(query, filters.client_id_not)

    effective_start_dt = func.coalesce(Project.date_start, Project.created_at)
    if filters.date_start:
        try:
            start_d = datetime.strptime(filters.date_start, "%Y-%m-%d").date()
            query = query.filter(cast(effective_start_dt, SaDate) >= start_d)
        except Exception:
            pass

    if filters.date_end:
        try:
            end_d = datetime.strptime(filters.date_end, "%Y-%m-%d").date()
            query = query.filter(cast(effective_start_dt, SaDate) <= end_d)
        except Exception:
            pass

    if filters.subdivision_id:
        try:
            subdiv_uuid = uuid.UUID(filters.subdivision_id)
            query = query.filter(
                or_(
                    cast(Project.project_division_ids, String).like(f"%{filters.subdivision_id}%"),
                    Project.division_id == subdiv_uuid,
                    cast(Project.division_ids, String).like(f"%{filters.subdivision_id}%"),
                )
            )
        except ValueError:
            pass
    elif filters.division_id:
        query = apply_any_divisions(query, db, filters.division_id)

    if filters.division_id_not:
        query = apply_excluded_divisions(query, db, filters.division_id_not)

    if filters.status:
        query = apply_any_statuses(query, db, filters.status)

    if filters.status_not:
        query = apply_excluded_statuses(query, db, filters.status_not)

    if filters.estimator_id:
        query = apply_any_estimators(query, filters.estimator_id)

    if filters.estimator_id_not:
        query = apply_excluded_estimators(query, filters.estimator_id_not)

    if filters.eta_start:
        try:
            eta_start_d = datetime.strptime(filters.eta_start, "%Y-%m-%d").date()
            query = query.filter(cast(Project.date_eta, SaDate) >= eta_start_d)
        except Exception:
            pass

    if filters.eta_end:
        try:
            eta_end_d = datetime.strptime(filters.eta_end, "%Y-%m-%d").date()
            query = query.filter(cast(Project.date_eta, SaDate) <= eta_end_d)
        except Exception:
            pass

    if filters.value_min is not None:
        query = query.filter(Project.cost_estimated >= filters.value_min)

    if filters.value_max is not None:
        query = query.filter(Project.cost_estimated <= filters.value_max)

    if filters.q:
        like = f"%{filters.q}%"
        matching_client_ids = db.query(Client.id).filter(
            or_(
                Client.name.ilike(like),
                Client.display_name.ilike(like),
                Client.address_line1.ilike(like),
                Client.address_line2.ilike(like),
                Client.city.ilike(like),
                Client.province.ilike(like),
                Client.postal_code.ilike(like),
                Client.country.ilike(like),
            )
        )
        matching_ids = [str(cid[0]) for cid in matching_client_ids.all()]
        search_conditions = [
            Project.name.ilike(like),
            Project.code.ilike(like),
            Project.address.ilike(like),
            Project.address_city.ilike(like),
            Project.address_province.ilike(like),
            Project.address_country.ilike(like),
        ]
        if matching_ids:
            try:
                matching_uuids = [uuid.UUID(cid) for cid in matching_ids]
                search_conditions.append(Project.client_id.in_(matching_uuids))
            except ValueError:
                pass
        query = query.filter(or_(*search_conditions))

    return query


def _division_family_ids(db: Session, division_id: str) -> list[str]:
    from ..models.models import SettingItem, SettingList

    div_uuid = uuid.UUID(division_id)
    divisions_list = db.query(SettingList).filter(SettingList.name == "project_divisions").first()
    family: list[str] = []
    if divisions_list:
        division_items = (
            db.query(SettingItem)
            .filter(
                SettingItem.list_id == divisions_list.id,
                or_(SettingItem.id == div_uuid, SettingItem.parent_id == div_uuid),
            )
            .all()
        )
        family = [str(item.id) for item in division_items]
    if str(div_uuid) not in family:
        family.append(str(div_uuid))
    return family


def division_include_clause(db: Session, division_id: str):
    """Match a division or any of its subdivisions. Several clauses are meant to be ORed."""
    try:
        div_uuid = uuid.UUID(division_id)
    except ValueError:
        return None
    family = _division_family_ids(db, division_id)
    conditions = [cast(Project.project_division_ids, String).like(f"%{div_id_str}%") for div_id_str in family]
    conditions.append(
        or_(
            Project.division_id == div_uuid,
            cast(Project.division_ids, String).like(f"%{division_id}%"),
        )
    )
    return or_(*conditions)


def division_exclude_clause(db: Session, division_id: str):
    try:
        family = _division_family_ids(db, division_id)
    except ValueError:
        return None
    exclusion_and_conditions = []
    for div_id_str in family:
        try:
            div_uuid = uuid.UUID(div_id_str)
        except ValueError:
            continue
        exclusion_and_conditions.append(
            and_(
                or_(Project.division_id != div_uuid, Project.division_id.is_(None)),
                or_(
                    cast(Project.project_division_ids, String).notlike(f"%{div_id_str}%"),
                    Project.project_division_ids.is_(None),
                ),
                or_(
                    cast(Project.division_ids, String).notlike(f"%{div_id_str}%"),
                    Project.division_ids.is_(None),
                ),
            )
        )
    if not exclusion_and_conditions:
        return None
    return and_(*exclusion_and_conditions)


def apply_any_divisions(query: Query, db: Session, division_ids: Any) -> Query:
    clauses = [clause for division_id in as_str_list(division_ids) if (clause := division_include_clause(db, division_id)) is not None]
    if clauses:
        query = query.filter(or_(*clauses))
    return query


def apply_excluded_divisions(query: Query, db: Session, division_ids: Any) -> Query:
    clauses = [clause for division_id in as_str_list(division_ids) if (clause := division_exclude_clause(db, division_id)) is not None]
    if clauses:
        query = query.filter(and_(*clauses))
    return query


def _status_include_clause(db: Session, status: str):
    from ..models.models import SettingItem

    try:
        status_uuid = uuid.UUID(str(status))
        status_item = db.query(SettingItem).filter(SettingItem.id == status_uuid).first()
        status_label = status_item.label if status_item else None
        if status_label:
            return or_(
                Project.status_id == status_uuid,
                and_(Project.status_id.is_(None), Project.status_label == status_label),
            )
        return Project.status_id == status_uuid
    except (ValueError, AttributeError):
        return Project.status_label == status


def apply_any_statuses(query: Query, db: Session, statuses: Any) -> Query:
    clauses = [_status_include_clause(db, status) for status in as_str_list(statuses)]
    if clauses:
        query = query.filter(or_(*clauses))
    return query


def apply_excluded_statuses(query: Query, db: Session, statuses: Any) -> Query:
    for status in as_str_list(statuses):
        query = _apply_status_exclusion(query, db, status)
    return query


def _uuid_list(values: Any) -> list[uuid.UUID]:
    parsed: list[uuid.UUID] = []
    for value in as_str_list(values):
        try:
            parsed.append(uuid.UUID(value))
        except ValueError:
            continue
    return parsed


def apply_any_clients(query: Query, client_ids: Any) -> Query:
    parsed = _uuid_list(client_ids)
    if parsed:
        query = query.filter(Project.client_id.in_(parsed))
    return query


def apply_excluded_clients(query: Query, client_ids: Any) -> Query:
    for client_uuid in _uuid_list(client_ids):
        query = query.filter(Project.client_id != client_uuid)
    return query


def apply_any_estimators(query: Query, estimator_ids: Any) -> Query:
    parsed = _uuid_list(estimator_ids)
    if parsed:
        query = query.filter(Project.estimator_id.in_(parsed))
    return query


def apply_excluded_estimators(query: Query, estimator_ids: Any) -> Query:
    for estimator_uuid in _uuid_list(estimator_ids):
        query = query.filter(Project.estimator_id != estimator_uuid)
    return query


def _apply_status_exclusion(query: Query, db: Session, status_not: str) -> Query:
    from ..models.models import SettingItem

    try:
        status_uuid = uuid.UUID(str(status_not))
        status_item = db.query(SettingItem).filter(SettingItem.id == status_uuid).first()
        status_label = status_item.label if status_item else None
        if status_label:
            query = query.filter(
                or_(
                    and_(Project.status_id.isnot(None), Project.status_id != status_uuid),
                    and_(Project.status_id.is_(None), Project.status_label != status_label),
                )
            )
        else:
            query = query.filter(Project.status_id != status_uuid)
    except (ValueError, AttributeError):
        query = query.filter(Project.status_label != status_not)
    return query


def apply_bounding_box_filter(
    query: Query,
    *,
    north: Optional[float],
    south: Optional[float],
    east: Optional[float],
    west: Optional[float],
) -> Query:
    if north is None or south is None or east is None or west is None:
        return query
    try:
        n, s, e, w = float(north), float(south), float(east), float(west)
    except (TypeError, ValueError):
        return query

    query = query.filter(
        Project.lat.isnot(None),
        Project.lng.isnot(None),
        Project.lat >= min(s, n),
        Project.lat <= max(s, n),
    )
    if w <= e:
        query = query.filter(Project.lng >= w, Project.lng <= e)
    else:
        query = query.filter(or_(Project.lng >= w, Project.lng <= e))
    return query
