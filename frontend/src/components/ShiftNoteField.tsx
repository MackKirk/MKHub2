import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Globe, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { GRID_CARD_CLASS, GRID_CLASS, PICKER_BODY_HEIGHT_CLASS } from '@/components/DocumentTypePicker';
import {
  appendShiftNote,
  SHIFT_NOTE_MAX,
  type ShiftNoteLibrary,
  type ShiftNoteTemplate,
} from '@/lib/shiftNoteLibrary';
import {
  AppButton,
  AppCard,
  AppCheckbox,
  AppInput,
  AppListRowIconButton,
  AppModal,
  AppTextarea,
  SelectDropdownCheckbox,
  uiBorders,
  uiColors,
  uiCx,
  uiModalLayer,
  uiRadius,
  uiTypography,
} from '@/components/ui';
import { useConfirm } from '@/components/ConfirmProvider';

type Flags = { saveOnProject: boolean; saveGlobal: boolean };

function SavedNotesModal({
  open,
  onClose,
  projectNotes,
  globalNotes,
  loading,
  failed,
  disabled,
  onInsert,
  onEdit,
  onDelete,
  editingId,
  draft,
  onDraftChange,
  onSaveEdit,
  onCancelEdit,
  savingId,
}: {
  open: boolean;
  onClose: () => void;
  projectNotes: ShiftNoteTemplate[];
  globalNotes: ShiftNoteTemplate[];
  loading: boolean;
  failed: boolean;
  disabled?: boolean;
  onInsert: (body: string) => void;
  onEdit: (row: ShiftNoteTemplate) => void;
  onDelete: (row: ShiftNoteTemplate) => void;
  editingId: string | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onSaveEdit: (row: ShiftNoteTemplate) => void;
  onCancelEdit: () => void;
  savingId: string | null;
}) {
  const [category, setCategory] = useState<'project' | 'global'>('project');
  const [search, setSearch] = useState('');

  const categories = [
    { value: 'project' as const, label: 'Project notes', count: projectNotes.length },
    { value: 'global' as const, label: 'Global notes', count: globalNotes.length },
  ];
  const source = category === 'project' ? projectNotes : globalNotes;
  const needle = search.trim().toLowerCase();
  const rows = needle ? source.filter((row) => row.body.toLowerCase().includes(needle)) : source;

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="Saved notes"
      description="Click a note to add it and close."
      size="lg"
      overlayClassName={uiModalLayer.nestedPicker}
      dialogClassName="!max-w-4xl"
    >
      <div className={uiCx(PICKER_BODY_HEIGHT_CLASS, 'flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-4')}>
        <div className="flex shrink-0 gap-1.5 overflow-x-auto sm:hidden" role="tablist" aria-label="Note libraries">
          {categories.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={category === item.value}
              onClick={() => setCategory(item.value)}
              className={uiCx(
                'shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
                category === item.value
                  ? 'border-brand-red bg-red-50 text-brand-red'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
              )}
            >
              {item.label}
              <span className="ml-1 tabular-nums text-gray-500">{item.count}</span>
            </button>
          ))}
        </div>

        <nav className="hidden w-40 shrink-0 flex-col gap-0.5 overflow-y-auto sm:flex" aria-label="Note libraries">
          <p className={uiCx(uiTypography.overline, 'mb-1 px-2')}>Libraries</p>
          {categories.map((item) => {
            const selected = category === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setCategory(item.value)}
                className={uiCx(
                  'flex w-full items-center justify-between gap-1 rounded-md border px-2 py-1.5 text-left text-sm transition-colors',
                  selected
                    ? 'border-brand-red bg-red-50 font-semibold text-brand-red ring-1 ring-inset ring-brand-red/30'
                    : 'border-transparent text-gray-700 hover:bg-gray-50',
                )}
              >
                <span className="min-w-0 truncate">{item.label}</span>
                <span className={uiCx('shrink-0 text-xs tabular-nums', selected ? 'text-brand-red' : 'text-gray-500')}>
                  {item.count}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <AppInput
            label="Search"
            placeholder="Search notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
            aria-label="Search notes"
          />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
            {loading ? (
              <p className={uiCx(uiTypography.helper, 'py-6 text-center text-gray-500')}>Loading saved notes…</p>
            ) : failed ? (
              <p className={uiCx(uiTypography.helper, 'py-6 text-center text-gray-500')}>Saved notes could not be loaded.</p>
            ) : rows.length === 0 ? (
              <p className={uiCx(uiTypography.helper, 'py-6 text-center text-gray-500')}>
                {source.length === 0
                  ? 'None saved in this library yet.'
                  : 'No notes match your search.'}
              </p>
            ) : (
              <div className={GRID_CLASS}>
                {rows.map((row) => (
                    <div
                      key={row.id}
                      className={uiCx(GRID_CARD_CLASS, 'relative min-h-[6.5rem] p-2')}
                    >
                      {editingId === row.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={draft}
                            onChange={(e) => onDraftChange(e.target.value)}
                            rows={3}
                            maxLength={SHIFT_NOTE_MAX}
                            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="text-sm font-semibold text-brand-red"
                              disabled={savingId === row.id}
                              onClick={() => onSaveEdit(row)}
                            >
                              Save
                            </button>
                            <button type="button" className="text-sm text-gray-600" onClick={onCancelEdit}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => onInsert(row.body)}
                            className="absolute inset-0 rounded-lg"
                            aria-label={`Add note: ${row.body}`}
                          />
                          <p className="pointer-events-none pr-16 text-left text-sm font-medium text-gray-900 line-clamp-4">
                            {row.body}
                          </p>
                          <div className="absolute bottom-1.5 right-1.5 z-10 flex gap-1">
                            <AppListRowIconButton
                              label="Edit saved note"
                              preset="edit"
                              disabled={disabled}
                              onClick={() => onEdit(row)}
                            />
                            <AppListRowIconButton
                              label="Delete saved note"
                              preset="delete"
                              disabled={disabled}
                              onClick={() => onDelete(row)}
                            />
                          </div>
                        </>
                      )}
                    </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppModal>
  );
}

export default function ShiftNoteField({
  projectId,
  value,
  onChange,
  disabled,
  variant = 'system',
  flags,
  onFlagsChange,
}: {
  projectId: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  variant?: 'system' | 'legacy';
  flags: Flags;
  onFlagsChange: (flags: Flags) => void;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!value.trim() && (flags.saveOnProject || flags.saveGlobal)) {
      onFlagsChange({ saveOnProject: false, saveGlobal: false });
    }
  }, [value, flags.saveOnProject, flags.saveGlobal, onFlagsChange]);

  const library = useQuery({
    queryKey: ['shift-note-templates', projectId],
    queryFn: () =>
      api<ShiftNoteLibrary>(
        'GET',
        `/dispatch/shift-note-templates?project_id=${encodeURIComponent(projectId)}`,
      ),
    enabled: (variant === 'system' || open) && !!projectId,
  });

  const needle = search.trim().toLowerCase();
  const filterRows = (rows: ShiftNoteTemplate[] = []) =>
    needle ? rows.filter((row) => row.body.toLowerCase().includes(needle)) : rows;
  const projectNotes = filterRows(library.data?.project);
  const globalNotes = filterRows(library.data?.global);

  const insertNote = (body: string) => {
    const next = appendShiftNote(value, body);
    if (next.overflow) {
      toast.error('That note does not fit in the remaining space.');
      return;
    }
    onChange(next.value);
    setOpen(false);
  };

  const saveEdit = async (row: ShiftNoteTemplate) => {
    const body = draft.trim();
    if (!body) {
      toast.error('Note text is required');
      return;
    }
    setSavingId(row.id);
    try {
      await api('PATCH', `/dispatch/shift-note-templates/${row.id}?context_project_id=${encodeURIComponent(projectId)}`, {
        body,
      });
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: ['shift-note-templates'] });
      toast.success('Saved note updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.message || 'Could not update the note');
    } finally {
      setSavingId(null);
    }
  };

  const removeNote = async (row: ShiftNoteTemplate) => {
    const result = await confirm({
      title: 'Delete saved note?',
      message: 'This removes it from the library. Notes already sent on shifts stay as they are.',
      confirmText: 'Delete',
    });
    if (result !== 'confirm') return;
    try {
      await api(
        'DELETE',
        `/dispatch/shift-note-templates/${row.id}?context_project_id=${encodeURIComponent(projectId)}`,
      );
      await queryClient.invalidateQueries({ queryKey: ['shift-note-templates'] });
      toast.success('Saved note deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.message || 'Could not delete the note');
    }
  };

  const renderGroup = (title: string, rows: ShiftNoteTemplate[]) => {
    if (rows.length === 0) return null;
    return (
      <div className="space-y-1">
        <div className={uiCx(uiTypography.overline)}>{title}</div>
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-gray-200 bg-white p-2">
            {editingId === row.id ? (
              <div className="space-y-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  maxLength={SHIFT_NOTE_MAX}
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-sm font-semibold text-brand-red"
                    disabled={savingId === row.id}
                    onClick={() => saveEdit(row)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="text-sm text-gray-600"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left text-sm text-gray-800 whitespace-pre-wrap hover:text-brand-red"
                  onClick={() => insertNote(row.body)}
                >
                  {row.body}
                </button>
                <AppListRowIconButton
                  label="Edit saved note"
                  preset="edit"
                  disabled={disabled}
                  onClick={() => {
                    setEditingId(row.id);
                    setDraft(row.body);
                  }}
                />
                <AppListRowIconButton
                  label="Delete saved note"
                  preset="delete"
                  disabled={disabled}
                  onClick={() => removeNote(row)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const savedCount = (library.data?.project?.length ?? 0) + (library.data?.global?.length ?? 0);
  const libraryBody = library.isLoading ? (
    <p className={uiCx(uiTypography.helper, 'text-gray-500')}>Loading saved notes…</p>
  ) : library.isError ? (
    <p className={uiCx(uiTypography.helper, 'text-gray-500')}>Saved notes could not be loaded.</p>
  ) : savedCount === 0 ? (
    <p className={uiCx(uiTypography.helper, 'text-gray-500')}>
      None yet. Write a note above and save it for this project or for every project.
    </p>
  ) : projectNotes.length === 0 && globalNotes.length === 0 ? (
    <p className={uiCx(uiTypography.helper, 'text-gray-500')}>No notes match that search.</p>
  ) : (
    <>
      {renderGroup('This project', projectNotes)}
      {renderGroup('All projects', globalNotes)}
    </>
  );

  const libraryPanel = (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div>
        <div className={uiCx(uiTypography.controlLabel)}>Saved notes</div>
        <p className={uiCx(uiTypography.helper, 'text-gray-500')}>
          Click a note to add it under what you already wrote.
        </p>
      </div>
      {savedCount > 4 ? (
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search saved notes..."
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
        />
      ) : null}
      {libraryBody}
    </div>
  );

  const saveChecks = (sideBySide: boolean) => (
    <div className={sideBySide ? 'grid grid-cols-1 gap-2 sm:grid-cols-2' : 'space-y-2'}>
      <AppCheckbox
        label="Save this note on this project"
        checked={flags.saveOnProject}
        disabled={disabled || !value.trim()}
        onChange={(checked) => onFlagsChange({ ...flags, saveOnProject: checked })}
      />
      <AppCheckbox
        label="Save this note for all projects"
        checked={flags.saveGlobal}
        disabled={disabled || !value.trim()}
        onChange={(checked) => onFlagsChange({ ...flags, saveGlobal: checked })}
      />
    </div>
  );

  const browseButton = (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setOpen((current) => !current)}
      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      aria-label="Browse saved notes"
    >
      <Search className="h-3.5 w-3.5" />
      Saved notes
    </button>
  );

  if (variant === 'legacy') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Note for the worker <span className="normal-case text-gray-600">(optional)</span>
          </label>
          {browseButton}
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={3}
          maxLength={SHIFT_NOTE_MAX}
          placeholder="Optional note the worker will see on their schedule..."
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300"
        />
        <p className="text-sm text-gray-600">
          Shown on the worker&apos;s schedule. The same note is applied to every shift in this batch.
        </p>
        {value.trim() ? saveChecks(false) : null}
        {open ? libraryPanel : null}
      </div>
    );
  }

  const noteCard = uiCx(uiRadius.card, uiBorders.subtle, uiColors.surface, 'space-y-2 p-3');

  return (
    <div className="space-y-4">
      <div className={noteCard}>
        <AppTextarea
          label="Note for the worker"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={3}
          maxLength={SHIFT_NOTE_MAX}
          placeholder="Optional. The worker sees this on their schedule..."
          helperText="Same note on every shift in this batch, including the assignment notification."
          fieldHint="Note for the worker\n\nOptional comment the assigned employee sees on their schedule. Saved notes opens a library you can add from without replacing what you already wrote. The save checkboxes keep the current text for next time."
        />
      </div>
      <div className={noteCard}>
        <div className={uiTypography.controlLabel}>Saved notes</div>
        <p className={uiCx(uiTypography.helper, 'text-gray-500')}>
          Reuse a note you already saved for this project or for every project.
        </p>
        <AppButton type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
          Browse saved notes
        </AppButton>
      </div>
      <AppCard
        title="Keep this note"
        subtitle="Save a copy of the text above so you can reuse it next time."
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              {
                key: 'project' as const,
                title: 'This project',
                description: 'Reuse it the next time you schedule this project.',
                icon: Building2,
                checked: flags.saveOnProject,
                onToggle: (checked: boolean) => onFlagsChange({ ...flags, saveOnProject: checked }),
              },
              {
                key: 'global' as const,
                title: 'All projects',
                description: 'Reuse it on any project.',
                icon: Globe,
                checked: flags.saveGlobal,
                onToggle: (checked: boolean) => onFlagsChange({ ...flags, saveGlobal: checked }),
              },
            ]
          ).map((opt) => {
            const locked = disabled || !value.trim();
            const Icon = opt.icon;
            return (
              <button
                key={opt.key}
                type="button"
                disabled={locked}
                aria-pressed={opt.checked}
                onClick={() => opt.onToggle(!opt.checked)}
                className={uiCx(
                  'relative flex items-start gap-2 rounded-lg border-2 p-3 text-left transition-all',
                  opt.checked
                    ? 'border-brand-red bg-red-50'
                    : 'border-gray-200 bg-white hover:border-brand-red hover:bg-red-50/60',
                  locked && 'cursor-not-allowed opacity-60 hover:border-gray-200 hover:bg-white',
                )}
              >
                <Icon
                  className={uiCx('mt-0.5 h-4 w-4 shrink-0', opt.checked ? 'text-brand-red' : 'text-gray-500')}
                  aria-hidden
                />
                <span className="pointer-events-none absolute right-2 top-2">
                  <SelectDropdownCheckbox checked={opt.checked} />
                </span>
                <span className="min-w-0 pr-6">
                  <span className={uiCx('block text-sm font-semibold', opt.checked ? 'text-[#7f1010]' : 'text-gray-900')}>
                    {opt.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-gray-600">{opt.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </AppCard>
      <SavedNotesModal
        open={open}
        onClose={() => setOpen(false)}
        projectNotes={library.data?.project ?? []}
        globalNotes={library.data?.global ?? []}
        loading={library.isLoading}
        failed={library.isError}
        disabled={disabled}
        onInsert={insertNote}
        onEdit={(row) => {
          setEditingId(row.id);
          setDraft(row.body);
        }}
        onDelete={removeNote}
        editingId={editingId}
        draft={draft}
        onDraftChange={setDraft}
        onSaveEdit={saveEdit}
        onCancelEdit={() => setEditingId(null)}
        savingId={savingId}
      />
    </div>
  );
}
