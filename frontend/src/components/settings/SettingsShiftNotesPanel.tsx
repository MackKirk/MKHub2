import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppInput,
  AppProjectSelect,
  AppSectionHeader,
  AppTextarea,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import {
  SHIFT_NOTE_MAX,
  type ShiftNoteLibrary,
  type ShiftNoteTemplate,
} from '@/lib/shiftNoteLibrary';

type Props = { canEdit: boolean };

export default function SettingsShiftNotesPanel({ canEdit }: Props) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [body, setBody] = useState('');
  const [scope, setScope] = useState<'global' | 'project'>('global');
  const [projectId, setProjectId] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const library = useQuery({
    queryKey: ['shift-note-templates', 'settings'],
    queryFn: () => api<ShiftNoteLibrary>('GET', '/dispatch/shift-note-templates'),
  });

  const needle = search.trim().toLowerCase();
  const matches = (row: ShiftNoteTemplate) =>
    !needle ||
    row.body.toLowerCase().includes(needle) ||
    (row.project_name || '').toLowerCase().includes(needle);

  const globalNotes = (library.data?.global || []).filter(matches);
  const projectGroups = useMemo(() => {
    const groups = new Map<string, ShiftNoteTemplate[]>();
    for (const row of library.data?.project || []) {
      if (!matches(row)) continue;
      const key = row.project_name || 'Project';
      const list = groups.get(key) || [];
      list.push(row);
      groups.set(key, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [library.data?.project, needle]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['shift-note-templates'] });

  const createNote = async () => {
    if (!body.trim()) {
      toast.error('Note text is required');
      return;
    }
    if (scope === 'project' && !projectId) {
      toast.error('Choose a project');
      return;
    }
    setSaving(true);
    try {
      await api('POST', '/dispatch/shift-note-templates', {
        body: body.trim(),
        project_id: scope === 'project' ? projectId : null,
        save_on_project: scope === 'project',
        save_global: scope === 'global',
      });
      setBody('');
      toast.success('Saved note created');
      await refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.message || 'Could not save the note');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (row: ShiftNoteTemplate) => {
    if (!draft.trim()) {
      toast.error('Note text is required');
      return;
    }
    try {
      await api('PATCH', `/dispatch/shift-note-templates/${row.id}`, { body: draft.trim() });
      setEditingId(null);
      toast.success('Saved note updated');
      await refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.message || 'Could not update the note');
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
      await api('DELETE', `/dispatch/shift-note-templates/${row.id}`);
      toast.success('Saved note deleted');
      await refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.message || 'Could not delete the note');
    }
  };

  const renderRow = (row: ShiftNoteTemplate) => (
    <div key={row.id} className="rounded-lg border border-gray-200 bg-white p-3">
      {editingId === row.id ? (
        <div className="space-y-2">
          <AppTextarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={SHIFT_NOTE_MAX} />
          <div className="flex gap-2">
            <AppButton size="sm" type="button" onClick={() => saveEdit(row)}>
              Save
            </AppButton>
            <AppButton size="sm" type="button" variant="secondary" onClick={() => setEditingId(null)}>
              Cancel
            </AppButton>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <p className="whitespace-pre-wrap text-sm text-gray-800">{row.body}</p>
          {canEdit ? (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="text-sm font-semibold text-gray-700"
                onClick={() => {
                  setEditingId(row.id);
                  setDraft(row.body);
                }}
              >
                Edit
              </button>
              <button type="button" className="text-sm font-semibold text-red-700" onClick={() => removeNote(row)}>
                Delete
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );

  return (
    <div className={uiSpacing.pageStack}>
      <AppCard
        title="Shift notes"
        subtitle="Notes supervisors can reuse when assigning a shift. Global notes are available on every project."
      >
        {canEdit ? (
          <div className={uiCx(uiSpacing.sectionStack, 'mb-4')}>
            <AppTextarea
              label="New note"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={SHIFT_NOTE_MAX}
              placeholder="Text the worker will see when this note is used on a shift..."
            />
            <div className="flex flex-wrap gap-2">
              <AppButton
                size="sm"
                type="button"
                variant={scope === 'global' ? 'primary' : 'secondary'}
                onClick={() => setScope('global')}
              >
                All projects
              </AppButton>
              <AppButton
                size="sm"
                type="button"
                variant={scope === 'project' ? 'primary' : 'secondary'}
                onClick={() => setScope('project')}
              >
                One project
              </AppButton>
            </div>
            {scope === 'project' ? (
              <AppProjectSelect
                label="Project"
                value={projectId}
                onChange={setProjectId}
                allowEmpty
                placeholder="Search for a project..."
              />
            ) : null}
            <div>
              <AppButton size="sm" type="button" loading={saving} onClick={createNote}>
                Save note
              </AppButton>
            </div>
          </div>
        ) : null}

        <AppInput
          label="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search note text or project..."
        />
      </AppCard>

      {library.isLoading ? (
        <AppCard>
          <AppEmptyState title="Loading notes…" />
        </AppCard>
      ) : (
        <>
          <AppCard>
            <AppSectionHeader title="All projects" />
            <div className={uiCx(uiSpacing.sectionStack, 'mt-3')}>
              {globalNotes.length === 0 ? (
                <p className={uiCx(uiTypography.helper, 'text-gray-500')}>No global notes.</p>
              ) : (
                globalNotes.map(renderRow)
              )}
            </div>
          </AppCard>
          <AppCard>
            <AppSectionHeader title="By project" />
            <div className={uiCx(uiSpacing.sectionStack, 'mt-3')}>
              {projectGroups.length === 0 ? (
                <p className={uiCx(uiTypography.helper, 'text-gray-500')}>No project notes.</p>
              ) : (
                projectGroups.map(([name, rows]) => (
                  <div key={name} className="space-y-2">
                    <div className={uiTypography.sectionTitle}>{name}</div>
                    {rows.map(renderRow)}
                  </div>
                ))
              )}
            </div>
          </AppCard>
        </>
      )}
    </div>
  );
}
