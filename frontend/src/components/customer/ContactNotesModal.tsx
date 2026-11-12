import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { formatDateVancouver } from '@/lib/dateUtils';
import {
  AppBadge,
  AppButton,
  AppEmptyState,
  AppFormModal,
  AppListCreateItem,
  uiBorders,
  uiCx,
  uiLayout,
  uiTypography,
} from '@/components/ui';
import {
  clientNoteContactLabel,
  clientNoteProjectLabel,
  isClientCommunicationCategory,
  type ClientNote,
} from '@/lib/clientNotes';
import { ClientNoteModal } from '@/components/customer/CustomerNotesTab';

type ProjectOption = {
  id: string;
  code?: string;
  name?: string;
  is_bidding?: boolean;
};

type ReportCategory = {
  value?: string;
  label?: string;
  sort_index?: number;
  meta?: { group?: string; client_log?: boolean };
};

type ContactNotesModalProps = {
  open: boolean;
  onClose: () => void;
  clientId: string;
  apiBase?: string;
  contact: { id: string; name?: string | null };
  contacts: Array<{ id: string; name?: string | null }>;
  canWrite: boolean;
  reportCategories: ReportCategory[];
  projects: ProjectOption[];
};

export function ContactNotesModal({
  open,
  onClose,
  clientId,
  apiBase = '/clients',
  contact,
  contacts,
  canWrite,
  reportCategories,
  projects,
}: ContactNotesModalProps) {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ClientNote | null>(null);

  const contactId = String(contact.id);
  const contactName = (contact.name || '').trim() || 'Contact';

  const { data: notes = [], refetch, isLoading } = useQuery({
    queryKey: ['clientNotes', clientId, 'contact', contactId],
    queryFn: () =>
      api<ClientNote[]>('GET', `${apiBase}/${clientId}/notes?contact_id=${encodeURIComponent(contactId)}`),
    enabled: open && !!clientId && !!contactId,
  });

  const categoryOptions = useMemo(() => {
    return reportCategories
      .filter((cat) => {
        const value = String(cat.value || cat.label || '');
        const meta = cat.meta || {};
        return meta.client_log === true || isClientCommunicationCategory(value);
      })
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0))
      .map((cat) => ({
        value: String(cat.value || cat.label || ''),
        label: String(cat.label || cat.value || ''),
      }));
  }, [reportCategories]);

  const projectSelectOptions = useMemo(() => {
    const opts = [{ value: '', label: 'No project (general contact)' }];
    projects.forEach((p) => {
      const code = (p.code || '').trim();
      const name = (p.name || '').trim();
      const bid = p.is_bidding ? ' (Opportunity)' : '';
      opts.push({
        value: p.id,
        label: code && name ? `${code} · ${name}${bid}` : name || code || p.id,
      });
    });
    return opts;
  }, [projects]);

  const contactSelectOptions = useMemo(
    () => [
      { value: '', label: 'No contact (firm-level note)' },
      ...contacts.map((c) => ({
        value: String(c.id),
        label: (c.name || '').trim() || 'Contact',
      })),
    ],
    [contacts],
  );

  const refresh = async () => {
    await refetch();
    await queryClient.invalidateQueries({ queryKey: ['clientNotes', clientId] });
  };

  if (!open) return null;

  return (
    <>
      <AppFormModal
        open
        onClose={onClose}
        title={`Notes · ${contactName}`}
        description="Notes linked to this contact. They also appear on Notes / History for the firm."
        formWidth="comfortable"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
              Close
            </AppButton>
          </div>
        }
      >
        <div className="space-y-3">
          {canWrite ? (
            <AppListCreateItem
              label="Add note"
              layout="row"
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            />
          ) : null}

          {isLoading ? (
            <div className="space-y-2">
              <div className="h-14 animate-pulse rounded bg-gray-100" />
              <div className="h-14 animate-pulse rounded bg-gray-100" />
            </div>
          ) : notes.length === 0 ? (
            <AppEmptyState
              title="No notes for this contact"
              description={canWrite ? 'Add a note to record a meeting, call, or follow-up.' : undefined}
            />
          ) : (
            <div className={uiCx('overflow-hidden rounded-lg border', uiBorders.subtle)}>
              {notes.map((note) => {
                const catLabel =
                  categoryOptions.find((c) => c.value === note.category_id)?.label ||
                  note.category_id ||
                  'General';
                const projectLabel = clientNoteProjectLabel(note);
                const contactLabel = clientNoteContactLabel(note, contacts);
                const preview = (note.description || '').replace(/\s+/g, ' ').trim();
                const attachmentCount = Array.isArray(note.images?.attachments)
                  ? note.images.attachments.length
                  : 0;
                return (
                  <button
                    key={note.id}
                    type="button"
                    className={uiCx(
                      'w-full border-b p-3 text-left transition-colors last:border-b-0 hover:bg-gray-50',
                      uiBorders.subtle,
                    )}
                    onClick={() => {
                      if (!canWrite) return;
                      setEditing(note);
                      setEditorOpen(true);
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div className={uiCx(uiTypography.body, 'min-w-0 flex-1 font-semibold line-clamp-1')}>
                        {note.title || 'Untitled note'}
                      </div>
                      <div className="flex max-w-[55%] shrink-0 flex-wrap items-center justify-end gap-1">
                        <AppBadge variant="info" className="normal-case !text-[10px] !px-1.5 !py-0">
                          {catLabel}
                        </AppBadge>
                        {contactLabel ? (
                          <AppBadge variant="neutral" className="normal-case !text-[10px] !px-1.5 !py-0">
                            {contactLabel}
                          </AppBadge>
                        ) : null}
                        {projectLabel ? (
                          <AppBadge variant="neutral" className="normal-case !text-[10px] !px-1.5 !py-0">
                            {projectLabel}
                          </AppBadge>
                        ) : null}
                        {attachmentCount > 0 ? (
                          <AppBadge variant="neutral" className="normal-case !text-[10px] !px-1.5 !py-0">
                            {attachmentCount === 1 ? '1 attachment' : `${attachmentCount} attachments`}
                          </AppBadge>
                        ) : null}
                      </div>
                    </div>
                    {preview ? (
                      <div className={uiCx(uiTypography.helper, 'mt-1 line-clamp-2 italic')}>
                        “{preview}”
                      </div>
                    ) : null}
                    <div className={uiCx(uiTypography.helper, 'mt-1')}>
                      {note.created_at
                        ? formatDateVancouver(note.created_at, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : ''}
                      {note.created_by_name ? ` · ${note.created_by_name}` : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </AppFormModal>

      {editorOpen ? (
        <ClientNoteModal
          clientId={clientId}
          apiBase={apiBase}
          note={editing}
          categoryOptions={categoryOptions}
          projectOptions={projectSelectOptions}
          contactOptions={contactSelectOptions}
          initialContactId={contactId}
          lockContact
          onClose={() => {
            setEditorOpen(false);
            setEditing(null);
          }}
          onSuccess={async () => {
            const wasEdit = Boolean(editing);
            setEditorOpen(false);
            setEditing(null);
            await refresh();
            toast.success(wasEdit ? 'Note updated' : 'Note created');
          }}
        />
      ) : null}
    </>
  );
}
