import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, Copy, Plus, Search, Trash2 } from 'lucide-react';
import { ApiError, api, formatApiErrorDetail } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { formatDateLocal } from '@/lib/dateUtils';
import { hasFieldworkWritePermission, isAdminRole } from '@/lib/projectLinePermissionKeys';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppListRowIconButton,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  AppTextarea,
  uiCx,
  uiLayout,
  uiShadows,
  uiSpacing,
  uiTypography,
  type AppListSortDirection,
} from '@/components/ui';

export type WorkPhaseTemplateRow = {
  id: string;
  name: string;
  description?: string | null;
  business_line?: string | null;
  phases: { key: string; label: string }[];
  is_active: boolean;
  sort_index: number;
  created_at?: string | null;
  updated_at?: string | null;
};

type BusinessLine = 'construction' | 'repairs_maintenance';

type Props = {
  businessLine: BusinessLine;
};

type DraftPhase = { key: string; label: string };

type EditorState = {
  id: string | null;
  name: string;
  description: string;
  phases: DraftPhase[];
  is_active: boolean;
};

const LIST_GRID = 'grid-cols-[minmax(0,2fr)_minmax(0,0.7fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto_auto]';
const LIST_MIN = 'min-w-[720px]';

function emptyEditor(): EditorState {
  return {
    id: null,
    name: '',
    description: '',
    phases: [{ key: 'phase_1', label: '' }],
    is_active: true,
  };
}

function fromRow(row: WorkPhaseTemplateRow): EditorState {
  const phases =
    Array.isArray(row.phases) && row.phases.length
      ? row.phases.map((p, i) => ({
          key: (p.key || `phase_${i + 1}`).trim() || `phase_${i + 1}`,
          label: (p.label || '').trim(),
        }))
      : [{ key: 'phase_1', label: '' }];
  return {
    id: row.id,
    name: row.name || '',
    description: row.description || '',
    phases,
    is_active: row.is_active !== false,
  };
}

function slugKey(label: string, index: number): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return base || `phase_${index + 1}`;
}

export default function WorkPhaseTemplatesAdminPage({ businessLine }: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ roles?: unknown[]; permissions?: string[] }>('GET', '/auth/me'),
    staleTime: 60_000,
  });
  const isAdmin = isAdminRole(me?.roles);
  const permissions = useMemo(() => new Set(me?.permissions || []), [me?.permissions]);
  const canWrite = hasFieldworkWritePermission(permissions, businessLine, isAdmin);
  const [searchQuery, setSearchQuery] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<EditorState>(emptyEditor);
  const noopSortBy = 'name' as const;
  const noopSortDir: AppListSortDirection = 'asc';
  const noopSort = () => undefined;

  const queryKey = ['work-phase-templates-admin', businessLine] as const;

  const {
    data: rows = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey,
    queryFn: () => {
      const qs = new URLSearchParams({
        business_line: businessLine,
        admin: 'true',
        include_inactive: 'true',
      });
      return api<WorkPhaseTemplateRow[]>('GET', `/work-phase-templates?${qs.toString()}`);
    },
    retry: 1,
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const s = searchQuery.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const name = (r.name || '').toLowerCase();
      const desc = (r.description || '').toLowerCase();
      const phases = (r.phases || []).map((p) => p.label || '').join(' ').toLowerCase();
      return name.includes(s) || desc.includes(s) || phases.includes(s);
    });
  }, [rows, searchQuery]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const phases = draft.phases
        .map((p, i) => {
          const label = p.label.trim();
          if (!label) return null;
          return { key: slugKey(label, i), label };
        })
        .filter(Boolean) as { key: string; label: string }[];
      if (!draft.name.trim()) throw new Error('Name is required');
      if (!phases.length) throw new Error('Add at least one phase');
      const body = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        business_line: businessLine,
        phases,
        is_active: draft.is_active,
      };
      if (draft.id) {
        return api<WorkPhaseTemplateRow>(
          'PUT',
          `/work-phase-templates/${encodeURIComponent(draft.id)}`,
          body
        );
      }
      return api<WorkPhaseTemplateRow>('POST', '/work-phase-templates', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['work-phase-templates'] });
      setEditorOpen(false);
      toast.success(draft.id ? 'Template updated' : 'Template created');
    },
    onError: (err) => {
      const msg =
        err instanceof Error && !(err instanceof ApiError)
          ? err.message
          : err instanceof ApiError
            ? formatApiErrorDetail(err) || err.message
            : 'Could not save template';
      toast.error(msg);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      api<{ ok: boolean }>('DELETE', `/work-phase-templates/${encodeURIComponent(id)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['work-phase-templates'] });
      toast.success('Template deactivated');
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError ? formatApiErrorDetail(err) || err.message : 'Could not delete'
      );
    },
  });

  const reactivateMut = useMutation({
    mutationFn: (id: string) =>
      api<WorkPhaseTemplateRow>('PUT', `/work-phase-templates/${encodeURIComponent(id)}`, {
        is_active: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['work-phase-templates'] });
      toast.success('Template reactivated');
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError
          ? formatApiErrorDetail(err) || err.message
          : 'Could not reactivate'
      );
    },
  });

  const duplicateMut = useMutation({
    mutationFn: (id: string) =>
      api<WorkPhaseTemplateRow>(
        'POST',
        `/work-phase-templates/${encodeURIComponent(id)}/duplicate`
      ),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['work-phase-templates'] });
      toast.success('Template duplicated');
      setDraft(fromRow(row));
      setEditorOpen(true);
    },
    onError: () => toast.error('Could not duplicate template'),
  });

  const openCreate = () => {
    setDraft(emptyEditor());
    setEditorOpen(true);
  };

  const openEdit = (row: WorkPhaseTemplateRow) => {
    setDraft(fromRow(row));
    setEditorOpen(true);
  };

  const askDelete = async (row: WorkPhaseTemplateRow) => {
    const res = await confirm({
      title: 'Deactivate template?',
      message: `"${row.name}" will be hidden from project pickers. Existing project checklists stay as-is.`,
      confirmText: 'Deactivate',
      cancelText: 'Cancel',
    });
    if (res !== 'confirm') return;
    deleteMut.mutate(row.id);
  };

  const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try {
      return formatDateLocal(new Date(iso));
    } catch {
      return '—';
    }
  };

  const movePhase = (index: number, dir: -1 | 1) => {
    setDraft((prev) => {
      const next = [...prev.phases];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[index];
      next[index] = next[j];
      next[j] = tmp;
      return { ...prev, phases: next };
    });
  };

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'pb-2')}>
      <p className={uiTypography.helper}>
        Starter packs for the project Progress tab. Projects can stack multiple templates and still
        add/remove phases by hand. Checking them off updates progress % — not system Tasks.
      </p>

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <AppInput
          id="work-phase-templates-search"
          placeholder="Search by name, description, or phase…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
          aria-label="Search job progress templates"
          autoComplete="off"
        />
      </AppCard>

      <AppCard className={uiShadows.card} bodyClassName="!p-0">
        {isLoading ? (
          <div className={uiCx(uiTypography.helper, 'px-4 py-8 text-center')}>Loading templates…</div>
        ) : isError ? (
          <div className={uiSpacing.cardPadding}>
            <AppEmptyState
              title="Could not load templates"
              description={
                error instanceof ApiError
                  ? formatApiErrorDetail(error) || error.message
                  : 'Check that the API is running, then try again.'
              }
              className="mt-2"
            />
            <div className={uiCx(uiLayout.actionsRow, 'mt-3 justify-center')}>
              <AppButton type="button" size="sm" variant="secondary" onClick={() => void refetch()}>
                Retry
              </AppButton>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className={uiSpacing.cardPadding}>
            {canWrite ? (
              <AppListCreateItem
                label="New job progress template"
                layout="row"
                className="w-full"
                onClick={openCreate}
              />
            ) : null}
            <AppEmptyState
              title="No job progress templates yet."
              description="Create a template with broad phases (foundation, roofing, polish…)."
              className="mt-4"
            />
          </div>
        ) : (
          <AppSortableEntityList layout="flat">
            {canWrite ? (
              <div className={uiSpacing.cardPadding}>
                <AppListCreateItem
                  label="New job progress template"
                  layout="row"
                  className="w-full"
                  onClick={openCreate}
                />
              </div>
            ) : null}
            <AppSortableEntityListHeader variant="flat" gridCols={LIST_GRID} minWidth={LIST_MIN}>
              <AppSortableEntityListSortColumn
                label="Name"
                column="name"
                sortBy={noopSortBy}
                sortDir={noopSortDir}
                onSort={noopSort}
                sortable={false}
              />
              <AppSortableEntityListSortColumn
                label="Phases"
                column="name"
                sortBy={noopSortBy}
                sortDir={noopSortDir}
                onSort={noopSort}
                sortable={false}
              />
              <AppSortableEntityListSortColumn
                label="Preview"
                column="name"
                sortBy={noopSortBy}
                sortDir={noopSortDir}
                onSort={noopSort}
                sortable={false}
              />
              <AppSortableEntityListSortColumn
                label="Updated"
                column="name"
                sortBy={noopSortBy}
                sortDir={noopSortDir}
                onSort={noopSort}
                sortable={false}
              />
              <AppSortableEntityListSortColumn
                label="Status"
                column="name"
                sortBy={noopSortBy}
                sortDir={noopSortDir}
                onSort={noopSort}
                sortable={false}
              />
              <AppSortableEntityListSortColumn
                label={<span className="sr-only">Actions</span>}
                column="name"
                sortBy={noopSortBy}
                sortDir={noopSortDir}
                onSort={noopSort}
                sortable={false}
                className="flex justify-end"
              />
            </AppSortableEntityListHeader>
            {filtered.length === 0 ? (
              <div className={uiCx(uiTypography.helper, 'px-4 py-8 text-center', LIST_MIN)}>
                No matching templates.
              </div>
            ) : (
              <AppSortableEntityListFlatBody gridCols={LIST_GRID} minWidth={LIST_MIN}>
                {filtered.map((r) => (
                  <AppSortableEntityListRow
                    key={r.id}
                    variant="flat"
                    as="div"
                    gridCols={LIST_GRID}
                    minWidth={LIST_MIN}
                  >
                    <button
                      type="button"
                      className={uiCx(
                        uiTypography.sectionTitle,
                        'truncate text-left hover:text-brand-red hover:underline',
                        canWrite ? '' : 'cursor-default hover:no-underline hover:text-inherit'
                      )}
                      title={r.name}
                      onClick={() => (canWrite ? openEdit(r) : undefined)}
                    >
                      {r.name}
                    </button>
                    <span className={uiTypography.body}>{r.phases?.length ?? 0}</span>
                    <span
                      className={uiCx(uiTypography.body, 'truncate')}
                      title={(r.phases || []).map((p) => p.label).join(' · ')}
                    >
                      {(r.phases || [])
                        .slice(0, 3)
                        .map((p) => p.label)
                        .join(' · ') || '—'}
                      {(r.phases || []).length > 3 ? '…' : ''}
                    </span>
                    <span className={uiCx(uiTypography.body, 'whitespace-nowrap')}>
                      {fmtDate(r.updated_at || r.created_at)}
                    </span>
                    <div className="flex justify-center">
                      {r.is_active ? (
                        <AppBadge variant="success">Active</AppBadge>
                      ) : (
                        <AppBadge variant="neutral">Inactive</AppBadge>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      {canWrite ? (
                        <>
                          <AppListRowIconButton
                            label={`Duplicate ${r.name}`}
                            icon={<Copy className="h-4 w-4" />}
                            disabled={duplicateMut.isPending}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              duplicateMut.mutate(r.id);
                            }}
                          />
                          {r.is_active ? (
                            <AppListRowIconButton
                              preset="delete"
                              label={`Deactivate ${r.name}`}
                              disabled={deleteMut.isPending}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void askDelete(r);
                              }}
                            />
                          ) : (
                            <AppButton
                              type="button"
                              size="sm"
                              variant="secondary"
                              loading={
                                reactivateMut.isPending && reactivateMut.variables === r.id
                              }
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                reactivateMut.mutate(r.id);
                              }}
                            >
                              Reactivate
                            </AppButton>
                          )}
                        </>
                      ) : null}
                    </div>
                  </AppSortableEntityListRow>
                ))}
              </AppSortableEntityListFlatBody>
            )}
          </AppSortableEntityList>
        )}
      </AppCard>

      <AppFormModal
        open={editorOpen}
        onClose={() => {
          if (saveMut.isPending) return;
          setEditorOpen(false);
        }}
        title={draft.id ? 'Edit job progress template' : 'New job progress template'}
        description="Phases become the checklist when this template is applied on a project."
        size="lg"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={saveMut.isPending}
              onClick={() => setEditorOpen(false)}
            >
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              loading={saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              Save
            </AppButton>
          </div>
        }
      >
        <div className={uiSpacing.sectionStack}>
          <AppInput
            id="wpt-name"
            label="Name"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="e.g. Production — Roofing job"
            autoComplete="off"
          />
          <AppTextarea
            id="wpt-desc"
            label="Description"
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            rows={2}
            placeholder="Optional — shown in the template picker"
          />
          <AppCheckbox
            label="Active (available when applying on a project)"
            checked={draft.is_active}
            onChange={(checked) => setDraft((d) => ({ ...d, is_active: checked }))}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className={uiTypography.controlLabel}>Phases (in order)</p>
              <AppButton
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    phases: [...d.phases, { key: `phase_${d.phases.length + 1}`, label: '' }],
                  }))
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add phase
              </AppButton>
            </div>
            <ul className="space-y-2">
              {draft.phases.map((phase, index) => (
                <li key={`phase-row-${index}`} className="flex items-start gap-2">
                  <span className={uiCx(uiTypography.helper, 'mt-2.5 w-5 shrink-0 text-right')}>
                    {index + 1}.
                  </span>
                  <AppInput
                    id={`wpt-phase-${index}`}
                    className="min-w-0 flex-1"
                    value={phase.label}
                    onChange={(e) =>
                      setDraft((d) => {
                        const phases = [...d.phases];
                        phases[index] = { ...phases[index], label: e.target.value };
                        return { ...d, phases };
                      })
                    }
                    placeholder="Phase label"
                    autoComplete="off"
                  />
                  <div className="flex shrink-0 gap-0.5 pt-0.5">
                    <AppListRowIconButton
                      label="Move up"
                      icon={<ArrowUp className="h-4 w-4" />}
                      disabled={index === 0}
                      onClick={() => movePhase(index, -1)}
                    />
                    <AppListRowIconButton
                      label="Move down"
                      icon={<ArrowDown className="h-4 w-4" />}
                      disabled={index >= draft.phases.length - 1}
                      onClick={() => movePhase(index, 1)}
                    />
                    <AppListRowIconButton
                      label="Remove phase"
                      icon={<Trash2 className="h-4 w-4" />}
                      disabled={draft.phases.length <= 1}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          phases: d.phases.filter((_, i) => i !== index),
                        }))
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </AppFormModal>
    </div>
  );
}
