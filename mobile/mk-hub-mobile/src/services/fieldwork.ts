import { api } from "./api";
import type {
  FieldworkEntryType,
  FieldworkPhraseCatalogs,
  FieldworkPhraseOption,
  FieldworkRecord,
  FieldworkRecordKind,
  FieldworkTemplatePick
} from "../types/fieldwork";

export async function listFieldworkRecords(projectId: string): Promise<FieldworkRecord[]> {
  const res = await api.get<FieldworkRecord[]>(
    `/projects/${encodeURIComponent(projectId)}/fieldwork-records`
  );
  return res.data || [];
}

export async function getFieldworkRecord(
  projectId: string,
  recordId: string
): Promise<FieldworkRecord> {
  const res = await api.get<FieldworkRecord>(
    `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(recordId)}`
  );
  return res.data;
}

export async function createFieldworkRecord(
  projectId: string,
  body: { kind: FieldworkRecordKind; form_template_id: string }
): Promise<FieldworkRecord> {
  const res = await api.post<FieldworkRecord>(
    `/projects/${encodeURIComponent(projectId)}/fieldwork-records`,
    { ...body, form_payload: {} }
  );
  return res.data;
}

export async function patchFieldworkRecord(
  projectId: string,
  recordId: string,
  body: {
    form_payload?: Record<string, unknown>;
    final_comments?: string | null;
    expected_row_version?: number;
  }
): Promise<FieldworkRecord> {
  const res = await api.patch<FieldworkRecord>(
    `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(recordId)}`,
    body
  );
  return res.data;
}

export async function submitFieldworkRecord(
  projectId: string,
  recordId: string,
  body: { final_comments?: string | null; expected_row_version?: number }
): Promise<FieldworkRecord> {
  const res = await api.post<FieldworkRecord>(
    `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(recordId)}/submit`,
    body
  );
  return res.data;
}

export async function listFieldworkTemplates(): Promise<FieldworkTemplatePick[]> {
  const res = await api.get<FieldworkTemplatePick[]>("/form-templates", {
    params: { domain: "fieldwork", status: "active", sort: "name", sort_dir: "asc" }
  });
  return res.data || [];
}

export async function getFieldworkPhraseCatalogs(): Promise<FieldworkPhraseCatalogs> {
  const res = await api.get<FieldworkPhraseCatalogs>("/fieldwork/phrase-catalogs");
  return res.data;
}

export async function getPhraseLeafOptions(listId: string): Promise<FieldworkPhraseOption[]> {
  const res = await api.get<{ leaf_options?: FieldworkPhraseOption[] }>(
    `/form-custom-lists/${encodeURIComponent(listId)}`,
    { params: { for_runtime: true } }
  );
  return Array.isArray(res.data?.leaf_options) ? res.data.leaf_options : [];
}

export async function createFieldworkPhoto(
  projectId: string,
  recordId: string,
  body: {
    file_object_id: string;
    client_file_id?: string | null;
    entry_type: FieldworkEntryType;
    phrase_item_id: string;
    classification_item_id?: string | null;
    extra_notes?: string | null;
    client_mutation_id?: string;
    expected_row_version?: number;
  }
): Promise<{ photo: unknown; recordRowVersionHint?: number }> {
  const res = await api.post(
    `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(recordId)}/photos`,
    body
  );
  return { photo: res.data };
}

export async function patchFieldworkPhoto(
  projectId: string,
  recordId: string,
  photoId: string,
  body: {
    entry_type?: FieldworkEntryType;
    phrase_item_id?: string;
    classification_item_id?: string | null;
    extra_notes?: string | null;
    expected_row_version?: number;
  }
): Promise<unknown> {
  const res = await api.patch(
    `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(recordId)}/photos/${encodeURIComponent(photoId)}`,
    body
  );
  return res.data;
}

export function kindLabel(kind?: string | null): string {
  const k = (kind || "").toLowerCase();
  if (k === "site_assessment") return "Site Assessment";
  if (k === "work_report") return "Work Report";
  return kind || "Field report";
}

export function statusLabel(status?: string | null): string {
  const st = (status || "").toLowerCase();
  if (st === "submitted") return "Pending review";
  if (st === "changes_requested") return "Changes requested";
  if (st === "approved") return "Approved";
  if (st === "superseded") return "Superseded";
  return "Draft";
}

export function isEditableFieldworkStatus(status?: string | null): boolean {
  const st = (status || "").toLowerCase();
  return st === "draft" || st === "changes_requested";
}
