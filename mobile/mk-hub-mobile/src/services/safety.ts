import { api } from "./api";
import type { SafetyFormDefinition } from "../lib/safetyFormTemplate";

export interface SafetyInspection {
  id: string;
  project_id: string;
  inspection_date: string;
  template_version?: string;
  status?: string;
  form_payload?: Record<string, unknown>;
  form_template_id?: string | null;
  form_definition_snapshot?: SafetyFormDefinition | Record<string, unknown> | null;
  template_name?: string | null;
  template_version_label?: string | null;
  created_at?: string | null;
}

export interface FormTemplateOption {
  id: string;
  name: string;
  version_label?: string;
}

export async function getProjectSafetyInspections(
  projectId: string
): Promise<SafetyInspection[]> {
  const response = await api.get<SafetyInspection[]>(
    `/projects/${projectId}/safety-inspections`
  );
  return response.data;
}

export async function getSafetyInspection(
  projectId: string,
  inspectionId: string
): Promise<SafetyInspection> {
  const response = await api.get<SafetyInspection>(
    `/projects/${projectId}/safety-inspections/${inspectionId}`
  );
  return response.data;
}

export async function getSchedulableFormTemplates(): Promise<FormTemplateOption[]> {
  const response = await api.get<FormTemplateOption[]>("/form-templates", {
    params: { schedulable: true }
  });
  return response.data;
}

export async function createSafetyInspection(
  projectId: string,
  formTemplateId: string
): Promise<SafetyInspection> {
  const response = await api.post<SafetyInspection>(
    `/projects/${projectId}/safety-inspections`,
    {
      form_template_id: formTemplateId,
      form_payload: {},
      inspection_date: new Date().toISOString()
    }
  );
  return response.data;
}

export async function updateSafetyInspection(
  projectId: string,
  inspectionId: string,
  payload: {
    form_payload?: Record<string, unknown>;
    status?: "draft" | "finalized";
  }
): Promise<SafetyInspection> {
  const response = await api.put<SafetyInspection>(
    `/projects/${projectId}/safety-inspections/${inspectionId}`,
    payload
  );
  return response.data;
}
