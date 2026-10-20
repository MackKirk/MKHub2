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

export async function duplicateSafetyInspection(
  projectId: string,
  inspectionId: string
): Promise<SafetyInspection> {
  const response = await api.post<SafetyInspection>(
    `/projects/${projectId}/safety-inspections/${inspectionId}/duplicate`
  );
  return response.data;
}

export type SafetyFollowUp = {
  id: string;
  project_id: string;
  source_inspection_id: string;
  source_field_key: string;
  source_field_label_snapshot?: string | null;
  source_value_snapshot?: {
    value?: unknown;
    display?: string;
    required?: boolean;
    field_type?: string | null;
  } | null;
  source_inspection_date?: string | null;
  source_template_name?: string | null;
  form_template_id?: string | null;
  template_name?: string | null;
  form_definition_snapshot?: SafetyFormDefinition | Record<string, unknown> | null;
  form_payload?: Record<string, unknown>;
  label?: string | null;
  assigned_user_id?: string | null;
  worker_name?: string | null;
  due_date?: string | null;
  status: string;
  created_at?: string | null;
  completed_at?: string | null;
  project_name?: string;
  project_code?: string;
  project_address?: string;
  project_address_city?: string;
  project_address_province?: string;
  business_line?: string;
};

export async function listInspectionFollowUps(
  projectId: string,
  inspectionId: string
): Promise<SafetyFollowUp[]> {
  const response = await api.get<SafetyFollowUp[]>(
    `/projects/${projectId}/safety-inspections/${inspectionId}/follow-ups`
  );
  return response.data;
}

export async function createInspectionFollowUp(
  projectId: string,
  inspectionId: string,
  body: {
    field_key: string;
    form_template_id: string;
    assigned_user_id: string;
    due_date?: string | null;
    label?: string | null;
    form_payload?: Record<string, unknown>;
    /** Always completed on create (API forces completed). */
    status?: "completed";
  }
): Promise<SafetyFollowUp> {
  const response = await api.post<SafetyFollowUp>(
    `/projects/${projectId}/safety-inspections/${inspectionId}/follow-ups`,
    { ...body, status: "completed" }
  );
  return response.data;
}

export async function updateSafetyFollowUp(
  projectId: string,
  followUpId: string,
  body: {
    form_payload?: Record<string, unknown>;
    assigned_user_id?: string | null;
    due_date?: string | null;
    label?: string | null;
    status?: "pending" | "completed";
  }
): Promise<SafetyFollowUp> {
  const response = await api.put<SafetyFollowUp>(
    `/projects/${projectId}/safety-follow-ups/${followUpId}`,
    body
  );
  return response.data;
}

export async function listSafetyFollowUps(params?: {
  status?: string;
  assigned_to_me?: boolean;
  search?: string;
}): Promise<SafetyFollowUp[]> {
  const response = await api.get<SafetyFollowUp[]>("/safety/follow-ups", {
    params: {
      status: params?.status,
      assigned_to_me: params?.assigned_to_me ? true : undefined,
      search: params?.search,
      limit: 200
    }
  });
  return response.data;
}

export async function getFollowUpFormTemplates(): Promise<FormTemplateOption[]> {
  const response = await api.get<FormTemplateOption[]>("/form-templates", {
    params: { category: "follow_up", schedulable: true, sort: "name", sort_dir: "asc" }
  });
  return response.data;
}

export async function getFormTemplate(templateId: string): Promise<{
  id: string;
  name: string;
  definition?: SafetyFormDefinition | Record<string, unknown>;
}> {
  const response = await api.get<{
    id: string;
    name: string;
    definition?: SafetyFormDefinition | Record<string, unknown>;
  }>(`/form-templates/${encodeURIComponent(templateId)}`);
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
