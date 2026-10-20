/** Categories stored on the customer communication log (mirrored on linked projects). */
export const CLIENT_COMMUNICATION_CATEGORY_IDS = new Set([
  'client-communication-log',
  'client-request',
  'client-contact-update',
  'prospecting',
  'legal-action',
  'warranty-contact',
  'preventive-maintenance',
]);

export function isClientCommunicationCategory(categoryId?: string | null): boolean {
  if (!categoryId) return false;
  return CLIENT_COMMUNICATION_CATEGORY_IDS.has(String(categoryId).trim().toLowerCase());
}

export type ClientNote = {
  id: string;
  source?: 'client_note' | 'project_report';
  client_id?: string | null;
  project_id?: string | null;
  project_code?: string | null;
  project_name?: string | null;
  title?: string;
  category_id?: string;
  description?: string;
  images?: {
    attachments?: Array<{
      file_object_id?: string;
      original_name?: string;
      content_type?: string;
    }>;
  };
  status?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  created_by_name?: string;
};

export function clientNoteProjectLabel(note: ClientNote): string | null {
  if (!note.project_id) return null;
  const code = (note.project_code || '').trim();
  const name = (note.project_name || '').trim();
  if (code && name) return `${code} · ${name}`;
  return code || name || 'Linked project';
}
