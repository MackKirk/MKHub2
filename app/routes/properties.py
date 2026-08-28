"""Property management API — Mack Kirk + family portfolio register."""

from __future__ import annotations

import csv
import io
import uuid
from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from ..auth.security import get_current_user
from ..db import get_db
from ..models.models import (
    FileObject,
    Property,
    PropertyAccess,
    PropertyEntity,
    PropertyFile,
    PropertyInsurancePolicy,
    PropertyLease,
    PropertyMaintenanceItem,
    PropertyOwner,
    PropertyPermit,
    PropertyResponsibility,
    PropertyTaxRecord,
)
from ..schemas.properties import (
    PropertyCalendarResponse,
    PropertyCreate,
    PropertyDashboardResponse,
    PropertyDetailResponse,
    PropertyEntityCreate,
    PropertyEntityResponse,
    PropertyEntityUpdate,
    PropertyFileCreate,
    PropertyFileResponse,
    PropertyFileUpdate,
    PropertyInsurancePolicyCreate,
    PropertyInsurancePolicyResponse,
    PropertyInsurancePolicyUpdate,
    PropertyLeaseCreate,
    PropertyLeaseResponse,
    PropertyLeaseUpdate,
    PropertyListItemResponse,
    PropertyListResponse,
    PropertyMapPoint,
    PropertyMapPointsResponse,
    PropertyMaintenanceItemCreate,
    PropertyMaintenanceItemResponse,
    PropertyMaintenanceItemUpdate,
    PropertyPermitCreate,
    PropertyPermitBase,
    PropertyPermitResponse,
    PropertyPermitStageUpdate,
    PropertyPermitUpdate,
    PropertyResponsibilityCreate,
    PropertyResponsibilityResponse,
    PropertyResponsibilityUpdate,
    PropertyTaxRecordCreate,
    PropertyTaxRecordResponse,
    PropertyTaxRecordUpdate,
    PropertyUpdate,
)
from ..services.properties import (
    PERMIT_STAGES,
    assert_property_editable,
    build_calendar,
    build_dashboard,
    can_read_property_documents,
    can_read_property_permits,
    can_write_property_documents,
    can_write_property_permits,
    checklist_complete,
    get_property_or_404,
    has_properties_access,
    owner_summary,
    permit_compliance,
    replace_property_access,
    replace_property_owners,
    serialize_property_detail,
    sync_lease_status,
    sync_tax_status,
    user_can_edit_property,
    visible_properties_query,
)
from ..services.task_service import get_user_display
from ..services.property_geocoding_service import apply_property_geocoding_on_save, snapshot_property_address

router = APIRouter(prefix="/properties", tags=["properties"])

PROPERTY_FILE_CATEGORIES = frozenset({
    "pictures",
    "documents",
    "leases",
    "insurance",
    "tax",
    "permits",
    "maintenance",
    "general",
})


def _require_access(user=Depends(get_current_user)):
    if not has_properties_access(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


# ---------- ENTITIES ----------


@router.get("/entities", response_model=List[PropertyEntityResponse])
def list_entities(
    search: Optional[str] = Query(None),
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    q = db.query(PropertyEntity)
    if active_only:
        q = q.filter(PropertyEntity.active == True)  # noqa: E712
    if search:
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                PropertyEntity.legal_name.ilike(term),
                PropertyEntity.display_name.ilike(term),
            )
        )
    return q.order_by(PropertyEntity.legal_name.asc()).all()


@router.post("/entities", response_model=PropertyEntityResponse)
def create_entity(
    payload: PropertyEntityCreate,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    ent = PropertyEntity(**payload.model_dump(), created_by=user.id)
    db.add(ent)
    db.commit()
    db.refresh(ent)
    return ent


@router.get("/entities/{entity_id}", response_model=PropertyEntityResponse)
def get_entity(entity_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(_require_access)):
    ent = db.query(PropertyEntity).filter(PropertyEntity.id == entity_id).first()
    if not ent:
        raise HTTPException(status_code=404, detail="Entity not found")
    return ent


@router.patch("/entities/{entity_id}", response_model=PropertyEntityResponse)
def update_entity(
    entity_id: uuid.UUID,
    payload: PropertyEntityUpdate,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    ent = db.query(PropertyEntity).filter(PropertyEntity.id == entity_id).first()
    if not ent:
        raise HTTPException(status_code=404, detail="Entity not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(ent, k, v)
    ent.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ent)
    return ent


# ---------- DASHBOARD & CALENDAR & EXPORT ----------


@router.get("/dashboard", response_model=PropertyDashboardResponse)
def get_dashboard(db: Session = Depends(get_db), user=Depends(_require_access)):
    return build_dashboard(db, user)


@router.get("/calendar", response_model=PropertyCalendarResponse)
def get_calendar(
    start: date = Query(...),
    end: date = Query(...),
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    return {"events": build_calendar(db, user, start, end)}


@router.get("/map-points", response_model=PropertyMapPointsResponse)
def get_map_points(
    search: Optional[str] = Query(None),
    visibility: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    q = visible_properties_query(db, user).filter(
        Property.lat.isnot(None),
        Property.lng.isnot(None),
    )
    if visibility:
        q = q.filter(Property.visibility == visibility.strip().lower())
    if search:
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                Property.name.ilike(term),
                Property.address_line1.ilike(term),
                Property.city.ilike(term),
            )
        )
    rows = q.order_by(Property.name.asc()).all()
    items = [
        PropertyMapPoint(
            id=str(p.id),
            name=p.name,
            lat=float(p.lat),
            lng=float(p.lng),
            address_line1=p.address_line1,
            city=p.city,
            province=p.province,
            visibility=p.visibility,
            property_type=p.property_type,
            ownership=p.ownership,
        )
        for p in rows
        if p.lat is not None and p.lng is not None
    ]
    return PropertyMapPointsResponse(items=items)


@router.get("/export/register.csv")
def export_register_csv(db: Session = Depends(get_db), user=Depends(_require_access)):
    props = visible_properties_query(db, user).options(joinedload(Property.owners).joinedload(PropertyOwner.entity)).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Property",
            "Type",
            "Ownership",
            "Visibility",
            "Owners",
            "City",
            "Province",
            "Status",
        ]
    )
    for p in props:
        summary, _ = owner_summary(list(p.owners or []))
        writer.writerow(
            [
                p.name,
                p.property_type or "",
                p.ownership,
                p.visibility,
                summary or "",
                p.city or "",
                p.province or "",
                p.status,
            ]
        )
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="property-register.csv"'},
    )


# ---------- PERMITS BOARD (static paths before /{property_id}) ----------


def _serialize_permit(db: Session, permit: PropertyPermit) -> dict:
    prop = db.query(Property).filter(Property.id == permit.property_id).first()
    status, label = permit_compliance(permit)
    return {
        "id": permit.id,
        "property_id": permit.property_id,
        "permit_type": permit.permit_type,
        "title": permit.title,
        "permit_number": permit.permit_number,
        "authority": permit.authority,
        "stage": permit.stage,
        "issued_date": permit.issued_date,
        "expiry_date": permit.expiry_date,
        "checklist": permit.checklist or [],
        "notes": permit.notes,
        "created_at": permit.created_at,
        "updated_at": permit.updated_at,
        "property_name": prop.name if prop else None,
        "compliance_status": status,
        "compliance_label": label,
    }


@router.get("/board/permits", response_model=List[PropertyPermitResponse])
def list_permits_board(db: Session = Depends(get_db), user=Depends(_require_access)):
    if not can_read_property_permits(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    prop_ids = [p.id for p in visible_properties_query(db, user).all()]
    if not prop_ids:
        return []
    permits = (
        db.query(PropertyPermit)
        .filter(PropertyPermit.property_id.in_(prop_ids), PropertyPermit.stage != "closed")
        .order_by(PropertyPermit.updated_at.desc())
        .all()
    )
    return [PropertyPermitResponse.model_validate(_serialize_permit(db, p)) for p in permits]


@router.post("/board/permits", response_model=PropertyPermitResponse)
def create_permit(payload: PropertyPermitCreate, db: Session = Depends(get_db), user=Depends(_require_access)):
    if not can_write_property_permits(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    prop = get_property_or_404(db, user, payload.property_id)
    assert_property_editable(user, prop)
    data = payload.model_dump()
    checklist = [item.model_dump() for item in payload.checklist]
    permit = PropertyPermit(**{**data, "checklist": checklist})
    db.add(permit)
    db.commit()
    db.refresh(permit)
    return PropertyPermitResponse.model_validate(_serialize_permit(db, permit))


@router.patch("/board/permits/{permit_id}", response_model=PropertyPermitResponse)
def update_permit(
    permit_id: uuid.UUID,
    payload: PropertyPermitUpdate,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    if not can_write_property_permits(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    permit = db.query(PropertyPermit).filter(PropertyPermit.id == permit_id).first()
    if not permit:
        raise HTTPException(status_code=404, detail="Permit not found")
    get_property_or_404(db, user, permit.property_id)
    data = payload.model_dump(exclude_unset=True)
    if "checklist" in data and data["checklist"] is not None:
        data["checklist"] = [item.model_dump() if hasattr(item, "model_dump") else item for item in data["checklist"]]
    for k, v in data.items():
        setattr(permit, k, v)
    permit.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(permit)
    return PropertyPermitResponse.model_validate(_serialize_permit(db, permit))


@router.patch("/board/permits/{permit_id}/stage", response_model=PropertyPermitResponse)
def update_permit_stage(
    permit_id: uuid.UUID,
    payload: PropertyPermitStageUpdate,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    if not can_write_property_permits(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    permit = db.query(PropertyPermit).filter(PropertyPermit.id == permit_id).first()
    if not permit:
        raise HTTPException(status_code=404, detail="Permit not found")
    get_property_or_404(db, user, permit.property_id)
    new_stage = payload.stage.strip().lower()
    if new_stage not in PERMIT_STAGES:
        raise HTTPException(status_code=400, detail="Invalid stage")
    if not checklist_complete(permit.checklist):
        raise HTTPException(status_code=400, detail="Checklist must be complete before advancing stage")
    permit.stage = new_stage
    permit.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(permit)
    return PropertyPermitResponse.model_validate(_serialize_permit(db, permit))


@router.delete("/board/permits/{permit_id}")
def delete_permit(permit_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(_require_access)):
    if not can_write_property_permits(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    permit = db.query(PropertyPermit).filter(PropertyPermit.id == permit_id).first()
    if not permit:
        raise HTTPException(status_code=404, detail="Permit not found")
    get_property_or_404(db, user, permit.property_id)
    db.delete(permit)
    db.commit()
    return {"ok": True}


# ---------- PROPERTIES ----------


@router.get("", response_model=PropertyListResponse)
def list_properties(
    search: Optional[str] = Query(None),
    visibility: Optional[str] = Query(None),
    ownership: Optional[str] = Query(None),
    property_type: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    q = visible_properties_query(db, user).options(joinedload(Property.owners).joinedload(PropertyOwner.entity))
    if visibility:
        q = q.filter(Property.visibility == visibility.strip().lower())
    if ownership:
        q = q.filter(Property.ownership == ownership.strip().lower())
    if property_type:
        q = q.filter(Property.property_type == property_type.strip().lower())
    if search:
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                Property.name.ilike(term),
                Property.address_line1.ilike(term),
                Property.city.ilike(term),
                Property.notes.ilike(term),
            )
        )
    total = q.count()
    offset = (page - 1) * limit
    rows = q.order_by(Property.name.asc()).offset(offset).limit(limit).all()
    items = []
    for p in rows:
        summary, total_pct = owner_summary(list(p.owners or []))
        base = {
            "id": p.id,
            "name": p.name,
            "property_type": p.property_type,
            "ownership": p.ownership,
            "visibility": p.visibility,
            "status": p.status,
            "address_line1": p.address_line1,
            "address_line2": p.address_line2,
            "city": p.city,
            "province": p.province,
            "postal_code": p.postal_code,
            "country": p.country,
            "lat": float(p.lat) if p.lat is not None else None,
            "lng": float(p.lng) if p.lng is not None else None,
            "notes": p.notes,
            "image_file_object_id": p.image_file_object_id,
            "created_at": p.created_at,
            "owner_summary": summary,
            "ownership_percentage_total": total_pct,
        }
        items.append(PropertyListItemResponse.model_validate(base))
    total_pages = (total + limit - 1) // limit if total else 1
    return PropertyListResponse(items=items, total=total, page=page, limit=limit, total_pages=total_pages)


@router.post("", response_model=PropertyDetailResponse)
def create_property(
    payload: PropertyCreate,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    data = payload.model_dump(exclude={"owners", "access_user_ids"})
    prop = Property(**data, created_by=user.id)
    db.add(prop)
    db.flush()
    if payload.owners:
        replace_property_owners(db, prop, [o.model_dump() for o in payload.owners])
    if payload.access_user_ids:
        replace_property_access(db, prop, payload.access_user_ids)
    apply_property_geocoding_on_save(prop, data, is_create=True)
    db.commit()
    prop = get_property_or_404(db, user, prop.id)
    return PropertyDetailResponse.model_validate(serialize_property_detail(db, prop))


@router.get("/{property_id}", response_model=PropertyDetailResponse)
def get_property(property_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(_require_access)):
    prop = get_property_or_404(db, user, property_id)
    return PropertyDetailResponse.model_validate(serialize_property_detail(db, prop))


@router.patch("/{property_id}", response_model=PropertyDetailResponse)
def update_property(
    property_id: uuid.UUID,
    payload: PropertyUpdate,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    prop = get_property_or_404(db, user, property_id)
    assert_property_editable(user, prop)
    before_addr = snapshot_property_address(prop)
    data = payload.model_dump(exclude_unset=True, exclude={"owners", "access_user_ids"})
    for k, v in data.items():
        setattr(prop, k, v)
    prop.updated_at = datetime.now(timezone.utc)
    if payload.owners is not None:
        replace_property_owners(db, prop, [o.model_dump() for o in payload.owners])
    if payload.access_user_ids is not None:
        replace_property_access(db, prop, payload.access_user_ids)
    apply_property_geocoding_on_save(prop, data, before=before_addr, is_create=False)
    db.commit()
    prop = get_property_or_404(db, user, property_id)
    return PropertyDetailResponse.model_validate(serialize_property_detail(db, prop))


@router.delete("/{property_id}")
def delete_property(property_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(_require_access)):
    prop = get_property_or_404(db, user, property_id)
    assert_property_editable(user, prop)
    prop.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


# ---------- LEASES ----------


@router.get("/{property_id}/leases", response_model=List[PropertyLeaseResponse])
def list_leases(property_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(_require_access)):
    get_property_or_404(db, user, property_id)
    leases = db.query(PropertyLease).filter(PropertyLease.property_id == property_id).order_by(PropertyLease.start_date.desc()).all()
    for lease in leases:
        sync_lease_status(lease)
    db.commit()
    return leases


@router.post("/{property_id}/leases", response_model=PropertyLeaseResponse)
def create_lease(
    property_id: uuid.UUID,
    payload: PropertyLeaseCreate,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    prop = get_property_or_404(db, user, property_id)
    assert_property_editable(user, prop)
    lease = PropertyLease(property_id=property_id, **payload.model_dump())
    sync_lease_status(lease)
    db.add(lease)
    db.commit()
    db.refresh(lease)
    return lease


@router.patch("/{property_id}/leases/{lease_id}", response_model=PropertyLeaseResponse)
def update_lease(
    property_id: uuid.UUID,
    lease_id: uuid.UUID,
    payload: PropertyLeaseUpdate,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    prop = get_property_or_404(db, user, property_id)
    assert_property_editable(user, prop)
    lease = db.query(PropertyLease).filter(PropertyLease.id == lease_id, PropertyLease.property_id == property_id).first()
    if not lease:
        raise HTTPException(status_code=404, detail="Lease not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(lease, k, v)
    lease.updated_at = datetime.now(timezone.utc)
    sync_lease_status(lease)
    db.commit()
    db.refresh(lease)
    return lease


@router.delete("/{property_id}/leases/{lease_id}")
def delete_lease(
    property_id: uuid.UUID,
    lease_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    prop = get_property_or_404(db, user, property_id)
    assert_property_editable(user, prop)
    lease = db.query(PropertyLease).filter(PropertyLease.id == lease_id, PropertyLease.property_id == property_id).first()
    if not lease:
        raise HTTPException(status_code=404, detail="Lease not found")
    db.delete(lease)
    db.commit()
    return {"ok": True}


# ---------- INSURANCE ----------


@router.get("/{property_id}/insurance", response_model=List[PropertyInsurancePolicyResponse])
def list_insurance(property_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(_require_access)):
    get_property_or_404(db, user, property_id)
    return (
        db.query(PropertyInsurancePolicy)
        .filter(PropertyInsurancePolicy.property_id == property_id)
        .order_by(PropertyInsurancePolicy.expiry_date.desc().nullslast())
        .all()
    )


@router.post("/{property_id}/insurance", response_model=PropertyInsurancePolicyResponse)
def create_insurance(
    property_id: uuid.UUID,
    payload: PropertyInsurancePolicyCreate,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    prop = get_property_or_404(db, user, property_id)
    assert_property_editable(user, prop)
    pol = PropertyInsurancePolicy(property_id=property_id, **payload.model_dump())
    db.add(pol)
    db.commit()
    db.refresh(pol)
    return pol


@router.patch("/{property_id}/insurance/{policy_id}", response_model=PropertyInsurancePolicyResponse)
def update_insurance(
    property_id: uuid.UUID,
    policy_id: uuid.UUID,
    payload: PropertyInsurancePolicyUpdate,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    prop = get_property_or_404(db, user, property_id)
    assert_property_editable(user, prop)
    pol = (
        db.query(PropertyInsurancePolicy)
        .filter(PropertyInsurancePolicy.id == policy_id, PropertyInsurancePolicy.property_id == property_id)
        .first()
    )
    if not pol:
        raise HTTPException(status_code=404, detail="Policy not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(pol, k, v)
    pol.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(pol)
    return pol


@router.delete("/{property_id}/insurance/{policy_id}")
def delete_insurance(
    property_id: uuid.UUID,
    policy_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    prop = get_property_or_404(db, user, property_id)
    assert_property_editable(user, prop)
    pol = (
        db.query(PropertyInsurancePolicy)
        .filter(PropertyInsurancePolicy.id == policy_id, PropertyInsurancePolicy.property_id == property_id)
        .first()
    )
    if not pol:
        raise HTTPException(status_code=404, detail="Policy not found")
    db.delete(pol)
    db.commit()
    return {"ok": True}


# ---------- TAX ----------


@router.get("/{property_id}/tax", response_model=List[PropertyTaxRecordResponse])
def list_tax(property_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(_require_access)):
    get_property_or_404(db, user, property_id)
    records = (
        db.query(PropertyTaxRecord)
        .filter(PropertyTaxRecord.property_id == property_id)
        .order_by(PropertyTaxRecord.tax_year.desc())
        .all()
    )
    for rec in records:
        sync_tax_status(rec)
    db.commit()
    return records


@router.post("/{property_id}/tax", response_model=PropertyTaxRecordResponse)
def create_tax(
    property_id: uuid.UUID,
    payload: PropertyTaxRecordCreate,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    prop = get_property_or_404(db, user, property_id)
    assert_property_editable(user, prop)
    rec = PropertyTaxRecord(property_id=property_id, **payload.model_dump())
    sync_tax_status(rec)
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.patch("/{property_id}/tax/{record_id}", response_model=PropertyTaxRecordResponse)
def update_tax(
    property_id: uuid.UUID,
    record_id: uuid.UUID,
    payload: PropertyTaxRecordUpdate,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    prop = get_property_or_404(db, user, property_id)
    assert_property_editable(user, prop)
    rec = (
        db.query(PropertyTaxRecord)
        .filter(PropertyTaxRecord.id == record_id, PropertyTaxRecord.property_id == property_id)
        .first()
    )
    if not rec:
        raise HTTPException(status_code=404, detail="Tax record not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(rec, k, v)
    rec.updated_at = datetime.now(timezone.utc)
    sync_tax_status(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.delete("/{property_id}/tax/{record_id}")
def delete_tax(
    property_id: uuid.UUID,
    record_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    prop = get_property_or_404(db, user, property_id)
    assert_property_editable(user, prop)
    rec = (
        db.query(PropertyTaxRecord)
        .filter(PropertyTaxRecord.id == record_id, PropertyTaxRecord.property_id == property_id)
        .first()
    )
    if not rec:
        raise HTTPException(status_code=404, detail="Tax record not found")
    db.delete(rec)
    db.commit()
    return {"ok": True}


# ---------- PERMITS (property tab) ----------


@router.get("/{property_id}/permits", response_model=List[PropertyPermitResponse])
def list_permits(property_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(_require_access)):
    get_property_or_404(db, user, property_id)
    if not can_read_property_permits(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    permits = db.query(PropertyPermit).filter(PropertyPermit.property_id == property_id).order_by(PropertyPermit.created_at.desc()).all()
    return [PropertyPermitResponse.model_validate(_serialize_permit(db, p)) for p in permits]


@router.post("/{property_id}/permits", response_model=PropertyPermitResponse)
def create_property_permit(
    property_id: uuid.UUID,
    payload: PropertyPermitBase,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    prop = get_property_or_404(db, user, property_id)
    assert_property_editable(user, prop)
    if not can_write_property_permits(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    data = payload.model_dump()
    checklist = data.pop("checklist", []) or []
    permit = PropertyPermit(property_id=property_id, **data, checklist=checklist)
    db.add(permit)
    db.commit()
    db.refresh(permit)
    return PropertyPermitResponse.model_validate(_serialize_permit(db, permit))


# ---------- RESPONSIBILITIES ----------


@router.get("/{property_id}/responsibilities", response_model=List[PropertyResponsibilityResponse])
def list_responsibilities(property_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(_require_access)):
    get_property_or_404(db, user, property_id)
    rows = db.query(PropertyResponsibility).filter(PropertyResponsibility.property_id == property_id).all()
    out = []
    for r in rows:
        base = PropertyResponsibilityResponse.model_validate(r).model_dump()
        base["user_display_name"] = get_user_display(db, r.user_id) if r.user_id else None
        out.append(PropertyResponsibilityResponse.model_validate(base))
    return out


@router.post("/{property_id}/responsibilities", response_model=PropertyResponsibilityResponse)
def create_responsibility(
    property_id: uuid.UUID,
    payload: PropertyResponsibilityCreate,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    prop = get_property_or_404(db, user, property_id)
    assert_property_editable(user, prop)
    row = PropertyResponsibility(property_id=property_id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    base = PropertyResponsibilityResponse.model_validate(row).model_dump()
    base["user_display_name"] = get_user_display(db, row.user_id) if row.user_id else None
    return PropertyResponsibilityResponse.model_validate(base)


@router.patch("/{property_id}/responsibilities/{row_id}", response_model=PropertyResponsibilityResponse)
def update_responsibility(
    property_id: uuid.UUID,
    row_id: uuid.UUID,
    payload: PropertyResponsibilityUpdate,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    prop = get_property_or_404(db, user, property_id)
    assert_property_editable(user, prop)
    row = (
        db.query(PropertyResponsibility)
        .filter(PropertyResponsibility.id == row_id, PropertyResponsibility.property_id == property_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Responsibility not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        if v is not None or k == "user_id":
            setattr(row, k, v)
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    base = PropertyResponsibilityResponse.model_validate(row).model_dump()
    base["user_display_name"] = get_user_display(db, row.user_id) if row.user_id else None
    return PropertyResponsibilityResponse.model_validate(base)


@router.delete("/{property_id}/responsibilities/{row_id}")
def delete_responsibility(
    property_id: uuid.UUID,
    row_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    prop = get_property_or_404(db, user, property_id)
    assert_property_editable(user, prop)
    row = (
        db.query(PropertyResponsibility)
        .filter(PropertyResponsibility.id == row_id, PropertyResponsibility.property_id == property_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Responsibility not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


# ---------- MAINTENANCE ----------


@router.get("/{property_id}/maintenance", response_model=List[PropertyMaintenanceItemResponse])
def list_maintenance(property_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(_require_access)):
    get_property_or_404(db, user, property_id)
    rows = db.query(PropertyMaintenanceItem).filter(PropertyMaintenanceItem.property_id == property_id).all()
    out = []
    for r in rows:
        base = PropertyMaintenanceItemResponse.model_validate(r).model_dump()
        base["responsible_user_name"] = get_user_display(db, r.responsible_user_id) if r.responsible_user_id else None
        out.append(PropertyMaintenanceItemResponse.model_validate(base))
    return out


@router.post("/{property_id}/maintenance", response_model=PropertyMaintenanceItemResponse)
def create_maintenance(
    property_id: uuid.UUID,
    payload: PropertyMaintenanceItemCreate,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    prop = get_property_or_404(db, user, property_id)
    assert_property_editable(user, prop)
    row = PropertyMaintenanceItem(property_id=property_id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    base = PropertyMaintenanceItemResponse.model_validate(row).model_dump()
    base["responsible_user_name"] = get_user_display(db, row.responsible_user_id) if row.responsible_user_id else None
    return PropertyMaintenanceItemResponse.model_validate(base)


@router.patch("/{property_id}/maintenance/{item_id}", response_model=PropertyMaintenanceItemResponse)
def update_maintenance(
    property_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: PropertyMaintenanceItemUpdate,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    prop = get_property_or_404(db, user, property_id)
    assert_property_editable(user, prop)
    row = (
        db.query(PropertyMaintenanceItem)
        .filter(PropertyMaintenanceItem.id == item_id, PropertyMaintenanceItem.property_id == property_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Maintenance item not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    base = PropertyMaintenanceItemResponse.model_validate(row).model_dump()
    base["responsible_user_name"] = get_user_display(db, row.responsible_user_id) if row.responsible_user_id else None
    return PropertyMaintenanceItemResponse.model_validate(base)


@router.delete("/{property_id}/maintenance/{item_id}")
def delete_maintenance(
    property_id: uuid.UUID,
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    prop = get_property_or_404(db, user, property_id)
    assert_property_editable(user, prop)
    row = (
        db.query(PropertyMaintenanceItem)
        .filter(PropertyMaintenanceItem.id == item_id, PropertyMaintenanceItem.property_id == property_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Maintenance item not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


# ---------- FILES ----------


def _serialize_file(db: Session, pf: PropertyFile) -> dict:
    fo = db.query(FileObject).filter(FileObject.id == pf.file_object_id).first()
    ct = fo.content_type if fo else None
    return {
        "id": pf.id,
        "property_id": pf.property_id,
        "file_object_id": pf.file_object_id,
        "category": pf.category,
        "related_type": pf.related_type,
        "related_id": pf.related_id,
        "folder": pf.folder,
        "description": pf.description,
        "original_name": pf.original_name,
        "uploaded_at": pf.uploaded_at,
        "uploaded_by": pf.uploaded_by,
        "content_type": ct,
        "is_image": bool(ct and ct.startswith("image/")),
    }


@router.get("/{property_id}/files", response_model=List[PropertyFileResponse])
def list_files(
    property_id: uuid.UUID,
    related_type: Optional[str] = Query(None),
    related_id: Optional[uuid.UUID] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    get_property_or_404(db, user, property_id)
    if not can_read_property_documents(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    q = db.query(PropertyFile).filter(PropertyFile.property_id == property_id)
    if related_type:
        q = q.filter(PropertyFile.related_type == related_type)
    if related_id:
        q = q.filter(PropertyFile.related_id == related_id)
    rows = q.order_by(PropertyFile.uploaded_at.desc()).all()
    return [PropertyFileResponse.model_validate(_serialize_file(db, r)) for r in rows]


@router.post("/{property_id}/files", response_model=PropertyFileResponse)
def attach_file(
    property_id: uuid.UUID,
    payload: PropertyFileCreate,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    prop = get_property_or_404(db, user, property_id)
    if not can_write_property_documents(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not user_can_edit_property(user, prop) and not can_write_property_documents(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    pf = PropertyFile(
        property_id=property_id,
        uploaded_by=user.id,
        **payload.model_dump(),
    )
    db.add(pf)
    db.commit()
    db.refresh(pf)
    return PropertyFileResponse.model_validate(_serialize_file(db, pf))


@router.patch("/{property_id}/files/{file_id}", response_model=PropertyFileResponse)
def update_file(
    property_id: uuid.UUID,
    file_id: uuid.UUID,
    payload: PropertyFileUpdate,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    get_property_or_404(db, user, property_id)
    if not can_write_property_documents(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    pf = db.query(PropertyFile).filter(PropertyFile.id == file_id, PropertyFile.property_id == property_id).first()
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")
    data = payload.model_dump(exclude_unset=True)
    if "category" in data and data["category"] is not None:
        if data["category"] not in PROPERTY_FILE_CATEGORIES:
            raise HTTPException(
                status_code=400,
                detail=f"category must be one of: {', '.join(sorted(PROPERTY_FILE_CATEGORIES))}",
            )
    for k, v in data.items():
        setattr(pf, k, v)
    db.commit()
    db.refresh(pf)
    return PropertyFileResponse.model_validate(_serialize_file(db, pf))


@router.delete("/{property_id}/files/{file_id}")
def delete_file(
    property_id: uuid.UUID,
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(_require_access),
):
    get_property_or_404(db, user, property_id)
    if not can_write_property_documents(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    pf = db.query(PropertyFile).filter(PropertyFile.id == file_id, PropertyFile.property_id == property_id).first()
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")
    db.delete(pf)
    db.commit()
    return {"ok": True}
