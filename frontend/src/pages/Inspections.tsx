import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import { SCHEDULE_STATUS_LABELS, INSPECTION_RESULT_LABELS } from '@/lib/fleetBadges';
import {
  getInspectionResultBadgeVariant,
  getInspectionScheduleStatusBadgeVariant,
} from '@/lib/fleetUi';
import FleetScheduleInspectionModal from '@/components/fleet/FleetScheduleInspectionModal';
import { canEditFleetInspectionTab } from '@/lib/fleetPermissions';
import LoadingOverlay from '@/components/LoadingOverlay';
import {
  AppBadge,
  AppCard,
  AppEmptyState,
  AppInput,
  AppListCreateItem,
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
  useAppListSort,
} from '@/components/ui';

type Schedule = {
  id: string;
  fleet_asset_id: string;
  fleet_asset_name?: string;
  scheduled_at: string;
  urgency: string;
  category: string;
  status: string;
  notes?: string;
  created_at?: string;
  body_inspection_id?: string | null;
  mechanical_inspection_id?: string | null;
  body_result?: string | null;
  mechanical_result?: string | null;
};

const INSPECTION_LIST_SORTS = [
  'scheduled_at',
  'created_at',
  'asset',
  'status',
  'body_result',
  'mechanical_result',
] as const;

type SortColumn = (typeof INSPECTION_LIST_SORTS)[number];

const LIST_GRID_COLS =
  'grid-cols-[minmax(7rem,1fr)_minmax(10rem,2fr)_minmax(6rem,1fr)_minmax(5rem,1fr)_minmax(5rem,1fr)_minmax(7rem,1fr)]';
const LIST_MIN_WIDTH = 'min-w-[720px]';

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...Object.entries(SCHEDULE_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

const OPEN_SCHEDULE_STATUSES = new Set(['scheduled', 'in_progress']);

function getScheduleDueBadge(schedule: Schedule): { label: string; variant: 'warning' | 'danger' } | null {
  if (!OPEN_SCHEDULE_STATUSES.has((schedule.status || '').toLowerCase()) || !schedule.scheduled_at) {
    return null;
  }
  const due = new Date(schedule.scheduled_at);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((dueDay.getTime() - todayDay.getTime()) / 86400000);
  if (diffDays < 0) return { label: 'Overdue', variant: 'danger' };
  if (diffDays <= 7) return { label: diffDays === 0 ? 'Due today' : 'Due soon', variant: 'warning' };
  return null;
}

export default function Inspections() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const [showNewInspectionModal, setShowNewInspectionModal] = useState(false);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = (me?.roles || []).includes('admin');
  const permissions = useMemo(() => new Set<string>(me?.permissions || []), [me?.permissions]);
  const canScheduleInspection = canEditFleetInspectionTab(isAdmin, permissions, 'schedules');

  const { sortBy, sortDir, setSort: setListSort } = useAppListSort<SortColumn>({
    searchParams,
    setSearchParams,
    defaultSort: 'created_at',
    defaultDir: 'desc',
    validSorts: INSPECTION_LIST_SORTS,
  });

  // Persist initial sort in the URL so opening the page always shows newest-created schedules first.
  useEffect(() => {
    const rawSort = searchParams.get('sort');
    const rawDir = searchParams.get('dir');
    const sortValid = rawSort != null && (INSPECTION_LIST_SORTS as readonly string[]).includes(rawSort);
    const dirValid = rawDir === 'asc' || rawDir === 'desc';
    if (sortValid && dirValid) return;

    const params = new URLSearchParams(searchParams);
    if (!sortValid) params.set('sort', 'created_at');
    if (!dirValid) params.set('dir', 'desc');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const statusParam = searchParams.get('status') ?? '';

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

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['inspection-schedules', statusParam, sortBy, sortDir],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusParam) params.set('status', statusParam);
      params.set('sort', sortBy);
      params.set('dir', sortDir);
      return api<Schedule[]>('GET', `/fleet/inspection-schedules?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });

  const schedulesRaw = data ?? [];
  const schedules = useMemo(() => {
    if (!search.trim()) return schedulesRaw;
    const q = search.trim().toLowerCase();
    return schedulesRaw.filter(
      (s) =>
        (s.fleet_asset_name && s.fleet_asset_name.toLowerCase().includes(q)) ||
        (s.fleet_asset_id && s.fleet_asset_id.toLowerCase().includes(q)),
    );
  }, [schedulesRaw, search]);

  const isInitialLoading = isLoading && !data;
  const showEmptyList = !isInitialLoading && schedules.length === 0;

  return (
    <div className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Fleet Inspections"
        subtitle="Manage inspection schedules. Open a schedule to start Body or Mechanical inspection."
        icon={<ClipboardCheck className="h-4 w-4" />}
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-end gap-3')}>
          <div className="min-w-0 flex-1">
            <AppInput
              placeholder="Search by vehicle name or ID…"
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

      <LoadingOverlay isLoading={isInitialLoading} text="Loading schedules…">
        <AppCard
          className={uiShadows.card}
          bodyClassName="!p-0"
          footer={
            schedules.length > 0 ? (
              <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-between gap-3')}>
                <p className={uiTypography.helper}>
                  Showing 1 to {schedules.length} of {schedules.length} schedules
                </p>
              </div>
            ) : undefined
          }
        >
          <div
            className={uiCx(
              'flex flex-col',
              isFetching && schedules.length > 0 ? 'opacity-60 pointer-events-none' : undefined,
            )}
          >
            {showEmptyList ? (
              <div className={uiCx(uiSpacing.cardPadding, uiSpacing.sectionStack, 'min-h-[12rem] pb-10')}>
                {canScheduleInspection ? (
                  <AppListCreateItem
                    label="Schedule inspection"
                    layout="row"
                    className="w-full"
                    onClick={() => setShowNewInspectionModal(true)}
                  />
                ) : null}
                <AppEmptyState
                  title="No inspection schedules found"
                  className="border-0 bg-transparent p-0 shadow-none"
                />
              </div>
            ) : (
              <>
                {canScheduleInspection ? (
                  <div className={uiCx(uiSpacing.cardPadding, schedules.length === 0 ? 'pb-10' : 'pb-3')}>
                    <AppListCreateItem
                      label="Schedule inspection"
                      layout="row"
                      className="w-full"
                      onClick={() => setShowNewInspectionModal(true)}
                    />
                  </div>
                ) : null}
                {schedules.length > 0 ? (
                  <AppSortableEntityList layout="flat" className="border-t border-gray-100">
                    <AppSortableEntityListHeader variant="flat" gridCols={LIST_GRID_COLS} minWidth={LIST_MIN_WIDTH}>
                      <AppSortableEntityListSortColumn
                        label="Date"
                        column="scheduled_at"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={setListSort}
                      />
                      <AppSortableEntityListSortColumn
                        label="Vehicle"
                        column="asset"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={setListSort}
                      />
                      <AppSortableEntityListSortColumn
                        label="Status"
                        column="status"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={setListSort}
                      />
                      <AppSortableEntityListSortColumn
                        label="Body"
                        column="body_result"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={setListSort}
                      />
                      <AppSortableEntityListSortColumn
                        label="Mechanical"
                        column="mechanical_result"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={setListSort}
                      />
                      <AppSortableEntityListSortColumn
                        label="Created"
                        column="created_at"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={setListSort}
                      />
                    </AppSortableEntityListHeader>
                    <AppSortableEntityListFlatBody gridCols={LIST_GRID_COLS} minWidth={LIST_MIN_WIDTH}>
                      {schedules.map((s) => {
                        const bodyDone = s.body_result && s.body_result !== 'pending';
                        const mechDone = s.mechanical_result && s.mechanical_result !== 'pending';
                        const vehicleLabel = s.fleet_asset_name || s.fleet_asset_id;
                        const dueBadge = getScheduleDueBadge(s);

                        return (
                          <AppSortableEntityListRow
                            key={s.id}
                            variant="flat"
                            as="div"
                            role="button"
                            tabIndex={0}
                            gridCols={LIST_GRID_COLS}
                            minWidth={LIST_MIN_WIDTH}
                            className="cursor-pointer"
                            onClick={() => nav(`/fleet/inspections/${s.id}`)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                nav(`/fleet/inspections/${s.id}`);
                              }
                            }}
                          >
                            <span className={uiCx(uiTypography.body, 'whitespace-nowrap font-medium text-gray-900')}>
                              {s.scheduled_at ? formatDateLocal(new Date(s.scheduled_at)) : '—'}
                            </span>
                            <div className="min-w-0">
                              <button
                                type="button"
                                className={uiCx(
                                  uiTypography.body,
                                  'block max-w-full truncate text-left font-semibold text-brand-red hover:underline',
                                )}
                                title={vehicleLabel}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  nav(`/fleet/assets/${s.fleet_asset_id}`);
                                }}
                              >
                                {vehicleLabel}
                              </button>
                            </div>
                            <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                              <AppBadge variant={getInspectionScheduleStatusBadgeVariant(s.status)}>
                                {SCHEDULE_STATUS_LABELS[s.status] ?? s.status}
                              </AppBadge>
                              {dueBadge ? (
                                <AppBadge variant={dueBadge.variant}>{dueBadge.label}</AppBadge>
                              ) : null}
                            </div>
                            <div className="min-w-0">
                              {s.body_inspection_id ? (
                                bodyDone ? (
                                  <AppBadge variant={getInspectionResultBadgeVariant(s.body_result!)}>
                                    {INSPECTION_RESULT_LABELS[s.body_result!] ?? s.body_result}
                                  </AppBadge>
                                ) : (
                                  <span className={uiTypography.helper}>Pending</span>
                                )
                              ) : (
                                <span className={uiTypography.helper}>—</span>
                              )}
                            </div>
                            <div className="min-w-0">
                              {s.mechanical_inspection_id ? (
                                mechDone ? (
                                  <AppBadge variant={getInspectionResultBadgeVariant(s.mechanical_result!)}>
                                    {INSPECTION_RESULT_LABELS[s.mechanical_result!] ?? s.mechanical_result}
                                  </AppBadge>
                                ) : (
                                  <span className={uiTypography.helper}>Pending</span>
                                )
                              ) : (
                                <span className={uiTypography.helper}>—</span>
                              )}
                            </div>
                            <span className={uiCx(uiTypography.body, 'whitespace-nowrap tabular-nums text-gray-600')}>
                              {s.created_at ? formatDateLocal(new Date(s.created_at)) : '—'}
                            </span>
                          </AppSortableEntityListRow>
                        );
                      })}
                    </AppSortableEntityListFlatBody>
                  </AppSortableEntityList>
                ) : null}
              </>
            )}
          </div>
        </AppCard>
      </LoadingOverlay>

      <FleetScheduleInspectionModal
        open={canScheduleInspection && showNewInspectionModal}
        onClose={() => setShowNewInspectionModal(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
        }}
      />
    </div>
  );
}
