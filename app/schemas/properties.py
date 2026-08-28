from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class PropertyEntityBase(BaseModel):
    legal_name: str
    display_name: Optional[str] = None
    entity_type: str = "company"
    notes: Optional[str] = None
    active: bool = True


class PropertyEntityCreate(PropertyEntityBase):
    pass


class PropertyEntityUpdate(BaseModel):
    legal_name: Optional[str] = None
    display_name: Optional[str] = None
    entity_type: Optional[str] = None
    notes: Optional[str] = None
    active: Optional[bool] = None


class PropertyEntityResponse(PropertyEntityBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None


class PropertyOwnerInput(BaseModel):
    entity_id: uuid.UUID
    ownership_percentage: Optional[float] = None


class PropertyOwnerResponse(PropertyOwnerInput):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_display_name: Optional[str] = None
    entity_legal_name: Optional[str] = None


class PropertyBase(BaseModel):
    name: str
    property_type: Optional[str] = None
    ownership: str = "owned"
    visibility: str = "company"
    status: str = "active"
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    notes: Optional[str] = None
    image_file_object_id: Optional[uuid.UUID] = None


class PropertyCreate(PropertyBase):
    owners: List[PropertyOwnerInput] = Field(default_factory=list)
    access_user_ids: List[uuid.UUID] = Field(default_factory=list)


class PropertyUpdate(BaseModel):
    name: Optional[str] = None
    property_type: Optional[str] = None
    ownership: Optional[str] = None
    visibility: Optional[str] = None
    status: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    notes: Optional[str] = None
    image_file_object_id: Optional[uuid.UUID] = None
    owners: Optional[List[PropertyOwnerInput]] = None
    access_user_ids: Optional[List[uuid.UUID]] = None


class PropertyListItemResponse(PropertyBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    owner_summary: Optional[str] = None
    ownership_percentage_total: Optional[float] = None


class PropertyDetailResponse(PropertyBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None
    owners: List[PropertyOwnerResponse] = Field(default_factory=list)
    access_user_ids: List[uuid.UUID] = Field(default_factory=list)
    ownership_percentage_total: Optional[float] = None


class PropertyListResponse(BaseModel):
    items: List[PropertyListItemResponse]
    total: int
    page: int
    limit: int
    total_pages: int


class PropertyMapPoint(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    address_line1: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    visibility: str
    property_type: Optional[str] = None
    ownership: Optional[str] = None


class PropertyMapPointsResponse(BaseModel):
    items: List[PropertyMapPoint] = Field(default_factory=list)


class PropertyLeaseBase(BaseModel):
    role: str
    landlord_entity_id: Optional[uuid.UUID] = None
    tenant_entity_id: Optional[uuid.UUID] = None
    counterparty_name: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    base_rent: Optional[float] = None
    rent_frequency: Optional[str] = None
    currency: Optional[str] = "CAD"
    deposit: Optional[float] = None
    renewal_type: Optional[str] = None
    renewal_date: Optional[date] = None
    notice_days: Optional[int] = None
    status: str = "draft"
    notes: Optional[str] = None


class PropertyLeaseCreate(PropertyLeaseBase):
    pass


class PropertyLeaseUpdate(BaseModel):
    role: Optional[str] = None
    landlord_entity_id: Optional[uuid.UUID] = None
    tenant_entity_id: Optional[uuid.UUID] = None
    counterparty_name: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    base_rent: Optional[float] = None
    rent_frequency: Optional[str] = None
    currency: Optional[str] = None
    deposit: Optional[float] = None
    renewal_type: Optional[str] = None
    renewal_date: Optional[date] = None
    notice_days: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class PropertyLeaseResponse(PropertyLeaseBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    property_id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None


class PropertyInsurancePolicyBase(BaseModel):
    provider: Optional[str] = None
    broker: Optional[str] = None
    policy_number: Optional[str] = None
    policy_type: Optional[str] = None
    effective_date: Optional[date] = None
    expiry_date: Optional[date] = None
    coverage_amount: Optional[float] = None
    deductible: Optional[float] = None
    annual_premium: Optional[float] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    notes: Optional[str] = None


class PropertyInsurancePolicyCreate(PropertyInsurancePolicyBase):
    pass


class PropertyInsurancePolicyUpdate(BaseModel):
    provider: Optional[str] = None
    broker: Optional[str] = None
    policy_number: Optional[str] = None
    policy_type: Optional[str] = None
    effective_date: Optional[date] = None
    expiry_date: Optional[date] = None
    coverage_amount: Optional[float] = None
    deductible: Optional[float] = None
    annual_premium: Optional[float] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    notes: Optional[str] = None


class PropertyInsurancePolicyResponse(PropertyInsurancePolicyBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    property_id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None


class PropertyTaxRecordBase(BaseModel):
    jurisdiction: Optional[str] = None
    tax_year: int
    assessed_value: Optional[float] = None
    tax_amount: Optional[float] = None
    due_date: Optional[date] = None
    paid_date: Optional[date] = None
    status: str = "upcoming"
    notes: Optional[str] = None


class PropertyTaxRecordCreate(PropertyTaxRecordBase):
    pass


class PropertyTaxRecordUpdate(BaseModel):
    jurisdiction: Optional[str] = None
    tax_year: Optional[int] = None
    assessed_value: Optional[float] = None
    tax_amount: Optional[float] = None
    due_date: Optional[date] = None
    paid_date: Optional[date] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class PropertyTaxRecordResponse(PropertyTaxRecordBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    property_id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None


class PropertyPermitChecklistItem(BaseModel):
    id: str
    label: str
    done: bool = False


class PropertyPermitBase(BaseModel):
    permit_type: Optional[str] = None
    title: Optional[str] = None
    permit_number: Optional[str] = None
    authority: Optional[str] = None
    stage: str = "identified"
    issued_date: Optional[date] = None
    expiry_date: Optional[date] = None
    checklist: List[PropertyPermitChecklistItem] = Field(default_factory=list)
    notes: Optional[str] = None


class PropertyPermitCreate(PropertyPermitBase):
    property_id: uuid.UUID


class PropertyPermitUpdate(BaseModel):
    permit_type: Optional[str] = None
    title: Optional[str] = None
    permit_number: Optional[str] = None
    authority: Optional[str] = None
    stage: Optional[str] = None
    issued_date: Optional[date] = None
    expiry_date: Optional[date] = None
    checklist: Optional[List[PropertyPermitChecklistItem]] = None
    notes: Optional[str] = None


class PropertyPermitStageUpdate(BaseModel):
    stage: str


class PropertyPermitResponse(PropertyPermitBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    property_id: uuid.UUID
    property_name: Optional[str] = None
    compliance_label: Optional[str] = None
    compliance_status: Optional[str] = None  # ok|warning|expired|none
    created_at: datetime
    updated_at: Optional[datetime] = None


class PropertyFileCreate(BaseModel):
    file_object_id: uuid.UUID
    category: Optional[str] = None
    related_type: Optional[str] = None
    related_id: Optional[uuid.UUID] = None
    folder: Optional[str] = None
    description: Optional[str] = None
    original_name: Optional[str] = None


class PropertyFileUpdate(BaseModel):
    category: Optional[str] = None
    folder: Optional[str] = None
    description: Optional[str] = None
    original_name: Optional[str] = None


class PropertyFileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    property_id: uuid.UUID
    file_object_id: uuid.UUID
    category: Optional[str] = None
    related_type: Optional[str] = None
    related_id: Optional[uuid.UUID] = None
    folder: Optional[str] = None
    description: Optional[str] = None
    original_name: Optional[str] = None
    uploaded_at: datetime
    uploaded_by: Optional[uuid.UUID] = None
    content_type: Optional[str] = None
    is_image: Optional[bool] = None


class PropertyResponsibilityBase(BaseModel):
    role: str
    user_id: Optional[uuid.UUID] = None
    contact_name: Optional[str] = None
    contact_company: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    notes: Optional[str] = None


class PropertyResponsibilityCreate(PropertyResponsibilityBase):
    pass


class PropertyResponsibilityUpdate(BaseModel):
    role: Optional[str] = None
    user_id: Optional[uuid.UUID] = None
    contact_name: Optional[str] = None
    contact_company: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    notes: Optional[str] = None


class PropertyResponsibilityResponse(PropertyResponsibilityBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    property_id: uuid.UUID
    user_display_name: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class PropertyMaintenanceItemBase(BaseModel):
    item_type: Optional[str] = None
    title: str
    frequency: Optional[str] = None
    next_due_date: Optional[date] = None
    last_completed_date: Optional[date] = None
    responsible_user_id: Optional[uuid.UUID] = None
    status: str = "scheduled"
    notes: Optional[str] = None


class PropertyMaintenanceItemCreate(PropertyMaintenanceItemBase):
    pass


class PropertyMaintenanceItemUpdate(BaseModel):
    item_type: Optional[str] = None
    title: Optional[str] = None
    frequency: Optional[str] = None
    next_due_date: Optional[date] = None
    last_completed_date: Optional[date] = None
    responsible_user_id: Optional[uuid.UUID] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class PropertyMaintenanceItemResponse(PropertyMaintenanceItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    property_id: uuid.UUID
    responsible_user_name: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class PropertyDashboardResponse(BaseModel):
    total_properties: int
    company_properties: int
    family_properties: int
    leases_expiring_count: int
    leases_expired_count: int
    insurance_expiring_count: int
    permits_expired_count: int
    tax_due_count: int
    tax_overdue_count: int
    leases_expiring: List[Dict[str, Any]] = Field(default_factory=list)
    leases_expired: List[Dict[str, Any]] = Field(default_factory=list)
    insurance_expiring: List[Dict[str, Any]] = Field(default_factory=list)
    permits_expired: List[Dict[str, Any]] = Field(default_factory=list)
    tax_due: List[Dict[str, Any]] = Field(default_factory=list)


class PropertyCalendarEvent(BaseModel):
    id: str
    event_type: str
    title: str
    property_id: str
    property_name: str
    date: date
    status: Optional[str] = None
    related_id: Optional[str] = None


class PropertyCalendarResponse(BaseModel):
    events: List[PropertyCalendarEvent]
