import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from sqlalchemy import or_, and_, func, case, cast, BigInteger

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session, joinedload

from ..db import get_db
from ..auth.security import get_current_user, require_permissions
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
    WorkOrder,
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
    FleetInspectionCreate,
    FleetInspectionUpdate,
    FleetInspectionResponse,
    WorkOrderCreate,
    WorkOrderUpdate,
    WorkOrderResponse,
    WorkOrderListResponse,
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
    """Create a work order automatically from a failed inspection"""
    wo = WorkOrder(
        work_order_number=generate_work_order_number(db),
        entity_type="fleet",
        entity_id=inspection.fleet_asset_id,
        description=f"Work order generated from failed inspection on {inspection.inspection_date.strftime('%Y-%m-%d')}",
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
    
    # Inspections due (within next 30 days or overdue)
    today = datetime.now(timezone.utc)
    thirty_days_ago = today - timedelta(days=30)
    # Get assets that haven't been inspected in the last 30 days
    # Get all assets and check which ones need inspection
    all_assets = db.query(FleetAsset).filter(FleetAsset.status != "retired").all()
    assets_needing_inspection = []
    for asset in all_assets[:20]:  # Limit to first 20 for performance
        last_inspection = db.query(FleetInspection).filter(
            FleetInspection.fleet_asset_id == asset.id
        ).order_by(FleetInspection.inspection_date.desc()).first()
        if not last_inspection or last_inspection.inspection_date < thirty_days_ago:
            assets_needing_inspection.append(asset)
        if len(assets_needing_inspection) >= 10:
            break
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
    
    return FleetDashboardResponse(
        total_fleet_assets=total_fleet,
        total_vehicles=total_vehicles,
        total_heavy_machinery=total_heavy_machinery,
        total_other_assets=total_other,
        assigned_now_count=assigned_now_count,
        inspections_due_count=len(inspections_due),
        inspections_due=inspections_due,
        open_work_orders_count=open_wos,
        in_progress_work_orders_count=in_progress_wos,
        pending_parts_work_orders_count=pending_parts_wos,
        overdue_equipment_count=len(overdue_equipment),
        overdue_equipment=overdue_equipment,
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


# ---------- INSPECTIONS ----------
@router.get("/inspections/checklist-template")
def get_inspection_checklist_template():
    """
    Returns the complete inspection checklist template based on company standards.
    This template includes all sections and items that need to be inspected.
    """
    return {
        "sections": [
            {
                "id": "A",
                "title": "Engine",
                "items": [
                    {"key": "A1", "label": "Change oil and filter", "category": "maintenance"},
                    {"key": "A2", "label": "Change fuel lines and tank cap", "category": "maintenance"},
                    {"key": "A3", "label": "Check fuel filter (25,000 mil)", "category": "inspection"},
                    {"key": "A4", "label": "Check air filter if needed", "category": "inspection"},
                    {"key": "A5", "label": "Check all hoses under pressure", "category": "inspection"},
                    {"key": "A6", "label": "Check all belts & tensioners", "category": "inspection"},
                    {"key": "A7", "label": "Check water pump and fan bearing", "category": "inspection"},
                    {"key": "A8", "label": "Check complete exhaust system", "category": "inspection"},
                    {"key": "A9", "label": "Check for engine oil leaks", "category": "inspection"},
                ]
            },
            {
                "id": "B",
                "title": "Under The Hood Fluid Levels",
                "items": [
                    {"key": "B1", "label": "Radiator- note strength", "category": "inspection"},
                    {"key": "B2", "label": "Brake", "category": "inspection"},
                    {"key": "B3", "label": "Steering", "category": "inspection"},
                    {"key": "B4", "label": "Windshield washer", "category": "inspection"},
                    {"key": "B5", "label": "Automatic transmission", "category": "inspection"},
                    {"key": "B6", "label": "Rear end fluid", "category": "inspection"},
                    {"key": "B7", "label": "Check AC (blows cold)", "category": "inspection"},
                ]
            },
            {
                "id": "C",
                "title": "Chassis",
                "items": [
                    {"key": "C1", "label": "Check steering play", "category": "inspection"},
                    {"key": "C2", "label": "Check power steering hose", "category": "inspection"},
                    {"key": "C3", "label": "Check steering pitman arm, drag link & idler arm", "category": "inspection"},
                    {"key": "C4", "label": "Check tie rod ends", "category": "inspection"},
                    {"key": "C5", "label": "Check front springs", "category": "inspection"},
                    {"key": "C6", "label": "Check front shocks", "category": "inspection"},
                    {"key": "C7", "label": "Check ball joints", "category": "inspection"},
                    {"key": "C8", "label": "Check rear springs", "category": "inspection"},
                    {"key": "C9", "label": "Check rear shocks", "category": "inspection"},
                    {"key": "C10", "label": "Check bell housing bolts", "category": "inspection"},
                    {"key": "C11", "label": "Check transmission mounts", "category": "inspection"},
                    {"key": "C12", "label": "Check U-joints & grease", "category": "maintenance"},
                    {"key": "C13", "label": "Check carrier bearings", "category": "inspection"},
                    {"key": "C14", "label": "Check slip joint & grease", "category": "maintenance"},
                    {"key": "C15", "label": "Check wheels and axle seals", "category": "inspection"},
                ]
            },
            {
                "id": "E",
                "title": "Brakes",
                "items": [
                    {"key": "E1", "label": "Check for fluid leaks", "category": "inspection"},
                    {"key": "E2", "label": "Check front pads & rotors", "category": "inspection"},
                    {"key": "E3", "label": "Check rear brakes & adjustment", "category": "inspection"},
                    {"key": "E4", "label": "Check parking brake operation", "category": "inspection"},
                ]
            },
            {
                "id": "F",
                "title": "Drivability Checks",
                "items": [
                    {"key": "F1", "label": "Check window glass and operation", "category": "inspection"},
                    {"key": "F2", "label": "Check emergency exits", "category": "inspection"},
                    {"key": "F3", "label": "Check mirrors", "category": "inspection"},
                    {"key": "F4", "label": "Check wiper blades", "category": "inspection"},
                    {"key": "F5", "label": "Check if washer fluid sprays", "category": "inspection"},
                    {"key": "F6", "label": "Check heater & AC fans", "category": "inspection"},
                    {"key": "F7", "label": "Check accelerator & linkage", "category": "inspection"},
                    {"key": "F8", "label": "Check fuel tank & mounting", "category": "inspection"},
                    {"key": "F9", "label": "Check tire condition & match", "category": "inspection"},
                    {"key": "F10", "label": "Check tire rims & lug nuts", "category": "inspection"},
                    {"key": "F11", "label": "Check tire inflation", "category": "inspection"},
                    {"key": "F12", "label": "Check mud flaps", "category": "inspection"},
                ]
            },
            {
                "id": "G",
                "title": "Safety / Emergency Items",
                "items": [
                    {"key": "G1", "label": "Fire extinguisher", "category": "safety"},
                    {"key": "G2", "label": "First aid kit", "category": "safety"},
                    {"key": "G3", "label": "Operating flashlight", "category": "safety"},
                    {"key": "G4", "label": "Reflective triangles", "category": "safety"},
                    {"key": "G5", "label": "Ice scraper (season applicable)", "category": "safety"},
                    {"key": "G6", "label": "Blanket", "category": "safety"},
                    {"key": "G7", "label": "Toolkit", "category": "safety"},
                ]
            },
            {
                "id": "H",
                "title": "Wrap-Up",
                "items": [
                    {"key": "H1", "label": "Check for leaks", "category": "inspection"},
                    {"key": "H2", "label": "Recheck oil level", "category": "inspection"},
                    {"key": "H3", "label": "Wash engine & chassis if applicable", "category": "maintenance"},
                    {"key": "H4", "label": "Install next PM due mileage in pocket", "category": "maintenance"},
                    {"key": "H5", "label": "Note any other repairs needed", "category": "notes"},
                ]
            }
        ],
        "status_options": [
            {"value": "inspected", "label": "Inspected"},
            {"value": "okay", "label": "Okay"},
            {"value": "repaired_adjusted", "label": "Repaired & Adjusted"},
            {"value": "greased_lubed", "label": "Greased & Lubed"},
        ],
        "metadata_fields": [
            {"key": "unit_number", "label": "Unit #", "type": "text"},
            {"key": "km", "label": "KM", "type": "number"},
            {"key": "hours", "label": "Hours", "type": "number"},
            {"key": "mechanic", "label": "Mechanic", "type": "text"},
            {"key": "date", "label": "Date", "type": "date"},
            {"key": "next_pm_due", "label": "Next PM Due On", "type": "date"},
        ]
    }


@router.get("/inspections", response_model=List[FleetInspectionResponse])
def list_inspections(
    fleet_asset_id: Optional[uuid.UUID] = Query(None),
    result: Optional[str] = Query(None),
    result_not: Optional[str] = Query(None),
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
    inspection = db.query(FleetInspection).filter(FleetInspection.id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    return inspection


@router.post("/inspections", response_model=FleetInspectionResponse)
def create_inspection(
    inspection: FleetInspectionCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("inspections:write"))
):
    """Create a new inspection"""
    new_inspection = FleetInspection(**inspection.dict(), created_by=user.id)
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
    _=Depends(require_permissions("inspections:write"))
):
    """Update an inspection"""
    inspection = db.query(FleetInspection).filter(FleetInspection.id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    
    update_data = inspection_update.dict(exclude_unset=True)
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
    
    # If result changed to fail and no work order exists, create one
    if inspection_update.result and (inspection_update.result == InspectionResult.fail.value or inspection_update.result == "fail") and not inspection.auto_generated_work_order_id:
        # Get current user from dependency - we'll need to pass it
        # For now, use created_by from inspection
        wo = create_work_order_from_inspection(inspection, db, inspection.created_by)
        inspection.auto_generated_work_order_id = wo.id
    
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
    _=Depends(require_permissions("work_orders:write"))
):
    """Update a work order"""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
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
    db.commit()
    db.refresh(wo)
    return wo


@router.put("/work-orders/{work_order_id}/status", response_model=WorkOrderResponse)
def update_work_order_status(
    work_order_id: uuid.UUID,
    status: WorkOrderStatus = Body(...),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("work_orders:write"))
):
    """Update work order status"""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    wo.status = status.value
    if status == WorkOrderStatus.closed and not wo.closed_at:
        wo.closed_at = datetime.now(timezone.utc)
    wo.updated_at = datetime.now(timezone.utc)
    
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
def cancel_work_order(
    work_order_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("work_orders:write"))
):
    """Cancel a work order"""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    wo.status = "cancelled"
    wo.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Work order cancelled successfully"}

