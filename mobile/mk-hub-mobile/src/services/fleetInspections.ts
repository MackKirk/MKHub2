import { api } from "./api";
import type {
  FleetInspectionDetail,
  InspectionChecklistTemplate,
  WorkOrder
} from "../types/fleet";

export async function getFleetInspection(inspectionId: string): Promise<FleetInspectionDetail> {
  const response = await api.get<FleetInspectionDetail>(`/fleet/inspections/${inspectionId}`);
  return response.data;
}

export async function updateFleetInspection(
  inspectionId: string,
  body: {
    checklist_results?: Record<string, unknown>;
    result?: string;
    notes?: string;
    photos?: string[];
  }
): Promise<FleetInspectionDetail> {
  const response = await api.put<FleetInspectionDetail>(
    `/fleet/inspections/${inspectionId}`,
    body
  );
  return response.data;
}

export async function getInspectionChecklistTemplate(
  type: "body" | "mechanical"
): Promise<InspectionChecklistTemplate> {
  const response = await api.get<InspectionChecklistTemplate>(
    "/fleet/inspections/checklist-template",
    { params: { type } }
  );
  return response.data;
}

export async function uploadInspectionPhoto(file: {
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
  form.append("category_id", "fleet-inspection");

  const response = await api.post<{ id: string }>("/files/upload-proxy", form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data.id;
}

export async function getSuggestedWorkOrderDescription(
  inspectionId: string
): Promise<string> {
  const response = await api.get<{ description: string }>(
    `/fleet/inspections/${inspectionId}/suggested-work-order-description`
  );
  return response.data.description;
}

export async function generateWorkOrderFromInspection(
  inspectionId: string
): Promise<WorkOrder> {
  const response = await api.post<WorkOrder>(
    `/fleet/inspections/${inspectionId}/generate-work-order`
  );
  return response.data;
}
