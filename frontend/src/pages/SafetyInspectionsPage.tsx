import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ClipboardCheck, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import { BUSINESS_LINE_REPAIRS_MAINTENANCE } from '@/lib/businessLine';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  AppBadge,
  AppCard,
  AppEmptyState,
  AppInput,
  AppListRowIconButton,
  AppPageHeader,
  AppSelect,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  uiCx,
  uiLayout,
  uiShadows,
  uiSpacing,
  uiTypography,
  type AppListSortDirection,
} from '@/components/ui';

type SafetyListRow = {
  id: string;
  project_id: string;
  project_name: string;
  project_code: string;
  business_line?: string;
  inspection_date: string | null;
  status: string;
  template_name?: string | null;
  template_version_label?: string | null;
  worker_name?: string | null;
  assigned_user_id?: string | null;
  form_template_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type SafetyListSort = 'inspection_date' | 'project';

const SAFETY_LIST_MIN_WIDTH = 'min-w-[880px]';

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'finalized', label: 'Finalized' },
];

function projectHref(row: SafetyListRow): string {
  const base = row.business_line === BUSINESS_LINE_REPAIRS_MAINTENANCE ? '/rm-projects' : '/projects';
  const q = new URLSearchParams({ tab: 'safety', safety_inspection: row.id });
  return `${base}/${encodeURIComponent(row.project_id)}?${q.toString()}`;
}

function safetyInspectionStatusBadge(status: string) {
  if (status === 'finalized') {
    return <AppBadge variant="success">Finalized</AppBadge>;
  }
  return <AppBadge variant="warning">Draft</AppBadge>;
}

export default function SafetyInspectionsPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<{ roles?: string[] }>('GET', '/auth/me') });
  const isAdmin = (me?.roles || []).includes('admin');
  const search = searchParams.get('search') ?? '';
  const statusParam = searchParams.get('status') ?? '';
  const sortBy: SafetyListSort = searchParams.get('sort') === 'project' ? 'project' : 'inspection_date';
  const sortDir: AppListSortDirection = searchParams.get('dir') === 'asc' ? 'asc' : 'desc';

  const todayLabel = new Date().toLocaleDateString('en-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const setListSort = (column: SafetyListSort, direction?: AppListSortDirection) => {
    const params = new URLSearchParams(searchParams);
    const nextDir = direction ?? (sortBy === column && sortDir === 'asc' ? 'desc' : 'asc');
    params.set('sort', column);
    params.set('dir', nextDir);
    setSearchParams(params, { replace: true });
  };

  const setSearchFilter = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set('search', next);
    else params.delete('search');
    setSearchParams(params, { replace: true });
  };

  const setStatusFilter = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set('status', next);
    else params.delete('status');
    setSearchParams(params, { replace: true });
  };

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['safetyInspections', search, statusParam, sortBy, sortDir],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusParam) params.set('status', statusParam);
      params.set('sort', sortBy);
      params.set('dir', sortDir);
      params.set('limit', '200');
      params.set('offset', '0');
      return api<SafetyListRow[]>('GET', `/safety/inspections?${params.toString()}`);
    },
  });

  const showEmpty = !isLoading && rows.length === 0;

  const listGridCols = useMemo(
    () =>
      isAdmin
        ? 'grid-cols-[3fr_8fr_4fr_7fr_4fr_2fr_auto]'
        : 'grid-cols-[3fr_8fr_4fr_7fr_4fr_2fr]',
    [isAdmin],
  );

  return (
    <div className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Site safety inspections"
        subtitle="All awarded projects you can access. Open a row to edit in the project Safety tab."
        icon={<ClipboardCheck className="h-4 w-4" />}
        actions={
          <div className="text-right">
            <div className={uiTypography.overline}>Today</div>
            <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
          </div>
        }
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-end gap-3')}>
          <div className="min-w-0 flex-1">
            <AppInput
              placeholder="Search by project name or code…"
              value={search}
              onChange={(e) => setSearchFilter(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search inspections"
            />
          </div>
          <div className="w-full sm:w-auto sm:min-w-[180px]">
            <AppSelect
              value={statusParam}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={STATUS_FILTER_OPTIONS}
              aria-label="Filter by status"
            />
          </div>
        </div>
      </AppCard>

      <AppCard className={uiShadows.card} bodyClassName="!p-0">
        {isLoading ? (
          <div className={uiCx(uiTypography.helper, 'px-4 py-8 text-center')}>Loading…</div>
        ) : showEmpty ? (
          <div className={uiSpacing.cardPadding}>
            <AppEmptyState title="No inspections found." />
          </div>
        ) : (
          <AppSortableEntityList layout="flat">
            <AppSortableEntityListHeader variant="flat" gridCols={listGridCols} minWidth={SAFETY_LIST_MIN_WIDTH}>
              <AppSortableEntityListSortColumn
                label="Date"
                column="inspection_date"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={setListSort}
              />
              <AppSortableEntityListSortColumn
                label="Project"
                column="project"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={setListSort}
              />
              <AppSortableEntityListSortColumn
                label="Code"
                column="inspection_date"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={setListSort}
                sortable={false}
              />
              <AppSortableEntityListSortColumn
                label="Template"
                column="inspection_date"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={setListSort}
                sortable={false}
              />
              <AppSortableEntityListSortColumn
                label="Worker"
                column="inspection_date"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={setListSort}
                sortable={false}
              />
              <AppSortableEntityListSortColumn
                label="Status"
                column="inspection_date"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={setListSort}
                sortable={false}
              />
              {isAdmin ? (
                <AppSortableEntityListSortColumn
                  label={<span className="sr-only">Actions</span>}
                  column="inspection_date"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={setListSort}
                  sortable={false}
                  className="flex justify-end"
                />
              ) : null}
            </AppSortableEntityListHeader>
            <AppSortableEntityListFlatBody gridCols={listGridCols} minWidth={SAFETY_LIST_MIN_WIDTH}>
              {rows.map((row) => (
                <AppSortableEntityListRow
                  key={row.id}
                  variant="flat"
                  as="div"
                  role="button"
                  tabIndex={0}
                  gridCols={listGridCols}
                  minWidth={SAFETY_LIST_MIN_WIDTH}
                  className="cursor-pointer"
                  onClick={() => nav(projectHref(row))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      nav(projectHref(row));
                    }
                  }}
                >
                  <span className={uiCx(uiTypography.body, 'whitespace-nowrap')}>
                    {row.inspection_date ? formatDateLocal(new Date(row.inspection_date)) : '—'}
                  </span>
                  <span className={uiCx(uiTypography.sectionTitle, 'truncate')} title={row.project_name}>
                    {row.project_name}
                  </span>
                  <span className={uiCx(uiTypography.body, 'truncate text-gray-600')}>{row.project_code}</span>
                  <span
                    className={uiCx(uiTypography.body, 'truncate')}
                    title={row.template_name || ''}
                  >
                    {row.template_name || '—'}
                  </span>
                  <span className={uiCx(uiTypography.body, 'truncate')} title={row.worker_name || ''}>
                    {row.worker_name || '—'}
                  </span>
                  <div className="min-w-0">{safetyInspectionStatusBadge(row.status)}</div>
                  {isAdmin ? (
                    <div className="flex justify-end">
                      <AppListRowIconButton
                        preset="delete"
                        label="Delete inspection"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const result = await confirm({
                            title: 'Delete inspection',
                            message:
                              'Delete this safety inspection permanently? This cannot be undone.',
                          });
                          if (result !== 'confirm') return;
                          try {
                            await api(
                              'DELETE',
                              `/projects/${encodeURIComponent(row.project_id)}/safety-inspections/${encodeURIComponent(row.id)}`
                            );
                            toast.success('Inspection deleted');
                            await qc.invalidateQueries({ queryKey: ['safetyInspections'] });
                            await qc.invalidateQueries({ queryKey: ['safetyInspectionsCalendar'] });
                            await qc.invalidateQueries({ queryKey: ['projectSafetyInspections', row.project_id] });
                            await qc.invalidateQueries({ queryKey: ['projectSafetyInspection', row.project_id] });
                          } catch {
                            toast.error('Could not delete inspection');
                          }
                        }}
                      />
                    </div>
                  ) : null}
                </AppSortableEntityListRow>
              ))}
            </AppSortableEntityListFlatBody>
          </AppSortableEntityList>
        )}
      </AppCard>
    </div>
  );
}
