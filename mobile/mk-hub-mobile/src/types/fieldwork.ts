import type { SafetyFormDefinition } from "../lib/safetyFormTemplate";

export type FieldworkRecordKind = "site_assessment" | "work_report";
export type FieldworkEntryType = "observation" | "work_performed";

export type FieldworkRecordStatus =
  | "draft"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "superseded";

export type FieldworkSettingsSnapshot = {
  require_final_comments?: boolean;
  require_min_photos?: number;
  default_pictures_folder?: string;
};

export type FieldworkPhoto = {
  id: string;
  record_id: string;
  file_object_id: string;
  client_file_id?: string | null;
  sort_order: number;
  entry_type: FieldworkEntryType | string;
  classification_item_id?: string | null;
  phrase_item_id?: string | null;
  classification_snapshot?: string | null;
  phrase_text_snapshot?: string | null;
  extra_notes?: string | null;
  client_mutation_id?: string | null;
};

export type FieldworkRecordEvent = {
  id: string;
  event_type: string;
  from_status?: string | null;
  to_status?: string | null;
  message?: string | null;
  created_at?: string | null;
  created_by_name?: string | null;
};

export type FieldworkRecord = {
  id: string;
  project_id: string;
  kind: FieldworkRecordKind | string;
  form_template_id?: string | null;
  form_definition_snapshot?: SafetyFormDefinition | Record<string, unknown> | null;
  form_payload: Record<string, unknown>;
  settings_snapshot?: FieldworkSettingsSnapshot | Record<string, unknown> | null;
  status: FieldworkRecordStatus | string;
  final_comments?: string | null;
  review_note?: string | null;
  version: number;
  row_version: number;
  photo_count?: number;
  pending_review?: boolean;
  created_at?: string | null;
  created_by_name?: string | null;
  updated_at?: string | null;
  photos?: FieldworkPhoto[];
  events?: FieldworkRecordEvent[];
};

export type FieldworkTemplatePick = {
  id: string;
  name: string;
  category: string;
  status: string;
  version_label?: string;
};

export type FieldworkPhraseOption = {
  value: string;
  label: string;
};

export type FieldworkPhraseCatalogs = {
  observation: { entry_type: string; list_name: string; list_id: string };
  work_performed: { entry_type: string; list_name: string; list_id: string };
};

/** Local pending photo before / during upload (persisted for recovery). */
export type FieldworkPendingPhoto = {
  localId: string;
  clientMutationId: string;
  uri: string;
  name: string;
  type: string;
  entryType: FieldworkEntryType;
  phraseItemId?: string | null;
  classificationItemId?: string | null;
  extraNotes?: string;
  status: "queued" | "uploading" | "failed" | "linked";
  error?: string;
  fileObjectId?: string;
  clientFileId?: string;
  photoId?: string;
  createdAt: string;
};
