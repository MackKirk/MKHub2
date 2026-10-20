import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Flag, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import { BUSINESS_LINE_REPAIRS_MAINTENANCE } from '@/lib/businessLine';
import {
  AppBadge,
  AppCard,
  AppEmptyState,
  AppInput,
  AppPageHeader,
  AppSelect,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  uiCx,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type FollowUpListRow = {
  id: string;
  project_id: string;
  project_name: string;
  project_code: string;
  business_line?: string;
  source_inspection_id: string;
  source_field_key: string;
  source_field_label_snapshot?: string | null;
  label?: string | null;
  template_name?: string | null;
  worker_name?: string | null;
  due_date?: string | null;
  status: string;
  created_at?: string | null;
  completed_at?: string | null;
};

const LIST_MIN_WIDTH = 'min-w-[980px]';
const LIST_GRID_COLS =
  'grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.85fr)_auto]';

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
];

function projectHref(row: FollowUpListRow): string {
  const base = row.business_line === BUSINESS_LINE_REPAIRS_MAINTENANCE ? '/rm-projects' : '/projects';
  const q = new URLSearchParams({
    tab: 'safety',
    safety_inspection: row.source_inspection_id,
    safety_follow_up: row.id,
  });
  return `${base}/${encodeURIComponent(row.project_id)}?${q.toString()}`;
}

function statusBadge(status: string) {
  if (status === 'completed') {
    return <AppBadge variant="success">Completed</AppBadge>;
  }
  return <AppBadge variant="warning">Pending</AppBadge>;
}

export default function SafetyFollowUpsPage() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const statusParam = searchParams.get('status') ?? '';

  const setStatus = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set('status', next);
    else params.delete('status');
    setSearchParams(params, { replace: true });
  };

  const setSearch = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next.trim()) params.set('search', next);
    else params.delete('search');
    setSearchParams(params, { replace: true });
  };

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['safetyFollowUps', search, statusParam],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusParam) params.set('status', statusParam);
      if (search.trim()) params.set('search', search.trim());
      params.set('limit', '200');
      return api<FollowUpListRow[]>('GET', `/safety/follow-ups?${params.toString()}`);
    },
  });

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Safety follow-ups"
        subtitle="Flagged items awaiting corrective action or other follow-up forms."
        icon={<Flag className="h-4 w-4" />}
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 min-w-0">
            <AppInput
              id="safety-follow-ups-search"
              placeholder="Search by project, code, or label…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search follow-ups"
              autoComplete="off"
            />
          </div>
          <div className="w-full sm:w-48 shrink-0">
            <AppSelect
              value={statusParam}
              onChange={(e) => setStatus(e.target.value)}
              options={STATUS_FILTER_OPTIONS}
              aria-label="Filter by status"
            />
          </div>
        </div>
      </AppCard>

      <AppCard className={uiShadows.card} bodyClassName="!p-0">
        {isLoading ? (
          <div className={uiCx(uiTypography.helper, 'px-4 py-8 text-center')}>Loading…</div>
        ) : rows.length === 0 ? (
          <div className={uiSpacing.cardPadding}>
            <AppEmptyState title="No follow-ups found." />
          </div>
        ) : (
          <AppSortableEntityList layout="flat">
            <AppSortableEntityListHeader variant="flat" gridCols={LIST_GRID_COLS} minWidth={LIST_MIN_WIDTH}>
              <AppSortableEntityListSortColumn label="Project" column="project" sortBy="project" sortDir="asc" onSort={() => {}} sortable={false} />
              <AppSortableEntityListSortColumn label="Label" column="project" sortBy="project" sortDir="asc" onSort={() => {}} sortable={false} />
              <AppSortableEntityListSortColumn label="Type" column="project" sortBy="project" sortDir="asc" onSort={() => {}} sortable={false} />
              <AppSortableEntityListSortColumn label="Field" column="project" sortBy="project" sortDir="asc" onSort={() => {}} sortable={false} />
              <AppSortableEntityListSortColumn label="Assignee" column="project" sortBy="project" sortDir="asc" onSort={() => {}} sortable={false} />
              <AppSortableEntityListSortColumn label="Due" column="project" sortBy="project" sortDir="asc" onSort={() => {}} sortable={false} />
              <AppSortableEntityListSortColumn label="Status" column="project" sortBy="project" sortDir="asc" onSort={() => {}} sortable={false} />
            </AppSortableEntityListHeader>
            <AppSortableEntityListFlatBody gridCols={LIST_GRID_COLS} minWidth={LIST_MIN_WIDTH}>
              {rows.map((row) => (
                <AppSortableEntityListRow
                  key={row.id}
                  variant="flat"
                  as="div"
                  role="button"
                  tabIndex={0}
                  gridCols={LIST_GRID_COLS}
                  minWidth={LIST_MIN_WIDTH}
                  className="cursor-pointer"
                  onClick={() => nav(projectHref(row))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      nav(projectHref(row));
                    }
                  }}
                >
                  <div className="min-w-0">
                    <div className={uiCx(uiTypography.sectionTitle, 'truncate')} title={row.project_name}>
                      {row.project_name}
                    </div>
                    <div className={uiCx(uiTypography.helper, 'truncate')}>{row.project_code}</div>
                  </div>
                  <span
                    className={uiCx(uiTypography.body, 'truncate')}
                    title={(row.label || '').trim() || undefined}
                  >
                    {(row.label || '').trim() || '—'}
                  </span>
                  <span className={uiCx(uiTypography.body, 'truncate')} title={row.template_name || ''}>
                    {row.template_name || '—'}
                  </span>
                  <span
                    className={uiCx(uiTypography.body, 'truncate')}
                    title={row.source_field_label_snapshot || row.source_field_key}
                  >
                    {row.source_field_label_snapshot || row.source_field_key || '—'}
                  </span>
                  <span className={uiCx(uiTypography.body, 'truncate')}>{row.worker_name || '—'}</span>
                  <span className={uiCx(uiTypography.body, 'whitespace-nowrap')}>
                    {row.due_date ? formatDateLocal(new Date(row.due_date + 'T12:00:00')) : '—'}
                  </span>
                  <div className="min-w-0">{statusBadge(row.status)}</div>
                </AppSortableEntityListRow>
              ))}
            </AppSortableEntityListFlatBody>
          </AppSortableEntityList>
        )}
      </AppCard>
    </div>
  );
}
