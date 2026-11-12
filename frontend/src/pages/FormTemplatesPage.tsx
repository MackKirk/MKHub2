import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Copy, FileStack, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { formatDateLocal } from '@/lib/dateUtils';
import {
  AppBadge,
  AppCard,
  AppEmptyState,
  AppInput,
  AppListCreateItem,
  AppListRowIconButton,
  AppPageHeader,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  uiCx,
  uiShadows,
  uiSpacing,
  uiTypography,
  type AppListSortDirection,
} from '@/components/ui';
import { FIELDWORK_TEMPLATE_CATEGORIES } from '@/types/formTemplate';

type TemplateRow = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  status: string;
  version_label: string;
  definition_version?: number;
  created_at?: string | null;
  updated_at?: string | null;
  created_by_name?: string | null;
  updated_by_name?: string | null;
};

type SortCol = 'name' | 'created_at' | 'updated_at';

export type FormTemplatesPageVariant = 'safety' | 'employee_review' | 'fieldwork';

type FormTemplatesPageProps = {
  variant?: FormTemplatesPageVariant;
  /** When true, omit the page header (e.g. embedded in Employee Review → Admin → Templates tab). */
  embedded?: boolean;
};

const LIST_GRID_COLS_SAFETY =
  'grid-cols-[minmax(0,2fr)_minmax(0,0.85fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]';
const LIST_GRID_COLS_HR = 'grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]';
const LIST_MIN_WIDTH = 'min-w-[720px]';


function templateStatusBadge(status: string) {
  if (status === 'active') {
    return <AppBadge variant="success">Active</AppBadge>;
  }
  return <AppBadge variant="neutral">{status}</AppBadge>;
}

function templateTypeLabel(category: string | null | undefined): string {
  const cat = (category || '').trim().toLowerCase();
  if (cat === 'follow_up') return 'Follow-up';
  if (cat === 'employee_review') return 'Employee review';
  if (cat === 'site_assessment') return 'Site assessment';
  if (cat === 'work_report') return 'Work report';
  return 'Inspection';
}

export default function FormTemplatesPage({ variant = 'safety', embedded = false }: FormTemplatesPageProps) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const isHr = variant === 'employee_review';
  const isFieldwork = variant === 'fieldwork';
  const editorBasePath = isHr
    ? '/reviews/form-templates'
    : isFieldwork
      ? '/rm-fieldwork/form-templates'
      : '/documents/form-templates';

  const sortBy = (searchParams.get('sort') as SortCol) || 'name';
  const sortDir: AppListSortDirection = searchParams.get('dir') === 'desc' ? 'desc' : 'asc';

  const setListSort = (column: SortCol, direction?: AppListSortDirection) => {
    const params = new URLSearchParams(searchParams);
    const nextDir = direction ?? (sortBy === column && sortDir === 'asc' ? 'desc' : 'asc');
    params.set('sort', column);
    params.set('dir', nextDir);
    setSearchParams(params, { replace: true });
  };

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['formTemplates', sortBy, sortDir, variant],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('sort', sortBy);
      params.set('sort_dir', sortDir);
      if (isHr) params.set('category', 'employee_review');
      if (isFieldwork) params.set('domain', 'fieldwork');
      return api<TemplateRow[]>('GET', `/form-templates?${params.toString()}`);
    },
  });

  const filteredRows = useMemo(() => {
    // Safety Documents hub must never list Fieldwork templates (API also filters).
    const domainRows = isHr || isFieldwork
      ? rows
      : rows.filter((r) => !FIELDWORK_TEMPLATE_CATEGORIES.has(String(r.category || '').toLowerCase()));
    const s = searchQuery.trim().toLowerCase();
    if (!s) return domainRows;
    return domainRows.filter((r) => {
      const name = (r.name || '').toLowerCase();
      const cat = (r.category || '').toLowerCase();
      const desc = (r.description || '').toLowerCase();
      const ver = (r.version_label || '').toLowerCase();
      const defVer = String(r.definition_version ?? '');
      return name.includes(s) || cat.includes(s) || desc.includes(s) || ver.includes(s) || defVer.includes(s);
    });
  }, [rows, searchQuery, isHr, isFieldwork]);

  const createMut = useMutation({
    mutationFn: () =>
      api<{ id: string }>('POST', '/form-templates', {
        name: isHr
          ? 'New employee review template'
          : isFieldwork
            ? 'New site assessment template'
            : 'New form template',
        category: isHr ? 'employee_review' : isFieldwork ? 'site_assessment' : 'inspection',
        status: 'active',
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['formTemplates'] });
      toast.success('Template created');
      nav(`${editorBasePath}/${encodeURIComponent(r.id)}`);
    },
    onError: () => toast.error('Could not create template'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>('DELETE', `/form-templates/${encodeURIComponent(id)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['formTemplates'] });
      toast.success('Template deleted');
    },
    onError: () => toast.error('Could not delete template'),
  });

  const duplicateMut = useMutation({
    mutationFn: (id: string) => api<{ id: string }>('POST', `/form-templates/${encodeURIComponent(id)}/duplicate`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['formTemplates'] });
      toast.success('Template duplicated');
      nav(`${editorBasePath}/${encodeURIComponent(r.id)}`);
    },
    onError: () => toast.error('Could not duplicate template'),
  });

  const askDeleteTemplate = async (r: TemplateRow) => {
    const label = r.name.trim() || 'Untitled template';
    const res = await confirm({
      title: 'Delete template?',
      message: `Delete "${label}"? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (res !== 'confirm') return;
    deleteMut.mutate(r.id);
  };

  const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try {
      return formatDateLocal(new Date(iso));
    } catch {
      return '—';
    }
  };

  const fmtDateBy = (iso: string | null | undefined, byName: string | null | undefined) => {
    const d = fmtDate(iso);
    if (d === '—') return '—';
    const who = (byName || '').trim() || 'Unknown';
    return `${d} by ${who}`;
  };



  const pageTitle = isHr
    ? 'Employee review form templates'
    : isFieldwork
      ? 'Fieldwork form templates'
      : 'Form Templates';
  const pageSubtitle = isHr
    ? 'Build reusable employee review forms (same builder as Safety). Save in the editor updates what employees see for review cycles.'
    : isFieldwork
      ? 'Site Assessment (Opportunity / quote) and Work Report (Project / execution) templates. Configure required fields, photos, and final comments in the editor.'
      : 'Build reusable safety forms. Save in the editor updates what users see when starting inspections.';

  const showEmptyList = !isLoading && rows.length === 0;
  const showNoMatches = !isLoading && rows.length > 0 && filteredRows.length === 0;
  const listGridCols = isHr ? LIST_GRID_COLS_HR : LIST_GRID_COLS_SAFETY;
  const showTypeColumn = !isHr;

  const listContent = (
    <AppCard className={uiShadows.card} bodyClassName="!p-0">
      {isLoading ? (
        <div className={uiCx(uiTypography.helper, 'px-4 py-8 text-center')}>Loading…</div>
      ) : showEmptyList ? (
        <div className={uiSpacing.cardPadding}>
          <AppListCreateItem
            label={createMut.isPending ? 'Creating…' : 'New template'}
            layout="row"
            className="w-full"
            disabled={createMut.isPending}
            onClick={() => createMut.mutate()}
          />
          <AppEmptyState title="No templates yet." className="mt-4" />
        </div>
      ) : (
        <AppSortableEntityList layout="flat">
          <div className={uiSpacing.cardPadding}>
            <AppListCreateItem
              label={createMut.isPending ? 'Creating…' : 'New template'}
              layout="row"
              className="w-full"
              disabled={createMut.isPending}
              onClick={() => createMut.mutate()}
            />
          </div>
          <AppSortableEntityListHeader variant="flat" gridCols={listGridCols} minWidth={LIST_MIN_WIDTH}>
            <AppSortableEntityListSortColumn
              label="Name"
              column="name"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={setListSort}
            />
            {showTypeColumn ? (
              <AppSortableEntityListSortColumn
                label="Type"
                column="name"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={setListSort}
                sortable={false}
              />
            ) : null}
            <AppSortableEntityListSortColumn
              label="Version"
              column="name"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={setListSort}
              sortable={false}
            />
            <AppSortableEntityListSortColumn
              label="Created"
              column="created_at"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={setListSort}
            />
            <AppSortableEntityListSortColumn
              label="Last update"
              column="updated_at"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={setListSort}
              className="hidden md:flex"
            />
            <AppSortableEntityListSortColumn
              label="Status"
              column="name"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={setListSort}
              sortable={false}
            />
            <AppSortableEntityListSortColumn
              label={<span className="sr-only">Actions</span>}
              column="name"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={setListSort}
              sortable={false}
              className="flex justify-end"
            />
          </AppSortableEntityListHeader>
          {showNoMatches ? (
            <div className={uiCx(uiTypography.helper, 'px-4 py-8 text-center', LIST_MIN_WIDTH)}>
              No matching templates.
            </div>
          ) : (
            <AppSortableEntityListFlatBody gridCols={listGridCols} minWidth={LIST_MIN_WIDTH}>
              {filteredRows.map((r) => (
                <AppSortableEntityListRow
                  key={r.id}
                  variant="flat"
                  as="div"
                  gridCols={listGridCols}
                  minWidth={LIST_MIN_WIDTH}
                >
                  <Link
                    to={`${editorBasePath}/${encodeURIComponent(r.id)}`}
                    className={uiCx(uiTypography.sectionTitle, 'truncate hover:text-brand-red hover:underline')}
                    title={r.name}
                  >
                    {r.name}
                  </Link>
                  {showTypeColumn ? (
                    <span className={uiCx(uiTypography.body, 'truncate')} title={templateTypeLabel(r.category)}>
                      {templateTypeLabel(r.category)}
                    </span>
                  ) : null}
                  <span className={uiCx(uiTypography.body, 'truncate')} title={r.version_label || ''}>
                    {(r.version_label || '').trim() || '—'}
                  </span>
                  <span className={uiCx(uiTypography.body, 'whitespace-nowrap')}>
                    {fmtDateBy(r.created_at, r.created_by_name)}
                  </span>
                  <span className={uiCx(uiTypography.body, 'whitespace-nowrap hidden md:block')}>
                    {fmtDateBy(r.updated_at, r.updated_by_name)}
                  </span>
                  <div className="flex justify-center">{templateStatusBadge(r.status)}</div>
                  <div className="flex items-center justify-end gap-1">
                    <AppListRowIconButton
                      label={`Duplicate template ${r.name.trim() || 'Untitled'}`}
                      icon={<Copy className="h-4 w-4" />}
                      disabled={duplicateMut.isPending}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        duplicateMut.mutate(r.id);
                      }}
                    />
                    <AppListRowIconButton
                      preset="delete"
                      label={`Delete template ${r.name.trim() || 'Untitled'}`}
                      disabled={deleteMut.isPending}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void askDeleteTemplate(r);
                      }}
                    />
                  </div>
                </AppSortableEntityListRow>
              ))}
            </AppSortableEntityListFlatBody>
          )}
        </AppSortableEntityList>
      )}
    </AppCard>
  );

  if (embedded) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'pb-2')}>
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <AppInput
            id="form-templates-search"
            placeholder="Search by name, category, version, or description…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
            aria-label="Search templates"
            autoComplete="off"
          />
        </AppCard>
        {listContent}
      </div>
    );
  }

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title={pageTitle}
        subtitle={pageSubtitle}
        icon={<FileStack className="h-4 w-4" />}
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <AppInput
          id="form-templates-search"
          placeholder="Search by name, category, version, or description…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
          aria-label="Search templates"
          autoComplete="off"
        />
      </AppCard>

      {listContent}
    </div>
  );
}
