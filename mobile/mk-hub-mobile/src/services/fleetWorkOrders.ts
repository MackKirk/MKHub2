import { api } from "./api";
import type {
  InspectionSchedule,
  WorkOrder,
  WorkOrderActivityEntry,
  WorkOrderCalendarItem,
  WorkOrderCheckInRequest,
  WorkOrderCheckOutRequest,
  WorkOrderCreateRequest,
  WorkOrderFileItem,
  WorkOrderListResponse,
  WorkOrderReopenRequest,
  WorkOrderStatusUpdateRequest,
  WorkOrderUpdateRequest
} from "../types/fleet";

export async function listWorkOrders(params: {
  status?: string;
  assigned_to?: string;
  entity_type?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
  dir?: "asc" | "desc";
}): Promise<WorkOrderListResponse> {
  const response = await api.get<WorkOrderListResponse>("/fleet/work-orders", { params });
  return response.data;
}

export async function getWorkOrder(workOrderId: string): Promise<WorkOrder> {
  const response = await api.get<WorkOrder>(`/fleet/work-orders/${workOrderId}`);
  return response.data;
}

export async function createWorkOrder(body: WorkOrderCreateRequest): Promise<WorkOrder> {
  const response = await api.post<WorkOrder>("/fleet/work-orders", body);
  return response.data;
}

export async function updateWorkOrder(
  workOrderId: string,
  body: WorkOrderUpdateRequest
): Promise<WorkOrder> {
  const response = await api.put<WorkOrder>(`/fleet/work-orders/${workOrderId}`, body);
  return response.data;
}

export async function updateWorkOrderStatus(
  workOrderId: string,
  body: WorkOrderStatusUpdateRequest
): Promise<WorkOrder> {
  const response = await api.put<WorkOrder>(`/fleet/work-orders/${workOrderId}/status`, body);
  return response.data;
}

export async function checkInWorkOrder(
  workOrderId: string,
  body: WorkOrderCheckInRequest
): Promise<WorkOrder> {
  const response = await api.put<WorkOrder>(`/fleet/work-orders/${workOrderId}/check-in`, body);
  return response.data;
}

export async function checkOutWorkOrder(
  workOrderId: string,
  body: WorkOrderCheckOutRequest
): Promise<WorkOrder> {
  const response = await api.put<WorkOrder>(`/fleet/work-orders/${workOrderId}/check-out`, body);
  return response.data;
}

export async function getWorkOrderActivity(workOrderId: string): Promise<WorkOrderActivityEntry[]> {
  const response = await api.get<WorkOrderActivityEntry[]>(
    `/fleet/work-orders/${workOrderId}/activity`
  );
  return response.data;
}

export async function reopenWorkOrder(
  workOrderId: string,
  body: WorkOrderReopenRequest
): Promise<WorkOrder> {
  const response = await api.put<WorkOrder>(`/fleet/work-orders/${workOrderId}/reopen`, body);
  return response.data;
}

export async function listWorkOrderFiles(workOrderId: string): Promise<WorkOrderFileItem[]> {
  const response = await api.get<WorkOrderFileItem[]>(`/fleet/work-orders/${workOrderId}/files`);
  return response.data;
}

export async function attachWorkOrderFile(
  workOrderId: string,
  params: {
    file_object_id: string;
    category: string;
    original_name: string;
  }
): Promise<void> {
  await api.post(`/fleet/work-orders/${workOrderId}/files`, null, { params });
}

export async function deleteWorkOrderFile(
  workOrderId: string,
  file: WorkOrderFileItem
): Promise<void> {
  if (file.is_legacy) {
    await api.delete(
      `/fleet/work-orders/${workOrderId}/files/legacy/${file.file_object_id}`,
      { params: { category: file.category } }
    );
    return;
  }
  await api.delete(`/fleet/work-orders/${workOrderId}/files/${file.id}`);
}

export async function uploadWorkOrderFile(file: {
  uri: string;
  name: string;
  type: string;
}): Promise<string> {
  const form = new FormData();
  form.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.type
  } as unknown as Blob);
  form.append("original_name", file.name);
  form.append("content_type", file.type);
  form.append("project_id", "");
  form.append("client_id", "");
  form.append("employee_id", "");
  form.append("category_id", "fleet-work-order");

  const response = await api.post<{ id: string }>("/files/upload-proxy", form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data.id;
}

export async function getWorkOrdersCalendar(params?: {
  start?: string;
  end?: string;
}): Promise<WorkOrderCalendarItem[]> {
  const response = await api.get<WorkOrderCalendarItem[]>("/fleet/work-orders/calendar", {
    params
  });
  return response.data;
}

export async function listInspectionSchedules(params?: {
  status?: string;
  search?: string;
  sort?: string;
  dir?: "asc" | "desc";
}): Promise<InspectionSchedule[]> {
  const response = await api.get<InspectionSchedule[]>("/fleet/inspection-schedules", { params });
  return response.data;
}

export async function getInspectionSchedule(scheduleId: string): Promise<InspectionSchedule> {
  const response = await api.get<InspectionSchedule>(`/fleet/inspection-schedules/${scheduleId}`);
  return response.data;
}

export async function startInspectionScheduleBody(
  scheduleId: string
): Promise<{ body_inspection_id: string }> {
  const response = await api.post<{ body_inspection_id: string }>(
    `/fleet/inspection-schedules/${scheduleId}/start-body`
  );
  return response.data;
}

export async function startInspectionScheduleMechanical(
  scheduleId: string
): Promise<{ mechanical_inspection_id: string }> {
  const response = await api.post<{ mechanical_inspection_id: string }>(
    `/fleet/inspection-schedules/${scheduleId}/start-mechanical`
  );
  return response.data;
}

export function buildWorkOrderAssetLine(
  entityType: string,
  fleet?: {
    make?: string | null;
    model?: string | null;
    name?: string | null;
    unit_number?: string | null;
  } | null,
  equipment?: {
    brand?: string | null;
    model?: string | null;
    name?: string | null;
    unit_number?: string | null;
  } | null
): string {
  const unitPart = (value: unknown) => {
    if (value == null) return "";
    const text = String(value).trim();
    return text ? `Unit #${text}` : "";
  };

  if (entityType === "fleet" && fleet) {
    const makeModel = [fleet.make, fleet.model].filter(Boolean).join(" ").trim();
    const core = makeModel || (fleet.name?.trim() ?? "");
    return [core, unitPart(fleet.unit_number)].filter(Boolean).join(" ");
  }

  if (entityType === "equipment" && equipment) {
    const brandModel = [equipment.brand, equipment.model].filter(Boolean).join(" ").trim();
    const core = brandModel || (equipment.name?.trim() ?? "");
    return [core, unitPart(equipment.unit_number)].filter(Boolean).join(" ");
  }

  return "";
}
