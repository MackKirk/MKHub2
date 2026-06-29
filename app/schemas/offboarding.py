from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class OffboardingDraftCreate(BaseModel):
    user_id: UUID
    termination_type: Optional[str] = None
    termination_date: Optional[str] = None
    last_working_day: Optional[str] = None
    internal_notes: Optional[str] = None
    access_revocation_timing: Optional[str] = None
    access_revoke_at_local: Optional[str] = None


class OffboardingStartCreate(OffboardingDraftCreate):
    termination_type: str
    termination_date: str
    last_working_day: str
    access_revocation_timing: str
    access_revoke_at_local: Optional[str] = None


class OffboardingUpdate(BaseModel):
    termination_type: Optional[str] = None
    termination_date: Optional[str] = None
    last_working_day: Optional[str] = None
    internal_notes: Optional[str] = None
    access_revocation_timing: Optional[str] = None
    access_revoke_at_local: Optional[str] = None


class OffboardingDeactivateAccess(BaseModel):
    reason: Optional[str] = None


class OffboardingCancel(BaseModel):
    clear_termination_date: bool = False
    reactivate_hub_access: bool = False
    reason: Optional[str] = None


class OffboardingChecklistToggle(BaseModel):
    completed: bool


class OffboardingListItem(BaseModel):
    id: str
    user_id: str
    employee_name: str
    position: Optional[str] = None
    division: Optional[str] = None
    termination_date: Optional[str] = None
    last_working_day: Optional[str] = None
    hub_access_active: bool
    status: str
    action_required: bool
    assets_pending_return: int
    created_at: str


class OffboardingListResponse(BaseModel):
    items: List[OffboardingListItem]
    total: int
    page: int
    limit: int
    total_pages: int


class OffboardingAssetRow(BaseModel):
    id: str
    source_type: str
    source_id: str
    asset_name: str
    asset_type: str
    assigned_since: Optional[str] = None
    current_status: str
    return_status: str
    fleet_asset_id: Optional[str] = None
    equipment_id: Optional[str] = None
    can_start_return: bool = False


class OffboardingChecklistRow(BaseModel):
    item_key: str
    label: str
    is_auto: bool
    is_completed: bool
    is_not_applicable: bool
    completed_at: Optional[str] = None
    completed_by_name: Optional[str] = None


class OffboardingActivityRow(BaseModel):
    id: str
    action: str
    action_label: str
    created_at: str
    performed_by_name: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class OffboardingOperationalSummary(BaseModel):
    assets_pending_return: int = 0
    future_shifts: int = 0
    pending_timesheets: int = 0
    project_admin_roles: int = 0
    onsite_lead_roles: int = 0
    safety_items: int = 0
    open_tasks: int = 0
    hub_access_active: bool = True
    project_roles: List[Dict[str, Any]] = Field(default_factory=list)
    future_shift_items: List[Dict[str, Any]] = Field(default_factory=list)
    safety_items_list: List[Dict[str, Any]] = Field(default_factory=list)


class OffboardingDetail(BaseModel):
    id: str
    user_id: str
    status: str
    termination_type: Optional[str] = None
    termination_date: Optional[str] = None
    last_working_day: Optional[str] = None
    internal_notes: Optional[str] = None
    access_revocation_timing: Optional[str] = None
    access_revoke_at: Optional[str] = None
    access_revoke_at_local: Optional[str] = None
    company_timezone: str
    access_revoked_at: Optional[str] = None
    hub_access_active: bool
    action_required: bool
    employee_name: str
    position: Optional[str] = None
    division: Optional[str] = None
    manager_user_id: Optional[str] = None
    manager_name: Optional[str] = None
    created_at: str
    created_by_name: Optional[str] = None
    operational_summary: OffboardingOperationalSummary
    completion_blockers: List[str] = Field(default_factory=list)
    completion_warnings: List[str] = Field(default_factory=list)
