export type SignatureSource = "onboarding" | "document_builder";

export type SignatureInboxStatus =
  | "action_required"
  | "waiting"
  | "signed"
  | "cancelled";

export interface SignatureInboxItem {
  id: string;
  source: SignatureSource;
  source_label?: string | null;
  title: string;
  status: SignatureInboxStatus;
  available_at?: string | null;
  deadline_at?: string | null;
  is_overdue?: boolean;
  block_on_overdue?: boolean;
  is_access_blocker?: boolean;
  required?: boolean | null;
  requested_by_name?: string | null;
  my_role_label?: string | null;
  participant_status?: string | null;
  subject_label?: string | null;
  user_message?: string | null;
  signed_at?: string | null;
  signed_file_id?: string | null;
  created_at?: string | null;
}

export interface SignatureInboxResponse {
  items: SignatureInboxItem[];
  sections: {
    action_required: number;
    waiting: number;
    completed: number;
  };
}

export interface SignatureTemplateField {
  id: string;
  type: string;
  page_index: number;
  rect: { x: number; y: number; width: number; height: number };
  field_name: string;
  required: boolean;
  assignee?: string;
  employee_info_key?: string;
}

export interface SigningContext {
  uses_template: boolean;
  signature_template: { version: number; fields: SignatureTemplateField[] } | null;
  page_sizes: { width: number; height: number }[];
  document_name: string;
  signer_role?: string;
  signer_role_label?: string;
}
