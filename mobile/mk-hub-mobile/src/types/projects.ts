export interface ProjectListItem {
  id: string;
  code: string;
  name: string;
  slug?: string;
  client_id?: string;
  created_at?: string;
  date_start?: string;
  date_end?: string;
  progress?: number;
  status_label?: string;
  is_bidding?: boolean;
  client_display_name?: string;
  client_name?: string;
}

export interface ProjectDetail extends ProjectListItem {
  related_client_ids?: string[];
  related_client_display_names?: Array<string | null>;
  address?: string | null;
  address_city?: string | null;
  address_province?: string | null;
  address_country?: string | null;
  address_postal_code?: string | null;
  description?: string | null;
  status_id?: string | null;
  division_id?: string | null;
  status_changed_at?: string | null;
  division_ids?: string[] | null;
  project_division_ids?: string[] | null;
  project_division_percentages?: Record<string, number> | null;
  site_id?: string | null;
  site_name?: string | null;
  site_address_line1?: string | null;
  site_city?: string | null;
  site_province?: string | null;
  site_country?: string | null;
  site_postal_code?: string | null;
  estimator_id?: string | null;
  estimator_ids?: string[];
  project_admin_id?: string | null;
  onsite_lead_id?: string | null;
  division_onsite_leads?: Record<string, string> | null;
  contact_id?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  date_eta?: string | null;
  cost_estimated?: number | null;
  cost_actual?: number | null;
  service_value?: number | null;
  lead_source?: string | null;
  lat?: number | null;
  lng?: number | null;
  timezone?: string | null;
  image_file_object_id?: string | null;
  image_manually_set?: boolean;
}

export interface ProjectFileItem {
  id: string;
  file_object_id: string;
  category?: string | null;
  folder_id?: string | null;
  key?: string | null;
  original_name?: string | null;
  uploaded_at?: string | null;
  content_type?: string | null;
  is_image?: boolean;
}

export interface ProjectFileCategory {
  id: string;
  name: string;
  icon?: string;
}

export interface ProjectAuditLogEntry {
  id: string;
  timestamp?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  action?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_avatar_file_id?: string | null;
  actor_role?: string | null;
  source?: string | null;
  changes?: Record<string, unknown> | null;
  context?: Record<string, unknown> | null;
  affected_user_id?: string | null;
  affected_user_name?: string | null;
  project_name?: string | null;
  worker_name?: string | null;
}

