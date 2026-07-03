export type FleetAssetType = "vehicle" | "heavy_machinery" | "other";
export type FleetAssetStatus = "active" | "inactive" | "retired" | "maintenance";
export type EquipmentCategory =
  | "generator"
  | "tool"
  | "electronics"
  | "small_tool"
  | "safety";
export type EquipmentStatus = "active" | "inactive" | "maintenance" | "retired";
export type AssetCondition = "new" | "good" | "fair" | "poor";

export interface FleetAsset {
  id: string;
  asset_type: FleetAssetType;
  name?: string | null;
  unit_number?: string | null;
  license_plate?: string | null;
  vin?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  condition?: string | null;
  status: FleetAssetStatus;
  odometer_current?: number | null;
  odometer_last_service?: number | null;
  odometer_next_due_at?: number | null;
  odometer_noted_issues?: string | null;
  hours_current?: number | null;
  hours_last_service?: number | null;
  hours_next_due_at?: number | null;
  hours_noted_issues?: string | null;
  driver_id?: string | null;
  driver_name?: string | null;
  assigned_to_name?: string | null;
  yard_location?: string | null;
  fuel_type?: string | null;
  vehicle_type?: string | null;
  equipment_type_label?: string | null;
  icbc_registration_no?: string | null;
  vancouver_decals?: string[] | null;
  ferry_length?: string | null;
  gvw_kg?: number | null;
  gvw_value?: number | null;
  gvw_unit?: string | null;
  propane_sticker_cert?: string | null;
  propane_sticker_date?: string | null;
  driver_contact_phone?: string | null;
  photos?: string[] | null;
  documents?: string[] | null;
  notes?: string | null;
  created_at?: string | null;
}

export interface EquipmentItem {
  id: string;
  category: EquipmentCategory;
  name: string;
  unit_number?: string | null;
  serial_number?: string | null;
  brand?: string | null;
  model?: string | null;
  status: EquipmentStatus;
  assigned_to_name?: string | null;
}

export interface AssetAssignment {
  id: string;
  target_type: "fleet" | "equipment";
  fleet_asset_id?: string | null;
  equipment_id?: string | null;
  assigned_to_user_id?: string | null;
  assigned_to_name?: string | null;
  assigned_at: string;
  expected_return_at?: string | null;
  returned_at?: string | null;
  odometer_out?: number | null;
  odometer_in?: number | null;
  hours_out?: number | null;
  hours_in?: number | null;
  notes_out?: string | null;
  notes_in?: string | null;
}

export interface CurrentAssignment {
  id: string;
  target_type: "fleet" | "equipment";
  equipment_id?: string | null;
  fleet_asset_id?: string | null;
  asset_name: string;
  fleet_asset_type?: FleetAssetType | null;
  odometer_out?: number | null;
  hours_out?: number | null;
  assigned_at?: string | null;
  expected_return_at?: string | null;
}

export interface CurrentCheckout {
  id: string;
  equipment_id: string;
  equipment_name: string;
  equipment_category?: string;
  checked_out_at?: string | null;
  expected_return_date?: string | null;
  condition_out?: AssetCondition | null;
  notes_out?: string | null;
}

export interface UserAssetsResponse {
  current_checkouts: CurrentCheckout[];
  current_assignments: CurrentAssignment[];
  checkout_history: unknown[];
  assignment_history: unknown[];
}

export interface FleetAssetListResponse {
  items: FleetAsset[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface EquipmentListResponse {
  items: EquipmentItem[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface AssetAssignmentAssignRequest {
  assigned_to_user_id?: string;
  assigned_to_name?: string;
  odometer_out?: number | null;
  hours_out?: number | null;
  notes_out?: string | null;
  expected_return_at?: string | null;
}

export interface AssetAssignmentReturnRequest {
  odometer_in?: number | null;
  hours_in?: number | null;
  notes_in?: string | null;
}

export interface EquipmentCheckinRequest {
  actual_return_date: string;
  condition_in: AssetCondition;
  notes_in?: string | null;
}

export type FleetListKind = "vehicles" | "equipment" | "all";

export type WorkOrderEntityType = "fleet" | "equipment";

export type WorkOrderDetailTabKey = "general" | "costs" | "files" | "activity";

export interface WorkOrderCostItem {
  id?: string;
  description: string;
  amount: number;
  invoice_files?: string[];
}

export interface WorkOrderCosts {
  labor?: number | WorkOrderCostItem[];
  parts?: number | WorkOrderCostItem[];
  other?: number | WorkOrderCostItem[];
  total?: number;
}

export interface WorkOrderFileItem {
  id: string;
  file_object_id: string;
  category: string;
  original_name: string | null;
  uploaded_at: string | null;
  content_type: string | null;
  is_image: boolean;
  is_legacy?: boolean;
}

export interface WorkOrder {
  id: string;
  work_order_number: string;
  entity_type: WorkOrderEntityType;
  entity_id: string;
  description: string;
  category: string;
  urgency: string;
  status: string;
  origin_source?: string | null;
  origin_id?: string | null;
  assigned_to_user_id?: string | null;
  assigned_to_name?: string | null;
  costs?: WorkOrderCosts | null;
  scheduled_start_at?: string | null;
  estimated_duration_minutes?: number | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
  body_repair_required?: boolean;
  new_stickers_applied?: boolean;
  odometer_reading?: number | null;
  hours_reading?: number | null;
  created_at: string;
  updated_at?: string | null;
  closed_at?: string | null;
}

export interface WorkOrderListResponse {
  items: WorkOrder[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface WorkOrderCalendarItem {
  id: string;
  work_order_number: string;
  entity_id: string;
  scheduled_start_at?: string | null;
  estimated_duration_minutes?: number | null;
  expected_end_at?: string | null;
  status: string;
  asset_name?: string | null;
  unit_number?: string | null;
  work_order_type?: string | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
  created_at?: string | null;
}

export interface WorkOrderCreateRequest {
  entity_type: WorkOrderEntityType;
  entity_id: string;
  description: string;
  category?: string;
  urgency?: string;
  status?: string;
  assigned_to_user_id?: string | null;
  scheduled_start_at?: string | null;
  estimated_duration_minutes?: number | null;
  body_repair_required?: boolean;
  new_stickers_applied?: boolean;
  origin_source?: string;
}

export interface WorkOrderUpdateRequest {
  description?: string;
  category?: string;
  urgency?: string;
  scheduled_start_at?: string | null;
  estimated_duration_minutes?: number | null;
  body_repair_required?: boolean;
  new_stickers_applied?: boolean;
  notes?: string | null;
  costs?: WorkOrderCosts;
}

export interface WorkOrderReopenRequest {
  reason: string;
}

export interface WorkOrderStatusUpdateRequest {
  status: string;
  reason?: string | null;
}

export interface WorkOrderCheckInRequest {
  check_in_at?: string | null;
  odometer_reading?: number | null;
  hours_reading?: number | null;
}

export interface WorkOrderCheckOutRequest {
  check_out_at?: string | null;
  odometer_reading?: number | null;
  hours_reading?: number | null;
}

export interface WorkOrderActivityEntry {
  id: string;
  action: string;
  details?: Record<string, unknown>;
  created_at?: string | null;
  created_by?: string | null;
  created_by_display?: string | null;
}

export interface InspectionSchedule {
  id: string;
  fleet_asset_id: string;
  fleet_asset_name?: string | null;
  scheduled_at: string;
  urgency: string;
  category: string;
  status: string;
  notes?: string | null;
  created_at?: string | null;
  body_inspection_id?: string | null;
  mechanical_inspection_id?: string | null;
  body_result?: string | null;
  mechanical_result?: string | null;
}

export interface FleetInspectionChecklistResults {
  _metadata?: Record<string, string>;
  areas?: Array<{ key: string; condition?: string; issues?: string; photo_ids?: string[] }>;
  [key: string]: unknown;
}

export interface FleetInspection {
  id: string;
  fleet_asset_id: string;
  inspection_date: string;
  inspection_type?: string | null;
  inspection_schedule_id?: string | null;
  inspector_name?: string | null;
  result: string;
  notes?: string | null;
  photos?: string[] | null;
  checklist_results?: FleetInspectionChecklistResults | null;
  odometer_reading?: number | null;
  hours_reading?: number | null;
  auto_generated_work_order_id?: string | null;
  created_at: string;
}

export type FleetInspectionDetail = FleetInspection;

export interface InspectionChecklistTemplate {
  areas?: Array<{ key: string; label: string; description?: string }>;
  sections?: Array<{
    id: string;
    title: string;
    items: Array<{ key: string; label: string; category: string }>;
  }>;
}

export interface FleetComplianceRecord {
  id: string;
  fleet_asset_id: string;
  record_type: string;
  facility?: string | null;
  completed_by?: string | null;
  equipment_classification?: string | null;
  equipment_make_model?: string | null;
  serial_number?: string | null;
  annual_inspection_date?: string | null;
  expiry_date?: string | null;
  file_reference_number?: string | null;
  notes?: string | null;
}

export interface FleetHistoryItem {
  id: string;
  source: string;
  kind: string;
  title: string;
  subtitle?: string | null;
  detail?: string | null;
  occurred_at: string;
  actor_id?: string | null;
  actor_name?: string | null;
  assignment_id?: string | null;
  audit_action?: string | null;
}

export interface FleetHistoryResponse {
  items: FleetHistoryItem[];
}

export type FleetAssetDetailTabKey =
  | "general"
  | "inspections"
  | "work-orders"
  | "compliance"
  | "logs";
