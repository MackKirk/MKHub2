import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import {
  appendShiftNote,
  SHIFT_NOTE_MAX,
  type ShiftNoteLibrary,
  type ShiftNoteTemplate,
} from '@/lib/shiftNoteLibrary';
import { AppCheckbox, AppTextarea, uiCx, uiTypography } from '@/components/ui';
import { useConfirm } from '@/components/ConfirmProvider';

type Flags = { saveOnProject: boolean; saveGlobal: boolean };

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
    enabled: open && !!projectId,
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

  const renderGroup = (title: string, rows: ShiftNoteTemplate[]) => (
    <div className="space-y-1">
      <div className={uiCx(uiTypography.overline)}>{title}</div>
      {rows.length === 0 ? (
        <p className={uiCx(uiTypography.helper, 'text-gray-500')}>None saved.</p>
      ) : (
        rows.map((row) => (
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
                  className="min-w-0 flex-1 text-left text-sm text-gray-800 whitespace-pre-wrap"
                  onClick={() => insertNote(row.body)}
                >
                  {row.body}
                </button>
                <button
                  type="button"
                  className="shrink-0 text-sm font-semibold text-gray-600"
                  onClick={() => {
                    setEditingId(row.id);
                    setDraft(row.body);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="shrink-0 text-sm font-semibold text-red-700"
                  onClick={() => removeNote(row)}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );

  const libraryPanel = open ? (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search saved notes..."
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
      />
      {library.isLoading ? (
        <p className={uiCx(uiTypography.helper, 'text-gray-500')}>Loading saved notes…</p>
      ) : (
        <>
          {renderGroup('All projects', globalNotes)}
          {renderGroup('This project', projectNotes)}
        </>
      )}
      <p className={uiCx(uiTypography.helper, 'text-gray-500')}>
        Choosing a note adds it to the field. It does not replace what you already wrote.
      </p>
    </div>
  ) : null;

  const checkboxes = value.trim() ? (
    <div className="space-y-2">
      <AppCheckbox
        label="Save this note on this project"
        checked={flags.saveOnProject}
        disabled={disabled}
        onChange={(checked) => onFlagsChange({ ...flags, saveOnProject: checked })}
      />
      <AppCheckbox
        label="Save this note for all projects"
        checked={flags.saveGlobal}
        disabled={disabled}
        onChange={(checked) => onFlagsChange({ ...flags, saveGlobal: checked })}
      />
    </div>
  ) : null;

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
        {libraryPanel}
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
        {checkboxes}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className={uiCx(uiTypography.controlLabel)}>Note for the worker</span>
        {browseButton}
      </div>
      {libraryPanel}
      <AppTextarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={3}
        maxLength={SHIFT_NOTE_MAX}
        placeholder="Optional note the worker will see on their schedule..."
        helperText="Shown on the worker's schedule and in the assignment notification. The same note is applied to every shift in this batch."
        fieldHint="Note for the worker\n\nOptional comment the assigned employee sees on their schedule. Use Saved notes to insert a note you already keep for this project or for every project. Save checkboxes store the current text so you can reuse it."
      />
      {checkboxes}
    </div>
  );
}
