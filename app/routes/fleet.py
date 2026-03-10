import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from sqlalchemy import or_, and_, func, case, cast, BigInteger

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session, joinedload

from ..db import get_db
from ..auth.security import get_current_user, require_permissions, require_roles
from ..services.asset_assignment_service import (
    create_assignment_for_fleet_asset,
    return_assignment_for_fleet_asset,
    create_assignment_for_equipment_item,
    return_assignment_for_equipment_item,
)
from ..services.task_service import get_user_display
from ..models.models import (
    FleetAsset,
    Equipment,
    FleetInspection,
    InspectionSchedule,
    WorkOrder,
    WorkOrderFile,
    WorkOrderActivityLog,
    FileObject,
    EquipmentCheckout,
    FleetLog,
    EquipmentLog,
    EquipmentAssignment,
    FleetAssetAssignment,
    AssetAssignment,
    FleetComplianceRecord,
    User,
    EmployeeProfile,
)
from ..schemas.fleet import (
    FleetAssetCreate,
    FleetAssetUpdate,
    FleetAssetResponse,
    EquipmentCreate,
    EquipmentUpdate,
    EquipmentResponse,
    EquipmentListResponse,
    InspectionScheduleCreate,
    InspectionScheduleUpdate,
    InspectionScheduleResponse,
    InspectionScheduleStartResponse,
    InspectionScheduleStartBodyResponse,
    InspectionScheduleStartMechanicalResponse,
    InspectionScheduleCalendarItem,
    FleetInspectionCreate,
    FleetInspectionUpdate,
    FleetInspectionResponse,
    WorkOrderCreate,
    WorkOrderUpdate,
    WorkOrderResponse,
    WorkOrderListResponse,
    WorkOrderCalendarItem,
    EquipmentCheckoutCreate,
    EquipmentCheckinUpdate,
    EquipmentCheckoutResponse,
    FleetLogCreate,
    FleetLogResponse,
    EquipmentLogCreate,
    EquipmentLogResponse,
    EquipmentAssignmentCreate,
    EquipmentAssignmentReturn,
    EquipmentAssignmentResponse,
    FleetAssetAssignmentCreate,
    FleetAssetAssignmentReturn,
    FleetAssetAssignmentResponse,
    FleetComplianceRecordCreate,
    FleetComplianceRecordUpdate,
    FleetComplianceRecordRead,
    AssetAssignmentAssignRequest,
    AssetAssignmentReturnRequest,
    AssetAssignmentRead,
    FleetDashboardResponse,
    FleetAssetType,
    EquipmentCategory,
    InspectionResult,
    WorkOrderStatus,
    CheckoutStatus,
    Condition,
)

router = APIRouter(prefix="/fleet", tags=["fleet"])


# Helper function to generate work order number
def generate_work_order_number(db: Session) -> str:
    """Generate a unique work order number"""
    prefix = "WO"
    year = datetime.now().year
    # Get count of work orders this year
    count = db.query(WorkOrder).filter(
        WorkOrder.work_order_number.like(f"{prefix}-{year}-%")
    ).count()
    return f"{prefix}-{year}-{count + 1:05d}"


# Helper function to create work order from failed inspection
def create_work_order_from_inspection(
    inspection: FleetInspection,
    db: Session,
    user_id: Optional[uuid.UUID]
) -> WorkOrder:
    """Create a work order automatically from a failed inspection (body or mechanical)."""
    insp_type = getattr(inspection, "inspection_type", None) or "mechanical"
    type_label = "Body (funilaria/pintura)" if insp_type == "body" else "Mechanical"
    wo = WorkOrder(
        work_order_number=generate_work_order_number(db),
        entity_type="fleet",
        entity_id=inspection.fleet_asset_id,
        description=f"Work order from {type_label} inspection on {inspection.inspection_date.strftime('%Y-%m-%d')}",
        category="repair",
        urgency="high" if inspection.result == "fail" else "normal",
        status="open",
        origin_source="inspection",
        origin_id=inspection.id,
        created_by=user_id,
    )
    db.add(wo)
    db.flush()
    return wo


def _maybe_complete_inspection_schedule(db: Session, schedule_id: uuid.UUID) -> None:
    """If both body and mechanical inspections for this schedule have a final result (pass/fail/conditional), set schedule status to completed."""
    schedule = db.query(InspectionSchedule).filter(InspectionSchedule.id == schedule_id).first()
    if not schedule or schedule.status == "completed":
        return
    inspections = db.query(FleetInspection).filter(FleetInspection.inspection_schedule_id == schedule_id).all()
    if len(inspections) < 2:
        return
    final_results = ("pass", "fail", "conditional")
    body_done = any(i.inspection_type == "body" and (i.result or "").lower() in final_results for i in inspections)
    mechanical_done = any(i.inspection_type == "mechanical" and (i.result or "").lower() in final_results for i in inspections)
    if body_done and mechanical_done:
        schedule.status = "completed"


# Helper function to update fleet asset's last service odometer/hours
def update_fleet_asset_last_service(
    fleet_asset_id: uuid.UUID,
    odometer_reading: Optional[int] = None,
    hours_reading: Optional[float] = None,
    db: Session = None
):
    """Update fleet asset's odometer_last_service or hours_last_service from inspection/work order readings"""
    if not db:
        return
    
    asset = db.query(FleetAsset).filter(FleetAsset.id == fleet_asset_id).first()
    if not asset:
        return
    
    updated = False
    if odometer_reading is not None and asset.asset_type == "vehicle":
        # Update if this reading is higher than current last_service or if last_service is None
        if asset.odometer_last_service is None or odometer_reading > asset.odometer_last_service:
            asset.odometer_last_service = odometer_reading
            updated = True
    
    if hours_reading is not None and (asset.asset_type == "heavy_machinery" or asset.asset_type == "other"):
        # Update if this reading is higher than current last_service or if last_service is None
        if asset.hours_last_service is None or hours_reading > asset.hours_last_service:
            asset.hours_last_service = hours_reading
            updated = True
    
    if updated:
        asset.updated_at = datetime.now(timezone.utc)
        db.flush()


# ---------- DASHBOARD ----------
@router.get("/dashboard", response_model=FleetDashboardResponse)
def get_dashboard(
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:access", "fleet:read"))
):
    """Get dashboard statistics"""
    total_fleet = db.query(FleetAsset).count()
    total_vehicles = db.query(FleetAsset).filter(FleetAsset.asset_type == "vehicle").count()
    total_heavy_machinery = db.query(FleetAsset).filter(FleetAsset.asset_type == "heavy_machinery").count()
    total_other = db.query(FleetAsset).filter(FleetAsset.asset_type == "other").count()
    
    # Inspections due (no inspection in last 30 days)
    today = datetime.now(timezone.utc)
    thirty_days_ago = today - timedelta(days=30)
    all_assets = db.query(FleetAsset).filter(FleetAsset.status != "retired").all()
    assets_needing_inspection = []
    for asset in all_assets[:20]:  # Limit to first 20 for sample list
        last_inspection = db.query(FleetInspection).filter(
            FleetInspection.fleet_asset_id == asset.id
        ).order_by(FleetInspection.inspection_date.desc()).first()
        if not last_inspection or last_inspection.inspection_date < thirty_days_ago:
            assets_needing_inspection.append(asset)
        if len(assets_needing_inspection) >= 10:
            break
    # Full count: assets with no inspection or last inspection older than 30 days
    last_dates = db.query(
        FleetInspection.fleet_asset_id,
        func.max(FleetInspection.inspection_date).label("last_date"),
    ).group_by(FleetInspection.fleet_asset_id).all()
    last_by_asset = {str(row.fleet_asset_id): row.last_date for row in last_dates}
    inspections_due_total = sum(
        1 for a in all_assets
        if last_by_asset.get(str(a.id)) is None or last_by_asset[str(a.id)] < thirty_days_ago
    )
    inspections_due = [
        {
            "id": str(asset.id),
            "name": asset.name,
            "asset_type": asset.asset_type,
            "last_inspection": None,
        }
        for asset in assets_needing_inspection
    ]
    
    # Assigned now (unified asset_assignments: fleet + equipment with no returned_at)
    assigned_now_count = db.query(AssetAssignment).filter(AssetAssignment.returned_at.is_(None)).count()

    # Work orders
    open_wos = db.query(WorkOrder).filter(WorkOrder.status == "open").count()
    in_progress_wos = db.query(WorkOrder).filter(WorkOrder.status == "in_progress").count()
    pending_parts_wos = db.query(WorkOrder).filter(WorkOrder.status == "pending_parts").count()
    
    # Overdue equipment
    overdue_checkouts = db.query(EquipmentCheckout).filter(
        and_(
            EquipmentCheckout.status == "checked_out",
            EquipmentCheckout.expected_return_date < today
        )
    ).all()
    overdue_equipment = [
        {
            "id": str(co.id),
            "equipment_id": str(co.equipment_id),
            "equipment_name": db.query(Equipment).filter(Equipment.id == co.equipment_id).first().name if db.query(Equipment).filter(Equipment.id == co.equipment_id).first() else "Unknown",
            "checked_out_by": str(co.checked_out_by_user_id),
            "expected_return_date": co.expected_return_date.isoformat() if co.expected_return_date else None,
        }
        for co in overdue_checkouts
    ]

    # Compliance expiring in next 30 days
    thirty_days_later = today + timedelta(days=30)
    compliance_expiring_q = db.query(FleetComplianceRecord).options(
        joinedload(FleetComplianceRecord.fleet_asset)
    ).filter(
        FleetComplianceRecord.expiry_date.isnot(None),
        FleetComplianceRecord.expiry_date >= today,
        FleetComplianceRecord.expiry_date <= thirty_days_later,
    ).order_by(FleetComplianceRecord.expiry_date.asc())
    compliance_expiring_total = compliance_expiring_q.count()
    compliance_expiring_records = compliance_expiring_q.limit(10).all()
    compliance_expiring = [
        {
            "id": str(rec.id),
            "fleet_asset_id": str(rec.fleet_asset_id),
            "fleet_asset_name": rec.fleet_asset.name if rec.fleet_asset else None,
            "record_type": rec.record_type,
            "expiry_date": rec.expiry_date.isoformat() if rec.expiry_date else None,
        }
        for rec in compliance_expiring_records
    ]
    
    return FleetDashboardResponse(
        total_fleet_assets=total_fleet,
        total_vehicles=total_vehicles,
        total_heavy_machinery=total_heavy_machinery,
        total_other_assets=total_other,
        assigned_now_count=assigned_now_count,
        inspections_due_count=len(inspections_due),
        inspections_due_total=inspections_due_total,
        inspections_due=inspections_due,
        open_work_orders_count=open_wos,
        in_progress_work_orders_count=in_progress_wos,
        pending_parts_work_orders_count=pending_parts_wos,
        overdue_equipment_count=len(overdue_equipment),
        overdue_equipment=overdue_equipment,
        compliance_expiring_count=compliance_expiring_total,
        compliance_expiring=compliance_expiring,
    )


# ---------- FLEET ASSETS ----------
def _fleet_assets_order(sort: Optional[str], direction: str):
    """Return SQLAlchemy order_by clause for fleet assets list. direction is 'asc' or 'desc'.
    Use column.asc().nulls_last() so PostgreSQL gets ASC NULLS LAST (not NULLS LAST ASC)."""
    is_asc = (direction or "asc").lower() == "asc"

    if sort == "unit_number":
        # Sort numerically when value is all digits (1, 2, 10, 21, 1231), else by string
        is_numeric = FleetAsset.unit_number.op("~")("^[0-9]+$")
        numeric_sort = case((is_numeric, cast(FleetAsset.unit_number, BigInteger)), else_=None)
        if is_asc:
            return (numeric_sort.asc().nulls_last(), FleetAsset.unit_number.asc())
        return (numeric_sort.desc().nulls_last(), FleetAsset.unit_number.desc())
    if sort == "name":
        return FleetAsset.name.asc() if is_asc else FleetAsset.name.desc()
    if sort == "type":
        return FleetAsset.asset_type.asc() if is_asc else FleetAsset.asset_type.desc()
    if sort == "make_model":
        if is_asc:
            return (FleetAsset.make.asc().nulls_last(), FleetAsset.model.asc().nulls_last())
        return (FleetAsset.make.desc().nulls_last(), FleetAsset.model.desc().nulls_last())
    if sort == "year":
        return FleetAsset.year.asc().nulls_last() if is_asc else FleetAsset.year.desc().nulls_last()
    if sort == "plate_vin":
        c = func.coalesce(FleetAsset.license_plate, FleetAsset.vin)
        return c.asc().nulls_last() if is_asc else c.desc().nulls_last()
    if sort == "fuel_type":
        return FleetAsset.fuel_type.asc().nulls_last() if is_asc else FleetAsset.fuel_type.desc().nulls_last()
    if sort == "vehicle_type":
        return FleetAsset.vehicle_type.asc().nulls_last() if is_asc else FleetAsset.vehicle_type.desc().nulls_last()
    if sort == "sleeps":
        return FleetAsset.yard_location.asc().nulls_last() if is_asc else FleetAsset.yard_location.desc().nulls_last()
    if sort == "assignment":
        return FleetAsset.driver_id.asc().nulls_first() if is_asc else FleetAsset.driver_id.desc().nulls_last()
    if sort == "status":
        return FleetAsset.status.asc() if is_asc else FleetAsset.status.desc()
    return FleetAsset.created_at.desc()


@router.get("/assets")
def list_fleet_assets(
    asset_type: Optional[FleetAssetType] = Query(None),
    asset_type_not: Optional[str] = Query(None),
    division_id: Optional[uuid.UUID] = Query(None),
    division_id_not: Optional[uuid.UUID] = Query(None),
    status: Optional[str] = Query(None),
    status_not: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    fuel_type: Optional[str] = Query(None),
    fuel_type_not: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    year_not: Optional[int] = Query(None),
    assigned: Optional[bool] = Query(None),
    sort: Optional[str] = Query(None),
    dir: Optional[str] = Query("asc"),
    page: int = 1,
    limit: int = 15,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:access", "fleet:read"))
):
    """List fleet assets with filters, sort, and pagination. Sort applies to all pages."""
    page = max(1, page)
    limit = max(1, min(100, limit))
    offset = (page - 1) * limit

    query = db.query(FleetAsset)

    if asset_type:
        query = query.filter(FleetAsset.asset_type == asset_type.value)
    if asset_type_not:
        query = query.filter(FleetAsset.asset_type != asset_type_not)
    if division_id:
        query = query.filter(FleetAsset.division_id == division_id)
    if division_id_not is not None:
        query = query.filter(FleetAsset.division_id != division_id_not)
    if status:
        query = query.filter(FleetAsset.status == status)
    if status_not:
        query = query.filter(FleetAsset.status != status_not)
    if fuel_type:
        query = query.filter(FleetAsset.fuel_type.ilike(fuel_type))
    if fuel_type_not:
        query = query.filter(or_(FleetAsset.fuel_type.is_(None), ~FleetAsset.fuel_type.ilike(fuel_type_not)))
    if year is not None:
        query = query.filter(FleetAsset.year == year)
    if year_not is not None:
        query = query.filter(FleetAsset.year != year_not)
    if assigned is not None:
        if assigned:
            query = query.filter(FleetAsset.driver_id.isnot(None))
        else:
            query = query.filter(FleetAsset.driver_id.is_(None))
    if search:
        search_term = f"%{search}%"
        # FleetAsset fields: name, make, model, vin, plate, unit_number, body_style, vehicle_type, fuel_type, yard_location, equipment_type_label, notes
        asset_conditions = or_(
            FleetAsset.name.ilike(search_term),
            FleetAsset.vin.ilike(search_term),
            FleetAsset.license_plate.ilike(search_term),
            FleetAsset.model.ilike(search_term),
            FleetAsset.make.ilike(search_term),
            FleetAsset.unit_number.ilike(search_term),
            FleetAsset.body_style.ilike(search_term),
            FleetAsset.vehicle_type.ilike(search_term),
            FleetAsset.fuel_type.ilike(search_term),
            FleetAsset.yard_location.ilike(search_term),
            FleetAsset.equipment_type_label.ilike(search_term),
            FleetAsset.notes.ilike(search_term),
        )
        # Driver name (assigned user): join User + EmployeeProfile
        driver_user = or_(
            User.username.ilike(search_term),
            User.email_personal.ilike(search_term),
        )
        driver_profile = or_(
            EmployeeProfile.first_name.ilike(search_term),
            EmployeeProfile.last_name.ilike(search_term),
            EmployeeProfile.preferred_name.ilike(search_term),
        )
        # Subquery: distinct asset IDs matching search (avoids SELECT DISTINCT + ORDER BY conflict in PostgreSQL)
        matching_ids_subq = (
            db.query(FleetAsset.id)
            .outerjoin(User, FleetAsset.driver_id == User.id)
            .outerjoin(EmployeeProfile, User.id == EmployeeProfile.user_id)
            .filter(or_(asset_conditions, driver_user, driver_profile))
            .distinct()
        )
        query = query.filter(FleetAsset.id.in_(matching_ids_subq))

    order_clause = _fleet_assets_order(sort, dir or "asc")
    if isinstance(order_clause, tuple):
        query = query.order_by(*order_clause)
    else:
        query = query.order_by(order_clause)

    total = query.count()
    assets = query.offset(offset).limit(limit).all()
    total_pages = (total + limit - 1) // limit if total > 0 else 1

    items = []
    for a in assets:
        d = FleetAssetResponse.model_validate(a).model_dump(mode="json")
        d["driver_name"] = get_user_display(db, a.driver_id) if a.driver_id else None
        items.append(d)

    # Fetch distinct fuel types for filter dropdown (when viewing vehicles or all)
    fuel_type_options: List[str] = []
    if asset_type is None or asset_type == FleetAssetType.vehicle:
        from sqlalchemy import distinct
        ft_query = db.query(distinct(FleetAsset.fuel_type)).filter(
            FleetAsset.asset_type == "vehicle",
            FleetAsset.fuel_type.isnot(None),
            FleetAsset.fuel_type != "",
        )
        fuel_type_options = [r[0] for r in ft_query.all() if r[0]]
        fuel_type_options.sort()

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
        "fuel_type_options": fuel_type_options,
    }


@router.get("/assets/{asset_id}", response_model=FleetAssetResponse)
def get_fleet_asset(
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:read"))
):
    """Get fleet asset detail"""
    asset = db.query(FleetAsset).filter(FleetAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Fleet asset not found")
    return asset


@router.post("/assets", response_model=FleetAssetResponse)
def create_fleet_asset(
    asset: FleetAssetCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("fleet:write"))
):
    """Create a new fleet asset. Name is optional; stored as empty string if not provided."""
    data = asset.model_dump() if hasattr(asset, 'model_dump') else asset.dict()
    if not (data.get('name') or '').strip():
        data['name'] = ''
    new_asset = FleetAsset(**data, created_by=user.id)
    db.add(new_asset)
    db.commit()
    db.refresh(new_asset)
    return new_asset


@router.put("/assets/{asset_id}", response_model=FleetAssetResponse)
def update_fleet_asset(
    asset_id: uuid.UUID,
    asset_update: FleetAssetUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:write"))
):
    """Update a fleet asset"""
    asset = db.query(FleetAsset).filter(FleetAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Fleet asset not found")
    
    update_data = asset_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(asset, key, value)
    asset.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(asset)
    return asset


@router.delete("/assets/{asset_id}")
def delete_fleet_asset(
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:write"))
):
    """Delete a fleet asset (soft delete by setting status to retired)"""
    asset = db.query(FleetAsset).filter(FleetAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Fleet asset not found")
    
    asset.status = "retired"
    asset.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Fleet asset deleted successfully"}


@router.get("/assets/{asset_id}/inspections", response_model=List[FleetInspectionResponse])
def get_asset_inspections(
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:read"))
):
    """Get inspections for a fleet asset"""
    return db.query(FleetInspection).filter(
        FleetInspection.fleet_asset_id == asset_id
    ).order_by(FleetInspection.inspection_date.desc()).all()


@router.get("/assets/{asset_id}/work-orders", response_model=List[WorkOrderResponse])
def get_asset_work_orders(
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:read"))
):
    """Get work orders for a fleet asset"""
    return db.query(WorkOrder).filter(
        and_(
            WorkOrder.entity_type == "fleet",
            WorkOrder.entity_id == asset_id
        )
    ).order_by(WorkOrder.created_at.desc()).all()


@router.get("/assets/{asset_id}/logs", response_model=List[FleetLogResponse])
def get_asset_logs(
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:read"))
):
    """Get logs for a fleet asset"""
    return db.query(FleetLog).filter(
        FleetLog.fleet_asset_id == asset_id
    ).order_by(FleetLog.log_date.desc()).all()


# ---------- FLEET COMPLIANCE ----------
@router.get("/assets/{asset_id}/compliance", response_model=List[FleetComplianceRecordRead])
def get_asset_compliance(
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:read"))
):
    """Get compliance records for a fleet asset"""
    asset = db.query(FleetAsset).filter(FleetAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Fleet asset not found")
    return db.query(FleetComplianceRecord).filter(
        FleetComplianceRecord.fleet_asset_id == asset_id
    ).order_by(FleetComplianceRecord.expiry_date.desc().nulls_last()).all()


@router.post("/assets/{asset_id}/compliance", response_model=FleetComplianceRecordRead)
def create_asset_compliance(
    asset_id: uuid.UUID,
    payload: FleetComplianceRecordCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:write"))
):
    """Create a compliance record for a fleet asset"""
    asset = db.query(FleetAsset).filter(FleetAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Fleet asset not found")
    data = payload.dict(exclude={"fleet_asset_id"})
    rec = FleetComplianceRecord(fleet_asset_id=asset_id, **data)
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.put("/compliance/{record_id}", response_model=FleetComplianceRecordRead)
def update_compliance(
    record_id: uuid.UUID,
    payload: FleetComplianceRecordUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:write"))
):
    """Update a compliance record"""
    rec = db.query(FleetComplianceRecord).filter(FleetComplianceRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Compliance record not found")
    update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(rec, key, value)
    db.commit()
    db.refresh(rec)
    return rec


@router.delete("/compliance/{record_id}")
def delete_compliance(
    record_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:write"))
):
    """Delete a compliance record"""
    rec = db.query(FleetComplianceRecord).filter(FleetComplianceRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Compliance record not found")
    db.delete(rec)
    db.commit()
    return {"message": "Compliance record deleted"}


# ---------- EQUIPMENT ----------
def _equipment_order(sort: Optional[str], direction: str):
    """Return SQLAlchemy order_by clause for equipment list."""
    is_asc = (direction or "asc").lower() == "asc"
    if sort == "unit_number":
        is_numeric = Equipment.unit_number.op("~")("^[0-9]+$")
        numeric_sort = case((is_numeric, cast(Equipment.unit_number, BigInteger)), else_=None)
        if is_asc:
            return (numeric_sort.asc().nulls_last(), Equipment.unit_number.asc())
        return (numeric_sort.desc().nulls_last(), Equipment.unit_number.desc())
    if sort == "name":
        return Equipment.name.asc() if is_asc else Equipment.name.desc()
    if sort == "category":
        return Equipment.category.asc() if is_asc else Equipment.category.desc()
    if sort == "value":
        return Equipment.value.asc().nulls_last() if is_asc else Equipment.value.desc().nulls_last()
    if sort == "assignment":
        # checked_out first when asc = "assigned" first
        return Equipment.status.asc() if is_asc else Equipment.status.desc()
    if sort == "status":
        return Equipment.status.asc() if is_asc else Equipment.status.desc()
    return Equipment.created_at.desc()


@router.get("/equipment", response_model=EquipmentListResponse)
def list_equipment(
    category: Optional[EquipmentCategory] = Query(None),
    category_not: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    status_not: Optional[str] = Query(None),
    assigned: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    sort: Optional[str] = Query(None),
    dir: Optional[str] = Query("asc"),
    page: int = Query(1, ge=1),
    limit: int = Query(15, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:access", "fleet:read", "equipment:read"))
):
    """List equipment with filters, sort, and pagination."""
    offset = (page - 1) * limit
    query = db.query(Equipment)

    if category:
        query = query.filter(Equipment.category == category.value)
    if category_not:
        query = query.filter(Equipment.category != category_not)
    if status:
        query = query.filter(Equipment.status == status)
    if status_not:
        query = query.filter(Equipment.status != status_not)
    if assigned is not None:
        active_assignment_equipment_ids = db.query(EquipmentAssignment.equipment_id).filter(
            EquipmentAssignment.is_active == True
        ).distinct()
        if assigned:
            query = query.filter(
                or_(
                    Equipment.status == "checked_out",
                    Equipment.id.in_(active_assignment_equipment_ids)
                )
            )
        else:
            query = query.filter(Equipment.status != "checked_out").filter(
                ~Equipment.id.in_(active_assignment_equipment_ids)
            )
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Equipment.name.ilike(search_term),
                Equipment.serial_number.ilike(search_term),
                Equipment.brand.ilike(search_term),
                Equipment.model.ilike(search_term),
                Equipment.unit_number.ilike(search_term),
                Equipment.notes.ilike(search_term),
            )
        )

    order_clause = _equipment_order(sort, dir or "asc")
    if isinstance(order_clause, tuple):
        query = query.order_by(*order_clause)
    else:
        query = query.order_by(order_clause)

    total = query.count()
    equipment_list = query.offset(offset).limit(limit).all()
    total_pages = (total + limit - 1) // limit if total > 0 else 1

    items = []
    for eq in equipment_list:
        d = EquipmentResponse.model_validate(eq).model_dump(mode="json")
        assigned_user_id = None
        if eq.status == "checked_out":
            checkout = (
                db.query(EquipmentCheckout)
                .filter(
                    EquipmentCheckout.equipment_id == eq.id,
                    EquipmentCheckout.status == "checked_out"
                )
                .order_by(EquipmentCheckout.checked_out_at.desc())
                .first()
            )
            if checkout:
                assigned_user_id = checkout.checked_out_by_user_id
        if assigned_user_id is None:
            assignment = (
                db.query(EquipmentAssignment)
                .filter(
                    EquipmentAssignment.equipment_id == eq.id,
                    EquipmentAssignment.is_active == True
                )
                .order_by(EquipmentAssignment.assigned_at.desc())
                .first()
            )
            if assignment:
                assigned_user_id = assignment.assigned_to_user_id
        d["assigned_to_name"] = get_user_display(db, assigned_user_id) if assigned_user_id else None
        items.append(d)

    return EquipmentListResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


@router.get("/equipment/{equipment_id}", response_model=EquipmentResponse)
def get_equipment(
    equipment_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("equipment:read"))
):
    """Get equipment detail"""
    equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return equipment


@router.post("/equipment", response_model=EquipmentResponse)
def create_equipment(
    equipment: EquipmentCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("equipment:write"))
):
    """Create new equipment"""
    new_equipment = Equipment(**equipment.dict(), created_by=user.id)
    db.add(new_equipment)
    db.commit()
    db.refresh(new_equipment)
    return new_equipment


@router.put("/equipment/{equipment_id}", response_model=EquipmentResponse)
def update_equipment(
    equipment_id: uuid.UUID,
    equipment_update: EquipmentUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("equipment:write"))
):
    """Update equipment"""
    equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    update_data = equipment_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(equipment, key, value)
    equipment.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(equipment)
    return equipment


@router.delete("/equipment/{equipment_id}")
def delete_equipment(
    equipment_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("equipment:write"))
):
    """Delete equipment (soft delete by setting status to retired)"""
    equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    equipment.status = "retired"
    equipment.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Equipment deleted successfully"}


@router.post("/equipment/{equipment_id}/checkout", response_model=EquipmentCheckoutResponse)
def checkout_equipment(
    equipment_id: uuid.UUID,
    checkout: EquipmentCheckoutCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("equipment:write"))
):
    """Check out equipment to a user"""
    equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    if equipment.status == "checked_out":
        raise HTTPException(status_code=400, detail="Equipment is already checked out")
    
    new_checkout = EquipmentCheckout(
        equipment_id=equipment_id,
        checked_out_by_user_id=checkout.checked_out_by_user_id,
        checked_out_at=checkout.checked_out_at or datetime.now(timezone.utc),
        expected_return_date=checkout.expected_return_date,
        condition_out=checkout.condition_out.value,
        notes_out=checkout.notes_out,
        status="checked_out",
        created_by=user.id,
    )
    db.add(new_checkout)
    
    # Update equipment status
    equipment.status = "checked_out"
    equipment.updated_at = datetime.now(timezone.utc)
    
    # Create log entry
    log = EquipmentLog(
        equipment_id=equipment_id,
        log_type="checkout",
        log_date=datetime.now(timezone.utc),
        user_id=user.id,
        description=f"Equipment checked out to user {checkout.checked_out_by_user_id}",
        created_by=user.id,
    )
    db.add(log)
    
    db.commit()
    db.refresh(new_checkout)
    return new_checkout


@router.post("/equipment/{equipment_id}/checkin", response_model=EquipmentCheckoutResponse)
def checkin_equipment(
    equipment_id: uuid.UUID,
    checkin: EquipmentCheckinUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("equipment:write"))
):
    """Check in equipment"""
    equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    # Find active checkout
    checkout = db.query(EquipmentCheckout).filter(
        and_(
            EquipmentCheckout.equipment_id == equipment_id,
            EquipmentCheckout.status == "checked_out"
        )
    ).order_by(EquipmentCheckout.checked_out_at.desc()).first()
    
    if not checkout:
        raise HTTPException(status_code=400, detail="No active checkout found for this equipment")
    
    # Update checkout
    checkout.actual_return_date = checkin.actual_return_date
    checkout.condition_in = checkin.condition_in.value
    checkout.notes_in = checkin.notes_in
    checkout.status = "returned"
    checkout.updated_at = datetime.now(timezone.utc)
    
    # Update equipment status
    equipment.status = "available"
    equipment.updated_at = datetime.now(timezone.utc)
    
    # Create log entry
    log = EquipmentLog(
        equipment_id=equipment_id,
        log_type="checkin",
        log_date=datetime.now(timezone.utc),
        user_id=user.id,
        description=f"Equipment checked in. Condition: {checkin.condition_in.value}",
        created_by=user.id,
    )
    db.add(log)
    
    db.commit()
    db.refresh(checkout)
    return checkout


@router.get("/equipment/{equipment_id}/work-orders", response_model=List[WorkOrderResponse])
def get_equipment_work_orders(
    equipment_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("equipment:read"))
):
    """Get work orders for equipment"""
    return db.query(WorkOrder).filter(
        and_(
            WorkOrder.entity_type == "equipment",
            WorkOrder.entity_id == equipment_id
        )
    ).order_by(WorkOrder.created_at.desc()).all()


@router.get("/equipment/{equipment_id}/logs", response_model=List[EquipmentLogResponse])
def get_equipment_logs(
    equipment_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("equipment:read"))
):
    """Get logs for equipment"""
    return db.query(EquipmentLog).filter(
        EquipmentLog.equipment_id == equipment_id
    ).order_by(EquipmentLog.log_date.desc()).all()


@router.get("/equipment/{equipment_id}/checkouts", response_model=List[EquipmentCheckoutResponse])
def get_equipment_checkouts(
    equipment_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("equipment:read"))
):
    """Get checkout history for equipment"""
    return db.query(EquipmentCheckout).filter(
        EquipmentCheckout.equipment_id == equipment_id
    ).order_by(EquipmentCheckout.checked_out_at.desc()).all()


@router.get("/equipment/overdue", response_model=List[EquipmentCheckoutResponse])
def get_overdue_equipment(
    db: Session = Depends(get_db),
    _=Depends(require_permissions("equipment:read"))
):
    """Get overdue equipment checkouts"""
    today = datetime.now(timezone.utc)
    overdue = db.query(EquipmentCheckout).filter(
        and_(
            EquipmentCheckout.status == "checked_out",
            EquipmentCheckout.expected_return_date < today
        )
    ).all()
    
    # Update status to overdue
    for checkout in overdue:
        if checkout.status == "checked_out":
            checkout.status = "overdue"
    db.commit()
    
    return overdue


# ---------- EQUIPMENT ASSIGNMENTS (unified asset_assignments) ----------
@router.get("/equipment/{equipment_id}/assignments", response_model=List[AssetAssignmentRead])
def get_equipment_assignments(
    equipment_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("equipment:read"))
):
    """Get assignment history for equipment (from asset_assignments)"""
    assignments = db.query(AssetAssignment).filter(
        AssetAssignment.equipment_id == equipment_id
    ).order_by(AssetAssignment.assigned_at.desc()).all()
    return assignments


@router.post("/equipment/{equipment_id}/assign", response_model=AssetAssignmentRead)
def assign_equipment(
    equipment_id: uuid.UUID,
    payload: AssetAssignmentAssignRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("equipment:write"))
):
    """Assign equipment to a user (unified asset_assignments)"""
    if not payload.assigned_to_user_id and not payload.assigned_to_name:
        raise HTTPException(status_code=400, detail="Provide assigned_to_user_id or assigned_to_name")
    try:
        result = create_assignment_for_equipment_item(equipment_id, payload, user.id, db)
        db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/equipment/{equipment_id}/return", response_model=AssetAssignmentRead)
def return_equipment(
    equipment_id: uuid.UUID,
    payload: AssetAssignmentReturnRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("equipment:write"))
):
    """Return equipment (close open assignment by equipment_id)"""
    try:
        result = return_assignment_for_equipment_item(equipment_id, payload, user.id, db)
        db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/equipment/assignments/{assignment_id}/return", response_model=EquipmentAssignmentResponse)
def return_equipment_assignment(
    assignment_id: uuid.UUID,
    return_data: EquipmentAssignmentReturn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("equipment:write"))
):
    """Return equipment assignment by id (legacy equipment_assignments table)"""
    assignment = db.query(EquipmentAssignment).filter(EquipmentAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    if not assignment.is_active:
        raise HTTPException(status_code=400, detail="Assignment is already returned")
    
    assignment.is_active = False
    assignment.returned_at = return_data.returned_at or datetime.now(timezone.utc)
    assignment.returned_to_user_id = return_data.returned_to_user_id or user.id
    if return_data.notes:
        assignment.notes = (assignment.notes or "") + f"\nReturn notes: {return_data.notes}"
    
    log = EquipmentLog(
        equipment_id=assignment.equipment_id,
        log_type="return",
        log_date=datetime.now(timezone.utc),
        user_id=user.id,
        description=f"Equipment returned from user {assignment.assigned_to_user_id}",
        created_by=user.id,
    )
    db.add(log)
    db.commit()
    db.refresh(assignment)
    return assignment


# ---------- FLEET ASSET ASSIGNMENTS (unified asset_assignments) ----------
@router.get("/assets/{asset_id}/assignments", response_model=List[AssetAssignmentRead])
def get_fleet_asset_assignments(
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:read"))
):
    """Get assignment history for fleet asset (from asset_assignments)"""
    assignments = db.query(AssetAssignment).filter(
        AssetAssignment.fleet_asset_id == asset_id
    ).order_by(AssetAssignment.assigned_at.desc()).all()
    return assignments


@router.post("/assets/{asset_id}/assign", response_model=AssetAssignmentRead)
def assign_fleet_asset(
    asset_id: uuid.UUID,
    payload: AssetAssignmentAssignRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("fleet:write"))
):
    """Assign fleet asset to a user (unified asset_assignments)"""
    if not payload.assigned_to_user_id and not payload.assigned_to_name:
        raise HTTPException(status_code=400, detail="Provide assigned_to_user_id or assigned_to_name")
    try:
        result = create_assignment_for_fleet_asset(asset_id, payload, user.id, db)
        db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/assets/{asset_id}/return", response_model=AssetAssignmentRead)
def return_fleet_asset(
    asset_id: uuid.UUID,
    payload: AssetAssignmentReturnRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("fleet:write"))
):
    """Return fleet asset (close open assignment by asset_id)"""
    try:
        result = return_assignment_for_fleet_asset(asset_id, payload, user.id, db)
        db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/assets/assignments/{assignment_id}/return", response_model=FleetAssetAssignmentResponse)
def return_fleet_asset_assignment(
    assignment_id: uuid.UUID,
    return_data: FleetAssetAssignmentReturn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("fleet:write"))
):
    """Return fleet asset assignment by assignment id (legacy fleet_asset_assignments table)"""
    assignment = db.query(FleetAssetAssignment).filter(FleetAssetAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    if not assignment.is_active:
        raise HTTPException(status_code=400, detail="Assignment is already returned")
    
    assignment.is_active = False
    assignment.returned_at = return_data.returned_at or datetime.now(timezone.utc)
    assignment.returned_to_user_id = return_data.returned_to_user_id or user.id
    if return_data.notes:
        assignment.notes = (assignment.notes or "") + f"\nReturn notes: {return_data.notes}"
    
    asset = db.query(FleetAsset).filter(FleetAsset.id == assignment.fleet_asset_id).first()
    if asset:
        asset.driver_id = None
        asset.updated_at = datetime.now(timezone.utc)
    
    log = FleetLog(
        fleet_asset_id=assignment.fleet_asset_id,
        log_type="return",
        log_date=datetime.now(timezone.utc),
        user_id=user.id,
        description=f"Fleet asset returned from user {assignment.assigned_to_user_id}",
        created_by=user.id,
    )
    db.add(log)
    db.commit()
    db.refresh(assignment)
    return assignment


# ---------- INSPECTION SCHEDULES (agendamentos) ----------
@router.post("/inspection-schedules", response_model=InspectionScheduleResponse)
def create_inspection_schedule(
    payload: InspectionScheduleCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("inspections:write")),
):
    """Create an inspection appointment (agendamento). Use start to create the two inspections (body + mechanical)."""
    schedule = InspectionSchedule(
        fleet_asset_id=payload.fleet_asset_id,
        scheduled_at=payload.scheduled_at,
        urgency=payload.urgency,
        category=payload.category,
        notes=payload.notes,
        status="scheduled",
        created_by=user.id,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    out = InspectionScheduleResponse.model_validate(schedule)
    asset = db.query(FleetAsset).filter(FleetAsset.id == schedule.fleet_asset_id).first()
    return out.model_copy(update={"fleet_asset_name": asset.name if asset else None})


@router.get("/inspection-schedules", response_model=List[InspectionScheduleResponse])
def list_inspection_schedules(
    fleet_asset_id: Optional[uuid.UUID] = Query(None),
    status: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    sort: Optional[str] = Query("scheduled_at"),
    dir: Optional[str] = Query("desc"),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("inspections:read")),
):
    """List inspection schedules with filters."""
    query = db.query(InspectionSchedule).options(
        joinedload(InspectionSchedule.fleet_asset),
        joinedload(InspectionSchedule.inspections),
    )
    if fleet_asset_id:
        query = query.filter(InspectionSchedule.fleet_asset_id == fleet_asset_id)
    if status:
        query = query.filter(InspectionSchedule.status == status)
    if start_date:
        query = query.filter(InspectionSchedule.scheduled_at >= start_date)
    if end_date:
        query = query.filter(InspectionSchedule.scheduled_at <= end_date)
    is_desc = (dir or "desc").lower() == "desc"
    if sort == "scheduled_at":
        query = query.order_by(InspectionSchedule.scheduled_at.desc() if is_desc else InspectionSchedule.scheduled_at.asc())
    elif sort == "asset":
        query = query.join(InspectionSchedule.fleet_asset).order_by(FleetAsset.name.desc() if is_desc else FleetAsset.name.asc())
    else:
        query = query.order_by(InspectionSchedule.scheduled_at.desc() if is_desc else InspectionSchedule.scheduled_at.asc())
    rows = query.limit(500).all()
    out_list = []
    for r in rows:
        body_insp = next((i for i in (r.inspections or []) if i.inspection_type == "body"), None)
        mech_insp = next((i for i in (r.inspections or []) if i.inspection_type == "mechanical"), None)
        out_list.append(
            InspectionScheduleResponse.model_validate(r).model_copy(update={
                "fleet_asset_name": r.fleet_asset.name if r.fleet_asset else None,
                "body_inspection_id": body_insp.id if body_insp else None,
                "mechanical_inspection_id": mech_insp.id if mech_insp else None,
                "body_result": body_insp.result if body_insp else None,
                "mechanical_result": mech_insp.result if mech_insp else None,
            })
        )
    return out_list


@router.get("/inspection-schedules/calendar", response_model=List[InspectionScheduleCalendarItem])
def get_inspection_schedules_calendar(
    start: str = Query(..., description="Start date (YYYY-MM-DD) or datetime (ISO)"),
    end: str = Query(..., description="End date (YYYY-MM-DD) or datetime (ISO)"),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:access", "fleet:read", "inspections:read")),
):
    """List inspection schedules with scheduled_at in [start, end] for calendar view."""
    def _parse(s: str, default_time: str):
        s = (s or "").strip()
        if not s:
            raise ValueError("Empty")
        if "T" in s or " " in s:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        else:
            dt = datetime.fromisoformat(s + default_time)
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt

    try:
        start_dt = _parse(start, "T00:00:00")
        end_dt = _parse(end, "T23:59:59.999999")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid start or end date/datetime")
    query = (
        db.query(InspectionSchedule)
        .filter(InspectionSchedule.scheduled_at >= start_dt)
        .filter(InspectionSchedule.scheduled_at <= end_dt)
    )
    schedules = (
        query.options(
            joinedload(InspectionSchedule.fleet_asset),
            joinedload(InspectionSchedule.inspections),
        )
        .order_by(InspectionSchedule.scheduled_at.asc())
        .all()
    )
    out = []
    for s in schedules:
        body_id = None
        mech_id = None
        for insp in (s.inspections or []):
            if getattr(insp, "inspection_type", None) == "body":
                body_id = insp.id
            elif getattr(insp, "inspection_type", None) == "mechanical":
                mech_id = insp.id
        unit_number = None
        if s.fleet_asset:
            unit_number = getattr(s.fleet_asset, "unit_number", None) or getattr(s.fleet_asset, "name", None)
        out.append(
            InspectionScheduleCalendarItem(
                id=s.id,
                scheduled_at=s.scheduled_at,
                fleet_asset_name=s.fleet_asset.name if s.fleet_asset else None,
                unit_number=unit_number,
                status=s.status,
                body_inspection_id=body_id,
                mechanical_inspection_id=mech_id,
            )
        )
    return out


@router.get("/inspection-schedules/{schedule_id}", response_model=InspectionScheduleResponse)
def get_inspection_schedule(
    schedule_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("inspections:read")),
):
    """Get inspection schedule by id."""
    schedule = db.query(InspectionSchedule).options(joinedload(InspectionSchedule.fleet_asset)).filter(InspectionSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Inspection schedule not found")
    out = InspectionScheduleResponse.model_validate(schedule)
    return out.model_copy(update={"fleet_asset_name": schedule.fleet_asset.name if schedule.fleet_asset else None})


@router.put("/inspection-schedules/{schedule_id}", response_model=InspectionScheduleResponse)
def update_inspection_schedule(
    schedule_id: uuid.UUID,
    payload: InspectionScheduleUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("inspections:write")),
):
    """Update an inspection schedule (e.g. reschedule, cancel)."""
    schedule = db.query(InspectionSchedule).options(joinedload(InspectionSchedule.fleet_asset)).filter(InspectionSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Inspection schedule not found")
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(schedule, key, value)
    db.commit()
    db.refresh(schedule)
    out = InspectionScheduleResponse.model_validate(schedule)
    return out.model_copy(update={"fleet_asset_name": schedule.fleet_asset.name if schedule.fleet_asset else None})


@router.delete("/inspection-schedules/{schedule_id}")
def delete_inspection_schedule(
    schedule_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    """Permanently delete an inspection schedule and its linked inspections (admin only)."""
    schedule = db.query(InspectionSchedule).filter(InspectionSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Inspection schedule not found")
    db.delete(schedule)
    db.commit()
    return {"message": "Inspection schedule deleted"}


def _ensure_schedule_inspections(schedule: InspectionSchedule, db: Session, user_id: uuid.UUID):
    """Ensure body and mechanical inspections exist for this schedule; create if missing. Mark schedule in_progress. Returns (body_inspection, mechanical_inspection)."""
    schedule = db.query(InspectionSchedule).options(joinedload(InspectionSchedule.inspections)).filter(InspectionSchedule.id == schedule.id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Inspection schedule not found")
    now = datetime.now(timezone.utc)
    body_inspection = next((i for i in schedule.inspections if i.inspection_type == "body"), None)
    mechanical_inspection = next((i for i in schedule.inspections if i.inspection_type == "mechanical"), None)
    if body_inspection is None:
        body_inspection = FleetInspection(
            fleet_asset_id=schedule.fleet_asset_id,
            inspection_date=now,
            inspection_type="body",
            inspection_schedule_id=schedule.id,
            result="pending",
            created_by=user_id,
        )
        db.add(body_inspection)
        db.flush()
    if mechanical_inspection is None:
        mechanical_inspection = FleetInspection(
            fleet_asset_id=schedule.fleet_asset_id,
            inspection_date=now,
            inspection_type="mechanical",
            inspection_schedule_id=schedule.id,
            result="pending",
            created_by=user_id,
        )
        db.add(mechanical_inspection)
        db.flush()
    if schedule.status == "scheduled":
        schedule.status = "in_progress"
    db.commit()
    db.refresh(body_inspection)
    db.refresh(mechanical_inspection)
    return body_inspection, mechanical_inspection


@router.post("/inspection-schedules/{schedule_id}/start", response_model=InspectionScheduleStartResponse)
def start_inspection_schedule(
    schedule_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("inspections:write")),
):
    """Start an inspection schedule: create both inspections (body and mechanical) and mark schedule in_progress."""
    schedule = db.query(InspectionSchedule).filter(InspectionSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Inspection schedule not found")
    if schedule.status not in ("scheduled", "in_progress"):
        raise HTTPException(status_code=400, detail="Schedule already completed or cancelled")
    body_inspection, mechanical_inspection = _ensure_schedule_inspections(schedule, db, user.id)
    return InspectionScheduleStartResponse(
        body_inspection_id=body_inspection.id,
        mechanical_inspection_id=mechanical_inspection.id,
    )


@router.post("/inspection-schedules/{schedule_id}/start-body", response_model=InspectionScheduleStartBodyResponse)
def start_inspection_schedule_body(
    schedule_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("inspections:write")),
):
    """Start (open) the body/exterior inspection for this schedule. Creates it if not yet created. Redirect to inspection screen."""
    schedule = db.query(InspectionSchedule).filter(InspectionSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Inspection schedule not found")
    if schedule.status not in ("scheduled", "in_progress"):
        raise HTTPException(status_code=400, detail="Schedule already completed or cancelled")
    body_inspection, _ = _ensure_schedule_inspections(schedule, db, user.id)
    return InspectionScheduleStartBodyResponse(body_inspection_id=body_inspection.id)


@router.post("/inspection-schedules/{schedule_id}/start-mechanical", response_model=InspectionScheduleStartMechanicalResponse)
def start_inspection_schedule_mechanical(
    schedule_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("inspections:write")),
):
    """Start (open) the mechanical inspection for this schedule. Creates it if not yet created. Redirect to inspection screen."""
    schedule = db.query(InspectionSchedule).filter(InspectionSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Inspection schedule not found")
    if schedule.status not in ("scheduled", "in_progress"):
        raise HTTPException(status_code=400, detail="Schedule already completed or cancelled")
    _, mechanical_inspection = _ensure_schedule_inspections(schedule, db, user.id)
    return InspectionScheduleStartMechanicalResponse(mechanical_inspection_id=mechanical_inspection.id)


# ---------- INSPECTIONS ----------
def _mechanical_checklist_template():
    """Simple mechanical inspection checklist – essential items only."""
    return {
        "type": "mechanical",
        "sections": [
            {
                "id": "A",
                "title": "Engine & fluids",
                "items": [
                    {"key": "A1", "label": "Oil level and leaks", "category": "inspection"},
                    {"key": "A2", "label": "Coolant and hoses", "category": "inspection"},
                    {"key": "A3", "label": "Belts and tensioners", "category": "inspection"},
                ]
            },
            {
                "id": "B",
                "title": "Brakes",
                "items": [
                    {"key": "B1", "label": "Brake fluid and leaks", "category": "inspection"},
                    {"key": "B2", "label": "Pads and rotors", "category": "inspection"},
                    {"key": "B3", "label": "Parking brake", "category": "inspection"},
                ]
            },
            {
                "id": "C",
                "title": "Steering & suspension",
                "items": [
                    {"key": "C1", "label": "Steering play and linkage", "category": "inspection"},
                    {"key": "C2", "label": "Shocks and springs", "category": "inspection"},
                ]
            },
            {
                "id": "D",
                "title": "Tires & wheels",
                "items": [
                    {"key": "D1", "label": "Tire condition and inflation", "category": "inspection"},
                    {"key": "D2", "label": "Lug nuts and rims", "category": "inspection"},
                ]
            },
            {
                "id": "E",
                "title": "Safety & visibility",
                "items": [
                    {"key": "E1", "label": "Lights and signals", "category": "inspection"},
                    {"key": "E2", "label": "Mirrors and wipers", "category": "inspection"},
                    {"key": "E3", "label": "Fire extinguisher", "category": "safety"},
                ]
            },
        ],
        "metadata_fields": [
            {"key": "unit_number", "label": "Unit #", "type": "text"},
            {"key": "km", "label": "KM", "type": "number"},
            {"key": "hours", "label": "Hours", "type": "number"},
            {"key": "mechanic", "label": "Mechanic", "type": "text"},
            {"key": "date", "label": "Date", "type": "date"},
        ]
    }


def _body_checklist_template():
    """Body / exterior inspection template: areas for funilaria, pintura, etc. with issues and photos."""
    return {
        "type": "body",
        "areas": [
            {"key": "body_panels", "label": "Body panels", "description": "Dents, damage, alignment"},
            {"key": "paint", "label": "Paint", "description": "Scratches, chips, rust, fading"},
            {"key": "glass", "label": "Glass", "description": "Cracks, chips, seals"},
            {"key": "lights", "label": "Lights", "description": "Condition, moisture"},
            {"key": "bumpers", "label": "Bumpers", "description": "Damage, mounting"},
            {"key": "mirrors", "label": "Mirrors", "description": "Condition, adjustment"},
            {"key": "wheels_trim", "label": "Wheels & trim", "description": "Curb damage, missing trim"},
            {"key": "other_exterior", "label": "Other (exterior)", "description": "Other exterior notes"},
        ],
        "quote_fields": True,
        "metadata_fields": [
            {"key": "unit_number", "label": "Unit #", "type": "text"},
            {"key": "km", "label": "KM", "type": "number"},
            {"key": "inspector", "label": "Inspector", "type": "text"},
            {"key": "date", "label": "Date", "type": "date"},
        ],
    }


@router.get("/inspections/checklist-template")
def get_inspection_checklist_template(
    type: Optional[str] = Query("mechanical", description="Inspection type: mechanical (default) or body"),
):
    """
    Returns the inspection checklist template by type.
    - type=mechanical: full A-H mechanical checklist (default).
    - type=body: body/exterior areas (funilaria, pintura, etc.) with issues and quote.
    """
    if type == "body":
        return _body_checklist_template()
    return _mechanical_checklist_template()


@router.get("/inspections", response_model=List[FleetInspectionResponse])
def list_inspections(
    fleet_asset_id: Optional[uuid.UUID] = Query(None),
    result: Optional[str] = Query(None),
    result_not: Optional[str] = Query(None),
    inspection_type: Optional[str] = Query(None),  # body|mechanical
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    sort: Optional[str] = Query("inspection_date"),
    dir: Optional[str] = Query("desc"),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("inspections:read"))
):
    """List inspections with filters and sort. Returns fleet_asset_name and inspector_name for display."""
    query = db.query(FleetInspection).options(joinedload(FleetInspection.fleet_asset))
    if fleet_asset_id:
        query = query.filter(FleetInspection.fleet_asset_id == fleet_asset_id)
    if result:
        query = query.filter(FleetInspection.result == result)
    if result_not:
        query = query.filter(FleetInspection.result != result_not)
    if inspection_type:
        query = query.filter(FleetInspection.inspection_type == inspection_type)
    if start_date:
        query = query.filter(FleetInspection.inspection_date >= start_date)
    if end_date:
        query = query.filter(FleetInspection.inspection_date <= end_date)
    is_desc = (dir or "desc").lower() == "desc"
    if sort == "result":
        query = query.order_by(FleetInspection.result.desc() if is_desc else FleetInspection.result.asc())
    elif sort == "asset":
        query = query.join(FleetInspection.fleet_asset).order_by(FleetAsset.name.desc() if is_desc else FleetAsset.name.asc())
    else:
        query = query.order_by(FleetInspection.inspection_date.desc() if is_desc else FleetInspection.inspection_date.asc())
    rows = query.limit(500).all()
    return [
        FleetInspectionResponse.model_validate(r).model_copy(update={
            "fleet_asset_name": r.fleet_asset.name if r.fleet_asset else None,
            "inspector_name": get_user_display(db, r.inspector_user_id) if r.inspector_user_id else None,
        })
        for r in rows
    ]


@router.get("/inspections/{inspection_id}", response_model=FleetInspectionResponse)
def get_inspection(
    inspection_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("inspections:read"))
):
    """Get inspection detail"""
    inspection = db.query(FleetInspection).options(joinedload(FleetInspection.fleet_asset)).filter(FleetInspection.id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    out = FleetInspectionResponse.model_validate(inspection)
    return out.model_copy(update={
        "fleet_asset_name": inspection.fleet_asset.name if inspection.fleet_asset else None,
        "inspector_name": get_user_display(db, inspection.inspector_user_id) if inspection.inspector_user_id else None,
    })


@router.post("/inspections", response_model=FleetInspectionResponse)
def create_inspection(
    inspection: FleetInspectionCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("inspections:write"))
):
    """Create a new inspection (body or mechanical)."""
    data = inspection.model_dump()
    new_inspection = FleetInspection(**data, created_by=user.id)
    db.add(new_inspection)
    db.flush()
    
    # Update fleet asset's last service odometer/hours if readings are provided
    if inspection.odometer_reading is not None or inspection.hours_reading is not None:
        update_fleet_asset_last_service(
            inspection.fleet_asset_id,
            inspection.odometer_reading,
            inspection.hours_reading,
            db
        )
    
    # If inspection failed, auto-generate work order
    if inspection.result == InspectionResult.fail.value or inspection.result == "fail":
        wo = create_work_order_from_inspection(new_inspection, db, user.id)
        new_inspection.auto_generated_work_order_id = wo.id
    
    db.commit()
    db.refresh(new_inspection)
    return new_inspection


@router.put("/inspections/{inspection_id}", response_model=FleetInspectionResponse)
def update_inspection(
    inspection_id: uuid.UUID,
    inspection_update: FleetInspectionUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("inspections:write"))
):
    """Update an inspection. If result is set to fail, a work order is created automatically."""
    inspection = db.query(FleetInspection).filter(FleetInspection.id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    
    update_data = inspection_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(inspection, key, value)
    
    # Update fleet asset's last service odometer/hours if readings are provided
    if inspection_update.odometer_reading is not None or inspection_update.hours_reading is not None:
        update_fleet_asset_last_service(
            inspection.fleet_asset_id,
            inspection_update.odometer_reading,
            inspection_update.hours_reading,
            db
        )
    
    # If result changed to fail and no work order exists, create one automatically
    if inspection_update.result and (inspection_update.result == InspectionResult.fail.value or inspection_update.result == "fail") and not inspection.auto_generated_work_order_id:
        wo = create_work_order_from_inspection(inspection, db, user.id)
        inspection.auto_generated_work_order_id = wo.id
    
    # If this inspection is part of a schedule and now has a final result, check if schedule can be marked completed
    if inspection.inspection_schedule_id and inspection.result and inspection.result.lower() in ("pass", "fail", "conditional"):
        _maybe_complete_inspection_schedule(db, inspection.inspection_schedule_id)
    
    db.commit()
    db.refresh(inspection)
    return inspection


@router.post("/inspections/{inspection_id}/generate-work-order", response_model=WorkOrderResponse)
def generate_work_order_from_inspection(
    inspection_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("work_orders:write"))
):
    """Manually generate a work order from a failed inspection"""
    inspection = db.query(FleetInspection).filter(FleetInspection.id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    
    if inspection.auto_generated_work_order_id:
        # Return existing work order
        wo = db.query(WorkOrder).filter(WorkOrder.id == inspection.auto_generated_work_order_id).first()
        if wo:
            return wo
    
    # Create new work order
    wo = create_work_order_from_inspection(inspection, db, user.id)
    inspection.auto_generated_work_order_id = wo.id
    db.commit()
    db.refresh(wo)
    return wo


@router.delete("/inspections/{inspection_id}")
def delete_inspection(
    inspection_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    """Permanently delete an inspection (admin only). Unlinks any work orders that originated from it."""
    inspection = db.query(FleetInspection).filter(FleetInspection.id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    db.query(WorkOrder).filter(WorkOrder.origin_id == inspection_id).update({WorkOrder.origin_id: None})
    db.delete(inspection)
    db.commit()
    return {"message": "Inspection deleted"}


# ---------- WORK ORDERS ----------
def _work_order_order(sort: Optional[str], direction: str):
    """Return SQLAlchemy order_by clause for work orders list."""
    is_asc = (direction or "asc").lower() == "asc"
    if sort == "work_order_number":
        return WorkOrder.work_order_number.asc() if is_asc else WorkOrder.work_order_number.desc()
    if sort == "description":
        return WorkOrder.description.asc() if is_asc else WorkOrder.description.desc()
    if sort == "entity_type":
        return WorkOrder.entity_type.asc() if is_asc else WorkOrder.entity_type.desc()
    if sort == "category":
        return WorkOrder.category.asc() if is_asc else WorkOrder.category.desc()
    if sort == "urgency":
        return WorkOrder.urgency.asc() if is_asc else WorkOrder.urgency.desc()
    if sort == "status":
        return WorkOrder.status.asc() if is_asc else WorkOrder.status.desc()
    if sort == "created_at":
        return WorkOrder.created_at.asc() if is_asc else WorkOrder.created_at.desc()
    if sort == "scheduled_start_at":
        return WorkOrder.scheduled_start_at.asc().nulls_last() if is_asc else WorkOrder.scheduled_start_at.desc().nulls_first()
    return WorkOrder.created_at.desc()


@router.get("/work-orders", response_model=WorkOrderListResponse)
def list_work_orders(
    status: Optional[WorkOrderStatus] = Query(None),
    status_not: Optional[str] = Query(None),
    assigned_to: Optional[uuid.UUID] = Query(None),
    entity_type: Optional[str] = Query(None),
    entity_type_not: Optional[str] = Query(None),
    entity_id: Optional[uuid.UUID] = Query(None),
    category: Optional[str] = Query(None),
    category_not: Optional[str] = Query(None),
    urgency: Optional[str] = Query(None),
    urgency_not: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort: Optional[str] = Query(None),
    dir: Optional[str] = Query("asc"),
    page: int = Query(1, ge=1),
    limit: int = Query(15, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:access", "fleet:read", "work_orders:read"))
):
    """List work orders with filters, sort, search, and pagination."""
    offset = (page - 1) * limit
    query = db.query(WorkOrder)

    if status:
        query = query.filter(WorkOrder.status == status.value)
    if status_not:
        query = query.filter(WorkOrder.status != status_not)
    if assigned_to:
        query = query.filter(WorkOrder.assigned_to_user_id == assigned_to)
    if entity_type:
        query = query.filter(WorkOrder.entity_type == entity_type)
    if entity_type_not:
        query = query.filter(WorkOrder.entity_type != entity_type_not)
    if entity_id:
        query = query.filter(WorkOrder.entity_id == entity_id)
    if category:
        query = query.filter(WorkOrder.category == category)
    if category_not:
        query = query.filter(WorkOrder.category != category_not)
    if urgency:
        query = query.filter(WorkOrder.urgency == urgency)
    if urgency_not:
        query = query.filter(WorkOrder.urgency != urgency_not)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                WorkOrder.description.ilike(search_term),
                WorkOrder.work_order_number.ilike(search_term),
            )
        )

    order_clause = _work_order_order(sort, dir or "asc")
    query = query.order_by(order_clause)

    total = query.count()
    work_orders_list = query.offset(offset).limit(limit).all()
    total_pages = (total + limit - 1) // limit if total > 0 else 1

    items = []
    for wo in work_orders_list:
        d = WorkOrderResponse.model_validate(wo).model_dump(mode="json")
        d["assigned_to_name"] = get_user_display(db, wo.assigned_to_user_id) if wo.assigned_to_user_id else None
        items.append(d)

    return WorkOrderListResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


@router.get("/work-orders/calendar", response_model=List[WorkOrderCalendarItem])
def get_work_orders_calendar(
    start: str = Query(..., description="Start date or datetime (ISO)"),
    end: str = Query(..., description="End date or datetime (ISO)"),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:access", "fleet:read", "work_orders:read"))
):
    """List fleet work orders with scheduled_start_at in [start, end] for calendar view."""
    def _parse_calendar_param(s: str, default_time: str):
        s = (s or "").strip()
        if not s:
            raise ValueError("Empty")
        if "T" in s or " " in s:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        else:
            dt = datetime.fromisoformat(s + default_time)
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt

    try:
        start_dt = _parse_calendar_param(start, "T00:00:00")
        end_dt = _parse_calendar_param(end, "T23:59:59.999999")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid start or end date/datetime")
    # Include WOs that have scheduled_start_at, check_in_at, or created_at in range (so "scheduled" and "in service" show)
    query = (
        db.query(WorkOrder)
        .filter(WorkOrder.entity_type == "fleet")
        .filter(
            or_(
                (WorkOrder.scheduled_start_at.isnot(None)) & (WorkOrder.scheduled_start_at >= start_dt) & (WorkOrder.scheduled_start_at <= end_dt),
                (WorkOrder.check_in_at.isnot(None)) & (WorkOrder.check_in_at >= start_dt) & (WorkOrder.check_in_at <= end_dt),
                (WorkOrder.created_at >= start_dt) & (WorkOrder.created_at <= end_dt),
            )
        )
    )
    work_orders = query.order_by(WorkOrder.scheduled_start_at.asc().nulls_last(), WorkOrder.check_in_at.asc().nulls_last(), WorkOrder.created_at.asc()).all()
    out = []
    for wo in work_orders:
        asset_name = None
        unit_number = None
        work_order_type = None
        if wo.entity_type == "fleet":
            asset = db.query(FleetAsset).filter(FleetAsset.id == wo.entity_id).first()
            if asset:
                asset_name = asset.name or asset.unit_number or asset.license_plate or str(wo.entity_id)
                unit_number = getattr(asset, "unit_number", None) or getattr(asset, "name", None)
        if wo.origin_source == "inspection" and wo.origin_id:
            insp = db.query(FleetInspection).filter(FleetInspection.id == wo.origin_id).first()
            if insp and getattr(insp, "inspection_type", None) in ("body", "mechanical"):
                work_order_type = insp.inspection_type
        out.append(WorkOrderCalendarItem(
            id=wo.id,
            work_order_number=wo.work_order_number,
            entity_id=wo.entity_id,
            scheduled_start_at=wo.scheduled_start_at,
            scheduled_end_at=wo.scheduled_end_at,
            estimated_duration_minutes=wo.estimated_duration_minutes,
            status=wo.status,
            asset_name=asset_name,
            unit_number=unit_number,
            work_order_type=work_order_type,
            check_in_at=wo.check_in_at,
            check_out_at=wo.check_out_at,
            created_at=wo.created_at,
        ))
    return out


@router.get("/work-orders/{work_order_id}", response_model=WorkOrderResponse)
def get_work_order(
    work_order_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("work_orders:read"))
):
    """Get work order detail"""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    return wo


@router.get("/work-orders/{work_order_id}/activity")
def get_work_order_activity(
    work_order_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("work_orders:read"))
):
    """Get activity log for a work order (file attach/remove, status changes, cost add/remove)."""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    logs = (
        db.query(WorkOrderActivityLog)
        .filter(WorkOrderActivityLog.work_order_id == work_order_id)
        .order_by(WorkOrderActivityLog.created_at.desc())
        .all()
    )
    out = []
    for log in logs:
        entry = {
            "id": str(log.id),
            "action": log.action,
            "details": log.details or {},
            "created_at": log.created_at.isoformat() if log.created_at else None,
            "created_by": str(log.created_by) if log.created_by else None,
        }
        if log.created_by:
            entry["created_by_display"] = get_user_display(db, log.created_by)
        else:
            entry["created_by_display"] = None
        out.append(entry)
    return out


@router.post("/work-orders", response_model=WorkOrderResponse)
def create_work_order(
    work_order: WorkOrderCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("work_orders:write"))
):
    """Create a new work order"""
    wo = WorkOrder(
        work_order_number=generate_work_order_number(db),
        **work_order.dict(),
        assigned_by_user_id=user.id if work_order.assigned_to_user_id else None,
        created_by=user.id,
    )
    db.add(wo)
    db.flush()
    
    # Update fleet asset's last service odometer/hours if readings are provided and entity is fleet
    if work_order.entity_type == "fleet" and (work_order.odometer_reading is not None or work_order.hours_reading is not None):
        update_fleet_asset_last_service(
            work_order.entity_id,
            work_order.odometer_reading,
            work_order.hours_reading,
            db
        )
    
    db.commit()
    db.refresh(wo)
    return wo


@router.put("/work-orders/{work_order_id}", response_model=WorkOrderResponse)
def update_work_order(
    work_order_id: uuid.UUID,
    work_order_update: WorkOrderUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("work_orders:write"))
):
    """Update a work order"""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")

    old_status = wo.status
    old_costs = (wo.costs or {}).copy()
    if isinstance(old_costs.get("labor"), list):
        old_costs["labor"] = list(wo.costs.get("labor") or [])
    if isinstance(old_costs.get("parts"), list):
        old_costs["parts"] = list(wo.costs.get("parts") or [])
    if isinstance(old_costs.get("other"), list):
        old_costs["other"] = list(wo.costs.get("other") or [])

    update_data = work_order_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(wo, key, value)

    # Update fleet asset's last service odometer/hours if readings are provided and entity is fleet
    if wo.entity_type == "fleet" and (work_order_update.odometer_reading is not None or work_order_update.hours_reading is not None):
        update_fleet_asset_last_service(
            wo.entity_id,
            work_order_update.odometer_reading,
            work_order_update.hours_reading,
            db
        )

    # If status changed to closed, set closed_at
    if work_order_update.status == WorkOrderStatus.closed and not wo.closed_at:
        wo.closed_at = datetime.now(timezone.utc)

    wo.updated_at = datetime.now(timezone.utc)

    # Activity log: status change
    if "status" in update_data and wo.status != old_status:
        _log_work_order_activity(
            db, work_order_id, "status_changed",
            details={"old_status": old_status, "new_status": wo.status},
            created_by=user.id,
        )

    # Activity log: cost add/remove (diff old_costs vs wo.costs)
    if "costs" in update_data and wo.costs:
        new_costs = wo.costs
        for category in ("labor", "parts", "other"):
            old_list = old_costs.get(category)
            new_list = new_costs.get(category) if isinstance(new_costs.get(category), list) else []
            if not isinstance(old_list, list):
                old_list = []
            old_by_desc = {(item.get("description"), item.get("amount")): item for item in old_list}
            new_by_desc = {(item.get("description"), item.get("amount")): item for item in new_list}
            for k, item in new_by_desc.items():
                if k not in old_by_desc:
                    _log_work_order_activity(
                        db, work_order_id, "cost_added",
                        details={"category": category, "description": item.get("description"), "amount": item.get("amount")},
                        created_by=user.id,
                    )
            for k, item in old_by_desc.items():
                if k not in new_by_desc:
                    _log_work_order_activity(
                        db, work_order_id, "cost_removed",
                        details={"category": category, "description": item.get("description"), "amount": item.get("amount")},
                        created_by=user.id,
                    )

    db.commit()
    db.refresh(wo)
    return wo


@router.put("/work-orders/{work_order_id}/status", response_model=WorkOrderResponse)
def update_work_order_status(
    work_order_id: uuid.UUID,
    status: WorkOrderStatus = Body(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("work_orders:write"))
):
    """Update work order status"""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")

    old_status = wo.status
    wo.status = status.value
    if status == WorkOrderStatus.closed and not wo.closed_at:
        wo.closed_at = datetime.now(timezone.utc)
    wo.updated_at = datetime.now(timezone.utc)

    _log_work_order_activity(
        db, work_order_id, "status_changed",
        details={"old_status": old_status, "new_status": wo.status},
        created_by=user.id,
    )

    db.commit()
    db.refresh(wo)
    return wo


@router.put("/work-orders/{work_order_id}/check-in", response_model=WorkOrderResponse)
def work_order_check_in(
    work_order_id: uuid.UUID,
    body: dict = Body(default_factory=dict),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("work_orders:write"))
):
    """Register vehicle check-in (entrada). Sets check_in_at, optional scheduled_end_at (expected completion date)/odometer/hours, and status to in_progress."""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    if body.get("estimated_duration_minutes") is not None:
        wo.estimated_duration_minutes = int(body["estimated_duration_minutes"])
    scheduled_end_at = body.get("scheduled_end_at")
    if scheduled_end_at is not None:
        try:
            raw = str(scheduled_end_at).strip()
            if "T" in raw or " " in raw:
                wo.scheduled_end_at = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            else:
                wo.scheduled_end_at = datetime.fromisoformat(raw + "T23:59:59")
            if wo.scheduled_end_at.tzinfo is None:
                wo.scheduled_end_at = wo.scheduled_end_at.replace(tzinfo=timezone.utc)
        except Exception:
            pass  # keep existing if parse fails
    check_in_at = body.get("check_in_at")
    if check_in_at is not None:
        wo.check_in_at = (
            datetime.fromisoformat(str(check_in_at).replace("Z", "+00:00"))
            if isinstance(check_in_at, str) else check_in_at
        )
        if wo.check_in_at.tzinfo is None:
            wo.check_in_at = wo.check_in_at.replace(tzinfo=timezone.utc)
    else:
        wo.check_in_at = datetime.now(timezone.utc)
    old_status = wo.status
    if wo.status == "open":
        wo.status = "in_progress"
    if body.get("odometer_reading") is not None:
        wo.odometer_reading = int(body["odometer_reading"])
    if body.get("hours_reading") is not None:
        wo.hours_reading = float(body["hours_reading"])
    if wo.entity_type == "fleet" and (body.get("odometer_reading") is not None or body.get("hours_reading") is not None):
        update_fleet_asset_last_service(
            wo.entity_id,
            int(body["odometer_reading"]) if body.get("odometer_reading") is not None else None,
            float(body["hours_reading"]) if body.get("hours_reading") is not None else None,
            db,
        )
    wo.updated_at = datetime.now(timezone.utc)

    if old_status != wo.status:
        _log_work_order_activity(
            db, work_order_id, "status_changed",
            details={"old_status": old_status, "new_status": wo.status},
            created_by=user.id,
        )

    db.commit()
    db.refresh(wo)
    return wo


@router.put("/work-orders/{work_order_id}/check-out", response_model=WorkOrderResponse)
def work_order_check_out(
    work_order_id: uuid.UUID,
    body: dict = Body(default_factory=dict),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("work_orders:write"))
):
    """Register vehicle check-out (saída). Sets check_out_at, status to closed, and optional odometer/hours."""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    old_status = wo.status
    wo.status = "closed"
    if not wo.closed_at:
        wo.closed_at = datetime.now(timezone.utc)
    check_out_at = body.get("check_out_at")
    if check_out_at is not None:
        wo.check_out_at = (
            datetime.fromisoformat(str(check_out_at).replace("Z", "+00:00"))
            if isinstance(check_out_at, str) else check_out_at
        )
        if wo.check_out_at.tzinfo is None:
            wo.check_out_at = wo.check_out_at.replace(tzinfo=timezone.utc)
    else:
        wo.check_out_at = datetime.now(timezone.utc)
    if body.get("odometer_reading") is not None:
        wo.odometer_reading = int(body["odometer_reading"])
    if body.get("hours_reading") is not None:
        wo.hours_reading = float(body["hours_reading"])
    if wo.entity_type == "fleet" and (body.get("odometer_reading") is not None or body.get("hours_reading") is not None):
        update_fleet_asset_last_service(
            wo.entity_id,
            int(body["odometer_reading"]) if body.get("odometer_reading") is not None else None,
            float(body["hours_reading"]) if body.get("hours_reading") is not None else None,
            db,
        )
    wo.updated_at = datetime.now(timezone.utc)

    if old_status != wo.status:
        _log_work_order_activity(
            db, work_order_id, "status_changed",
            details={"old_status": old_status, "new_status": wo.status},
            created_by=user.id,
        )

    db.commit()
    db.refresh(wo)
    return wo


@router.put("/work-orders/{work_order_id}/assign", response_model=WorkOrderResponse)
def assign_work_order(
    work_order_id: uuid.UUID,
    assigned_to: uuid.UUID = Body(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("work_orders:assign"))
):
    """Assign work order to a user"""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    wo.assigned_to_user_id = assigned_to
    wo.assigned_by_user_id = user.id
    wo.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(wo)
    return wo


@router.delete("/work-orders/{work_order_id}")
def delete_work_order(
    work_order_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    """Permanently delete a work order (admin only)."""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    db.delete(wo)
    db.commit()
    return {"message": "Work order deleted"}


# Work order file categories (same idea as project files)
WORK_ORDER_FILE_CATEGORIES = ("orcamentos", "photos", "invoices", "outros")


def _log_work_order_activity(
    db: Session,
    work_order_id: uuid.UUID,
    action: str,
    details: Optional[dict] = None,
    created_by: Optional[uuid.UUID] = None,
) -> None:
    """Append an activity log entry for a work order."""
    entry = WorkOrderActivityLog(
        work_order_id=work_order_id,
        action=action,
        details=details,
        created_by=created_by,
    )
    db.add(entry)


def _work_order_file_item(worf: WorkOrderFile, fo: FileObject) -> dict:
    ct = getattr(fo, "content_type", None) or ""
    name = worf.original_name or fo.key or ""
    ext = (name.rsplit(".", 1)[-1] if "." in name else "").lower()
    is_img_ext = ext in {"png", "jpg", "jpeg", "webp", "gif", "bmp", "heic", "heif"}
    is_image = ct.startswith("image/") or is_img_ext
    return {
        "id": str(worf.id),
        "file_object_id": str(worf.file_object_id),
        "category": worf.category,
        "original_name": worf.original_name,
        "uploaded_at": fo.created_at.isoformat() if fo.created_at else None,
        "content_type": ct or None,
        "is_image": is_image,
        "is_legacy": False,
    }


@router.get("/work-orders/{work_order_id}/files")
def list_work_order_files(
    work_order_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("fleet:access")),
):
    """List files attached to the work order. Includes WorkOrderFile rows plus legacy documents/photos from the work order."""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    out = []
    # New table
    worfs = db.query(WorkOrderFile).filter(WorkOrderFile.work_order_id == work_order_id).order_by(WorkOrderFile.created_at.desc()).all()
    for worf in worfs:
        fo = db.query(FileObject).filter(FileObject.id == worf.file_object_id).first()
        if fo:
            out.append(_work_order_file_item(worf, fo))
    # Legacy: work_order.documents (flat list of file_object_ids) and work_order.photos (list or { before, after })
    legacy_doc_ids = list(wo.documents or [])
    legacy_photo_ids = []
    if wo.photos:
        if isinstance(wo.photos, list):
            legacy_photo_ids = [str(x) for x in wo.photos]
        elif isinstance(wo.photos, dict):
            for v in (wo.photos.get("before") or [], wo.photos.get("after") or []):
                legacy_photo_ids.extend([str(x) for x in (v if isinstance(v, list) else [])])
    seen_fids = {item["file_object_id"] for item in out}
    for fid in legacy_doc_ids:
        fid_str = str(fid)
        if fid_str in seen_fids:
            continue
        fo = db.query(FileObject).filter(FileObject.id == fid).first()
        if not fo:
            continue
        seen_fids.add(fid_str)
        ct = getattr(fo, "content_type", None) or ""
        name = getattr(fo, "key", "") or ""
        ext = (name.rsplit(".", 1)[-1] if "." in name else "").lower()
        is_image = (ct or "").startswith("image/") or ext in {"png", "jpg", "jpeg", "webp", "gif", "bmp", "heic", "heif"}
        out.append({
            "id": f"legacy-{fid_str}",
            "file_object_id": fid_str,
            "category": "outros",
            "original_name": None,
            "uploaded_at": fo.created_at.isoformat() if fo.created_at else None,
            "content_type": ct or None,
            "is_image": is_image,
            "is_legacy": True,
        })
    for fid in legacy_photo_ids:
        try:
            fid_uuid = uuid.UUID(fid)
        except ValueError:
            continue
        if fid in seen_fids:
            continue
        fo = db.query(FileObject).filter(FileObject.id == fid_uuid).first()
        if not fo:
            continue
        seen_fids.add(fid)
        ct = getattr(fo, "content_type", None) or ""
        out.append({
            "id": f"legacy-{fid}",
            "file_object_id": fid,
            "category": "photos",
            "original_name": None,
            "uploaded_at": fo.created_at.isoformat() if fo.created_at else None,
            "content_type": ct or None,
            "is_image": True,
            "is_legacy": True,
        })
    return out


@router.post("/work-orders/{work_order_id}/files")
def attach_work_order_file(
    work_order_id: uuid.UUID,
    file_object_id: str = Query(..., description="File object ID from upload+confirm"),
    category: str = Query(..., description="orcamentos | photos | invoices | outros"),
    original_name: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("fleet:access")),
):
    if category not in WORK_ORDER_FILE_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"category must be one of: {WORK_ORDER_FILE_CATEGORIES}")
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    try:
        fo_id = uuid.UUID(file_object_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file_object_id")
    fo = db.query(FileObject).filter(FileObject.id == fo_id).first()
    if not fo:
        raise HTTPException(status_code=404, detail="File not found")
    row = WorkOrderFile(work_order_id=work_order_id, file_object_id=fo_id, category=category, original_name=original_name, created_by=user.id)
    db.add(row)
    _log_work_order_activity(
        db, work_order_id, "file_attached",
        details={"category": category, "original_name": original_name or fo.original_name},
        created_by=user.id,
    )
    db.commit()
    db.refresh(row)
    fo = db.query(FileObject).filter(FileObject.id == fo_id).first()
    return _work_order_file_item(row, fo) if fo else {"id": str(row.id), "file_object_id": file_object_id, "category": category, "original_name": original_name, "is_legacy": False}


@router.put("/work-orders/{work_order_id}/files/{file_id}")
def update_work_order_file(
    work_order_id: uuid.UUID,
    file_id: uuid.UUID,
    category: Optional[str] = Query(None),
    original_name: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("fleet:access")),
):
    worf = db.query(WorkOrderFile).filter(WorkOrderFile.id == file_id, WorkOrderFile.work_order_id == work_order_id).first()
    if not worf:
        raise HTTPException(status_code=404, detail="File not found")
    if category is not None and category not in WORK_ORDER_FILE_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"category must be one of: {WORK_ORDER_FILE_CATEGORIES}")
    if category is not None:
        worf.category = category
    if original_name is not None:
        worf.original_name = original_name
    db.commit()
    db.refresh(worf)
    fo = db.query(FileObject).filter(FileObject.id == worf.file_object_id).first()
    return _work_order_file_item(worf, fo) if fo else {"id": str(worf.id), "file_object_id": str(worf.file_object_id), "category": worf.category, "original_name": worf.original_name, "is_legacy": False}


@router.delete("/work-orders/{work_order_id}/files/legacy/{file_object_id}")
def delete_work_order_legacy_file(
    work_order_id: uuid.UUID,
    file_object_id: uuid.UUID,
    category: str = Query(..., description="outros | photos"),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("fleet:access")),
):
    """Remove a file from legacy work_order.documents or work_order.photos."""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    fid_str = str(file_object_id)
    if category == "outros" and wo.documents:
        docs = [str(x) for x in wo.documents]
        if fid_str in docs:
            wo.documents = [x for x in wo.documents if str(x) != fid_str]
            _log_work_order_activity(db, work_order_id, "file_removed", details={"category": "outros", "file_object_id": fid_str}, created_by=user.id)
            db.commit()
            return {"message": "File removed"}
    if category == "photos" and wo.photos:
        if isinstance(wo.photos, list):
            wo.photos = [x for x in wo.photos if str(x) != fid_str]
        else:
            before = [x for x in (wo.photos.get("before") or []) if str(x) != fid_str]
            after = [x for x in (wo.photos.get("after") or []) if str(x) != fid_str]
            wo.photos = {"before": before, "after": after}
        _log_work_order_activity(db, work_order_id, "file_removed", details={"category": "photos", "file_object_id": fid_str}, created_by=user.id)
        db.commit()
        return {"message": "File removed"}
    raise HTTPException(status_code=404, detail="File not found")


@router.delete("/work-orders/{work_order_id}/files/{file_id}")
def delete_work_order_file(
    work_order_id: uuid.UUID,
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("fleet:access")),
):
    worf = db.query(WorkOrderFile).filter(WorkOrderFile.id == file_id, WorkOrderFile.work_order_id == work_order_id).first()
    if worf:
        details = {"category": worf.category, "original_name": worf.original_name}
        _log_work_order_activity(db, work_order_id, "file_removed", details=details, created_by=user.id)
        db.delete(worf)
        db.commit()
        return {"message": "File removed"}
    raise HTTPException(status_code=404, detail="File not found")

