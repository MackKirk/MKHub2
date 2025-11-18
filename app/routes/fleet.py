import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from sqlalchemy import or_, and_

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session

from ..db import get_db
from ..auth.security import get_current_user, require_permissions
from ..models.models import (
    FleetAsset,
    Equipment,
    FleetInspection,
    WorkOrder,
    EquipmentCheckout,
    FleetLog,
    EquipmentLog,
    EquipmentAssignment,
    User,
)
from ..schemas.fleet import (
    FleetAssetCreate,
    FleetAssetUpdate,
    FleetAssetResponse,
    EquipmentCreate,
    EquipmentUpdate,
    EquipmentResponse,
    FleetInspectionCreate,
    FleetInspectionUpdate,
    FleetInspectionResponse,
    WorkOrderCreate,
    WorkOrderUpdate,
    WorkOrderResponse,
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
    _=Depends(require_permissions("fleet:read"))
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
        inspections_due_count=len(inspections_due),
        inspections_due=inspections_due,
        open_work_orders_count=open_wos,
        in_progress_work_orders_count=in_progress_wos,
        pending_parts_work_orders_count=pending_parts_wos,
        overdue_equipment_count=len(overdue_equipment),
        overdue_equipment=overdue_equipment,
    )


# ---------- FLEET ASSETS ----------
@router.get("/assets", response_model=List[FleetAssetResponse])
def list_fleet_assets(
    asset_type: Optional[FleetAssetType] = Query(None),
    division_id: Optional[uuid.UUID] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("fleet:read"))
):
    """List fleet assets with filters"""
    query = db.query(FleetAsset)
    
    if asset_type:
        query = query.filter(FleetAsset.asset_type == asset_type.value)
    if division_id:
        query = query.filter(FleetAsset.division_id == division_id)
    if status:
        query = query.filter(FleetAsset.status == status)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                FleetAsset.name.ilike(search_term),
                FleetAsset.vin.ilike(search_term),
                FleetAsset.model.ilike(search_term),
            )
        )
    
    return query.order_by(FleetAsset.created_at.desc()).limit(500).all()


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
    """Create a new fleet asset"""
    new_asset = FleetAsset(**asset.dict(), created_by=user.id)
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


# ---------- EQUIPMENT ----------
@router.get("/equipment", response_model=List[EquipmentResponse])
def list_equipment(
    category: Optional[EquipmentCategory] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("equipment:read"))
):
    """List equipment with filters"""
    query = db.query(Equipment)
    
    if category:
        query = query.filter(Equipment.category == category.value)
    if status:
        query = query.filter(Equipment.status == status)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Equipment.name.ilike(search_term),
                Equipment.serial_number.ilike(search_term),
                Equipment.brand.ilike(search_term),
                Equipment.model.ilike(search_term),
            )
        )
    
    return query.order_by(Equipment.created_at.desc()).limit(500).all()


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


# ---------- EQUIPMENT ASSIGNMENTS ----------
@router.get("/equipment/{equipment_id}/assignments", response_model=List[EquipmentAssignmentResponse])
def get_equipment_assignments(
    equipment_id: uuid.UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("equipment:read"))
):
    """Get assignment history for equipment"""
    assignments = db.query(EquipmentAssignment).filter(
        EquipmentAssignment.equipment_id == equipment_id
    ).order_by(EquipmentAssignment.assigned_at.desc()).all()
    return assignments


@router.post("/equipment/{equipment_id}/assign", response_model=EquipmentAssignmentResponse)
def assign_equipment(
    equipment_id: uuid.UUID,
    assignment: EquipmentAssignmentCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("equipment:write"))
):
    """Assign equipment to a user"""
    equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    # Deactivate any existing active assignments
    active_assignments = db.query(EquipmentAssignment).filter(
        and_(
            EquipmentAssignment.equipment_id == equipment_id,
            EquipmentAssignment.is_active == True
        )
    ).all()
    for active_assignment in active_assignments:
        active_assignment.is_active = False
        active_assignment.returned_at = assignment.assigned_at or datetime.now(timezone.utc)
        active_assignment.returned_to_user_id = user.id
    
    # Create new assignment
    new_assignment = EquipmentAssignment(
        equipment_id=equipment_id,
        assigned_to_user_id=assignment.assigned_to_user_id,
        assigned_at=assignment.assigned_at or datetime.now(timezone.utc),
        notes=assignment.notes,
        is_active=True,
        created_by=user.id,
    )
    db.add(new_assignment)
    
    # Create log entry
    log = EquipmentLog(
        equipment_id=equipment_id,
        log_type="assignment",
        log_date=datetime.now(timezone.utc),
        user_id=user.id,
        description=f"Equipment assigned to user {assignment.assigned_to_user_id}",
        created_by=user.id,
    )
    db.add(log)
    
    db.commit()
    db.refresh(new_assignment)
    return new_assignment


@router.put("/equipment/assignments/{assignment_id}/return", response_model=EquipmentAssignmentResponse)
def return_equipment_assignment(
    assignment_id: uuid.UUID,
    return_data: EquipmentAssignmentReturn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_permissions("equipment:write"))
):
    """Return equipment assignment (unassign)"""
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
    
    # Create log entry
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


# ---------- INSPECTIONS ----------
@router.get("/inspections", response_model=List[FleetInspectionResponse])
def list_inspections(
    fleet_asset_id: Optional[uuid.UUID] = Query(None),
    result: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("inspections:read"))
):
    """List inspections with filters"""
    query = db.query(FleetInspection)
    
    if fleet_asset_id:
        query = query.filter(FleetInspection.fleet_asset_id == fleet_asset_id)
    if result:
        query = query.filter(FleetInspection.result == result)
    if start_date:
        query = query.filter(FleetInspection.inspection_date >= start_date)
    if end_date:
        query = query.filter(FleetInspection.inspection_date <= end_date)
    
    return query.order_by(FleetInspection.inspection_date.desc()).limit(500).all()


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
@router.get("/work-orders", response_model=List[WorkOrderResponse])
def list_work_orders(
    status: Optional[WorkOrderStatus] = Query(None),
    assigned_to: Optional[uuid.UUID] = Query(None),
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[uuid.UUID] = Query(None),
    category: Optional[str] = Query(None),
    urgency: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("work_orders:read"))
):
    """List work orders with filters"""
    query = db.query(WorkOrder)
    
    if status:
        query = query.filter(WorkOrder.status == status.value)
    if assigned_to:
        query = query.filter(WorkOrder.assigned_to_user_id == assigned_to)
    if entity_type:
        query = query.filter(WorkOrder.entity_type == entity_type)
    if entity_id:
        query = query.filter(WorkOrder.entity_id == entity_id)
    if category:
        query = query.filter(WorkOrder.category == category)
    if urgency:
        query = query.filter(WorkOrder.urgency == urgency)
    
    return query.order_by(WorkOrder.created_at.desc()).limit(500).all()


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

