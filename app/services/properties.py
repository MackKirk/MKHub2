"""Property management helpers: visibility, status transitions, compliance labels."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set

from sqlalchemy import or_, and_
from sqlalchemy.orm import Session, joinedload

from ..auth.security import User, _has_permission, _user_is_admin
from ..models.models import (
    Property,
    PropertyAccess,
    PropertyEntity,
    PropertyInsurancePolicy,
    PropertyLease,
    PropertyOwner,
    PropertyPermit,
    PropertyTaxRecord,
)
from ..services.task_service import get_user_display


LEASE_STATUSES = ("draft", "active", "expiring", "renewed", "terminated", "expired")
PERMIT_STAGES = (
    "identified",
    "applying",
    "under_review",
    "conditions",
    "issued",
    "closed",
)
EXPIRING_LEASE_DAYS = 90
EXPIRING_INSURANCE_DAYS = 60
EXPIRING_PERMIT_WARNING_DAYS = 30


def _today() -> date:
    return datetime.now(timezone.utc).date()


def has_properties_access(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return _has_permission(user, "properties:access")


def can_read_company_properties(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return _has_permission(user, "properties:company:read") or _has_permission(
        user, "properties:company:write"
    )


def can_write_company_properties(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return _has_permission(user, "properties:company:write")


def can_read_family_properties(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return _has_permission(user, "properties:family:read") or _has_permission(
        user, "properties:family:write"
    )


def can_write_family_properties(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return _has_permission(user, "properties:family:write")


def can_read_property_documents(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return _has_permission(user, "properties:documents:read") or _has_permission(
        user, "properties:documents:write"
    )


def can_write_property_documents(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return _has_permission(user, "properties:documents:write")


def can_read_property_permits(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return _has_permission(user, "properties:permits:read") or _has_permission(
        user, "properties:permits:write"
    )


def can_write_property_permits(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return _has_permission(user, "properties:permits:write")


def user_can_view_property(db: Session, user: User, prop: Property) -> bool:
    if _user_is_admin(user):
        return True
    if not has_properties_access(user):
        return False
    if prop.visibility == "company":
        return can_read_company_properties(user)
    if prop.visibility == "family":
        if can_read_family_properties(user):
            return True
        grant = (
            db.query(PropertyAccess.id)
            .filter(PropertyAccess.property_id == prop.id, PropertyAccess.user_id == user.id)
            .first()
        )
        return grant is not None
    return False


def user_can_edit_property(user: User, prop: Property) -> bool:
    if _user_is_admin(user):
        return True
    if prop.visibility == "company":
        return can_write_company_properties(user)
    return can_write_family_properties(user)


def visible_properties_query(db: Session, user: User):
    q = db.query(Property).filter(Property.deleted_at.is_(None))
    if _user_is_admin(user):
        return q
    if not has_properties_access(user):
        return q.filter(False)

    clauses = []
    if can_read_company_properties(user):
        clauses.append(Property.visibility == "company")
    if can_read_family_properties(user):
        clauses.append(Property.visibility == "family")
    else:
        family_ids = (
            db.query(PropertyAccess.property_id)
            .filter(PropertyAccess.user_id == user.id)
            .subquery()
        )
        clauses.append(and_(Property.visibility == "family", Property.id.in_(family_ids)))

    if not clauses:
        return q.filter(False)
    return q.filter(or_(*clauses))


def get_property_or_404(db: Session, user: User, property_id: uuid.UUID) -> Property:
    from fastapi import HTTPException

    prop = (
        db.query(Property)
        .options(
            joinedload(Property.owners).joinedload(PropertyOwner.entity),
            joinedload(Property.access_grants),
        )
        .filter(Property.id == property_id, Property.deleted_at.is_(None))
        .first()
    )
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    if not user_can_view_property(db, user, prop):
        raise HTTPException(status_code=403, detail="Forbidden")
    return prop


def assert_property_editable(user: User, prop: Property) -> None:
    from fastapi import HTTPException

    if not user_can_edit_property(user, prop):
        raise HTTPException(status_code=403, detail="Forbidden")


def owner_summary(owners: List[PropertyOwner]) -> tuple[Optional[str], Optional[float]]:
    if not owners:
        return None, None
    parts = []
    total = 0.0
    has_pct = False
    for o in owners:
        ent = o.entity
        label = (ent.display_name or ent.legal_name) if ent else str(o.entity_id)
        if o.ownership_percentage is not None:
            parts.append(f"{label} ({float(o.ownership_percentage):g}%)")
            total += float(o.ownership_percentage)
            has_pct = True
        else:
            parts.append(label)
    return ", ".join(parts), total if has_pct else None


def sync_lease_status(lease: PropertyLease, today: Optional[date] = None) -> None:
    today = today or _today()
    if lease.status in ("terminated", "renewed", "draft"):
        return
    end = lease.end_date or lease.renewal_date
    if not end:
        if lease.status == "draft":
            return
        lease.status = "active"
        return
    if end < today:
        lease.status = "expired"
    elif end <= today + timedelta(days=EXPIRING_LEASE_DAYS):
        lease.status = "expiring"
    elif lease.status in ("expired", "expiring"):
        lease.status = "active"
    elif lease.status == "draft" and lease.start_date and lease.start_date <= today:
        lease.status = "active"


def sync_tax_status(record: PropertyTaxRecord, today: Optional[date] = None) -> None:
    today = today or _today()
    if record.status == "paid":
        return
    if record.paid_date:
        record.status = "paid"
        return
    if record.due_date:
        if record.due_date < today:
            record.status = "overdue"
        elif record.due_date <= today + timedelta(days=30):
            record.status = "due"
        else:
            record.status = "upcoming"


def permit_compliance(permit: PropertyPermit, today: Optional[date] = None) -> tuple[str, str]:
    """Returns (compliance_status, compliance_label)."""
    today = today or _today()
    if not permit.expiry_date:
        return "none", ""
    days = (permit.expiry_date - today).days
    exp_str = permit.expiry_date.strftime("%b %d")
    if days < 0:
        return "expired", f"EXPIRED {abs(days)} days ago"
    if days == 0:
        return "warning", f"Issued · Expires {exp_str} · today"
    if days <= EXPIRING_PERMIT_WARNING_DAYS:
        return "warning", f"Issued · Expires {exp_str} · {days} days remaining"
    return "ok", f"Issued · Expires {exp_str} · {days} days remaining"


def checklist_complete(checklist: Optional[list]) -> bool:
    if not checklist:
        return True
    return all(bool(item.get("done")) for item in checklist if isinstance(item, dict))


def replace_property_owners(
    db: Session, prop: Property, owners: List[Dict[str, Any]]
) -> None:
    db.query(PropertyOwner).filter(PropertyOwner.property_id == prop.id).delete()
    for o in owners:
        db.add(
            PropertyOwner(
                property_id=prop.id,
                entity_id=o["entity_id"],
                ownership_percentage=o.get("ownership_percentage"),
            )
        )


def replace_property_access(db: Session, prop: Property, user_ids: List[uuid.UUID]) -> None:
    db.query(PropertyAccess).filter(PropertyAccess.property_id == prop.id).delete()
    for uid in user_ids:
        db.add(PropertyAccess(property_id=prop.id, user_id=uid))


def serialize_property_detail(db: Session, prop: Property) -> Dict[str, Any]:
    summary, total = owner_summary(list(prop.owners or []))
    owners_out = []
    for o in prop.owners or []:
        ent = o.entity
        owners_out.append(
            {
                "id": o.id,
                "entity_id": o.entity_id,
                "ownership_percentage": float(o.ownership_percentage)
                if o.ownership_percentage is not None
                else None,
                "entity_display_name": ent.display_name if ent else None,
                "entity_legal_name": ent.legal_name if ent else None,
            }
        )
    return {
        "id": prop.id,
        "name": prop.name,
        "property_type": prop.property_type,
        "ownership": prop.ownership,
        "visibility": prop.visibility,
        "status": prop.status,
        "address_line1": prop.address_line1,
        "address_line2": prop.address_line2,
        "city": prop.city,
        "province": prop.province,
        "postal_code": prop.postal_code,
        "country": prop.country,
        "lat": float(prop.lat) if prop.lat is not None else None,
        "lng": float(prop.lng) if prop.lng is not None else None,
        "notes": prop.notes,
        "image_file_object_id": prop.image_file_object_id,
        "created_at": prop.created_at,
        "updated_at": prop.updated_at,
        "owners": owners_out,
        "access_user_ids": [g.user_id for g in (prop.access_grants or [])],
        "ownership_percentage_total": total,
        "owner_summary": summary,
    }


def build_dashboard(db: Session, user: User) -> Dict[str, Any]:
    today = _today()
    base_q = visible_properties_query(db, user)
    props = base_q.all()
    prop_ids = [p.id for p in props]

    total = len(props)
    company = sum(1 for p in props if p.visibility == "company")
    family = sum(1 for p in props if p.visibility == "family")

    leases_expiring = []
    leases_expired = []
    if prop_ids:
        leases = db.query(PropertyLease).filter(PropertyLease.property_id.in_(prop_ids)).all()
        for lease in leases:
            sync_lease_status(lease, today)
            prop = next((p for p in props if p.id == lease.property_id), None)
            row = {
                "id": str(lease.id),
                "property_id": str(lease.property_id),
                "property_name": prop.name if prop else None,
                "role": lease.role,
                "status": lease.status,
                "end_date": lease.end_date.isoformat() if lease.end_date else None,
                "renewal_date": lease.renewal_date.isoformat() if lease.renewal_date else None,
            }
            if lease.status == "expiring":
                leases_expiring.append(row)
            elif lease.status == "expired":
                leases_expired.append(row)
        db.commit()

    insurance_expiring = []
    if prop_ids:
        cutoff = today + timedelta(days=EXPIRING_INSURANCE_DAYS)
        policies = (
            db.query(PropertyInsurancePolicy)
            .filter(
                PropertyInsurancePolicy.property_id.in_(prop_ids),
                PropertyInsurancePolicy.expiry_date.isnot(None),
                PropertyInsurancePolicy.expiry_date >= today,
                PropertyInsurancePolicy.expiry_date <= cutoff,
            )
            .order_by(PropertyInsurancePolicy.expiry_date.asc())
            .limit(10)
            .all()
        )
        for pol in policies:
            prop = next((p for p in props if p.id == pol.property_id), None)
            insurance_expiring.append(
                {
                    "id": str(pol.id),
                    "property_id": str(pol.property_id),
                    "property_name": prop.name if prop else None,
                    "provider": pol.provider,
                    "expiry_date": pol.expiry_date.isoformat() if pol.expiry_date else None,
                }
            )

    permits_expired = []
    if prop_ids and can_read_property_permits(user):
        permits = (
            db.query(PropertyPermit)
            .filter(
                PropertyPermit.property_id.in_(prop_ids),
                PropertyPermit.expiry_date.isnot(None),
                PropertyPermit.expiry_date < today,
            )
            .order_by(PropertyPermit.expiry_date.asc())
            .limit(10)
            .all()
        )
        for permit in permits:
            prop = next((p for p in props if p.id == permit.property_id), None)
            status, label = permit_compliance(permit, today)
            permits_expired.append(
                {
                    "id": str(permit.id),
                    "property_id": str(permit.property_id),
                    "property_name": prop.name if prop else None,
                    "title": permit.title or permit.permit_type,
                    "stage": permit.stage,
                    "expiry_date": permit.expiry_date.isoformat() if permit.expiry_date else None,
                    "compliance_label": label,
                    "compliance_status": status,
                }
            )

    tax_due = []
    tax_due_count = 0
    tax_overdue_count = 0
    if prop_ids:
        records = db.query(PropertyTaxRecord).filter(PropertyTaxRecord.property_id.in_(prop_ids)).all()
        for rec in records:
            sync_tax_status(rec, today)
            if rec.status == "due":
                tax_due_count += 1
            elif rec.status == "overdue":
                tax_overdue_count += 1
        db.commit()
        due_records = (
            db.query(PropertyTaxRecord)
            .filter(
                PropertyTaxRecord.property_id.in_(prop_ids),
                PropertyTaxRecord.status.in_(("due", "overdue")),
            )
            .order_by(PropertyTaxRecord.due_date.asc())
            .limit(10)
            .all()
        )
        for rec in due_records:
            prop = next((p for p in props if p.id == rec.property_id), None)
            tax_due.append(
                {
                    "id": str(rec.id),
                    "property_id": str(rec.property_id),
                    "property_name": prop.name if prop else None,
                    "tax_year": rec.tax_year,
                    "due_date": rec.due_date.isoformat() if rec.due_date else None,
                    "status": rec.status,
                }
            )

    return {
        "total_properties": total,
        "company_properties": company,
        "family_properties": family,
        "leases_expiring_count": len(leases_expiring),
        "leases_expired_count": len(leases_expired),
        "insurance_expiring_count": len(insurance_expiring),
        "permits_expired_count": len(permits_expired),
        "tax_due_count": tax_due_count,
        "tax_overdue_count": tax_overdue_count,
        "leases_expiring": leases_expiring[:10],
        "leases_expired": leases_expired[:10],
        "insurance_expiring": insurance_expiring,
        "permits_expired": permits_expired,
        "tax_due": tax_due,
    }


def build_calendar(db: Session, user: User, start: date, end: date) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    props = visible_properties_query(db, user).all()
    prop_map = {p.id: p for p in props}
    prop_ids = list(prop_map.keys())
    if not prop_ids:
        return events

    def add(event_type: str, title: str, prop_id: uuid.UUID, d: Optional[date], related_id: uuid.UUID, status: Optional[str] = None):
        if not d or d < start or d > end:
            return
        prop = prop_map.get(prop_id)
        events.append(
            {
                "id": f"{event_type}:{related_id}:{d.isoformat()}",
                "event_type": event_type,
                "title": title,
                "property_id": str(prop_id),
                "property_name": prop.name if prop else "",
                "date": d,
                "status": status,
                "related_id": str(related_id),
            }
        )

    for lease in db.query(PropertyLease).filter(PropertyLease.property_id.in_(prop_ids)).all():
        sync_lease_status(lease)
        add("lease_end", f"Lease end ({lease.role})", lease.property_id, lease.end_date, lease.id, lease.status)
        add("lease_renewal", f"Lease renewal ({lease.role})", lease.property_id, lease.renewal_date, lease.id, lease.status)

    for pol in db.query(PropertyInsurancePolicy).filter(PropertyInsurancePolicy.property_id.in_(prop_ids)).all():
        add("insurance_expiry", f"Insurance expiry — {pol.provider or pol.policy_number or 'Policy'}", pol.property_id, pol.expiry_date, pol.id)

    for rec in db.query(PropertyTaxRecord).filter(PropertyTaxRecord.property_id.in_(prop_ids)).all():
        sync_tax_status(rec)
        add("tax_due", f"Property tax {rec.tax_year}", rec.property_id, rec.due_date, rec.id, rec.status)

    if can_read_property_permits(user):
        for permit in db.query(PropertyPermit).filter(PropertyPermit.property_id.in_(prop_ids)).all():
            add("permit_expiry", permit.title or permit.permit_type or "Permit expiry", permit.property_id, permit.expiry_date, permit.id, permit.stage)

    from ..models.models import PropertyMaintenanceItem

    for item in db.query(PropertyMaintenanceItem).filter(PropertyMaintenanceItem.property_id.in_(prop_ids)).all():
        add("maintenance", item.title, item.property_id, item.next_due_date, item.id, item.status)

    db.commit()
    events.sort(key=lambda e: e["date"])
    return events


def property_recipients(db: Session, prop: Property) -> Set[uuid.UUID]:
    """Users to notify for property alerts."""
    ids: Set[uuid.UUID] = set()
    for grant in prop.access_grants or []:
        ids.add(grant.user_id)
    for resp in prop.responsibilities or []:
        if resp.user_id:
            ids.add(resp.user_id)
    return ids
