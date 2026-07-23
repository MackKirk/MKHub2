import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import { uploadCertificateBackgroundFile, uploadOrganizationLogoFile } from '@/lib/trainingFileUpload';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Award,
  FolderTree,
  ImageIcon,
  Plus,
  Replace,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppInput,
  AppSectionHeader,
  AppTabs,
  AppTextarea,
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

type SettingItem = {
  id: string;
  label: string;
  value?: string;
  sort_index?: number;
  meta?: { file_object_id?: string; icon?: string; description?: string } | null;
};

type FilesView = 'categories' | 'logos' | 'certificates';

const VIEW_TABS: { key: FilesView; label: string }[] = [
  { key: 'categories', label: 'File categories' },
  { key: 'logos', label: 'Brand assets' },
  { key: 'certificates', label: 'Certificate assets' },
];

function parseView(raw: string | null): FilesView {
  if (raw === 'logos' || raw === 'certificates' || raw === 'categories') return raw;
  return 'categories';
}

export default function SettingsFilesAssetsPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<FilesView>(() => parseView(searchParams.get('view')));

  useEffect(() => {
    if ((searchParams.get('section') || '').toLowerCase() !== 'files') return;
    setView(parseView(searchParams.get('view')));
  }, [searchParams]);

  const handleViewChange = (key: string) => {
    const nextView = parseView(key);
    setView(nextView);
    const next = new URLSearchParams(searchParams);
    next.set('section', 'files');
    if (nextView === 'categories') next.delete('view');
    else next.set('view', nextView);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className={uiSpacing.pageStack}>
      <AppCard className={uiShadows.card} bodyClassName={uiSpacing.cardPadding}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={uiTypography.overline}>Administration</div>
            <h2 className={uiCx(uiTypography.pageTitle, '!text-lg')}>Files & assets</h2>
            <p className={uiCx('mt-1 max-w-2xl', uiTypography.helper)}>
              Manage file taxonomies, brand logos, and LMS certificate artwork in one place.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <AppTabs tabs={VIEW_TABS} value={view} onChange={handleViewChange} />
        </div>
      </AppCard>

      {view === 'categories' && <FileCategoriesView />}
      {view === 'logos' && <BrandAssetsView />}
      {view === 'certificates' && <CertificateAssetsView />}
    </div>
  );
}

/* ——— File categories ——— */

function FileCategoriesView() {
  return (
    <div className={uiSpacing.pageStack}>
      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-brand-red">
            <FolderTree className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className={uiTypography.sectionTitle}>Two different taxonomies</h3>
            <p className={uiCx('mt-1', uiTypography.helper)}>
              <span className="font-medium text-gray-800">Company file categories</span> are the top-level
              areas in Company Files (HR, Operations, etc.).{' '}
              <span className="font-medium text-gray-800">Project file categories</span> define upload
              slugs and default project subfolder names (Drawings, Safety, Contract…).
            </p>
          </div>
        </div>
      </AppCard>

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <CompanyFileCategoriesCard />
        <ProjectFileCategoriesCard />
      </div>
    </div>
  );
}

function CompanyFileCategoriesCard() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { data: departments, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api<SettingItem[]>('GET', '/settings/departments'),
  });
  const [newDept, setNewDept] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [edits, setEdits] = useState<Record<string, SettingItem>>({});

  const createMutation = useMutation({
    mutationFn: (label: string) => api('POST', `/settings/departments?label=${encodeURIComponent(label)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      setNewDept('');
      setAddOpen(false);
      toast.success('Category created');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to create'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api('DELETE', `/settings/departments/${encodeURIComponent(id)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      toast.success('Deleted');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to delete'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; label?: string; sort_index?: number }) => {
      const params = new URLSearchParams();
      if (payload.label !== undefined) params.set('label', payload.label);
      if (payload.sort_index !== undefined) params.set('sort_index', String(payload.sort_index));
      return api('PUT', `/settings/departments/${encodeURIComponent(payload.id)}?${params.toString()}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      toast.success('Updated');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to update'),
  });

  const sorted = useMemo(
    () => (departments || []).slice().sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0)),
    [departments],
  );

  const move = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[next];
    updateMutation.mutate({ id: a.id, sort_index: b.sort_index ?? 0 });
    updateMutation.mutate({ id: b.id, sort_index: a.sort_index ?? 0 });
  };

  const getEdit = (it: SettingItem) => edits[it.id] || it;

  return (
    <AppCard className={uiCx(uiShadows.card, 'min-w-0')} bodyClassName="!p-0 overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <AppSectionHeader
              title="Company file categories"
              description="Top-level areas shown in Company Files."
            />
          </div>
          <div className="flex items-center gap-2">
            <AppBadge variant="neutral">{sorted.length}</AppBadge>
            <AppButton
              type="button"
              size="sm"
              variant={addOpen ? 'secondary' : 'primary'}
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setAddOpen((v) => !v)}
            >
              {addOpen ? 'Cancel' : 'Add'}
            </AppButton>
          </div>
        </div>
      </div>

      <div className={uiCx('p-5', uiSpacing.sectionStack)}>
        {addOpen && (
          <div className={uiCx(uiBorders.subtle, uiRadius.card, 'border-dashed bg-red-50/30 p-4')}>
            <div className={uiCx(uiLayout.actionsRow, 'flex-wrap gap-2')}>
              <AppInput
                className="min-w-[200px] flex-1"
                label="Category name"
                value={newDept}
                onChange={(e) => setNewDept(e.target.value)}
                placeholder="e.g. Human Resources"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newDept.trim()) createMutation.mutate(newDept.trim());
                }}
              />
              <div className="flex items-end">
                <AppButton
                  loading={createMutation.isPending}
                  disabled={createMutation.isPending || !newDept.trim()}
                  onClick={() => newDept.trim() && createMutation.mutate(newDept.trim())}
                >
                  Add category
                </AppButton>
              </div>
            </div>
          </div>
        )}

        <div className={uiCx('overflow-hidden', uiBorders.subtle, uiRadius.card)}>
          <div className="max-h-[28rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className={uiCx('sticky top-0 z-[1] border-b border-gray-200 bg-gray-50 text-left', uiTypography.overline)}>
                <tr>
                  <th className="w-10 px-2 py-2.5">Order</th>
                  <th className="px-3 py-2.5">Name</th>
                  <th className="w-24 px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {isLoading ? (
                  <tr>
                    <td colSpan={3} className={uiCx('px-3 py-8 text-center', uiTypography.helper)}>
                      Loading…
                    </td>
                  </tr>
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-0">
                      <AppEmptyState
                        title="No company categories yet"
                        description="Add the first area used in Company Files."
                        className="border-0 bg-transparent shadow-none"
                        action={
                          !addOpen ? (
                            <AppButton size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
                              Add category
                            </AppButton>
                          ) : undefined
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  sorted.map((d, i) => {
                    const e = getEdit(d);
                    return (
                      <tr key={d.id} className="hover:bg-gray-50/80">
                        <td className="whitespace-nowrap px-2 py-2 align-middle">
                          <div className="flex flex-col gap-0.5">
                            <AppButton
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-auto px-1 py-0 text-[10px] leading-none"
                              disabled={i === 0}
                              onClick={() => move(i, -1)}
                              title="Move up"
                            >
                              ↑
                            </AppButton>
                            <AppButton
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-auto px-1 py-0 text-[10px] leading-none"
                              disabled={i === sorted.length - 1}
                              onClick={() => move(i, 1)}
                              title="Move down"
                            >
                              ↓
                            </AppButton>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <AppInput
                            value={e.label}
                            onChange={(ev) =>
                              setEdits((s) => ({ ...s, [d.id]: { ...(s[d.id] || d), label: ev.target.value } }))
                            }
                            onBlur={() => {
                              const v = edits[d.id]?.label?.trim();
                              if (v && v !== d.label) {
                                updateMutation.mutate({ id: d.id, label: v });
                                setEdits((s) => {
                                  const { [d.id]: _, ...rest } = s;
                                  return rest;
                                });
                              }
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-right align-middle">
                          <AppButton
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                            loading={deleteMutation.isPending}
                            disabled={deleteMutation.isPending}
                            onClick={async () => {
                              const result = await confirm({
                                title: 'Delete category?',
                                message: `Remove "${d.label}" from Company Files?`,
                                confirmText: 'Delete',
                              });
                              if (result === 'confirm') deleteMutation.mutate(d.id);
                            }}
                          >
                            Delete
                          </AppButton>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppCard>
  );
}

function ProjectFileCategoriesCard() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { data: categories, isLoading } = useQuery({
    queryKey: ['file-categories'],
    queryFn: () => api<any[]>('GET', '/clients/file-categories'),
  });
  const [edits, setEdits] = useState<Record<string, { name?: string; icon?: string; description?: string }>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📁');
  const [newDesc, setNewDesc] = useState('');

  const sorted = useMemo(
    () => (categories || []).slice().sort((a: any, b: any) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0)),
    [categories],
  );

  const getEdit = (row: any) => edits[row.itemId] || {};

  const updateMutation = useMutation({
    mutationFn: (payload: {
      itemId: string;
      value?: string;
      icon?: string;
      description?: string;
      sort_index?: number;
    }) => {
      const params = new URLSearchParams();
      if (payload.value !== undefined) params.set('value', payload.value);
      if (payload.icon !== undefined) params.set('icon', payload.icon);
      if (payload.description !== undefined) params.set('description', payload.description);
      if (payload.sort_index !== undefined) params.set('sort_index', String(payload.sort_index));
      return api('PUT', `/settings/standard_file_categories/${encodeURIComponent(payload.itemId)}?${params.toString()}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['file-categories'] });
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      toast.success('Saved');
    },
    onError: () => toast.error('Failed to save'),
  });

  const createMutation = useMutation({
    mutationFn: (vars: { slug: string; name: string; icon: string; desc: string }) => {
      const slug = vars.slug.trim().toLowerCase();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw new Error('Invalid id: use lowercase letters, numbers and hyphens only.');
      }
      const params = new URLSearchParams({
        label: slug,
        value: vars.name.trim() || slug,
      });
      if (vars.icon.trim()) params.set('icon', vars.icon.trim());
      if (vars.desc.trim()) params.set('description', vars.desc.trim());
      return api('POST', `/settings/standard_file_categories?${params.toString()}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['file-categories'] });
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      setNewSlug('');
      setNewName('');
      setNewIcon('📁');
      setNewDesc('');
      setAddOpen(false);
      toast.success('Category added');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to add'),
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) =>
      api('DELETE', `/settings/standard_file_categories/${encodeURIComponent(itemId)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['file-categories'] });
      qc.invalidateQueries({ queryKey: ['settings-bundle'] });
      toast.success('Deleted');
    },
    onError: () => toast.error('Failed to delete'),
  });

  const move = (idx: number, dir: -1 | 1) => {
    if (!sorted.length) return;
    const j = idx + dir;
    if (j < 0 || j >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[j];
    updateMutation.mutate({ itemId: a.itemId, sort_index: b.sortIndex ?? 0 });
    updateMutation.mutate({ itemId: b.itemId, sort_index: a.sortIndex ?? 0 });
  };

  const saveRow = (row: any) => {
    const e = getEdit(row);
    const name = e.name !== undefined ? e.name : row.name;
    const icon = e.icon !== undefined ? e.icon : row.icon;
    const description = e.description !== undefined ? e.description : row.description || '';
    updateMutation.mutate(
      {
        itemId: row.itemId,
        value: String(name ?? '').trim() || row.id,
        icon: String(icon ?? '').trim() || '📁',
        description,
      },
      {
        onSuccess: () =>
          setEdits((s) => {
            const { [row.itemId]: _, ...rest } = s;
            return rest;
          }),
      },
    );
  };

  return (
    <AppCard className={uiCx(uiShadows.card, 'min-w-0')} bodyClassName="!p-0 overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <AppSectionHeader
              title="Project file categories"
              description="Slugs and folder names used for project uploads and default subfolders."
            />
          </div>
          <div className="flex items-center gap-2">
            <AppBadge variant="neutral">{sorted.length}</AppBadge>
            <AppButton
              type="button"
              size="sm"
              variant={addOpen ? 'secondary' : 'primary'}
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setAddOpen((v) => !v)}
            >
              {addOpen ? 'Cancel' : 'Add'}
            </AppButton>
          </div>
        </div>
      </div>

      <div className={uiCx('p-5', uiSpacing.sectionStack)}>
        {addOpen && (
          <div className={uiCx(uiBorders.subtle, uiRadius.card, 'border-dashed bg-red-50/30 p-4')}>
            <div className={uiCx('mb-3', uiTypography.sectionTitle)}>New project category</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <AppInput
                label="Id (slug)"
                placeholder="e.g. as-built-docs"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
              />
              <AppInput
                label="Display / folder name"
                placeholder="Shown in UI and folder name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <AppInput
                className="w-20"
                label="Icon"
                title="Emoji"
                inputClassName="text-center"
                value={newIcon}
                onChange={(e) => setNewIcon(e.target.value)}
              />
              <AppInput
                label="Description (optional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
            <div className={uiCx('mt-3 flex justify-end gap-2', uiLayout.actionsRow)}>
              <AppButton type="button" variant="ghost" size="sm" onClick={() => setAddOpen(false)}>
                Cancel
              </AppButton>
              <AppButton
                size="sm"
                loading={createMutation.isPending}
                disabled={createMutation.isPending || !newSlug.trim()}
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() =>
                  createMutation.mutate({ slug: newSlug, name: newName, icon: newIcon, desc: newDesc })
                }
              >
                Add category
              </AppButton>
            </div>
          </div>
        )}

        <div className={uiCx('overflow-hidden', uiBorders.subtle, uiRadius.card)}>
          <div className="max-h-[28rem] overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className={uiCx('sticky top-0 z-[1] border-b border-gray-200 bg-gray-50 text-left', uiTypography.overline)}>
                <tr>
                  <th className="w-10 px-2 py-2.5"> </th>
                  <th className="w-12 px-2 py-2.5">Icon</th>
                  <th className="min-w-[120px] px-3 py-2.5">Name</th>
                  <th className="min-w-[100px] px-3 py-2.5">Id</th>
                  <th className="min-w-[140px] px-3 py-2.5">Description</th>
                  <th className="w-28 px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className={uiCx('px-3 py-8 text-center', uiTypography.helper)}>
                      Loading…
                    </td>
                  </tr>
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <AppEmptyState
                        title="No project categories"
                        description="Add the first upload / folder category."
                        className="border-0 bg-transparent shadow-none"
                      />
                    </td>
                  </tr>
                ) : (
                  sorted.map((row: any, i: number) => {
                    const e = getEdit(row);
                    const name = e.name !== undefined ? e.name : row.name;
                    const icon = e.icon !== undefined ? e.icon : row.icon;
                    const description = e.description !== undefined ? e.description : row.description || '';
                    const dirty = Boolean(edits[row.itemId]);
                    return (
                      <tr
                        key={row.itemId}
                        className={uiCx('align-top', dirty ? 'bg-amber-50/40' : 'hover:bg-gray-50/50')}
                      >
                        <td className="whitespace-nowrap px-2 py-2">
                          <div className="flex flex-col gap-0.5">
                            <AppButton
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-auto px-1 py-0 text-[10px] leading-none"
                              disabled={i === 0}
                              onClick={() => move(i, -1)}
                              title="Move up"
                            >
                              ↑
                            </AppButton>
                            <AppButton
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-auto px-1 py-0 text-[10px] leading-none"
                              disabled={i === sorted.length - 1}
                              onClick={() => move(i, 1)}
                              title="Move down"
                            >
                              ↓
                            </AppButton>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <AppInput
                            className="w-11"
                            inputClassName="px-1 text-center"
                            value={icon}
                            onChange={(ev) =>
                              setEdits((s) => ({
                                ...s,
                                [row.itemId]: { ...getEdit(row), icon: ev.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <AppInput
                            value={name}
                            onChange={(ev) =>
                              setEdits((s) => ({
                                ...s,
                                [row.itemId]: { ...getEdit(row), name: ev.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <span className={uiCx('break-all font-mono', uiTypography.helper)}>{row.id}</span>
                        </td>
                        <td className="px-3 py-2">
                          <AppTextarea
                            textareaClassName="min-h-[2.5rem] text-xs"
                            rows={2}
                            placeholder="—"
                            value={description}
                            onChange={(ev) =>
                              setEdits((s) => ({
                                ...s,
                                [row.itemId]: { ...getEdit(row), description: ev.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className={uiCx('whitespace-nowrap px-3 py-2 text-right', uiLayout.actionsRow)}>
                          <AppButton
                            className="mr-1"
                            size="sm"
                            variant={dirty ? 'primary' : 'secondary'}
                            disabled={!dirty || updateMutation.isPending}
                            leftIcon={<Save className="h-3.5 w-3.5" />}
                            loading={updateMutation.isPending}
                            onClick={() => saveRow(row)}
                          >
                            Save
                          </AppButton>
                          <AppButton
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                            loading={deleteMutation.isPending}
                            disabled={deleteMutation.isPending}
                            onClick={async () => {
                              const result = await confirm({
                                title: 'Delete category?',
                                message: `Remove "${row.name}" (${row.id}) from the list? Existing files still reference this category id.`,
                                confirmText: 'Delete',
                              });
                              if (result === 'confirm') deleteMutation.mutate(row.itemId);
                            }}
                          >
                            Delete
                          </AppButton>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className={uiTypography.helper}>
          The id is stored on uploaded files; changing the display name does not rewrite existing file rows.
        </p>
      </div>
    </AppCard>
  );
}

/* ——— Brand / certificate asset libraries ——— */

function BrandAssetsView() {
  return (
    <AssetLibraryView
      kind="logos"
      title="Brand assets"
      subtitle="Upload logos once and reuse them in LMS certificates and other surfaces."
      icon={<ImageIcon className="h-4 w-4" />}
      emptyTitle="No logos yet"
      emptyDescription="Upload PNG, JPEG, WebP, or GIF logos to build the brand library."
      listKey="organization_logos"
      invalidateKeys={['settings-bundle', 'training-organization-logo-presets']}
      uploadFn={uploadOrganizationLogoFile}
      apiBase="/settings/organization_logos"
      previewFor={(it) => {
        const fid = it.meta?.file_object_id;
        return fid ? withFileAccessToken(`/files/${fid}`) : null;
      }}
      objectFit="contain"
    />
  );
}

function CertificateAssetsView() {
  return (
    <AssetLibraryView
      kind="certificates"
      title="Certificate assets"
      subtitle="Landscape backgrounds for LMS completion certificates. Authors pick these in the course Certificate tab."
      icon={<Award className="h-4 w-4" />}
      emptyTitle="No certificate backgrounds yet"
      emptyDescription="Upload high-resolution landscape images (PNG, JPEG, WebP)."
      listKey="certificate_backgrounds"
      invalidateKeys={['settings-bundle', 'training-certificate-bg-presets']}
      uploadFn={uploadCertificateBackgroundFile}
      apiBase="/settings/certificate_backgrounds"
      previewFor={(it) =>
        it.meta?.file_object_id ? `/training/certificate-background-library/${it.id}` : null
      }
      objectFit="cover"
    />
  );
}

function AssetLibraryView({
  kind,
  title,
  subtitle,
  icon,
  emptyTitle,
  emptyDescription,
  listKey,
  invalidateKeys,
  uploadFn,
  apiBase,
  previewFor,
  objectFit,
}: {
  kind: 'logos' | 'certificates';
  title: string;
  subtitle: string;
  icon: ReactNode;
  emptyTitle: string;
  emptyDescription: string;
  listKey: 'organization_logos' | 'certificate_backgrounds';
  invalidateKeys: string[];
  uploadFn: (file: File) => Promise<string>;
  apiBase: string;
  previewFor: (it: SettingItem) => string | null;
  objectFit: 'contain' | 'cover';
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const { data, isLoading } = useQuery({
    queryKey: ['settings-bundle'],
    queryFn: () => api<Record<string, SettingItem[]>>('GET', '/settings'),
  });
  const items = (data?.[listKey] || []) as SettingItem[];
  const [busy, setBusy] = useState(false);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});

  const invalidate = async () => {
    for (const key of invalidateKeys) {
      await qc.invalidateQueries({ queryKey: [key] });
    }
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const arr = Array.from(files);
      for (const f of arr) {
        const stem = f.name.replace(/\.[^.]+$/, '') || (kind === 'logos' ? 'Logo' : 'Background');
        const fid = await uploadFn(f);
        const params = new URLSearchParams({ label: stem, file_object_id: fid });
        await api('POST', `${apiBase}?${params.toString()}`);
      }
      await invalidate();
      toast.success(arr.length > 1 ? 'Assets added' : 'Asset added');
      if (fileRef.current) fileRef.current.value = '';
    } catch {
      toast.error('Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const saveLabel = async (it: SettingItem, nextLabel: string) => {
    const v = nextLabel.trim();
    if (!v || v === it.label) return;
    try {
      await api('PUT', `${apiBase}/${encodeURIComponent(it.id)}?label=${encodeURIComponent(v)}`);
      await invalidate();
      setLabelDrafts((s) => {
        const { [it.id]: _, ...rest } = s;
        return rest;
      });
      toast.success('Saved');
    } catch {
      toast.error('Failed to save label');
    }
  };

  const replaceFile = async (it: SettingItem, file: File | undefined) => {
    const fid = it.meta?.file_object_id;
    if (!file || !fid) return;
    setBusy(true);
    try {
      const newId = await uploadFn(file);
      const params = new URLSearchParams({ file_object_id: newId });
      await api('PUT', `${apiBase}/${encodeURIComponent(it.id)}?${params.toString()}`);
      await invalidate();
      toast.success('Image replaced');
    } catch {
      toast.error('Replace failed');
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (it: SettingItem) => {
    const result = await confirm({
      title: kind === 'logos' ? 'Remove logo?' : 'Remove background?',
      message: it.label,
      confirmText: 'Delete',
    });
    if (result !== 'confirm') return;
    try {
      await api('DELETE', `${apiBase}/${encodeURIComponent(it.id)}`);
      await invalidate();
      toast.success('Removed');
    } catch {
      toast.error('Delete failed');
    }
  };

  return (
    <AppCard className={uiShadows.card} bodyClassName="!p-0 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-brand-red">
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className={uiTypography.sectionTitle}>{title}</h3>
            <p className={uiCx('mt-1 max-w-2xl', uiTypography.helper)}>{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AppBadge variant="neutral">{items.length}</AppBadge>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="sr-only"
            id={`asset-upload-${kind}`}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <AppButton
            type="button"
            size="sm"
            leftIcon={<Upload className="h-4 w-4" />}
            disabled={busy}
            loading={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? 'Uploading…' : 'Upload'}
          </AppButton>
        </div>
      </div>

      <div className="p-5">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <AppEmptyState
            title={emptyTitle}
            description={emptyDescription}
            action={
              <AppButton
                size="sm"
                leftIcon={<Upload className="h-4 w-4" />}
                onClick={() => fileRef.current?.click()}
              >
                Upload images
              </AppButton>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((it) => {
              const preview = previewFor(it);
              const label = labelDrafts[it.id] ?? it.label;
              const dirty = labelDrafts[it.id] !== undefined && labelDrafts[it.id] !== it.label;
              return (
                <div
                  key={it.id}
                  className={uiCx(
                    'flex flex-col overflow-hidden',
                    uiBorders.subtle,
                    uiRadius.card,
                    uiColors.surface,
                    'shadow-sm',
                  )}
                >
                  <div
                    className={uiCx(
                      'relative flex h-36 items-center justify-center bg-gray-50',
                      objectFit === 'cover' ? 'overflow-hidden' : 'p-3',
                    )}
                  >
                    {preview ? (
                      <img
                        src={preview}
                        alt=""
                        className={uiCx(
                          'h-full w-full',
                          objectFit === 'cover' ? 'object-cover' : 'object-contain',
                        )}
                      />
                    ) : (
                      <span className={uiTypography.helper}>No preview</span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-3">
                    <AppInput
                      label="Label"
                      value={label}
                      onChange={(e) =>
                        setLabelDrafts((s) => ({ ...s, [it.id]: e.target.value }))
                      }
                      onBlur={() => saveLabel(it, label)}
                    />
                    {dirty ? (
                      <div className="text-[11px] font-medium text-amber-700">Unsaved label — blur to save</div>
                    ) : null}
                    <div className={uiCx('mt-auto flex flex-wrap gap-2', uiLayout.actionsRow)}>
                      <input
                        ref={(el) => {
                          replaceRefs.current[it.id] = el;
                        }}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="sr-only"
                        onChange={(ev) => {
                          const f = ev.target.files?.[0];
                          ev.target.value = '';
                          void replaceFile(it, f);
                        }}
                      />
                      <AppButton
                        type="button"
                        size="sm"
                        variant="secondary"
                        leftIcon={<Replace className="h-3.5 w-3.5" />}
                        disabled={busy || !it.meta?.file_object_id}
                        onClick={() => replaceRefs.current[it.id]?.click()}
                      >
                        Replace
                      </AppButton>
                      <AppButton
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={() => removeItem(it)}
                      >
                        Delete
                      </AppButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppCard>
  );
}
