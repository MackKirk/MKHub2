import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, withFileAccessToken } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { ReportNoteBody } from '@/components/ReportNoteBody';
import { ReportAttachmentAreaMultiple } from '@/components/ReportAttachmentArea';
import {
  AppBadge,
  AppButton,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppSelect,
  AppTextarea,
  appSectionPresetProps,
  AppSectionHeader,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
  uiUserSelect,
} from '@/components/ui';
import {
  clientNoteProjectLabel,
  isClientCommunicationCategory,
  type ClientNote,
} from '@/lib/clientNotes';

type ProjectOption = {
  id: string;
  code?: string;
  name?: string;
  is_bidding?: boolean;
};

type ReportCategory = {
  id?: string;
  value?: string;
  label?: string;
  sort_index?: number;
  meta?: { group?: string; client_log?: boolean };
};

type AuthorInfo = { name: string; avatar: string };

type CustomerNotesTabProps = {
  clientId: string;
  canWrite: boolean;
  reportCategories: ReportCategory[];
  projects: ProjectOption[];
};

function getAuthorInfo(createdBy: string | null | undefined, createdByName?: string | null): AuthorInfo {
  const name = (createdByName || '').trim() || 'Unknown';
  const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=e5e7eb&color=374151&size=64`;
  return { name, avatar };
}

function getPreviewText(text: string, maxLength = 120): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength)}…`;
}

function getAttachmentIcon(contentType: string, originalName: string): string {
  if ((contentType || '').startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(originalName || '')) {
    return '🖼️';
  }
  if ((contentType || '').includes('pdf') || /\.pdf$/i.test(originalName || '')) return '📄';
  return '📎';
}

export function CustomerNotesTab({
  clientId,
  canWrite,
  reportCategories,
  projects,
}: CustomerNotesTabProps) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClientNote | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');

  const { data: notes = [], refetch, isLoading } = useQuery({
    queryKey: ['clientNotes', clientId],
    queryFn: () => api<ClientNote[]>('GET', `/clients/${clientId}/notes`),
    enabled: !!clientId,
  });

  const communicationCategories = useMemo(() => {
    return reportCategories
      .filter((cat) => {
        const value = String(cat.value || cat.label || '');
        const meta = cat.meta || {};
        return meta.client_log === true || isClientCommunicationCategory(value);
      })
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
  }, [reportCategories]);

  const categoryOptions = useMemo(
    () =>
      communicationCategories.map((cat) => ({
        value: String(cat.value || cat.label || ''),
        label: String(cat.label || cat.value || ''),
      })),
    [communicationCategories],
  );

  const filterOptions = useMemo(() => {
    const counts: Record<string, number> = { '': notes.length };
    notes.forEach((n) => {
      const key = n.category_id || '';
      counts[key] = (counts[key] || 0) + 1;
    });
    return [
      { value: '', label: `All (${counts[''] || 0})` },
      ...categoryOptions.map((opt) => ({
        value: opt.value,
        label: `${opt.label} (${counts[opt.value] || 0})`,
      })),
    ];
  }, [notes, categoryOptions]);

  const filteredNotes = useMemo(() => {
    if (!categoryFilter) return notes;
    return notes.filter((n) => n.category_id === categoryFilter);
  }, [notes, categoryFilter]);

  const selected = useMemo(
    () => (selectedId ? filteredNotes.find((n) => n.id === selectedId) || notes.find((n) => n.id === selectedId) : null),
    [selectedId, filteredNotes, notes],
  );

  useEffect(() => {
    if (filteredNotes.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredNotes.some((n) => n.id === selectedId)) {
      setSelectedId(filteredNotes[0].id);
    }
  }, [filteredNotes, selectedId]);

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

  const refresh = async () => {
    await refetch();
    await queryClient.invalidateQueries({ queryKey: ['clientNotes', clientId] });
  };

  return (
    <div className={uiCx(uiSpacing.sectionStack, 'min-h-[28rem]')}>
      <AppSectionHeader
        title="Notes / History"
        description="Communication log for this customer — calls, emails, requests, and follow-ups."
        {...appSectionPresetProps('notesHistory')}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:min-h-[28rem]">
        <div
          className={uiCx(
            'flex w-full flex-col overflow-hidden lg:w-[32%]',
            uiRadius.card,
            uiBorders.subtle,
            uiColors.surface,
          )}
        >
          <div className={uiCx('border-b p-3', uiBorders.subtle)}>
            <AppSelect
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={filterOptions}
              sortOptions={false}
            />
          </div>
          {canWrite && (
            <div className={uiCx('border-b p-2', uiBorders.subtle)}>
              <AppListCreateItem
                label="New note"
                onClick={() => {
                  setEditing(null);
                  setModalOpen(true);
                }}
              />
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-3">
                <div className="h-16 animate-pulse rounded bg-gray-100" />
                <div className="h-16 animate-pulse rounded bg-gray-100" />
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="p-4">
                <AppEmptyState
                  title="No notes yet"
                  description="Record customer contacts, requests, and follow-ups here."
                />
              </div>
            ) : (
              filteredNotes.map((note) => {
                const author = getAuthorInfo(note.created_by, note.created_by_name);
                const catLabel =
                  communicationCategories.find((c) => c.value === note.category_id)?.label ||
                  note.category_id ||
                  'General';
                const projectLabel = clientNoteProjectLabel(note);
                const active = selectedId === note.id;
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => setSelectedId(note.id)}
                    className={uiCx(
                      'w-full border-b p-3 text-left transition-colors',
                      uiBorders.subtle,
                      active ? 'bg-gray-100' : 'hover:bg-gray-50',
                    )}
                  >
                    <div className={uiCx(uiTypography.body, 'font-semibold line-clamp-1')}>
                      {note.title || 'Untitled note'}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <AppBadge variant="info">{catLabel}</AppBadge>
                      {projectLabel ? <AppBadge variant="neutral">{projectLabel}</AppBadge> : null}
                    </div>
                    <div className={uiCx(uiTypography.helper, 'mt-1 line-clamp-2')}>
                      {getPreviewText(note.description || '')}
                    </div>
                    <div className={uiCx(uiTypography.helper, 'mt-2 flex items-center gap-2')}>
                      <img src={author.avatar} alt="" className={uiCx(uiUserSelect.avatarSm, 'rounded-full')} />
                      <span>
                        {author.name}
                        {note.created_at
                          ? ` · ${new Date(note.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}`
                          : ''}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div
          className={uiCx(
            'flex min-h-[20rem] flex-1 flex-col overflow-hidden',
            uiRadius.card,
            uiBorders.subtle,
            uiColors.surface,
          )}
        >
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <AppEmptyState title="Select a note" description="Choose a note from the list to view details." />
            </div>
          ) : (
            <NoteDetail
              note={selected}
              categoryLabel={
                communicationCategories.find((c) => c.value === selected.category_id)?.label ||
                selected.category_id ||
                'General'
              }
              canWrite={canWrite}
              onEdit={() => {
                setEditing(selected);
                setModalOpen(true);
              }}
              onDelete={async () => {
                const result = await confirm({
                  title: 'Delete note',
                  message: `Delete "${selected.title || 'this note'}"? This cannot be undone.`,
                  confirmText: 'Delete',
                  cancelText: 'Cancel',
                });
                if (result !== 'confirm') return;
                try {
                  await api('DELETE', `/clients/${clientId}/notes/${selected.id}`);
                  toast.success('Note deleted');
                  setSelectedId(null);
                  await refresh();
                } catch {
                  toast.error('Failed to delete note');
                }
              }}
            />
          )}
        </div>
      </div>

      {modalOpen && (
        <ClientNoteModal
          clientId={clientId}
          note={editing}
          categoryOptions={categoryOptions}
          projectOptions={projectSelectOptions}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSuccess={async () => {
            const wasEdit = Boolean(editing);
            setModalOpen(false);
            setEditing(null);
            await refresh();
            toast.success(wasEdit ? 'Note updated' : 'Note created');
          }}
        />
      )}
    </div>
  );
}

function NoteDetail({
  note,
  categoryLabel,
  canWrite,
  onEdit,
  onDelete,
}: {
  note: ClientNote;
  categoryLabel: string;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const author = getAuthorInfo(note.created_by, note.created_by_name);
  const projectLabel = clientNoteProjectLabel(note);
  const attachments = note.images?.attachments || [];
  const reportDate = note.created_at ? new Date(note.created_at) : null;

  return (
    <>
      <div className={uiCx('flex-shrink-0 border-b', uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.compactCardPadding)}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className={uiTypography.sectionTitle}>{note.title || 'Untitled note'}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <img
                  src={author.avatar}
                  alt={author.name}
                  className={uiCx(uiUserSelect.avatarSm, 'rounded-full object-cover')}
                />
                <div>
                  <div className={uiCx(uiTypography.body, 'font-semibold')}>{author.name}</div>
                  <div className={uiTypography.helper}>
                    {reportDate
                      ? reportDate.toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </div>
                </div>
              </div>
              <AppBadge variant="info">{categoryLabel}</AppBadge>
              {projectLabel ? <AppBadge variant="neutral">{projectLabel}</AppBadge> : null}
            </div>
          </div>
          {canWrite && (
            <div className={uiCx(uiLayout.actionsRow, 'shrink-0')}>
              <AppButton type="button" size="sm" variant="secondary" onClick={onEdit}>
                Edit
              </AppButton>
              <AppButton type="button" size="sm" variant="danger" onClick={onDelete}>
                Delete
              </AppButton>
            </div>
          )}
        </div>
      </div>

      <div className={uiCx('flex-1 overflow-y-auto', uiSpacing.cardPadding)}>
        <ReportNoteBody report={note} />
        {attachments.length > 0 && (
          <div className={uiCx('mt-4 border-t pt-4', uiBorders.subtle)}>
            <h3 className={uiCx(uiTypography.sectionTitle, 'mb-2')}>Attachments ({attachments.length})</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {attachments.map((a, i) => {
                const isImage =
                  (a.content_type || '').startsWith('image/') ||
                  /\.(jpg|jpeg|png|gif|webp)$/i.test(a.original_name || '');
                return (
                  <a
                    key={a.file_object_id || i}
                    href={withFileAccessToken(`/files/${a.file_object_id}`)}
                    target="_blank"
                    rel="noreferrer"
                    className={uiCx(
                      'overflow-hidden text-left transition-colors hover:bg-gray-50',
                      uiRadius.card,
                      uiBorders.subtle,
                      uiColors.surface,
                    )}
                  >
                    {isImage && a.file_object_id ? (
                      <>
                        <img
                          src={withFileAccessToken(`/files/${a.file_object_id}/thumbnail?w=400`)}
                          alt={a.original_name || 'attachment'}
                          className="h-32 w-full object-cover"
                        />
                        <div className={uiCx('border-t p-2', uiBorders.subtle)}>
                          <div className={uiCx(uiTypography.helper, 'truncate')}>{a.original_name || 'attachment'}</div>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 p-3">
                        <span className="text-sm">
                          {getAttachmentIcon(a.content_type || '', a.original_name || '')}
                        </span>
                        <span className={uiCx(uiTypography.helper, 'truncate')}>
                          {a.original_name || 'attachment'}
                        </span>
                      </div>
                    )}
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ClientNoteModal({
  clientId,
  note,
  categoryOptions,
  projectOptions,
  onClose,
  onSuccess,
}: {
  clientId: string;
  note: ClientNote | null;
  categoryOptions: { value: string; label: string }[];
  projectOptions: { value: string; label: string }[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const isEditing = Boolean(note);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [projectId, setProjectId] = useState('');
  const [desc, setDesc] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (note) {
      setTitle(note.title || '');
      setCategory(note.category_id || '');
      setProjectId(note.project_id || '');
      setDesc(note.description || '');
      setFiles([]);
      return;
    }
    setTitle('');
    setCategory(categoryOptions[0]?.value || 'client-communication-log');
    setProjectId('');
    setDesc('');
    setFiles([]);
  }, [note, categoryOptions]);

  const existingAttachments = useMemo(() => {
    const attachments = note?.images?.attachments;
    return Array.isArray(attachments) ? attachments : [];
  }, [note]);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if (!desc.trim()) {
      toast.error('Please enter a description');
      return;
    }
    setUploading(true);
    try {
      const newAttachments: Array<{
        file_object_id: string;
        original_name: string;
        content_type: string;
      }> = [];
      for (const file of files) {
        const up: any = await api('POST', '/files/upload', {
          project_id: projectId || null,
          client_id: clientId,
          employee_id: null,
          category_id: 'client-note',
          original_name: file.name,
          content_type: file.type || 'application/octet-stream',
        });
        await fetch(up.upload_url, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'x-ms-blob-type': 'BlockBlob',
          },
          body: file,
        });
        const conf: any = await api('POST', '/files/confirm', {
          key: up.key,
          size_bytes: file.size,
          checksum_sha256: 'na',
          content_type: file.type || 'application/octet-stream',
        });
        newAttachments.push({
          file_object_id: conf.id,
          original_name: file.name,
          content_type: file.type || 'application/octet-stream',
        });
      }

      const payload: Record<string, unknown> = {
        title: title.trim(),
        category_id: category || null,
        description: desc,
        project_id: projectId || null,
      };

      if (isEditing && note) {
        const existingImages = note.images && typeof note.images === 'object' ? note.images : {};
        payload.images = {
          ...existingImages,
          attachments: [...existingAttachments, ...newAttachments],
        };
        await api('PATCH', `/clients/${clientId}/notes/${note.id}`, payload);
      } else {
        if (newAttachments.length > 0) {
          payload.images = { attachments: newAttachments };
        }
        await api('POST', `/clients/${clientId}/notes`, payload);
      }
      await onSuccess();
    } catch (e: any) {
      toast.error(e?.message || (isEditing ? 'Failed to update note' : 'Failed to create note'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <AppFormModal
      open
      onClose={onClose}
      title={isEditing ? 'Edit note' : 'New note'}
      description={
        isEditing
          ? 'Update this customer communication record'
          : 'Log a contact, request, or follow-up for this customer'
      }
      formWidth="comfortable"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={uploading}>
            Cancel
          </AppButton>
          <AppButton type="button" size="sm" onClick={handleSave} disabled={uploading} loading={uploading}>
            {uploading ? (isEditing ? 'Saving…' : 'Creating…') : isEditing ? 'Save note' : 'Create note'}
          </AppButton>
        </div>
      }
    >
      <div className="space-y-4">
        <AppInput
          label="Title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short summary of the contact…"
        />
        <AppSelect
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={categoryOptions}
          sortOptions={false}
        />
        <AppSelect
          label="Related project (optional)"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          options={projectOptions}
          sortOptions={false}
          fieldHint="Optional. Links this contact to a project so it also appears on that project's Notes/History."
        />
        <AppTextarea
          label="Description"
          required
          rows={6}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="What was discussed, requested, or agreed…"
        />
        <ReportAttachmentAreaMultiple
          files={files}
          setFiles={setFiles}
          accept="image/*,.pdf,.doc,.docx"
          label={
            isEditing
              ? 'Add attachments (optional – existing files are kept)'
              : 'Attachments (optional)'
          }
        />
        {isEditing && existingAttachments.length > 0 && (
          <div className={uiTypography.helper}>
            <div className="mb-1 font-semibold text-gray-700">Existing attachments</div>
            <ul className="list-disc space-y-0.5 pl-4">
              {existingAttachments.map((a: any, i: number) => (
                <li key={a.file_object_id || i}>{a.original_name || 'Attachment'}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AppFormModal>
  );
}
