import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppPageHeader,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  sortListByAppColumn,
  useLocalAppListSort,
  uiColors,
  uiCx,
  uiLayout,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type SortCol = 'employee' | 'issues' | 'job_title' | 'department' | 'project_divisions' | 'profile_updated';

const LIST_GRID_COLS =
  'grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1.4fr)]';
const LIST_MIN_WIDTH = 'min-w-[900px]';

const ROW_SORT_GETTERS: Record<SortCol, (row: Row) => string | number | null | undefined> = {
  employee: (r) => r.name || r.username,
  issues: (r) => r.issues.length,
  job_title: (r) => r.job_title,
  department: (r) => r.department,
  project_divisions: (r) => (r.project_division_labels?.length ? r.project_division_labels.join(', ') : null),
  profile_updated: (r) => r.profile_updated_at,
};

type Row = {
  user_id: string;
  name: string;
  username: string;
  email?: string;
  job_title?: string | null;
  department?: string | null;
  project_division_labels: string[];
  manager_user_id?: string | null;
  issues: string[];
  profile_updated_at?: string | null;
  profile_updated_by_name?: string | null;
};

type Payload = {
  total_eligible: number;
  total_with_gaps: number;
  truncated: boolean;
  summary: {
    missing_supervisor: number;
    missing_department: number;
    missing_project_division: number;
    missing_job_title: number;
    missing_compensation: number;
    missing_sick_leave_history: number;
    missing_employment_type: number;
    missing_employee_documents: number;
  };
  rows: Row[];
};

const ISSUE_KEYS = [
  'missing_supervisor',
  'missing_department',
  'missing_project_division',
  'missing_job_title',
  'missing_compensation',
  'missing_sick_leave_history',
  'missing_employment_type',
  'missing_employee_documents',
] as const;

const ISSUE_LABELS: Record<(typeof ISSUE_KEYS)[number], string> = {
  missing_supervisor: 'No supervisor',
  missing_department: 'No department',
  missing_project_division: 'No project division',
  missing_job_title: 'No job title',
  missing_compensation: 'Pay details incomplete',
  missing_sick_leave_history: 'No sick leave history',
  missing_employment_type: 'No employment type',
  missing_employee_documents: 'No files in Docs',
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

export default function HrDataQualityOverview() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['hr-data-quality'],
    queryFn: () => api<Payload>('GET', '/users/hr-data-quality'),
  });
  const [filter, setFilter] = useState<string | null>(null);
  const { sortBy, sortDir, setSort } = useLocalAppListSort<SortCol>('employee', 'asc');

  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    if (!filter) return data.rows;
    return data.rows.filter((r) => r.issues.includes(filter));
  }, [data, filter]);

  const sortedRows = useMemo(
    () => sortListByAppColumn(filteredRows, sortBy, sortDir, ROW_SORT_GETTERS),
    [filteredRows, sortBy, sortDir],
  );

  const filterLabel = filter ? ISSUE_LABELS[filter as (typeof ISSUE_KEYS)[number]] : null;

  if (error) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppPageHeader
          icon={<Users className="h-4 w-4" />}
          title="HR overview"
          subtitle="Active employees with incomplete HR records — filter by gap type and open a profile to fix."
        />
        <AppEmptyState
          title="Could not load HR overview."
          description="You may not have permission."
          className="border-red-200 bg-red-50 text-red-800"
        />
      </div>
    );
  }

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        icon={<Users className="h-4 w-4" />}
        title="HR overview"
        subtitle={
          <>
            Active employees with incomplete HR records — filter by gap type and open a profile to fix.
            {data ? (
              <span className={uiCx('mt-2 block', uiTypography.helper)}>
                {data.total_with_gaps} of {data.total_eligible} have at least one gap
                {data.truncated ? ' (first 500 rows shown).' : '.'}
              </span>
            ) : null}
          </>
        }
      />

      {isLoading ? (
        <p className={uiTypography.helper}>Loading…</p>
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {ISSUE_KEYS.map((key) => {
              const count = data.summary[key] ?? 0;
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(active ? null : key)}
                  className="block w-full text-left"
                  aria-pressed={active}
                >
                  <AppCard
                    className={uiCx(
                      uiShadows.card,
                      'transition-shadow hover:shadow-md',
                      active && 'ring-2 ring-brand-red border-brand-red/40 bg-red-50/50',
                    )}
                    bodyClassName={uiSpacing.cardPadding}
                  >
                    <div className={uiTypography.overline}>{ISSUE_LABELS[key]}</div>
                    <div className={uiCx('mt-1 text-2xl font-semibold tabular-nums', uiColors.textStrong)}>
                      {count}
                    </div>
                    <div className={uiCx(uiTypography.helper, 'mt-2')}>
                      {active ? 'Click to clear filter' : 'Filter table'}
                    </div>
                  </AppCard>
                </button>
              );
            })}
          </div>

          <AppCard bodyClassName="!p-0">
            <AppSortableEntityList layout="flat">
              <div className={uiCx(uiColors.surfaceSubtle, 'px-4 pt-3')}>
                <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-center gap-2 pb-2')}>
                  <span className={uiTypography.sectionTitle}>
                    {filterLabel ? `Showing: ${filterLabel}` : 'All gaps (combined list)'}
                  </span>
                  <AppBadge variant="neutral" className="normal-case !tracking-normal">
                    {sortedRows.length} rows
                  </AppBadge>
                  {filter ? (
                    <AppButton variant="ghost" size="sm" onClick={() => setFilter(null)} className="ml-auto">
                      Clear filter
                    </AppButton>
                  ) : null}
                </div>
                <AppSortableEntityListHeader
                  variant="flat"
                  gridCols={LIST_GRID_COLS}
                  minWidth={LIST_MIN_WIDTH}
                  className="!rounded-none !border-0 !bg-transparent !px-0 !py-2.5"
                >
                <AppSortableEntityListSortColumn
                  label="Employee"
                  column="employee"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={setSort}
                />
                <AppSortableEntityListSortColumn
                  label="Issues"
                  column="issues"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={setSort}
                />
                <AppSortableEntityListSortColumn
                  label="Job title"
                  column="job_title"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={setSort}
                />
                <AppSortableEntityListSortColumn
                  label="Department"
                  column="department"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={setSort}
                />
                <AppSortableEntityListSortColumn
                  label="Project divisions"
                  column="project_divisions"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={setSort}
                />
                <AppSortableEntityListSortColumn
                  label="Last profile update"
                  column="profile_updated"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={setSort}
                />
                </AppSortableEntityListHeader>
              </div>
              {sortedRows.length === 0 ? (
                <AppEmptyState
                  title="No rows match this filter."
                  className="border-0 bg-transparent shadow-none"
                />
              ) : (
                <AppSortableEntityListFlatBody gridCols={LIST_GRID_COLS} minWidth={LIST_MIN_WIDTH}>
                  {sortedRows.map((r) => (
                    <AppSortableEntityListRow
                      key={r.user_id}
                      variant="flat"
                      as="div"
                      gridCols={LIST_GRID_COLS}
                      minWidth={LIST_MIN_WIDTH}
                    >
                      <div className="min-w-0">
                        <Link
                          to={`/users/${encodeURIComponent(r.user_id)}`}
                          className={uiCx(uiTypography.sectionTitle, 'truncate hover:text-brand-red hover:underline')}
                        >
                          {r.name || r.username}
                        </Link>
                        <div className={uiCx(uiTypography.helper, 'truncate')}>{r.email || r.username}</div>
                      </div>
                      <div className="flex min-w-0 flex-wrap gap-1">
                        {r.issues.map((issue) => (
                          <AppBadge key={issue} variant="warning" className="normal-case !tracking-normal">
                            {ISSUE_LABELS[issue as (typeof ISSUE_KEYS)[number]] || issue}
                          </AppBadge>
                        ))}
                      </div>
                      <span className={uiCx(uiTypography.body, 'truncate')} title={r.job_title || undefined}>
                        {r.job_title || '—'}
                      </span>
                      <span className={uiCx(uiTypography.body, 'truncate')} title={r.department || undefined}>
                        {r.department || '—'}
                      </span>
                      <span
                        className={uiCx(uiTypography.body, 'truncate')}
                        title={r.project_division_labels?.join(', ') || undefined}
                      >
                        {r.project_division_labels?.length ? r.project_division_labels.join(', ') : '—'}
                      </span>
                      <div className="min-w-0">
                        <span className={uiTypography.body}>{fmtDate(r.profile_updated_at)}</span>
                        {r.profile_updated_by_name ? (
                          <div className={uiCx(uiTypography.helper, 'mt-0.5 truncate')}>
                            by {r.profile_updated_by_name}
                          </div>
                        ) : null}
                      </div>
                    </AppSortableEntityListRow>
                  ))}
                </AppSortableEntityListFlatBody>
              )}
            </AppSortableEntityList>
          </AppCard>
        </>
      ) : null}
    </div>
  );
}
