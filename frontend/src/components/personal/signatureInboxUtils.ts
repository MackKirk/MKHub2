export type SignatureInboxItem = {
  id: string;
  source: 'onboarding' | 'document_builder';
  title: string;
  status: 'action_required' | 'waiting' | 'signed' | 'cancelled';
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
};

export type SignatureInboxResponse = {
  items: SignatureInboxItem[];
  sections: { action_required: number; waiting: number; completed: number };
};

export type SignatureCardVariant = 'overdue' | 'your_turn' | 'waiting' | 'signed' | 'cancelled';

export function getCardVariant(item: SignatureInboxItem): SignatureCardVariant {
  if (item.status === 'cancelled') return 'cancelled';
  if (item.status === 'signed') return 'signed';
  if (item.status === 'waiting') return 'waiting';
  if (item.is_access_blocker || item.is_overdue) return 'overdue';
  return 'your_turn';
}

export function sourceLabel(item: SignatureInboxItem): string {
  return item.source === 'onboarding' ? 'Onboarding' : 'Document Builder';
}

export function formatDueDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

export function daysOverdueLabel(deadlineIso: string | null | undefined): string | null {
  if (!deadlineIso) return null;
  try {
    const deadline = new Date(deadlineIso);
    const now = new Date();
    const diffMs = now.getTime() - deadline.getTime();
    if (diffMs <= 0) return null;
    const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return days === 1 ? '1 day overdue' : `${days} days overdue`;
  } catch {
    return null;
  }
}

export function sortActionRequired(items: SignatureInboxItem[]): SignatureInboxItem[] {
  const priority = (item: SignatureInboxItem) => {
    if (item.is_access_blocker) return 0;
    if (item.is_overdue) return 1;
    return 2;
  };
  return [...items].sort((a, b) => priority(a) - priority(b));
}

export function itemDomId(item: SignatureInboxItem): string {
  return `signature-item-${item.source}-${item.id}`;
}
