import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any, Union
from enum import Enum

from pydantic import BaseModel, field_validator


# Enums
class FleetAssetType(str, Enum):
    vehicle = "vehicle"
    heavy_machinery = "heavy_machinery"
    other = "other"


class FleetAssetStatus(str, Enum):
    active = "active"
    inactive = "inactive"
    retired = "retired"
    maintenance = "maintenance"


class EquipmentCategory(str, Enum):
    generator = "generator"
    tool = "tool"
    electronics = "electronics"
    small_tool = "small_tool"
    safety = "safety"


class EquipmentStatus(str, Enum):
    available = "available"
    checked_out = "checked_out"
    maintenance = "maintenance"
    retired = "retired"


class InspectionResult(str, Enum):
    pass_result = "pass"
    fail = "fail"
    conditional = "conditional"


class WorkOrderCategory(str, Enum):
    maintenance = "maintenance"
    repair = "repair"
    inspection = "inspection"
    other = "other"


class WorkOrderUrgency(str, Enum):
    low = "low"
    normal = "normal"
    high = "high"
    urgent = "urgent"


class WorkOrderStatus(str, Enum):
    open = "open"
    in_progress = "in_progress"
    pending_parts = "pending_parts"
    closed = "closed"
    cancelled = "cancelled"


class CheckoutStatus(str, Enum):
    checked_out = "checked_out"
    returned = "returned"
    overdue = "overdue"


class Condition(str, Enum):
    new = "new"
    good = "good"
    fair = "fair"
    poor = "poor"


# Fleet Asset Schemas
class FleetAssetBase(BaseModel):
    asset_type: FleetAssetType
    name: str
    vin: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    division_id: Optional[uuid.UUID] = None
    odometer_current: Optional[int] = None
    odometer_last_service: Optional[int] = None
    hours_current: Optional[float] = None
    hours_last_service: Optional[float] = None
    status: FleetAssetStatus = FleetAssetStatus.active
    photos: Optional[List[uuid.UUID]] = None
    documents: Optional[List[uuid.UUID]] = None
    notes: Optional[str] = None


class FleetAssetCreate(FleetAssetBase):
    pass


class FleetAssetUpdate(BaseModel):
    name: Optional[str] = None
    vin: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    division_id: Optional[uuid.UUID] = None
    odometer_current: Optional[int] = None
    odometer_last_service: Optional[int] = None
    hours_current: Optional[float] = None
    hours_last_service: Optional[float] = None
    status: Optional[FleetAssetStatus] = None
    photos: Optional[List[uuid.UUID]] = None
    documents: Optional[List[uuid.UUID]] = None
    notes: Optional[str] = None


class FleetAssetResponse(FleetAssetBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True


# Equipment Schemas
class EquipmentBase(BaseModel):
    category: EquipmentCategory
    name: str
    serial_number: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    value: Optional[float] = None
    warranty_expiry: Optional[datetime] = None
    purchase_date: Optional[datetime] = None
    status: EquipmentStatus = EquipmentStatus.available
    photos: Optional[List[uuid.UUID]] = None
    documents: Optional[List[uuid.UUID]] = None
    notes: Optional[str] = None


class EquipmentCreate(EquipmentBase):
    pass


class EquipmentUpdate(BaseModel):
    name: Optional[str] = None
    serial_number: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    value: Optional[float] = None
    warranty_expiry: Optional[datetime] = None
    purchase_date: Optional[datetime] = None
    status: Optional[EquipmentStatus] = None
    photos: Optional[List[uuid.UUID]] = None
    documents: Optional[List[uuid.UUID]] = None
    notes: Optional[str] = None


class EquipmentResponse(EquipmentBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True


# Inspection Schemas
class FleetInspectionBase(BaseModel):
    fleet_asset_id: uuid.UUID
    inspection_date: datetime
    inspector_user_id: Optional[uuid.UUID] = None
    checklist_results: Optional[Dict[str, Any]] = None  # {tire_condition: pass/fail, etc.}
    photos: Optional[List[uuid.UUID]] = None
    result: InspectionResult = InspectionResult.pass_result
    notes: Optional[str] = None


class FleetInspectionCreate(FleetInspectionBase):
    pass


class FleetInspectionUpdate(BaseModel):
    inspection_date: Optional[datetime] = None
    inspector_user_id: Optional[uuid.UUID] = None
    checklist_results: Optional[Dict[str, Any]] = None
    photos: Optional[List[uuid.UUID]] = None
    result: Optional[InspectionResult] = None
    notes: Optional[str] = None


class FleetInspectionResponse(FleetInspectionBase):
    id: uuid.UUID
    auto_generated_work_order_id: Optional[uuid.UUID] = None
    created_at: datetime
    created_by: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True


# Work Order Schemas
class WorkOrderBase(BaseModel):
    entity_type: str  # "fleet" or "equipment"
    entity_id: uuid.UUID
    description: str
    category: WorkOrderCategory = WorkOrderCategory.maintenance
    urgency: WorkOrderUrgency = WorkOrderUrgency.normal
    status: WorkOrderStatus = WorkOrderStatus.open
    assigned_to_user_id: Optional[uuid.UUID] = None
    photos: Optional[Union[List[uuid.UUID], Dict[str, List[uuid.UUID]]]] = None  # Array of file_object_ids OR { before: [ids], after: [ids] }
    costs: Optional[Dict[str, Any]] = None  # Legacy: {labor: 0, parts: 0, other: 0, total: 0} or New: {labor: [{description: str, amount: float, invoice_files: List[uuid.UUID]}], parts: [...], other: [...]}
    documents: Optional[List[uuid.UUID]] = None  # Array of file_object_ids for invoices and documents
    origin_source: Optional[str] = None  # "manual" or "inspection"
    origin_id: Optional[uuid.UUID] = None


class WorkOrderCreate(WorkOrderBase):
    pass


class WorkOrderUpdate(BaseModel):
    description: Optional[str] = None
    category: Optional[WorkOrderCategory] = None
    urgency: Optional[WorkOrderUrgency] = None
    status: Optional[WorkOrderStatus] = None
    assigned_to_user_id: Optional[uuid.UUID] = None
    photos: Optional[Union[List[uuid.UUID], Dict[str, List[uuid.UUID]]]] = None  # Array of file_object_ids OR { before: [ids], after: [ids] }
    costs: Optional[Dict[str, Any]] = None  # Legacy: {labor: 0, parts: 0, other: 0, total: 0} or New: {labor: [{description: str, amount: float, invoice_files: List[uuid.UUID]}], parts: [...], other: [...]}
    documents: Optional[List[uuid.UUID]] = None
    notes: Optional[str] = None


class WorkOrderResponse(WorkOrderBase):
    id: uuid.UUID
    work_order_number: str
    assigned_by_user_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    created_by: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True


# Equipment Checkout Schemas
class EquipmentCheckoutBase(BaseModel):
    equipment_id: uuid.UUID
    checked_out_by_user_id: uuid.UUID
    checked_out_at: datetime
    expected_return_date: Optional[datetime] = None
    condition_out: Condition
    notes_out: Optional[str] = None


class EquipmentCheckoutCreate(EquipmentCheckoutBase):
    pass


class EquipmentCheckinUpdate(BaseModel):
    actual_return_date: datetime
    condition_in: Condition
    notes_in: Optional[str] = None


class EquipmentCheckoutResponse(EquipmentCheckoutBase):
    id: uuid.UUID
    actual_return_date: Optional[datetime] = None
    condition_in: Optional[Condition] = None
    notes_in: Optional[str] = None
    status: CheckoutStatus
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Log Schemas
class FleetLogBase(BaseModel):
    fleet_asset_id: uuid.UUID
    log_type: str  # usage|status_change|repair|inspection|other
    log_date: datetime
    user_id: Optional[uuid.UUID] = None
    description: str
    odometer_snapshot: Optional[int] = None
    hours_snapshot: Optional[float] = None
    status_snapshot: Optional[str] = None
    related_work_order_id: Optional[uuid.UUID] = None


class FleetLogCreate(FleetLogBase):
    pass


class FleetLogResponse(FleetLogBase):
    id: uuid.UUID
    created_at: datetime
    created_by: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True


class EquipmentLogBase(BaseModel):
    equipment_id: uuid.UUID
    log_type: str  # usage|issue|maintenance|checkout|checkin|other
    log_date: datetime
    user_id: Optional[uuid.UUID] = None
    description: str
    related_work_order_id: Optional[uuid.UUID] = None


class EquipmentLogCreate(EquipmentLogBase):
    pass


class EquipmentLogResponse(EquipmentLogBase):
    id: uuid.UUID
    created_at: datetime
    created_by: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True


# Dashboard Schema
class FleetDashboardResponse(BaseModel):
    total_fleet_assets: int
    total_vehicles: int
    total_heavy_machinery: int
    total_other_assets: int
    inspections_due_count: int
    inspections_due: List[Dict[str, Any]]
    open_work_orders_count: int
    in_progress_work_orders_count: int
    pending_parts_work_orders_count: int
    overdue_equipment_count: int
    overdue_equipment: List[Dict[str, Any]]

