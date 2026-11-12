import type { SafetyFormDefinition } from '@/types/safetyFormTemplate';

export type FieldworkRecordKind = 'site_assessment' | 'work_report';

export type FieldworkRecordStatus =
  | 'draft'
  | 'submitted'
  | 'changes_requested'
  | 'approved'
  | 'superseded';

export type FieldworkSettingsSnapshot = {
  require_final_comments?: boolean;
  require_min_photos?: number;
  default_pictures_folder?: string;
};

export type FieldworkPhotoObservation = {
  id: string;
  record_id: string;
  file_object_id: string;
  client_file_id?: string | null;
  sort_order: number;
  entry_type: 'observation' | 'work_performed' | string;
  classification_item_id?: string | null;
  phrase_item_id?: string | null;
  classification_snapshot?: string | null;
  phrase_text_snapshot?: string | null;
  extra_notes?: string | null;
  client_mutation_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type FieldworkRecordEvent = {
  id: string;
  event_type: string;
  from_status?: string | null;
  to_status?: string | null;
  message?: string | null;
  meta?: Record<string, unknown> | null;
  created_at?: string | null;
  created_by?: string | null;
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
  revision_of_id?: string | null;
  superseded_by_id?: string | null;
  photo_count?: number;
  pending_review?: boolean;
  created_at?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  submitted_at?: string | null;
  submitted_by?: string | null;
  submitted_by_name?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  reviewed_by_name?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  approved_by_name?: string | null;
  photos?: FieldworkPhotoObservation[];
  events?: FieldworkRecordEvent[];
};

export type FieldworkTemplatePick = {
  id: string;
  name: string;
  category: string;
  status: string;
  version_label?: string;
  definition_version?: number;
};
