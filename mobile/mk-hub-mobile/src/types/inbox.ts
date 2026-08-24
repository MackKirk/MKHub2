export interface InboxNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
  link?: string | null;
}

export interface SignatureRequestRow {
  id: string;
  display_name: string;
  status: string;
  my_status?: string | null;
  my_role_label?: string | null;
  requested_by_name?: string | null;
  created_at?: string | null;
}

export interface OnboardingDocumentRow {
  id: string;
  document_name: string;
  status: string;
  deadline_at?: string | null;
  remaining_days?: number | null;
  required?: boolean;
  subject_label?: string | null;
}
