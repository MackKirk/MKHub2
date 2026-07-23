import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { List, Plus, Save, Search, Trash2 } from 'lucide-react';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppEmptyState,
  AppInput,
  AppSelect,
  AppTextarea,
  AppUserSelect,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { useConfirm } from '@/components/ConfirmProvider';
import { effectiveShowInOpportunity, effectiveShowInProject } from '@/lib/projectStatusVisibility';

type Item = { id: string; label: string; value?: string; sort_index?: number; meta?: any };

const MATRIX_CELL_KIND_OPTIONS = [
  { value: 'expiry', label: 'Expiry date' },
  { value: 'date_taken', label: 'Date taken' },
  { value: 'text', label: 'Text / notes' },
];

const EXCLUDED_LISTS = new Set([
  'google_places_api_key',
  'terms-templates',
  'branding',
  'departments',
  'standard_file_categories',
  'organization_logos',
  'certificate_backgrounds',
]);

const LIST_DESCRIPTIONS: Record<string, string> = {
  client_statuses: 'Statuses shown on customers (Active, Prospect, etc.).',
  client_types: 'Customer types used in filters and forms.',
  project_statuses: 'Statuses for projects and opportunities, including date and proposal rules.',
  project_divisions: 'Business divisions and colors used across projects.',
  divisions: 'Organization divisions used in HR and reporting.',
  payment_terms: 'Payment terms offered on quotes and customers.',
  lead_sources: 'Where leads and opportunities come from.',
  report_categories: 'Categories for project notes and reports.',
  training_matrix_slots: 'Columns on the training matrix (slug + cell type).',
  timesheet: 'Default break length, eligible employees, and geofence radius.',
};

type ListGroupId = 'statuses' | 'organization' | 'training' | 'operations' | 'other';

const LIST_GROUPS: { id: ListGroupId; label: string }[] = [
  { id: 'statuses', label: 'Statuses' },
  { id: 'organization', label: 'Organization' },
  { id: 'training', label: 'Training' },
  { id: 'operations', label: 'Operations' },
  { id: 'other', label: 'Other' },
];

function formatSettingsListTitle(name: string): string {
  if (name === 'terms-templates') return 'Terms Templates';
  if (name === 'training_matrix_slots') return 'Training matrix slots';
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function groupForList(name: string): ListGroupId {
  const n = name.toLowerCase();
  if (n.includes('status')) return 'statuses';
  if (n === 'training_matrix_slots') return 'training';
  if (n === 'timesheet') return 'operations';
  if (
    n.includes('division') ||
    n === 'payment_terms' ||
    n === 'lead_sources' ||
    n === 'client_types' ||
    n === 'report_categories'
  ) {
    return 'organization';
  }
  return 'other';
}

function ColorSwatchInput({
  value,
  onChange,
  title = 'Color',
}: {
  value: string;
  onChange: (hex: string) => void;
  title?: string;
}) {
  const hex = value || '#cccccc';
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        title={title}
        aria-label={title}
        className={uiCx(uiBorders.input, uiRadius.control, 'h-9 w-10 shrink-0 cursor-pointer p-0.5')}
        value={hex}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className={uiCx('font-mono text-xs', uiTypography.helper)}>{hex}</span>
    </div>
  );
}

export default function SettingsLookupListsPanel() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, refetch, isLoading } = useQuery({
    queryKey: ['settings-bundle'],
    queryFn: () => api<Record<string, Item[]>>('GET', '/settings'),
  });

  const lists = useMemo(
    () =>
      Object.entries(data || {})
        .filter(([name]) => !EXCLUDED_LISTS.has(name))
        .sort(([a], [b]) => a.localeCompare(b)),
    [data],
  );

  const [sel, setSel] = useState<string>(() => searchParams.get('list') || 'client_statuses');
  const [listQuery, setListQuery] = useState('');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [newShowInProject, setNewShowInProject] = useState(true);
  const [newShowInOpportunity, setNewShowInOpportunity] = useState(true);
  const [newMatrixCellKind, setNewMatrixCellKind] = useState<'expiry' | 'date_taken' | 'text'>('expiry');
  const [edits, setEdits] = useState<Record<string, Item>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const items = (data || {})[sel] || [];
  const isColorList = useMemo(() => sel.toLowerCase().includes('status'), [sel]);
  const isDivisionList = useMemo(() => sel.toLowerCase().includes('division'), [sel]);
  const isMatrixSlotsList = useMemo(() => sel === 'training_matrix_slots', [sel]);
  const isTimesheetConfig = useMemo(() => sel === 'timesheet', [sel]);
  const isTermsTemplates = useMemo(() => sel === 'terms-templates', [sel]);

  const timesheetItems = (data?.timesheet || []) as Item[];
  const breakMinItem = timesheetItems.find((i) => i.label === 'default_break_minutes');
  const breakEmployeesItem = timesheetItems.find((i) => i.label === 'break_eligible_employees');
  const geofenceRadiusItem = timesheetItems.find((i) => i.label === 'default_geofence_radius_meters');
  const [breakMin, setBreakMin] = useState<string>(breakMinItem?.value || '30');
  const [geofenceRadius, setGeofenceRadius] = useState<string>(geofenceRadiusItem?.value || '150');
  const [selectedBreakEmployees, setSelectedBreakEmployees] = useState<string[]>([]);

  useEffect(() => {
    const fromUrl = searchParams.get('list');
    if (fromUrl && lists.some(([n]) => n === fromUrl)) {
      setSel(fromUrl);
      return;
    }
    if (lists.length && !lists.some(([n]) => n === sel)) {
      setSel(lists[0][0]);
    }
  }, [searchParams, lists, sel]);

  useEffect(() => {
    setLabel('');
    setValue('');
    setDescription('');
    setNewShowInProject(true);
    setNewShowInOpportunity(true);
    setNewMatrixCellKind('expiry');
    setEdits({});
    setAddOpen(false);
  }, [sel]);

  useEffect(() => {
    if (breakMinItem?.value) setBreakMin(breakMinItem.value);
    if (geofenceRadiusItem?.value) setGeofenceRadius(geofenceRadiusItem.value);
    if (breakEmployeesItem?.value) {
      try {
        const employeeIds = JSON.parse(breakEmployeesItem.value);
        setSelectedBreakEmployees(Array.isArray(employeeIds) ? employeeIds : []);
      } catch {
        setSelectedBreakEmployees([]);
      }
    }
  }, [breakMinItem?.value, geofenceRadiusItem?.value, breakEmployeesItem?.value]);

  const selectList = (name: string) => {
    setSel(name);
    const next = new URLSearchParams(searchParams);
    // Default section is lists — keep URL readable with ?list=
    next.delete('section');
    next.set('list', name);
    setSearchParams(next, { replace: true });
  };

  const filteredLists = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    return lists.filter(([name]) => {
      if (!q) return true;
      const title = formatSettingsListTitle(name).toLowerCase();
      return name.toLowerCase().includes(q) || title.includes(q);
    });
  }, [lists, listQuery]);

  const groupedLists = useMemo(() => {
    const map = new Map<ListGroupId, [string, Item[]][]>();
    for (const g of LIST_GROUPS) map.set(g.id, []);
    for (const entry of filteredLists) {
      const g = groupForList(entry[0]);
      map.get(g)!.push(entry);
    }
    return LIST_GROUPS.map((g) => ({ ...g, entries: map.get(g.id) || [] })).filter((g) => g.entries.length > 0);
  }, [filteredLists]);

  const getEdit = (it: Item): Item => edits[it.id] || it;
  const isDirty = (it: Item) => {
    const e = edits[it.id];
    if (!e) return false;
    return (
      e.label !== it.label ||
      (e.value || '') !== (it.value || '') ||
      JSON.stringify(e.meta || {}) !== JSON.stringify(it.meta || {})
    );
  };

  const listSubtitle =
    LIST_DESCRIPTIONS[sel] || 'Values used in dropdowns and filters across MKHub.';

  const handleAdd = async () => {
    if (!label.trim()) {
      toast.error(isTermsTemplates ? 'Template name required' : 'Label required');
      return;
    }
    if (isMatrixSlotsList && !(value || '').trim()) {
      toast.error('Slug is required');
      return;
    }
    try {
      if (isTermsTemplates) {
        const url = `/settings/${encodeURIComponent(sel)}?label=${encodeURIComponent(label)}&description=${encodeURIComponent(description || '')}`;
        await api('POST', url);
        setLabel('');
        setDescription('');
      } else {
        try {
          await api('POST', `/settings/${encodeURIComponent(sel)}`, undefined, {
            'Content-Type': 'application/x-www-form-urlencoded',
          });
        } catch {
          /* ignore preflight quirk */
        }
        let url = `/settings/${encodeURIComponent(sel)}?label=${encodeURIComponent(label)}`;
        if (isDivisionList) {
          const [abbr, color] = (value || '').split('|');
          url += `&abbr=${encodeURIComponent(abbr || '')}&color=${encodeURIComponent(color || '#cccccc')}`;
        } else if (isMatrixSlotsList) {
          url += `&value=${encodeURIComponent((value || '').trim())}&cell_kind=${encodeURIComponent(newMatrixCellKind)}`;
        } else if (isColorList) {
          url += `&value=${encodeURIComponent(value || '#cccccc')}`;
          if (sel === 'project_statuses') {
            url += `&show_in_project=${newShowInProject ? 'true' : 'false'}&show_in_opportunity=${newShowInOpportunity ? 'true' : 'false'}`;
          }
        } else {
          url += `&value=${encodeURIComponent(value || '')}`;
        }
        await api('POST', url);
        setLabel('');
        setValue('');
        setNewMatrixCellKind('expiry');
      }
      await refetch();
      setAddOpen(false);
      toast.success('Added');
    } catch {
      toast.error('Failed');
    }
  };

  const handleSaveItem = async (it: Item) => {
    const e = getEdit(it);
    setSavingId(it.id);
    try {
      let url = `/settings/${encodeURIComponent(sel)}/${encodeURIComponent(it.id)}?label=${encodeURIComponent(e.label || '')}`;
      if (isTermsTemplates) {
        url += `&description=${encodeURIComponent(e.meta?.description || '')}`;
      } else if (isDivisionList) {
        url += `&abbr=${encodeURIComponent(e.meta?.abbr || '')}&color=${encodeURIComponent(e.meta?.color || '')}`;
      } else if (isMatrixSlotsList) {
        url += `&value=${encodeURIComponent((e.value || '').trim())}&cell_kind=${encodeURIComponent(String(e.meta?.cell_kind || 'text'))}`;
      } else if (isColorList) {
        url += `&value=${encodeURIComponent(e.value || '')}`;
        if (sel === 'project_statuses') {
          const allowEdit = e.meta?.allow_edit_proposal;
          const setsStart = e.meta?.sets_start_date;
          const setsEnd = e.meta?.sets_end_date;
          const sip = typeof e.meta?.show_in_project === 'boolean' ? e.meta.show_in_project : effectiveShowInProject(it);
          const sio =
            typeof e.meta?.show_in_opportunity === 'boolean' ? e.meta.show_in_opportunity : effectiveShowInOpportunity(it);
          url += `&allow_edit_proposal=${allowEdit === true || allowEdit === 'true' || allowEdit === 1 ? 'true' : 'false'}`;
          url += `&sets_start_date=${setsStart === true || setsStart === 'true' || setsStart === 1 ? 'true' : 'false'}`;
          url += `&sets_end_date=${setsEnd === true || setsEnd === 'true' || setsEnd === 1 ? 'true' : 'false'}`;
          url += `&show_in_project=${sip ? 'true' : 'false'}&show_in_opportunity=${sio ? 'true' : 'false'}`;
        }
      } else {
        url += `&value=${encodeURIComponent(e.value || '')}`;
      }
      await api('PUT', url);
      setEdits((s) => {
        const next = { ...s };
        delete next[it.id];
        return next;
      });
      await refetch();
      toast.success('Saved');
    } catch {
      toast.error('Failed');
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteItem = async (it: Item) => {
    if (!(await confirm({ title: 'Delete item?', description: 'This action cannot be undone.' }))) return;
    try {
      await api('DELETE', `/settings/${encodeURIComponent(sel)}/${encodeURIComponent(it.id)}`);
      await refetch();
      toast.success('Deleted');
    } catch {
      toast.error('Failed');
    }
  };

  const patchEdit = (it: Item, patch: Partial<Item>) => {
    setEdits((s) => ({
      ...s,
      [it.id]: { ...(s[it.id] || it), ...patch },
    }));
  };

  const patchMeta = (it: Item, metaPatch: Record<string, unknown>) => {
    setEdits((s) => {
      const base = s[it.id] || it;
      return {
        ...s,
        [it.id]: {
          ...base,
          meta: { ...(base.meta || it.meta || {}), ...metaPatch },
        },
      };
    });
  };

  return (
    <AppCard className={uiShadows.card} bodyClassName="!p-0 overflow-hidden">
      <div className="grid min-h-[min(640px,75vh)] lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
        {/* ——— Sidebar ——— */}
        <aside className="flex flex-col border-b border-gray-100 bg-gray-50/60 lg:border-b-0 lg:border-r">
          <div className="border-b border-gray-100 bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-brand-red">
                <List className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className={uiTypography.sectionTitle}>Lookup lists</h2>
                <p className={uiTypography.helper}>{lists.length} datasets</p>
              </div>
            </div>
            <div className="mt-3">
              <AppInput
                placeholder="Search lists…"
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
                aria-label="Search lookup lists"
              />
            </div>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Lookup list catalog">
            {isLoading && !data ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-9 animate-pulse rounded-lg bg-gray-100" />
                ))}
              </div>
            ) : groupedLists.length === 0 ? (
              <p className={uiCx('px-3 py-6 text-center', uiTypography.helper)}>No lists match.</p>
            ) : (
              groupedLists.map((group) => (
                <div key={group.id} className="mb-3">
                  <div className={uiCx('px-2.5 py-1.5', uiTypography.overline)}>{group.label}</div>
                  <ul className="space-y-0.5">
                    {group.entries.map(([name]) => {
                      const count = ((data || {})[name] || []).length;
                      const active = sel === name;
                      return (
                        <li key={name}>
                          <button
                            type="button"
                            onClick={() => selectList(name)}
                            className={uiCx(
                              'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                              active
                                ? 'bg-red-50 font-semibold text-brand-red ring-1 ring-red-100'
                                : 'text-gray-800 hover:bg-white hover:shadow-sm',
                            )}
                          >
                            <span className="min-w-0 truncate">{formatSettingsListTitle(name)}</span>
                            <AppBadge variant={active ? 'danger' : 'neutral'} className="shrink-0 tabular-nums">
                              {count}
                            </AppBadge>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </nav>
        </aside>

        {/* ——— Editor ——— */}
        <section className="flex min-w-0 flex-col bg-white">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div className="min-w-0">
              <div className={uiTypography.overline}>Editing</div>
              <h2 className={uiCx(uiTypography.pageTitle, '!text-lg')}>{formatSettingsListTitle(sel)}</h2>
              <p className={uiCx('mt-1 max-w-2xl', uiTypography.helper)}>{listSubtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!isTimesheetConfig && (
                <AppButton
                  type="button"
                  variant={addOpen ? 'secondary' : 'primary'}
                  size="sm"
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={() => setAddOpen((v) => !v)}
                >
                  {addOpen ? 'Cancel' : 'Add item'}
                </AppButton>
              )}
              <span className={uiCx('rounded-full bg-gray-100 px-2.5 py-1 tabular-nums', uiTypography.helper)}>
                <span className={uiCx('font-semibold', uiColors.textStrong)}>{items.length}</span> items
              </span>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            {isTimesheetConfig ? (
              <div className={uiCx(uiBorders.subtle, uiRadius.card, 'bg-gray-50/40 p-4 sm:p-5')}>
                <div className={uiCx('mb-4', uiTypography.sectionTitle)}>Timesheet defaults</div>
                <div className={uiLayout.sectionGrid2}>
                  <AppInput
                    type="number"
                    label="Default break for shifts of 5+ hours (minutes)"
                    value={breakMin}
                    onChange={(e) => setBreakMin(e.target.value)}
                    min="0"
                    placeholder="30"
                    helperText="Break duration deducted from attendance for eligible employees on long shifts."
                  />
                  <AppInput
                    type="number"
                    label="Default geofence radius (meters)"
                    value={geofenceRadius}
                    onChange={(e) => setGeofenceRadius(e.target.value)}
                    min="0"
                    placeholder="150"
                    helperText="Default radius for new shifts."
                  />
                  <div className="sm:col-span-2">
                    <AppUserSelect
                      mode="multiple"
                      label={`Employees eligible for break deduction${selectedBreakEmployees.length > 0 ? ` (${selectedBreakEmployees.length} selected)` : ''}`}
                      value={selectedBreakEmployees}
                      onChange={setSelectedBreakEmployees}
                      placeholder="Select employees..."
                      helperText="Select employees who are eligible for break deduction when their attendance is 5 hours or more."
                    />
                  </div>
                  <div className={uiCx('sm:col-span-2 flex justify-end pt-1', uiLayout.actionsRow)}>
                    <AppButton
                      onClick={async () => {
                        try {
                          if (breakMinItem) {
                            await api(
                              'PUT',
                              `/settings/timesheet/${encodeURIComponent(breakMinItem.id)}?label=default_break_minutes&value=${encodeURIComponent(breakMin)}`,
                            );
                          } else {
                            await api(
                              'POST',
                              `/settings/timesheet?label=default_break_minutes&value=${encodeURIComponent(breakMin)}`,
                            );
                          }
                          const employeesJson = JSON.stringify(selectedBreakEmployees);
                          if (breakEmployeesItem) {
                            await api(
                              'PUT',
                              `/settings/timesheet/${encodeURIComponent(breakEmployeesItem.id)}?label=break_eligible_employees&value=${encodeURIComponent(employeesJson)}`,
                            );
                          } else {
                            await api(
                              'POST',
                              `/settings/timesheet?label=break_eligible_employees&value=${encodeURIComponent(employeesJson)}`,
                            );
                          }
                          if (geofenceRadiusItem) {
                            await api(
                              'PUT',
                              `/settings/timesheet/${encodeURIComponent(geofenceRadiusItem.id)}?label=default_geofence_radius_meters&value=${encodeURIComponent(geofenceRadius)}`,
                            );
                          } else {
                            await api(
                              'POST',
                              `/settings/timesheet?label=default_geofence_radius_meters&value=${encodeURIComponent(geofenceRadius)}`,
                            );
                          }
                          await refetch();
                          queryClient.invalidateQueries({ queryKey: ['settings-bundle'] });
                          toast.success('Timesheet settings saved');
                        } catch {
                          toast.error('Failed to save');
                        }
                      }}
                    >
                      Save settings
                    </AppButton>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {addOpen && (
                  <div className={uiCx(uiBorders.subtle, uiRadius.card, 'border-dashed bg-red-50/30 p-4')}>
                    <div className={uiCx('mb-3', uiTypography.sectionTitle)}>
                      {isTermsTemplates ? 'New terms template' : 'New list item'}
                    </div>
                    {isTermsTemplates ? (
                      <div className="space-y-3">
                        <AppInput
                          label="Template name"
                          className="w-full"
                          value={label}
                          onChange={(e) => setLabel(e.target.value)}
                        />
                        <AppTextarea
                          label="Terms text"
                          className="w-full"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          rows={6}
                        />
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <AppInput
                          label={isMatrixSlotsList ? 'Column title' : 'Label'}
                          value={label}
                          onChange={(e) => setLabel(e.target.value)}
                        />
                        {isDivisionList ? (
                          <>
                            <AppInput
                              label="Abbreviation"
                              value={(value || '').split('|')[0] || ''}
                              onChange={(e) => {
                                const parts = (value || '').split('|');
                                parts[0] = e.target.value;
                                setValue(parts.join('|'));
                              }}
                            />
                            <div>
                              <div className={uiCx('mb-1.5', uiTypography.controlLabel)}>Color</div>
                              <ColorSwatchInput
                                value={(value || '').split('|')[1] || '#cccccc'}
                                onChange={(hex) => {
                                  const parts = (value || '').split('|');
                                  parts[1] = hex;
                                  setValue(parts.join('|'));
                                }}
                              />
                            </div>
                          </>
                        ) : isMatrixSlotsList ? (
                          <>
                            <AppInput
                              label="Slug (stable id)"
                              inputClassName="font-mono"
                              value={value}
                              onChange={(e) => setValue(e.target.value)}
                            />
                            <AppSelect
                              label="Cell type"
                              options={MATRIX_CELL_KIND_OPTIONS}
                              value={newMatrixCellKind}
                              onChange={(e) =>
                                setNewMatrixCellKind(e.target.value as 'expiry' | 'date_taken' | 'text')
                              }
                            />
                          </>
                        ) : isColorList ? (
                          <div>
                            <div className={uiCx('mb-1.5', uiTypography.controlLabel)}>Color</div>
                            <ColorSwatchInput value={value || '#cccccc'} onChange={setValue} />
                          </div>
                        ) : (
                          <AppInput label="Value" value={value} onChange={(e) => setValue(e.target.value)} />
                        )}
                        {sel === 'project_statuses' && (
                          <div className="flex flex-wrap items-end gap-4 sm:col-span-2 lg:col-span-3">
                            <AppCheckbox
                              label="Show in projects"
                              checked={newShowInProject}
                              onChange={setNewShowInProject}
                            />
                            <AppCheckbox
                              label="Show in opportunities"
                              checked={newShowInOpportunity}
                              onChange={setNewShowInOpportunity}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    <div className={uiCx('mt-4 flex justify-end gap-2', uiLayout.actionsRow)}>
                      <AppButton type="button" variant="ghost" size="sm" onClick={() => setAddOpen(false)}>
                        Cancel
                      </AppButton>
                      <AppButton type="button" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={handleAdd}>
                        Add
                      </AppButton>
                    </div>
                  </div>
                )}

                {isLoading && !items.length ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
                    ))}
                  </div>
                ) : !items.length ? (
                  <AppEmptyState
                    title="No items yet"
                    description="Add the first value for this list."
                    action={
                      !addOpen ? (
                        <AppButton type="button" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
                          Add item
                        </AppButton>
                      ) : undefined
                    }
                  />
                ) : (
                  <div className={uiCx('overflow-hidden', uiBorders.subtle, uiRadius.card)}>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-sm">
                        <thead className="border-b border-gray-100 bg-gray-50">
                          <tr className={uiTypography.overline}>
                            <th className="px-3 py-2.5 text-left">Label</th>
                            <th className="px-3 py-2.5 text-left">
                              {isDivisionList
                                ? 'Abbr / color'
                                : isMatrixSlotsList
                                  ? 'Slug / type'
                                  : isColorList
                                    ? 'Color'
                                    : isTermsTemplates
                                      ? 'Text'
                                      : 'Value'}
                            </th>
                            {sel === 'project_statuses' ? (
                              <th className="px-3 py-2.5 text-left">Rules</th>
                            ) : null}
                            <th className="px-3 py-2.5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {items.map((it) => {
                            const e = getEdit(it);
                            const dirty = isDirty(it);
                            return (
                              <tr
                                key={it.id}
                                className={uiCx(
                                  'align-top transition-colors',
                                  dirty ? 'bg-amber-50/40' : 'bg-white hover:bg-gray-50/80',
                                )}
                              >
                                <td className="px-3 py-3">
                                  <AppInput
                                    value={e.label}
                                    onChange={(ev) => patchEdit(it, { label: ev.target.value })}
                                    aria-label="Label"
                                  />
                                  {dirty ? (
                                    <div className="mt-1 text-[11px] font-medium text-amber-700">Unsaved changes</div>
                                  ) : null}
                                </td>
                                <td className="px-3 py-3">
                                  {isTermsTemplates ? (
                                    <AppTextarea
                                      value={e.meta?.description || ''}
                                      onChange={(ev) => patchMeta(it, { description: ev.target.value })}
                                      rows={4}
                                    />
                                  ) : isDivisionList ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                      <AppInput
                                        className="w-24"
                                        placeholder="Abbr"
                                        value={e.meta?.abbr || ''}
                                        onChange={(ev) => patchMeta(it, { abbr: ev.target.value })}
                                      />
                                      <ColorSwatchInput
                                        value={e.meta?.color || '#cccccc'}
                                        onChange={(hex) => patchMeta(it, { color: hex })}
                                      />
                                    </div>
                                  ) : isMatrixSlotsList ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                      <AppInput
                                        className="w-36"
                                        inputClassName="font-mono"
                                        value={e.value || ''}
                                        onChange={(ev) => patchEdit(it, { value: ev.target.value })}
                                      />
                                      <AppSelect
                                        className="w-44"
                                        options={MATRIX_CELL_KIND_OPTIONS}
                                        value={(e.meta?.cell_kind as string) || 'text'}
                                        onChange={(ev) => patchMeta(it, { cell_kind: ev.target.value })}
                                      />
                                    </div>
                                  ) : isColorList ? (
                                    <ColorSwatchInput
                                      value={e.value || '#cccccc'}
                                      onChange={(hex) => patchEdit(it, { value: hex })}
                                    />
                                  ) : (
                                    <AppInput
                                      value={e.value || ''}
                                      onChange={(ev) => patchEdit(it, { value: ev.target.value })}
                                    />
                                  )}
                                </td>
                                {sel === 'project_statuses' ? (
                                  <td className="px-3 py-3">
                                    <div className="flex max-w-xs flex-col gap-2">
                                      <AppCheckbox
                                        label="Show in projects"
                                        checked={
                                          typeof e.meta?.show_in_project === 'boolean'
                                            ? e.meta.show_in_project
                                            : effectiveShowInProject(it)
                                        }
                                        onChange={(checked) => patchMeta(it, { show_in_project: checked })}
                                      />
                                      <AppCheckbox
                                        label="Show in opportunities"
                                        checked={
                                          typeof e.meta?.show_in_opportunity === 'boolean'
                                            ? e.meta.show_in_opportunity
                                            : effectiveShowInOpportunity(it)
                                        }
                                        onChange={(checked) => patchMeta(it, { show_in_opportunity: checked })}
                                      />
                                      <AppCheckbox
                                        label="Allow edit proposal/estimate"
                                        checked={!!e.meta?.allow_edit_proposal}
                                        onChange={(checked) => patchMeta(it, { allow_edit_proposal: checked })}
                                      />
                                      <AppCheckbox
                                        label="Sets start date"
                                        checked={!!e.meta?.sets_start_date}
                                        onChange={(checked) => patchMeta(it, { sets_start_date: checked })}
                                      />
                                      <AppCheckbox
                                        label="Sets end date"
                                        checked={!!e.meta?.sets_end_date}
                                        onChange={(checked) => patchMeta(it, { sets_end_date: checked })}
                                      />
                                    </div>
                                  </td>
                                ) : null}
                                <td className="px-3 py-3">
                                  <div className="flex justify-end gap-2">
                                    <AppButton
                                      type="button"
                                      size="sm"
                                      variant={dirty ? 'primary' : 'secondary'}
                                      disabled={!dirty || savingId === it.id}
                                      leftIcon={<Save className="h-3.5 w-3.5" />}
                                      onClick={() => handleSaveItem(it)}
                                    >
                                      {savingId === it.id ? 'Saving…' : 'Save'}
                                    </AppButton>
                                    <AppButton
                                      type="button"
                                      size="sm"
                                      variant="danger"
                                      leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                                      onClick={() => handleDeleteItem(it)}
                                    >
                                      Delete
                                    </AppButton>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </AppCard>
  );
}
