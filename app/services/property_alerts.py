"""Property expiry alerts — leases, insurance, tax, permits."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Set

from sqlalchemy.orm import Session, joinedload

from ..models.models import (
    Property,
    PropertyAlertEvent,
    PropertyInsurancePolicy,
    PropertyLease,
    PropertyPermit,
    PropertyTaxRecord,
)
from .notifications import create_notification
from .properties import (
    EXPIRING_INSURANCE_DAYS,
    EXPIRING_LEASE_DAYS,
    EXPIRING_PERMIT_WARNING_DAYS,
    property_recipients,
    sync_lease_status,
    sync_tax_status,
    visible_properties_query,
)
from .permissions import is_admin


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _already_sent(db: Session, entity_type: str, entity_id: uuid.UUID, alert_key: str) -> bool:
    return (
        db.query(PropertyAlertEvent.id)
        .filter(
            PropertyAlertEvent.entity_type == entity_type,
            PropertyAlertEvent.entity_id == entity_id,
            PropertyAlertEvent.alert_key == alert_key,
        )
        .first()
        is not None
    )


def _record_sent(db: Session, entity_type: str, entity_id: uuid.UUID, alert_key: str) -> None:
    if _already_sent(db, entity_type, entity_id, alert_key):
        return
    db.add(
        PropertyAlertEvent(
            entity_type=entity_type,
            entity_id=entity_id,
            alert_key=alert_key,
        )
    )


def _notify_users(db: Session, user_ids: Set[uuid.UUID], template_key: str, payload: dict) -> None:
    for uid in user_ids:
        if not uid:
            continue
        try:
            create_notification(db, str(uid), "push", template_key, payload_json=payload)
        except Exception:
            pass


def _admin_users(db: Session) -> Set[uuid.UUID]:
    from ..models.models import User, Role

    admins = (
        db.query(User.id)
        .join(User.roles)
        .filter(Role.name == "admin")
        .all()
    )
    return {row[0] for row in admins}


def process_property_alerts(db: Session) -> int:
    """Send idempotent expiry alerts. Returns count of notification attempts."""
    today = _today()
    count = 0

    props = (
        db.query(Property)
        .options(
            joinedload(Property.access_grants),
            joinedload(Property.responsibilities),
        )
        .filter(Property.deleted_at.is_(None))
        .all()
    )
    prop_map = {p.id: p for p in props}

    for lease in db.query(PropertyLease).all():
        prop = prop_map.get(lease.property_id)
        if not prop:
            continue
        sync_lease_status(lease, today)
        recipients = property_recipients(db, prop) | _admin_users(db)
        end = lease.end_date or lease.renewal_date
        if not end:
            continue
        days = (end - today).days
        if lease.status == "expired" and days < 0:
            key = f"lease_expired_{abs(days)}"
            if not _already_sent(db, "property_lease", lease.id, key):
                _notify_users(
                    db,
                    recipients,
                    "property_lease_expired",
                    {
                        "property_id": str(prop.id),
                        "property_name": prop.name,
                        "lease_id": str(lease.id),
                        "days_overdue": abs(days),
                    },
                )
                _record_sent(db, "property_lease", lease.id, key)
                count += 1
        elif lease.status == "expiring" and days <= EXPIRING_LEASE_DAYS:
            key = f"lease_expiring_{days}"
            if not _already_sent(db, "property_lease", lease.id, key):
                _notify_users(
                    db,
                    recipients,
                    "property_lease_expiring",
                    {
                        "property_id": str(prop.id),
                        "property_name": prop.name,
                        "lease_id": str(lease.id),
                        "days_remaining": days,
                    },
                )
                _record_sent(db, "property_lease", lease.id, key)
                count += 1

    for pol in db.query(PropertyInsurancePolicy).all():
        prop = prop_map.get(pol.property_id)
        if not prop or not pol.expiry_date:
            continue
        days = (pol.expiry_date - today).days
        if 0 <= days <= EXPIRING_INSURANCE_DAYS:
            key = f"insurance_expiring_{days}"
            if not _already_sent(db, "property_insurance", pol.id, key):
                recipients = property_recipients(db, prop) | _admin_users(db)
                _notify_users(
                    db,
                    recipients,
                    "property_insurance_expiring",
                    {
                        "property_id": str(prop.id),
                        "property_name": prop.name,
                        "policy_id": str(pol.id),
                        "days_remaining": days,
                    },
                )
                _record_sent(db, "property_insurance", pol.id, key)
                count += 1
        elif days < 0:
            key = f"insurance_expired_{abs(days)}"
            if not _already_sent(db, "property_insurance", pol.id, key):
                recipients = property_recipients(db, prop) | _admin_users(db)
                _notify_users(
                    db,
                    recipients,
                    "property_insurance_expired",
                    {
                        "property_id": str(prop.id),
                        "property_name": prop.name,
                        "policy_id": str(pol.id),
                    },
                )
                _record_sent(db, "property_insurance", pol.id, key)
                count += 1

    for rec in db.query(PropertyTaxRecord).all():
        prop = prop_map.get(rec.property_id)
        if not prop:
            continue
        sync_tax_status(rec, today)
        if rec.status in ("due", "overdue") and rec.due_date:
            key = f"tax_{rec.status}_{rec.tax_year}"
            if not _already_sent(db, "property_tax", rec.id, key):
                recipients = property_recipients(db, prop) | _admin_users(db)
                _notify_users(
                    db,
                    recipients,
                    "property_tax_due",
                    {
                        "property_id": str(prop.id),
                        "property_name": prop.name,
                        "tax_year": rec.tax_year,
                        "status": rec.status,
                    },
                )
                _record_sent(db, "property_tax", rec.id, key)
                count += 1

    for permit in db.query(PropertyPermit).filter(PropertyPermit.expiry_date.isnot(None)).all():
        prop = prop_map.get(permit.property_id)
        if not prop:
            continue
        days = (permit.expiry_date - today).days
        if days < 0:
            key = f"permit_expired_{abs(days)}"
            if not _already_sent(db, "property_permit", permit.id, key):
                recipients = property_recipients(db, prop) | _admin_users(db)
                _notify_users(
                    db,
                    recipients,
                    "property_permit_expired",
                    {
                        "property_id": str(prop.id),
                        "property_name": prop.name,
                        "permit_id": str(permit.id),
                        "title": permit.title or permit.permit_type,
                    },
                )
                _record_sent(db, "property_permit", permit.id, key)
                count += 1
        elif days <= EXPIRING_PERMIT_WARNING_DAYS:
            key = f"permit_expiring_{days}"
            if not _already_sent(db, "property_permit", permit.id, key):
                recipients = property_recipients(db, prop) | _admin_users(db)
                _notify_users(
                    db,
                    recipients,
                    "property_permit_expiring",
                    {
                        "property_id": str(prop.id),
                        "property_name": prop.name,
                        "permit_id": str(permit.id),
                        "days_remaining": days,
                    },
                )
                _record_sent(db, "property_permit", permit.id, key)
                count += 1

    db.commit()
    return count
