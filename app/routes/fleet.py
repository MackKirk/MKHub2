import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy import or_, and_, func, case, cast, BigInteger

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session, joinedload

from ..db import get_db
from ..auth.security import get_current_user, require_permissions, require_roles
from ..services.permissions import is_admin
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
    AuditLog,
)
from ..services.audit import compute_diff
from ..services.fleet_audit import (
    audit_fleet,
    snapshot_fleet_asset,
    snapshot_equipment,
    snapshot_work_order,
    snapshot_work_order_flow,
    snapshot_inspection_schedule,
    snapshot_fleet_inspection,
    snapshot_compliance,
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
    WorkOrderStatusUpdateRequest,
    WorkOrderCheckInRequest,
    WorkOrderCheckOutRequest,
    WorkOrderReopenRequest,
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
    type_label = "Body" if insp_type == "body" else "Mechanical"
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
    _log_work_order_activity(
        db,
        wo.id,
        "work_order_created_from_inspection",
        details={
            "inspection_id": str(inspection.id) if getattr(inspection, "id", None) else None,
            "inspection_type": insp_type,
            "inspection_result": getattr(inspection, "result", None),
            "work_order_number": wo.work_order_number,
        },
        created_by=user_id,
    )
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


WORK_ORDER_PENDING_STATUS = WorkOrderStatus.open.value
WORK_ORDER_FINISHED_STATUS = WorkOrderStatus.closed.value
MANUAL_WORK_ORDER_TRANSITIONS: Dict[str, set[str]] = {
    WorkOrderStatus.open.value: {
        WorkOrderStatus.not_approved.value,
        WorkOrderStatus.cancelled.value,
    },
    WorkOrderStatus.in_progress.value: {
        WorkOrderStatus.pending_parts.value,
        WorkOrderStatus.cancelled.value,
    },
    WorkOrderStatus.pending_parts.value: {
        WorkOrderStatus.in_progress.value,
        WorkOrderStatus.cancelled.value,
    },
}


def _normalize_reason(reason: Optional[str]) -> Optional[str]:
    if reason is None:
        return None
    txt = reason.strip()
    return txt or None


def _assert_manual_status_transition_allowed(current_status: str, target_status: str, reason: Optional[str]) -> None:
    if target_status == current_status:
        return
    allowed_targets = MANUAL_WORK_ORDER_TRANSITIONS.get(current_status, set())
    if target_status not in allowed_targets:
        raise HTTPException(
            status_code=409,
            detail=f"Invalid manual status transition: {current_status} -> {target_status}",
        )
    if target_status == WorkOrderStatus.cancelled.value and not _normalize_reason(reason):
        raise HTTPException(status_code=400, detail="Cancellation reason is required")


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


def _fleet_asset_json_file_id_list(value: Any) -> Any:
    """JSON columns cannot serialize uuid.UUID; persist file_object ids as strings."""
    if value is None:
        return None
    if isinstance(value, list):
        return [str(x) for x in value]
    return value


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
    if 'photos' in data:
        data['photos'] = _fleet_asset_json_file_id_list(data.get('photos'))
    if 'documents' in data:
        data['documents'] = _fleet_asset_json_file_id_list(data.get('documents'))
    new_asset = FleetAsset(**data, created_by=user.id)
    db.add(new_asset)
    db.commit()
    db.refresh(new_asset)
    audit_fleet(
        db,
        user,
        entity_type="fleet_asset",
        entity_id=new_asset.id,
        action="CREATE",
        changes_json={"after": snapshot_fleet_asset(new_asset)},
        context={"fleet_asset_id": str(new_asset.id)},
    )
    return new_asset


@router.put("/assets/{asset_id}", response_model=FleetAssetResponse)
def update_fleet_asset(
    asset_id: uuid.UUID,
    asset_update: FleetAssetUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("fleet:write")),
):
    """Update a fleet asset"""
    asset = db.query(FleetAsset).filter(FleetAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Fleet asset not found")

    before = snapshot_fleet_asset(asset)
    update_data = asset_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        if key in ('photos', 'documents'):
            value = _fleet_asset_json_file_id_list(value)
        setattr(asset, key, value)
    asset.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(asset)
    after = snapshot_fleet_asset(asset)
    diff = compute_diff(before, after)
    if diff:
        audit_fleet(
            db,
            user,
            entity_type="fleet_asset",
            entity_id=asset.id,
            action="UPDATE",
            changes_json={"before": before, "after": after},
            context={"fleet_asset_id": str(asset.id), "changed_fields": list(diff.keys())},
        )
    return asset


@router.delete("/assets/{asset_id}")
def delete_fleet_asset(
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("fleet:write")),
):
    """Delete a fleet asset (soft delete by setting status to retired)"""
    asset = db.query(FleetAsset).filter(FleetAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Fleet asset not found")

    before = snapshot_fleet_asset(asset)
    asset.status = "retired"
    asset.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(asset)
    audit_fleet(
        db,
        user,
        entity_type="fleet_asset",
        entity_id=asset.id,
        action="UPDATE",
        changes_json={"before": before, "after": snapshot_fleet_asset(asset), "soft_delete": True},
        context={"fleet_asset_id": str(asset.id), "note": "status set to retired"},
    )
    return {"message": "Fleet asset deleted successfully"}


@router.get("/assets/{asset_id}/inspections", response_model=List[FleetInspectionResponse])
def get_asset_inspections(
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:read"))
):
    """Get inspections for a fleet asset (same response shape as list inspections, including inspector_name)."""
    rows = (
        db.query(FleetInspection)
        .filter(FleetInspection.fleet_asset_id == asset_id)
        .order_by(FleetInspection.inspection_date.desc())
        .all()
    )
    return [
        FleetInspectionResponse.model_validate(r).model_copy(
            update={
                "inspector_name": get_user_display(db, r.inspector_user_id) if r.inspector_user_id else None,
            }
        )
        for r in rows
    ]


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


def _fleet_audit_ctx_for_work_order(wo: WorkOrder, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Audit context for work orders; includes fleet_asset_id when the WO is tied to a fleet asset."""
    ctx: Dict[str, Any] = dict(extra or ())
    wn = getattr(wo, "work_order_number", None)
    if wn is not None and "work_order_number" not in ctx:
        ctx["work_order_number"] = wn
    if getattr(wo, "entity_type", None) == "fleet" and getattr(wo, "entity_id", None):
        ctx["fleet_asset_id"] = str(wo.entity_id)
    return ctx


@router.get("/assets/{asset_id}/history")
def get_fleet_asset_history(
    asset_id: uuid.UUID,
    limit: int = Query(300, ge=1, le=500),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:read")),
):
    """
    Unified timeline: assignments (when no matching assignment audit), fleet_logs,
    and audit logs for this asset (edits, inspections, schedules, compliance, work orders, files).
    """
    asset = db.query(FleetAsset).filter(FleetAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Fleet asset not found")

    aid_str = str(asset_id)
    wo_ids = [
        row[0]
        for row in db.query(WorkOrder.id)
        .filter(WorkOrder.entity_type == "fleet", WorkOrder.entity_id == asset_id)
        .all()
    ]

    try:
        bind = db.get_bind()
        dialect = getattr(bind.dialect, "name", "") or ""
    except Exception:
        dialect = ""

    fleet_entity_match = and_(AuditLog.entity_type == "fleet_asset", AuditLog.entity_id == asset_id)
    audit_parts = [fleet_entity_match]
    if dialect == "postgresql":
        audit_parts.append(AuditLog.context.op("->>")("fleet_asset_id") == aid_str)
        if wo_ids:
            audit_parts.append(and_(AuditLog.entity_type == "work_order", AuditLog.entity_id.in_(wo_ids)))
            audit_parts.append(
                and_(
                    AuditLog.entity_type == "work_order_file",
                    AuditLog.context.op("->>")("work_order_id").in_([str(w) for w in wo_ids]),
                )
            )
    else:
        fleet_ctx = func.json_extract(AuditLog.context, "$.fleet_asset_id")
        audit_parts.append(fleet_ctx == aid_str)
        if wo_ids:
            wos = [str(w) for w in wo_ids]
            audit_parts.append(and_(AuditLog.entity_type == "work_order", AuditLog.entity_id.in_(wo_ids)))
            wof_wo = func.json_extract(AuditLog.context, "$.work_order_id")
            audit_parts.append(and_(AuditLog.entity_type == "work_order_file", wof_wo.in_(wos)))

    audit_rows = (
        db.query(AuditLog)
        .filter(or_(*audit_parts))
        .order_by(AuditLog.timestamp_utc.desc())
        .limit(450)
        .all()
    )
    audit_assignment_ids = {
        str(row.entity_id) for row in audit_rows if (row.entity_type or "") == "asset_assignment"
    }

    items: List[dict] = []

    assignments = (
        db.query(AssetAssignment)
        .filter(
            AssetAssignment.fleet_asset_id == asset_id,
            AssetAssignment.target_type == "fleet",
        )
        .order_by(AssetAssignment.assigned_at.desc())
        .all()
    )
    has_assignments = len(assignments) > 0

    for a in assignments:
        if str(a.id) in audit_assignment_ids:
            continue
        assignee = (a.assigned_to_name or "").strip() or (
            get_user_display(db, a.assigned_to_user_id) if a.assigned_to_user_id else "Unknown"
        )
        items.append(
            {
                "id": f"assign-out-{a.id}",
                "source": "assignment",
                "kind": "checkout",
                "title": "Checked out",
                "subtitle": f"Assigned to {assignee}",
                "detail": None,
                "occurred_at": a.assigned_at.isoformat() if a.assigned_at else "",
                "actor_id": None,
                "actor_name": None,
                "assignment_id": str(a.id),
                "log_subtype": "assign",
                "audit_action": None,
                "changes_json": None,
            }
        )
        if a.returned_at:
            items.append(
                {
                    "id": f"assign-in-{a.id}",
                    "source": "assignment",
                    "kind": "return",
                    "title": "Returned",
                    "subtitle": f"Previously with {assignee}",
                    "detail": None,
                    "occurred_at": a.returned_at.isoformat() if a.returned_at else "",
                    "actor_id": None,
                    "actor_name": None,
                    "assignment_id": str(a.id),
                    "log_subtype": "return",
                    "audit_action": None,
                    "changes_json": None,
                }
            )

    for row in audit_rows:
        items.append(
            {
                "id": f"audit-{row.id}",
                "source": "audit",
                "kind": (row.action or "audit").lower(),
                "title": (row.entity_type or "audit").replace("_", " "),
                "subtitle": None,
                "detail": None,
                "occurred_at": row.timestamp_utc.isoformat() if row.timestamp_utc else "",
                "actor_id": str(row.actor_id) if row.actor_id else None,
                "actor_name": get_user_display(db, row.actor_id) if row.actor_id else None,
                "assignment_id": None,
                "log_subtype": None,
                "audit_action": row.action,
                "changes_json": row.changes_json,
                "entity_type": row.entity_type,
                "entity_id": str(row.entity_id) if row.entity_id is not None else None,
                "audit_context": row.context,
            }
        )

    fleet_logs = (
        db.query(FleetLog)
        .filter(FleetLog.fleet_asset_id == asset_id)
        .order_by(FleetLog.log_date.desc())
        .all()
    )
    for log in fleet_logs:
        if has_assignments and log.log_type in ("assignment", "return"):
            continue
        actor_uid = log.user_id or log.created_by
        items.append(
            {
                "id": f"log-{log.id}",
                "source": "fleet_log",
                "kind": log.log_type,
                "title": log.log_type.replace("_", " ").title(),
                "subtitle": None,
                "detail": log.description,
                "occurred_at": log.log_date.isoformat() if log.log_date else "",
                "actor_id": str(actor_uid) if actor_uid else None,
                "actor_name": get_user_display(db, actor_uid) if actor_uid else None,
                "assignment_id": None,
                "log_subtype": None,
                "audit_action": None,
                "changes_json": None,
                "odometer_snapshot": log.odometer_snapshot,
                "hours_snapshot": float(log.hours_snapshot) if log.hours_snapshot is not None else None,
            }
        )

    items.sort(key=lambda x: x.get("occurred_at") or "", reverse=True)
    return {"items": items[:limit]}


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
    user=Depends(get_current_user),
    _=Depends(require_permissions("fleet:write")),
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
    audit_fleet(
        db,
        user,
        entity_type="fleet_compliance_record",
        entity_id=rec.id,
        action="CREATE",
        changes_json={"after": snapshot_compliance(rec)},
        context={"fleet_asset_id": str(asset_id), "record_type": rec.record_type},
    )
    return rec


@router.put("/compliance/{record_id}", response_model=FleetComplianceRecordRead)
def update_compliance(
    record_id: uuid.UUID,
    payload: FleetComplianceRecordUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("fleet:write")),
):
    """Update a compliance record"""
    rec = db.query(FleetComplianceRecord).filter(FleetComplianceRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Compliance record not found")
    before = snapshot_compliance(rec)
    update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(rec, key, value)
    db.commit()
    db.refresh(rec)
    after = snapshot_compliance(rec)
    diff = compute_diff(before, after)
    if diff:
        audit_fleet(
            db,
            user,
            entity_type="fleet_compliance_record",
            entity_id=rec.id,
            action="UPDATE",
            changes_json={"before": before, "after": after},
            context={"fleet_asset_id": str(rec.fleet_asset_id), "changed_fields": list(diff.keys())},
        )
    return rec


@router.delete("/compliance/{record_id}")
def delete_compliance(
    record_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("fleet:write")),
):
    """Delete a compliance record"""
    rec = db.query(FleetComplianceRecord).filter(FleetComplianceRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Compliance record not found")
    snap = snapshot_compliance(rec)
    aid = rec.fleet_asset_id
    db.delete(rec)
    db.commit()
    audit_fleet(
        db,
        user,
        entity_type="fleet_compliance_record",
        entity_id=record_id,
        action="DELETE",
        changes_json={"deleted": snap},
        context={"fleet_asset_id": str(aid)},
    )
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
    audit_fleet(
        db,
        user,
        entity_type="equipment",
        entity_id=new_equipment.id,
        action="CREATE",
        changes_json={"after": snapshot_equipment(new_equipment)},
        context={"equipment_id": str(new_equipment.id)},
    )
    return new_equipment


@router.put("/equipment/{equipment_id}", response_model=EquipmentResponse)
def update_equipment(
    equipment_id: uuid.UUID,
    equipment_update: EquipmentUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("equipment:write")),
):
    """Update equipment"""
    equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")

    before = snapshot_equipment(equipment)
    update_data = equipment_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(equipment, key, value)
    equipment.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(equipment)
    after = snapshot_equipment(equipment)
    diff = compute_diff(before, after)
    if diff:
        audit_fleet(
            db,
            user,
            entity_type="equipment",
            entity_id=equipment.id,
            action="UPDATE",
            changes_json={"before": before, "after": after},
            context={"equipment_id": str(equipment.id), "changed_fields": list(diff.keys())},
        )
    return equipment


@router.delete("/equipment/{equipment_id}")
def delete_equipment(
    equipment_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("equipment:write")),
):
    """Retire equipment (soft delete: status set to retired)."""
    equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")

    before = snapshot_equipment(equipment)
    equipment.status = "retired"
    equipment.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(equipment)
    audit_fleet(
        db,
        user,
        entity_type="equipment",
        entity_id=equipment.id,
        action="UPDATE",
        changes_json={"before": before, "after": snapshot_equipment(equipment), "soft_delete": True},
        context={"equipment_id": str(equipment.id), "note": "status set to retired"},
    )
    return {"message": "Equipment deleted successfully"}


@router.post("/equipment/{equipment_id}/purge")
def purge_equipment_record(
    equipment_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Permanently remove equipment and DB-cascaded rows. Deletes work orders linked to this equipment (no FK). Administrators only."""
    if not is_admin(user, db):
        raise HTTPException(status_code=403, detail="Only administrators can permanently delete equipment")

    equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")

    before = snapshot_equipment(equipment)
    work_orders = (
        db.query(WorkOrder)
        .filter(WorkOrder.entity_type == "equipment", WorkOrder.entity_id == equipment_id)
        .all()
    )
    for wo in work_orders:
        db.delete(wo)

    db.delete(equipment)
    db.commit()
    audit_fleet(
        db,
        user,
        entity_type="equipment",
        entity_id=equipment_id,
        action="DELETE",
        changes_json={"before": before, "purged_work_orders": len(work_orders)},
        context={"equipment_id": str(equipment_id), "permanent": True},
    )
    return {"message": "Equipment permanently removed"}


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
    audit_fleet(
        db,
        user,
        entity_type="equipment_checkout",
        entity_id=new_checkout.id,
        action="CREATE",
        changes_json={
            "equipment_id": str(equipment_id),
            "checked_out_by_user_id": str(checkout.checked_out_by_user_id),
            "status": new_checkout.status,
        },
        context={"equipment_id": str(equipment_id)},
    )
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
    audit_fleet(
        db,
        user,
        entity_type="equipment_checkout",
        entity_id=checkout.id,
        action="UPDATE",
        changes_json={"equipment_id": str(equipment_id), "status": checkout.status},
        context={"equipment_id": str(equipment_id)},
    )
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


@router.get("/users/{user_id}/assets")
def get_user_assets(
    user_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:access", "fleet:read", "equipment:read")),
):
    """Get assets currently with this user and full checkout/assignment history."""
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user id")
    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Current checkouts (EquipmentCheckout, status=checked_out)
    current_checkouts_q = (
        db.query(EquipmentCheckout, Equipment)
        .join(Equipment, EquipmentCheckout.equipment_id == Equipment.id)
        .filter(
            EquipmentCheckout.checked_out_by_user_id == user_uuid,
            EquipmentCheckout.status == "checked_out",
        )
    )
    current_checkouts = []
    for co, eq in current_checkouts_q.all():
        current_checkouts.append({
            "id": str(co.id),
            "equipment_id": str(co.equipment_id),
            "equipment_name": eq.name or "",
            "equipment_category": eq.category or "",
            "checked_out_at": co.checked_out_at.isoformat() if co.checked_out_at else None,
            "expected_return_date": co.expected_return_date.isoformat() if co.expected_return_date else None,
            "condition_out": co.condition_out,
            "notes_out": co.notes_out,
        })

    # Current assignments (AssetAssignment, returned_at is None)
    current_assignments_q = (
        db.query(AssetAssignment)
        .filter(
            AssetAssignment.assigned_to_user_id == user_uuid,
            AssetAssignment.returned_at.is_(None),
        )
    )
    current_assignments = []
    for a in current_assignments_q.all():
        asset_name = ""
        fleet_asset_type = None
        if a.equipment_id:
            eq = db.query(Equipment).filter(Equipment.id == a.equipment_id).first()
            asset_name = eq.name if eq else ""
        elif a.fleet_asset_id:
            fa = db.query(FleetAsset).filter(FleetAsset.id == a.fleet_asset_id).first()
            asset_name = fa.name if fa else ""
            fleet_asset_type = fa.asset_type if fa else None
        odometer_out = a.odometer_out
        if odometer_out is not None:
            try:
                odometer_out = int(odometer_out)
            except (TypeError, ValueError):
                odometer_out = None
        hours_out = a.hours_out
        if hours_out is not None:
            try:
                hours_out = float(hours_out)
            except (TypeError, ValueError):
                hours_out = None
        current_assignments.append({
            "id": str(a.id),
            "target_type": a.target_type,
            "equipment_id": str(a.equipment_id) if a.equipment_id else None,
            "fleet_asset_id": str(a.fleet_asset_id) if a.fleet_asset_id else None,
            "asset_name": asset_name,
            "fleet_asset_type": fleet_asset_type,
            "odometer_out": odometer_out,
            "hours_out": hours_out,
            "assigned_at": a.assigned_at.isoformat() if a.assigned_at else None,
            "expected_return_at": a.expected_return_at.isoformat() if a.expected_return_at else None,
        })

    # Checkout history (all checkouts for this user)
    checkout_history_q = (
        db.query(EquipmentCheckout, Equipment)
        .join(Equipment, EquipmentCheckout.equipment_id == Equipment.id)
        .filter(EquipmentCheckout.checked_out_by_user_id == user_uuid)
        .order_by(EquipmentCheckout.checked_out_at.desc())
    )
    checkout_history = []
    for co, eq in checkout_history_q.all():
        checkout_history.append({
            "id": str(co.id),
            "equipment_id": str(co.equipment_id),
            "equipment_name": eq.name or "",
            "equipment_category": eq.category or "",
            "checked_out_at": co.checked_out_at.isoformat() if co.checked_out_at else None,
            "actual_return_date": co.actual_return_date.isoformat() if co.actual_return_date else None,
            "expected_return_date": co.expected_return_date.isoformat() if co.expected_return_date else None,
            "status": co.status,
        })

    # Assignment history (all assignments for this user)
    assignment_history_q = (
        db.query(AssetAssignment)
        .filter(AssetAssignment.assigned_to_user_id == user_uuid)
        .order_by(AssetAssignment.assigned_at.desc())
    )
    assignment_history = []
    for a in assignment_history_q.all():
        asset_name = ""
        if a.equipment_id:
            eq = db.query(Equipment).filter(Equipment.id == a.equipment_id).first()
            asset_name = eq.name if eq else ""
        elif a.fleet_asset_id:
            fa = db.query(FleetAsset).filter(FleetAsset.id == a.fleet_asset_id).first()
            asset_name = fa.name if fa else ""
        assignment_history.append({
            "id": str(a.id),
            "target_type": a.target_type,
            "equipment_id": str(a.equipment_id) if a.equipment_id else None,
            "fleet_asset_id": str(a.fleet_asset_id) if a.fleet_asset_id else None,
            "asset_name": asset_name,
            "assigned_at": a.assigned_at.isoformat() if a.assigned_at else None,
            "returned_at": a.returned_at.isoformat() if a.returned_at else None,
            "expected_return_at": a.expected_return_at.isoformat() if a.expected_return_at else None,
        })

    return {
        "current_checkouts": current_checkouts,
        "current_assignments": current_assignments,
        "checkout_history": checkout_history,
        "assignment_history": assignment_history,
    }


@router.delete("/users/{user_id}/assets/history")
def delete_user_assets_history(
    user_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("fleet:write"))
):
    """Delete all asset checkout and assignment history for a user. Admin only."""
    # Check if current user is admin
    if not user.roles or not any(r.name.lower() == "admin" for r in user.roles):
        raise HTTPException(status_code=403, detail="Only admins can delete asset history")
    
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user id")
    
    target_user = db.query(User).filter(User.id == user_uuid).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete all checkout history (including active checkouts - be careful!)
    deleted_checkouts = db.query(EquipmentCheckout).filter(
        EquipmentCheckout.checked_out_by_user_id == user_uuid
    ).all()
    for co in deleted_checkouts:
        # Reset equipment status if it was checked out
        if co.status == "checked_out":
            equipment = db.query(Equipment).filter(Equipment.id == co.equipment_id).first()
            if equipment:
                equipment.status = "available"
                equipment.updated_at = datetime.now(timezone.utc)
        db.delete(co)
    
    # Delete all assignment history (including active assignments)
    deleted_assignments = db.query(AssetAssignment).filter(
        AssetAssignment.assigned_to_user_id == user_uuid
    ).all()
    for a in deleted_assignments:
        # Reset fleet asset driver if it was assigned
        if a.fleet_asset_id and a.returned_at is None:
            asset = db.query(FleetAsset).filter(FleetAsset.id == a.fleet_asset_id).first()
            if asset:
                asset.driver_id = None
                asset.updated_at = datetime.now(timezone.utc)
        db.delete(a)
    
    db.commit()
    audit_fleet(
        db,
        user,
        entity_type="fleet_operation",
        entity_id=user_uuid,
        action="UPDATE",
        changes_json={
            "fleet_history_cleared": True,
            "deleted_checkouts": len(deleted_checkouts),
            "deleted_assignments": len(deleted_assignments),
        },
        context={"target_user_id": str(user_uuid), "note": "Fleet/equipment checkout and assignment history removed"},
    )
    return {"message": f"Deleted {len(deleted_checkouts)} checkouts and {len(deleted_assignments)} assignments"}


@router.delete("/equipment/checkouts/{checkout_id}")
def delete_equipment_checkout(
    checkout_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("fleet:write"))
):
    """Delete a single equipment checkout. Admin only."""
    if not user.roles or not any(r.name.lower() == "admin" for r in user.roles):
        raise HTTPException(status_code=403, detail="Only admins can delete checkouts")
    
    checkout = db.query(EquipmentCheckout).filter(EquipmentCheckout.id == checkout_id).first()
    if not checkout:
        raise HTTPException(status_code=404, detail="Checkout not found")

    eq_id = checkout.equipment_id
    # Reset equipment status if it was checked out
    if checkout.status == "checked_out":
        equipment = db.query(Equipment).filter(Equipment.id == checkout.equipment_id).first()
        if equipment:
            equipment.status = "available"
            equipment.updated_at = datetime.now(timezone.utc)

    db.delete(checkout)
    db.commit()
    audit_fleet(
        db,
        user,
        entity_type="equipment_checkout",
        entity_id=checkout_id,
        action="DELETE",
        changes_json={"equipment_id": str(eq_id)},
        context={"equipment_id": str(eq_id)},
    )
    return {"message": "Checkout deleted"}


@router.delete("/assets/assignments/{assignment_id}")
def delete_asset_assignment(
    assignment_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("fleet:write"))
):
    """Delete a single asset assignment. Admin only."""
    if not user.roles or not any(r.name.lower() == "admin" for r in user.roles):
        raise HTTPException(status_code=403, detail="Only admins can delete assignments")
    
    assignment = db.query(AssetAssignment).filter(AssetAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    snap = {
        "target_type": assignment.target_type,
        "fleet_asset_id": str(assignment.fleet_asset_id) if assignment.fleet_asset_id else None,
        "equipment_id": str(assignment.equipment_id) if assignment.equipment_id else None,
        "assigned_to_user_id": str(assignment.assigned_to_user_id) if assignment.assigned_to_user_id else None,
    }
    # Reset fleet asset driver if it was assigned and not returned
    if assignment.fleet_asset_id and assignment.returned_at is None:
        asset = db.query(FleetAsset).filter(FleetAsset.id == assignment.fleet_asset_id).first()
        if asset:
            asset.driver_id = None
            asset.updated_at = datetime.now(timezone.utc)

    db.delete(assignment)
    db.commit()
    audit_fleet(
        db,
        user,
        entity_type="asset_assignment",
        entity_id=assignment_id,
        action="DELETE",
        changes_json={"deleted": snap},
        context=snap,
    )
    return {"message": "Assignment deleted"}


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
        audit_fleet(
            db,
            user,
            entity_type="asset_assignment",
            entity_id=result.id,
            action="CREATE",
            changes_json={
                "target_type": "equipment",
                "equipment_id": str(equipment_id),
                "assigned_to_user_id": str(payload.assigned_to_user_id) if payload.assigned_to_user_id else None,
                "assigned_to_name": payload.assigned_to_name,
            },
            context={"equipment_id": str(equipment_id)},
        )
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
        audit_fleet(
            db,
            user,
            entity_type="asset_assignment",
            entity_id=result.id,
            action="UPDATE",
            changes_json={"target_type": "equipment", "equipment_id": str(equipment_id), "returned": True},
            context={"equipment_id": str(equipment_id)},
        )
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
    audit_fleet(
        db,
        user,
        entity_type="equipment_assignment",
        entity_id=assignment.id,
        action="UPDATE",
        changes_json={"equipment_id": str(assignment.equipment_id), "is_active": assignment.is_active},
        context={"equipment_id": str(assignment.equipment_id)},
    )
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
        audit_fleet(
            db,
            user,
            entity_type="asset_assignment",
            entity_id=result.id,
            action="CREATE",
            changes_json={
                "target_type": "fleet",
                "fleet_asset_id": str(asset_id),
                "assigned_to_user_id": str(payload.assigned_to_user_id) if payload.assigned_to_user_id else None,
                "assigned_to_name": payload.assigned_to_name,
            },
            context={"fleet_asset_id": str(asset_id)},
        )
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
        audit_fleet(
            db,
            user,
            entity_type="asset_assignment",
            entity_id=result.id,
            action="UPDATE",
            changes_json={"target_type": "fleet", "fleet_asset_id": str(asset_id), "returned": True},
            context={"fleet_asset_id": str(asset_id)},
        )
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
    audit_fleet(
        db,
        user,
        entity_type="fleet_asset_assignment",
        entity_id=assignment.id,
        action="UPDATE",
        changes_json={"fleet_asset_id": str(assignment.fleet_asset_id), "is_active": assignment.is_active},
        context={"fleet_asset_id": str(assignment.fleet_asset_id)},
    )
    return assignment


# ---------- INSPECTION SCHEDULES (agendamentos) ----------
@router.post("/inspection-schedules", response_model=InspectionScheduleResponse)
def create_inspection_schedule(
    payload: InspectionScheduleCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("inspections:write")),
):
    """Create an inspection appointment (agendamento). Creates body and mechanical inspections as pending automatically."""
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

    scheduled_dt = schedule.scheduled_at
    if scheduled_dt.tzinfo is None:
        scheduled_dt = scheduled_dt.replace(tzinfo=timezone.utc)

    body_inspection = FleetInspection(
        fleet_asset_id=schedule.fleet_asset_id,
        inspection_date=scheduled_dt,
        inspection_type="body",
        inspection_schedule_id=schedule.id,
        result="pending",
        created_by=user.id,
    )
    mechanical_inspection = FleetInspection(
        fleet_asset_id=schedule.fleet_asset_id,
        inspection_date=scheduled_dt,
        inspection_type="mechanical",
        inspection_schedule_id=schedule.id,
        result="pending",
        created_by=user.id,
    )
    db.add(body_inspection)
    db.add(mechanical_inspection)
    db.commit()

    schedule = db.query(InspectionSchedule).options(
        joinedload(InspectionSchedule.fleet_asset),
        joinedload(InspectionSchedule.inspections),
    ).filter(InspectionSchedule.id == schedule.id).first()
    body_insp = next((i for i in (schedule.inspections or []) if i.inspection_type == "body"), None)
    mech_insp = next((i for i in (schedule.inspections or []) if i.inspection_type == "mechanical"), None)
    out = InspectionScheduleResponse.model_validate(schedule).model_copy(update={
        "fleet_asset_name": schedule.fleet_asset.name if schedule.fleet_asset else None,
        "body_inspection_id": body_insp.id if body_insp else None,
        "mechanical_inspection_id": mech_insp.id if mech_insp else None,
        "body_result": body_insp.result if body_insp else None,
        "mechanical_result": mech_insp.result if mech_insp else None,
    })
    audit_fleet(
        db,
        user,
        entity_type="inspection_schedule",
        entity_id=schedule.id,
        action="CREATE",
        changes_json={
            "after": snapshot_inspection_schedule(schedule),
            "body_inspection_id": str(body_insp.id) if body_insp else None,
            "mechanical_inspection_id": str(mech_insp.id) if mech_insp else None,
        },
        context={"fleet_asset_id": str(schedule.fleet_asset_id)},
    )
    return out


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
        fleet_asset_name = None
        if s.fleet_asset:
            fa = s.fleet_asset
            fleet_asset_name = (fa.name or "").strip() or None
            un = getattr(fa, "unit_number", None)
            if un is not None and str(un).strip():
                unit_number = str(un).strip()
        out.append(
            InspectionScheduleCalendarItem(
                id=s.id,
                scheduled_at=s.scheduled_at,
                fleet_asset_name=fleet_asset_name,
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
    schedule = db.query(InspectionSchedule).options(
        joinedload(InspectionSchedule.fleet_asset),
        joinedload(InspectionSchedule.inspections),
    ).filter(InspectionSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Inspection schedule not found")
    body_insp = next((i for i in (schedule.inspections or []) if i.inspection_type == "body"), None)
    mech_insp = next((i for i in (schedule.inspections or []) if i.inspection_type == "mechanical"), None)
    out = InspectionScheduleResponse.model_validate(schedule).model_copy(update={
        "fleet_asset_name": schedule.fleet_asset.name if schedule.fleet_asset else None,
        "body_inspection_id": body_insp.id if body_insp else None,
        "mechanical_inspection_id": mech_insp.id if mech_insp else None,
        "body_result": body_insp.result if body_insp else None,
        "mechanical_result": mech_insp.result if mech_insp else None,
    })
    return out


@router.put("/inspection-schedules/{schedule_id}", response_model=InspectionScheduleResponse)
def update_inspection_schedule(
    schedule_id: uuid.UUID,
    payload: InspectionScheduleUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("inspections:write")),
):
    """Update an inspection schedule (e.g. reschedule, cancel)."""
    schedule = db.query(InspectionSchedule).options(joinedload(InspectionSchedule.fleet_asset)).filter(InspectionSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Inspection schedule not found")
    before = snapshot_inspection_schedule(schedule)
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(schedule, key, value)
    db.commit()
    db.refresh(schedule)
    after = snapshot_inspection_schedule(schedule)
    diff = compute_diff(before, after)
    if diff:
        audit_fleet(
            db,
            user,
            entity_type="inspection_schedule",
            entity_id=schedule.id,
            action="UPDATE",
            changes_json={"before": before, "after": after},
            context={"fleet_asset_id": str(schedule.fleet_asset_id), "changed_fields": list(diff.keys())},
        )
    out = InspectionScheduleResponse.model_validate(schedule)
    return out.model_copy(update={"fleet_asset_name": schedule.fleet_asset.name if schedule.fleet_asset else None})


@router.delete("/inspection-schedules/{schedule_id}")
def delete_inspection_schedule(
    schedule_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_roles("admin")),
):
    """Permanently delete an inspection schedule and its linked inspections (admin only)."""
    schedule = db.query(InspectionSchedule).filter(InspectionSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Inspection schedule not found")
    snap = snapshot_inspection_schedule(schedule)
    fid = schedule.fleet_asset_id
    db.delete(schedule)
    db.commit()
    audit_fleet(
        db,
        user,
        entity_type="inspection_schedule",
        entity_id=schedule_id,
        action="DELETE",
        changes_json={"deleted": snap},
        context={"fleet_asset_id": str(fid)},
    )
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
    audit_fleet(
        db,
        user,
        entity_type="fleet_inspection",
        entity_id=new_inspection.id,
        action="CREATE",
        changes_json={"after": snapshot_fleet_inspection(new_inspection)},
        context={"fleet_asset_id": str(new_inspection.fleet_asset_id)},
    )
    if new_inspection.auto_generated_work_order_id:
        wo = db.query(WorkOrder).filter(WorkOrder.id == new_inspection.auto_generated_work_order_id).first()
        if wo:
            audit_fleet(
                db,
                user,
                entity_type="work_order",
                entity_id=wo.id,
                action="CREATE",
                changes_json={"after": snapshot_work_order(wo), "origin": "inspection_fail"},
                context={"fleet_inspection_id": str(new_inspection.id), "fleet_asset_id": str(new_inspection.fleet_asset_id)},
            )
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

    had_work_order = inspection.auto_generated_work_order_id
    before = snapshot_fleet_inspection(inspection)
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
    after = snapshot_fleet_inspection(inspection)
    diff = compute_diff(before, after)
    if diff:
        audit_fleet(
            db,
            user,
            entity_type="fleet_inspection",
            entity_id=inspection.id,
            action="UPDATE",
            changes_json={"before": before, "after": after},
            context={"fleet_asset_id": str(inspection.fleet_asset_id), "changed_fields": list(diff.keys())},
        )
    if not had_work_order and inspection.auto_generated_work_order_id:
        wo = db.query(WorkOrder).filter(WorkOrder.id == inspection.auto_generated_work_order_id).first()
        if wo:
            audit_fleet(
                db,
                user,
                entity_type="work_order",
                entity_id=wo.id,
                action="CREATE",
                changes_json={"after": snapshot_work_order(wo), "origin": "inspection_update_fail"},
                context={"fleet_inspection_id": str(inspection.id), "fleet_asset_id": str(inspection.fleet_asset_id)},
            )
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
    audit_fleet(
        db,
        user,
        entity_type="work_order",
        entity_id=wo.id,
        action="CREATE",
        changes_json={"after": snapshot_work_order(wo), "origin": "manual_generate_from_inspection"},
        context={"fleet_inspection_id": str(inspection_id), "fleet_asset_id": str(inspection.fleet_asset_id)},
    )
    return wo


@router.delete("/inspections/{inspection_id}")
def delete_inspection(
    inspection_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_roles("admin")),
):
    """Permanently delete an inspection (admin only). Unlinks any work orders that originated from it."""
    inspection = db.query(FleetInspection).filter(FleetInspection.id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    snap = snapshot_fleet_inspection(inspection)
    fid = inspection.fleet_asset_id
    db.query(WorkOrder).filter(WorkOrder.origin_id == inspection_id).update({WorkOrder.origin_id: None})
    db.delete(inspection)
    db.commit()
    audit_fleet(
        db,
        user,
        entity_type="fleet_inspection",
        entity_id=inspection_id,
        action="DELETE",
        changes_json={"deleted": snap},
        context={"fleet_asset_id": str(fid)},
    )
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


def _work_order_expected_end_at(wo: WorkOrder):
    """Calendar/UI: baseline + estimated_duration_minutes (not persisted). Baseline = scheduled_start or check-in or created."""
    est = getattr(wo, "estimated_duration_minutes", None)
    if est is None or est < 0:
        return None
    base = wo.scheduled_start_at or wo.check_in_at or wo.created_at
    if base is None:
        return None
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)
    return base + timedelta(minutes=int(est))


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
                asset_name = (asset.name or "").strip() or None
                if not asset_name:
                    asset_name = " ".join(x for x in (asset.make, asset.model) if x) or None
                if not asset_name:
                    asset_name = (asset.license_plate or "").strip() or str(wo.entity_id)
                un = getattr(asset, "unit_number", None)
                unit_number = str(un).strip() if un is not None and str(un).strip() else None
        if wo.origin_source == "inspection" and wo.origin_id:
            insp = db.query(FleetInspection).filter(FleetInspection.id == wo.origin_id).first()
            if insp and getattr(insp, "inspection_type", None) in ("body", "mechanical"):
                work_order_type = insp.inspection_type
        out.append(WorkOrderCalendarItem(
            id=wo.id,
            work_order_number=wo.work_order_number,
            entity_id=wo.entity_id,
            scheduled_start_at=wo.scheduled_start_at,
            estimated_duration_minutes=wo.estimated_duration_minutes,
            expected_end_at=_work_order_expected_end_at(wo),
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
    payload = work_order.dict()
    payload["status"] = WorkOrderStatus.open.value
    wo = WorkOrder(
        work_order_number=generate_work_order_number(db),
        **payload,
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
    
    _log_work_order_activity(
        db,
        wo.id,
        "work_order_created",
        details={
            "work_order_number": wo.work_order_number,
            "entity_type": wo.entity_type,
            "entity_id": str(wo.entity_id) if getattr(wo, "entity_id", None) else None,
            "status": wo.status,
        },
        created_by=user.id,
    )
    db.commit()
    db.refresh(wo)
    audit_fleet(
        db,
        user,
        entity_type="work_order",
        entity_id=wo.id,
        action="CREATE",
        changes_json={"after": snapshot_work_order(wo)},
        context=_fleet_audit_ctx_for_work_order(wo, {"entity_type": wo.entity_type, "entity_id": str(wo.entity_id)}),
    )
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

    before_wo = snapshot_work_order(wo)
    old_costs = (wo.costs or {}).copy()
    if isinstance(old_costs.get("labor"), list):
        old_costs["labor"] = list(wo.costs.get("labor") or [])
    if isinstance(old_costs.get("parts"), list):
        old_costs["parts"] = list(wo.costs.get("parts") or [])
    if isinstance(old_costs.get("other"), list):
        old_costs["other"] = list(wo.costs.get("other") or [])

    update_data = work_order_update.dict(exclude_unset=True)
    restricted_fields = {"status", "check_in_at", "check_out_at"}
    blocked_fields = [k for k in restricted_fields if k in update_data]
    if blocked_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Use dedicated workflow endpoints for {', '.join(blocked_fields)} updates",
        )
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

    after_wo_for_activity = snapshot_work_order(wo)
    diff_for_activity = compute_diff(before_wo, after_wo_for_activity) or {}
    changed_fields_for_activity = [
        field for field in diff_for_activity.keys()
        if field not in {"status", "costs"}
    ]
    if changed_fields_for_activity:
        _log_work_order_activity(
            db,
            work_order_id,
            "work_order_updated",
            details={"changed_fields": changed_fields_for_activity},
            created_by=user.id,
        )

    db.commit()
    db.refresh(wo)
    after_wo = snapshot_work_order(wo)
    diff_wo = compute_diff(before_wo, after_wo)
    if diff_wo:
        audit_fleet(
            db,
            user,
            entity_type="work_order",
            entity_id=wo.id,
            action="UPDATE",
            changes_json={"before": before_wo, "after": after_wo},
            context=_fleet_audit_ctx_for_work_order(wo, {"changed_fields": list(diff_wo.keys())}),
        )
    return wo


@router.put("/work-orders/{work_order_id}/status", response_model=WorkOrderResponse)
def update_work_order_status(
    work_order_id: uuid.UUID,
    body: WorkOrderStatusUpdateRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("work_orders:write"))
):
    """Update work order status through the allowed manual transitions."""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")

    before_flow = snapshot_work_order_flow(wo)
    old_status = wo.status
    reason = _normalize_reason(body.reason)
    _assert_manual_status_transition_allowed(old_status, body.status.value, reason)
    wo.status = body.status.value
    if wo.status != WorkOrderStatus.closed.value:
        wo.closed_at = None
    wo.updated_at = datetime.now(timezone.utc)

    if old_status != wo.status:
        details: Dict[str, Any] = {"old_status": old_status, "new_status": wo.status}
        if reason:
            details["reason"] = reason
        _log_work_order_activity(
            db, work_order_id, "status_changed",
            details=details,
            created_by=user.id,
        )

    db.commit()
    db.refresh(wo)
    after_flow = snapshot_work_order_flow(wo)
    diff_st = compute_diff(before_flow, after_flow)
    if diff_st:
        audit_fleet(
            db,
            user,
            entity_type="work_order",
            entity_id=wo.id,
            action="UPDATE",
            changes_json={"before": before_flow, "after": after_flow},
            context=_fleet_audit_ctx_for_work_order(wo, {"via": "status_endpoint"}),
        )
    return wo


@router.put("/work-orders/{work_order_id}/check-in", response_model=WorkOrderResponse)
def work_order_check_in(
    work_order_id: uuid.UUID,
    body: WorkOrderCheckInRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("work_orders:write"))
):
    """Register vehicle check-in (entrada). Sets check_in_at, optional odometer/hours, and status to in_progress."""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    if wo.status != WorkOrderStatus.open.value:
        raise HTTPException(status_code=409, detail="Check-in is only allowed when work order is pending")
    before_flow = snapshot_work_order_flow(wo)
    wo.scheduled_end_at = None
    check_in_at = body.check_in_at
    if check_in_at is not None:
        wo.check_in_at = check_in_at
        if wo.check_in_at.tzinfo is None:
            wo.check_in_at = wo.check_in_at.replace(tzinfo=timezone.utc)
    else:
        wo.check_in_at = datetime.now(timezone.utc)
    old_status = wo.status
    wo.status = WorkOrderStatus.in_progress.value
    if body.odometer_reading is not None:
        wo.odometer_reading = int(body.odometer_reading)
    if body.hours_reading is not None:
        wo.hours_reading = float(body.hours_reading)
    if wo.entity_type == "fleet" and (body.odometer_reading is not None or body.hours_reading is not None):
        update_fleet_asset_last_service(
            wo.entity_id,
            int(body.odometer_reading) if body.odometer_reading is not None else None,
            float(body.hours_reading) if body.hours_reading is not None else None,
            db,
        )
    wo.updated_at = datetime.now(timezone.utc)

    if old_status != wo.status:
        _log_work_order_activity(
            db, work_order_id, "status_changed",
            details={"old_status": old_status, "new_status": wo.status},
            created_by=user.id,
        )
    _log_work_order_activity(
        db,
        work_order_id,
        "check_in",
        details={
            "check_in_at": wo.check_in_at.isoformat() if wo.check_in_at else None,
            "odometer_reading": wo.odometer_reading,
            "hours_reading": wo.hours_reading,
        },
        created_by=user.id,
    )

    db.commit()
    db.refresh(wo)
    after_flow = snapshot_work_order_flow(wo)
    diff_ci = compute_diff(before_flow, after_flow)
    if diff_ci:
        audit_fleet(
            db,
            user,
            entity_type="work_order",
            entity_id=wo.id,
            action="UPDATE",
            changes_json={"before": before_flow, "after": after_flow},
            context=_fleet_audit_ctx_for_work_order(wo, {"via": "check_in"}),
        )
    return wo


@router.put("/work-orders/{work_order_id}/check-out", response_model=WorkOrderResponse)
def work_order_check_out(
    work_order_id: uuid.UUID,
    body: WorkOrderCheckOutRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("work_orders:write"))
):
    """Register vehicle check-out (saída). Sets check_out_at, status to closed, and optional odometer/hours."""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    if wo.status not in {WorkOrderStatus.in_progress.value, WorkOrderStatus.pending_parts.value}:
        raise HTTPException(status_code=409, detail="Check-out is only allowed for in-progress or awaiting-parts work orders")
    before_flow = snapshot_work_order_flow(wo)
    old_status = wo.status
    wo.status = WorkOrderStatus.closed.value
    if not wo.closed_at:
        wo.closed_at = datetime.now(timezone.utc)
    check_out_at = body.check_out_at
    if check_out_at is not None:
        wo.check_out_at = check_out_at
        if wo.check_out_at.tzinfo is None:
            wo.check_out_at = wo.check_out_at.replace(tzinfo=timezone.utc)
    else:
        wo.check_out_at = datetime.now(timezone.utc)
    if body.odometer_reading is not None:
        wo.odometer_reading = int(body.odometer_reading)
    if body.hours_reading is not None:
        wo.hours_reading = float(body.hours_reading)
    if wo.entity_type == "fleet" and (body.odometer_reading is not None or body.hours_reading is not None):
        update_fleet_asset_last_service(
            wo.entity_id,
            int(body.odometer_reading) if body.odometer_reading is not None else None,
            float(body.hours_reading) if body.hours_reading is not None else None,
            db,
        )
    wo.updated_at = datetime.now(timezone.utc)

    if old_status != wo.status:
        _log_work_order_activity(
            db, work_order_id, "status_changed",
            details={"old_status": old_status, "new_status": wo.status},
            created_by=user.id,
        )
    _log_work_order_activity(
        db,
        work_order_id,
        "check_out",
        details={
            "check_out_at": wo.check_out_at.isoformat() if wo.check_out_at else None,
            "odometer_reading": wo.odometer_reading,
            "hours_reading": wo.hours_reading,
        },
        created_by=user.id,
    )

    db.commit()
    db.refresh(wo)
    after_flow = snapshot_work_order_flow(wo)
    diff_co = compute_diff(before_flow, after_flow)
    if diff_co:
        audit_fleet(
            db,
            user,
            entity_type="work_order",
            entity_id=wo.id,
            action="UPDATE",
            changes_json={"before": before_flow, "after": after_flow},
            context=_fleet_audit_ctx_for_work_order(wo, {"via": "check_out"}),
        )
    return wo


@router.put("/work-orders/{work_order_id}/reopen", response_model=WorkOrderResponse)
def reopen_work_order(
    work_order_id: uuid.UUID,
    body: WorkOrderReopenRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("work_orders:write")),
):
    """Reopen cancelled or not-approved work orders back to pending."""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    if wo.status not in {WorkOrderStatus.cancelled.value, WorkOrderStatus.not_approved.value}:
        raise HTTPException(status_code=409, detail="Only cancelled or not-approved work orders can be reopened")
    if not is_admin(user, db):
        raise HTTPException(status_code=403, detail="Only admins can reopen work orders")
    reason = _normalize_reason(body.reason)
    if not reason:
        raise HTTPException(status_code=400, detail="Reopen reason is required")

    before_flow = snapshot_work_order_flow(wo)
    old_status = wo.status
    wo.status = WorkOrderStatus.open.value
    wo.closed_at = None
    wo.check_out_at = None
    wo.updated_at = datetime.now(timezone.utc)

    _log_work_order_activity(
        db,
        work_order_id,
        "work_order_reopened",
        details={"old_status": old_status, "new_status": wo.status, "reason": reason},
        created_by=user.id,
    )
    _log_work_order_activity(
        db,
        work_order_id,
        "status_changed",
        details={"old_status": old_status, "new_status": wo.status, "reason": reason},
        created_by=user.id,
    )

    db.commit()
    db.refresh(wo)
    after_flow = snapshot_work_order_flow(wo)
    diff_ro = compute_diff(before_flow, after_flow)
    if diff_ro:
        audit_fleet(
            db,
            user,
            entity_type="work_order",
            entity_id=wo.id,
            action="UPDATE",
            changes_json={"before": before_flow, "after": after_flow},
            context=_fleet_audit_ctx_for_work_order(wo, {"via": "reopen", "reason": reason}),
        )
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

    before_flow = snapshot_work_order_flow(wo)
    old_assigned_to = wo.assigned_to_user_id
    wo.assigned_to_user_id = assigned_to
    wo.assigned_by_user_id = user.id
    wo.updated_at = datetime.now(timezone.utc)
    _log_work_order_activity(
        db,
        work_order_id,
        "assignment_changed",
        details={
            "old_assigned_to_user_id": str(old_assigned_to) if old_assigned_to else None,
            "new_assigned_to_user_id": str(assigned_to),
        },
        created_by=user.id,
    )

    db.commit()
    db.refresh(wo)
    after_flow = snapshot_work_order_flow(wo)
    diff_as = compute_diff(before_flow, after_flow)
    if diff_as:
        audit_fleet(
            db,
            user,
            entity_type="work_order",
            entity_id=wo.id,
            action="UPDATE",
            changes_json={"before": before_flow, "after": after_flow},
            context=_fleet_audit_ctx_for_work_order(wo, {"via": "assign"}),
        )
    return wo


@router.delete("/work-orders/{work_order_id}")
def delete_work_order(
    work_order_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_roles("admin")),
):
    """Permanently delete a work order (admin only)."""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    snap = snapshot_work_order(wo)
    db.delete(wo)
    db.commit()
    del_ctx: Dict[str, Any] = {"work_order_number": snap.get("work_order_number")}
    if snap.get("entity_type") == "fleet" and snap.get("entity_id"):
        del_ctx["fleet_asset_id"] = str(snap["entity_id"])
    audit_fleet(
        db,
        user,
        entity_type="work_order",
        entity_id=work_order_id,
        action="DELETE",
        changes_json={"deleted": snap},
        context=del_ctx,
    )
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
    audit_fleet(
        db,
        user,
        entity_type="work_order_file",
        entity_id=row.id,
        action="CREATE",
        changes_json={
            "work_order_id": str(work_order_id),
            "category": category,
            "original_name": original_name or fo.original_name,
            "file_object_id": str(fo_id),
        },
        context=_fleet_audit_ctx_for_work_order(wo, {"work_order_id": str(work_order_id)}),
    )
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
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    before_f = {"category": worf.category, "original_name": worf.original_name}
    if category is not None and category not in WORK_ORDER_FILE_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"category must be one of: {WORK_ORDER_FILE_CATEGORIES}")
    if category is not None:
        worf.category = category
    if original_name is not None:
        worf.original_name = original_name
    after_f = {"category": worf.category, "original_name": worf.original_name}
    diff_f = compute_diff(before_f, after_f)
    if diff_f:
        _log_work_order_activity(
            db,
            work_order_id,
            "file_updated",
            details={
                "before": before_f,
                "after": after_f,
            },
            created_by=user.id,
        )
    db.commit()
    db.refresh(worf)
    if diff_f:
        audit_fleet(
            db,
            user,
            entity_type="work_order_file",
            entity_id=worf.id,
            action="UPDATE",
            changes_json={"before": before_f, "after": after_f},
            context=_fleet_audit_ctx_for_work_order(wo, {"work_order_id": str(work_order_id)}),
        )
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
            audit_fleet(
                db,
                user,
                entity_type="work_order",
                entity_id=work_order_id,
                action="UPDATE",
                changes_json={"legacy_file_removed": True, "category": "outros", "file_object_id": fid_str},
                context=_fleet_audit_ctx_for_work_order(wo, {"work_order_id": str(work_order_id)}),
            )
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
        audit_fleet(
            db,
            user,
            entity_type="work_order",
            entity_id=work_order_id,
            action="UPDATE",
            changes_json={"legacy_file_removed": True, "category": "photos", "file_object_id": fid_str},
            context=_fleet_audit_ctx_for_work_order(wo, {"work_order_id": str(work_order_id)}),
        )
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
        wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
        if not wo:
            raise HTTPException(status_code=404, detail="Work order not found")
        details = {"category": worf.category, "original_name": worf.original_name}
        _log_work_order_activity(db, work_order_id, "file_removed", details=details, created_by=user.id)
        wid = worf.id
        db.delete(worf)
        db.commit()
        audit_fleet(
            db,
            user,
            entity_type="work_order_file",
            entity_id=wid,
            action="DELETE",
            changes_json={"deleted": details},
            context=_fleet_audit_ctx_for_work_order(wo, {"work_order_id": str(work_order_id)}),
        )
        return {"message": "File removed"}
    raise HTTPException(status_code=404, detail="File not found")

