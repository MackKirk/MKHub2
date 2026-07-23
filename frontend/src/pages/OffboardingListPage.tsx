import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal, UserMinus, X } from 'lucide-react';
import { api } from '@/lib/api';
import StartOffboardingModal from '@/components/offboarding/StartOffboardingModal';
import { HubAccessBadge, OffboardingStatusBadge } from '@/components/offboarding/OffboardingStatusBadge';
import {
  fmtDate,
  OFFBOARDING_STATUSES,
  offboardingStatusLabel,
  TERMINATION_TYPES,
  terminationTypeLabel,
  type OffboardingDetail,
} from '@/components/offboarding/offboardingUtils';
import { filtersModalQuickInfo } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppPageHeader,
  AppQuickFilterRow,
  AppSelect,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type ListItem = {
  id: string;
  user_id: string;
  employee_name: string;
  position?: string | null;
  division?: string | null;
  termination_date?: string | null;
  last_working_day?: string | null;
  hub_access_active: boolean;
  status: string;
  action_required: boolean;
  assets_pending_return: number;
  created_at: string;
};

type ListResponse = {
  items: ListItem[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

type SortColumn = 'employee' | 'status' | 'created_at';

const STATUS_QUICK_FILTERS = [
  { value: 'all', label: 'All' },
  ...OFFBOARDING_STATUSES.map((s) => ({
    value: s,
    label: offboardingStatusLabel(s),
  })),
] as const;

const FILTER_HINTS = {
  status: 'Status\n\nDraft, in progress, completed, or cancelled.',
  termination_type: 'Termination type\n\nResignation, termination, layoff, end of contract, or other.',
  hub_access: 'Hub access\n\nWhether the employee can still sign in to MK Hub.',
  assets_pending: 'Assets pending\n\nCases where assigned fleet, equipment, or cards still need return.',
} as const;

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700">
      {label}
      <button
        type="button"
        className="rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        aria-label={`Remove filter ${label}`}
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

function SortHeader({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
  title,
  className,
}: {
  label: string;
  column: SortColumn;
  sortBy: SortColumn;
  sortDir: 'asc' | 'desc';
  onSort: (column: SortColumn) => void;
  title: string;
  className?: string;
}) {
  const indicator = sortBy === column ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  return (
    <th className={className}>
      <AppButton
        type="button"
        variant="ghost"
        size="sm"
        className={uiCx('h-auto px-0 font-semibold text-gray-700 hover:text-gray-900')}
        onClick={() => onSort(column)}
        title={title}
      >
        {label}
        {indicator}
      </AppButton>
    </th>
  );
}

function buildOffboardingQueryString(params: {
  q: string;
  page: number;
  limit: number;
  statusFilter: string;
  terminationTypeFilter: string;
  hubAccessFilter: string;
  assetsPendingFilter: string;
  sortBy: SortColumn;
  sortDir: 'asc' | 'desc';
  statusOverride?: string;
}): string {
  const p = new URLSearchParams();
  if (params.q.trim()) p.set('q', params.q.trim());
  p.set('page', String(params.page));
  p.set('limit', String(params.limit));
  const status = params.statusOverride ?? params.statusFilter;
  if (status !== 'all') p.set('status', status);
  if (params.terminationTypeFilter !== 'all') p.set('termination_type', params.terminationTypeFilter);
  if (params.hubAccessFilter === 'active') p.set('hub_access', 'active');
  if (params.hubAccessFilter === 'inactive') p.set('hub_access', 'inactive');
  if (params.assetsPendingFilter === 'yes') p.set('assets_pending', 'true');
  if (params.assetsPendingFilter === 'no') p.set('assets_pending', 'false');
  p.set('sort', params.sortBy);
  p.set('sort_dir', params.sortDir);
  return p.toString();
}

export default function OffboardingListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const q = searchParams.get('q') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = 24;
  const statusFilter = searchParams.get('status') || 'all';
  const terminationTypeFilter = searchParams.get('termination_type') || 'all';
  const hubAccessFilter = searchParams.get('hub_access') || 'all';
  const assetsPendingFilter = searchParams.get('assets_pending') || 'all';

  const validSorts: SortColumn[] = ['employee', 'status', 'created_at'];
  const rawSort = searchParams.get('sort');
  const sortBy: SortColumn =
    rawSort && validSorts.includes(rawSort as SortColumn) ? (rawSort as SortColumn) : 'created_at';
  const sortDir = (searchParams.get('sort_dir') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

  const [statusDraft, setStatusDraft] = useState(statusFilter);
  const [typeDraft, setTypeDraft] = useState(terminationTypeFilter);
  const [hubDraft, setHubDraft] = useState(hubAccessFilter);
  const [assetsDraft, setAssetsDraft] = useState(assetsPendingFilter);



  useEffect(() => {
    if (!filterOpen) return;
    setStatusDraft(statusFilter);
    setTypeDraft(terminationTypeFilter);
    setHubDraft(hubAccessFilter);
    setAssetsDraft(assetsPendingFilter);
  }, [filterOpen, statusFilter, terminationTypeFilter, hubAccessFilter, assetsPendingFilter]);

  const queryString = useMemo(
    () =>
      buildOffboardingQueryString({
        q,
        page,
        limit,
        statusFilter,
        terminationTypeFilter,
        hubAccessFilter,
        assetsPendingFilter,
        sortBy,
        sortDir,
      }),
    [q, page, limit, statusFilter, terminationTypeFilter, hubAccessFilter, assetsPendingFilter, sortBy, sortDir],
  );

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const canWrite = useMemo(() => {
    if (!me) return false;
    if ((me.roles || []).includes('admin')) return true;
    const perms = me.permissions || [];
    return perms.includes('hr:offboarding:write') || perms.includes('users:write');
  }, [me]);

  const { data, isLoading, refetch, isFetching } = useQuery<ListResponse>({
    queryKey: ['offboarding-list', queryString],
    queryFn: () => api<ListResponse>('GET', `/offboarding?${queryString}`),
  });

  const items = data?.items || [];

  const hasActiveFilters =
    statusFilter !== 'all' ||
    terminationTypeFilter !== 'all' ||
    hubAccessFilter !== 'all' ||
    assetsPendingFilter !== 'all';

  const setListSort = (column: SortColumn) => {
    const p = new URLSearchParams(searchParams);
    const nextDir = sortBy === column && sortDir === 'asc' ? 'desc' : 'asc';
    p.set('sort', column);
    p.set('sort_dir', nextDir);
    p.set('page', '1');
    setSearchParams(p, { replace: true });
  };

  const setStatusQuickFilter = (status: string) => {
    const p = new URLSearchParams(searchParams);
    if (status === 'all') p.delete('status');
    else p.set('status', status);
    p.set('page', '1');
    setSearchParams(p, { replace: true });
  };

  const quickFilterCountTargets = useMemo(
    () =>
      STATUS_QUICK_FILTERS.map((opt) => ({
        key: opt.value,
        qs: buildOffboardingQueryString({
          q,
          page: 1,
          limit: 1,
          statusFilter,
          terminationTypeFilter,
          hubAccessFilter,
          assetsPendingFilter,
          sortBy,
          sortDir,
          statusOverride: opt.value,
        }),
      })),
    [q, statusFilter, terminationTypeFilter, hubAccessFilter, assetsPendingFilter, sortBy, sortDir],
  );

  const quickFilterCountQueries = useQueries({
    queries: quickFilterCountTargets.map((target) => ({
      queryKey: ['offboarding-list', 'quick-filter-count', target.key, target.qs],
      queryFn: () => api<ListResponse>('GET', `/offboarding?${target.qs}`).then((r) => r.total),
      staleTime: 60_000,
    })),
  });

  const quickFilterCountsByKey = useMemo(() => {
    const counts: Record<string, number> = {};
    quickFilterCountTargets.forEach((target, index) => {
      const total = quickFilterCountQueries[index]?.data;
      if (typeof total === 'number') counts[target.key] = total;
    });
    return counts;
  }, [quickFilterCountTargets, quickFilterCountQueries]);

  const quickFilterSegments = useMemo(
    () =>
      STATUS_QUICK_FILTERS.map((opt) => ({
        key: opt.value,
        label: opt.label,
        active: statusFilter === opt.value,
        count: quickFilterCountsByKey[opt.value],
        onClick: () => setStatusQuickFilter(opt.value),
      })),
    [statusFilter, quickFilterCountsByKey],
  );

  const applyFilters = () => {
    const p = new URLSearchParams(searchParams);
    if (statusDraft === 'all') p.delete('status');
    else p.set('status', statusDraft);
    if (typeDraft === 'all') p.delete('termination_type');
    else p.set('termination_type', typeDraft);
    if (hubDraft === 'all') p.delete('hub_access');
    else p.set('hub_access', hubDraft);
    if (assetsDraft === 'all') p.delete('assets_pending');
    else p.set('assets_pending', assetsDraft);
    p.set('page', '1');
    setSearchParams(p);
    setFilterOpen(false);
  };

  const clearFilters = () => {
    const p = new URLSearchParams(searchParams);
    p.delete('status');
    p.delete('termination_type');
    p.delete('hub_access');
    p.delete('assets_pending');
    p.set('page', '1');
    setSearchParams(p);
  };

  const updateSearch = (value: string) => {
    const p = new URLSearchParams(searchParams);
    if (value) p.set('q', value);
    else p.delete('q');
    p.set('page', '1');
    setSearchParams(p);
  };

  const openCase = (id: string) => {
    navigate(`/human-resources/offboarding/${encodeURIComponent(id)}`);
  };

  return (
    <div className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Offboarding"
        subtitle="Manage employee departure cases, access revocation, and asset returns"
        icon={<UserMinus className="h-4 w-4" />}
      />

      <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, uiSpacing.sectionStack)}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-stretch gap-3')}>
          <div className="min-w-0 flex-1">
            <AppInput
              value={q}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Search employees…"
              leftIcon={<Search className="h-4 w-4" />}
              fieldHint="Search\n\nMatches employee name or username."
              aria-label="Search offboarding cases"
            />
          </div>
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<SlidersHorizontal className="h-4 w-4" />}
            onClick={() => setFilterOpen(true)}
          >
            Filters
          </AppButton>
          {hasActiveFilters ? (
            <AppButton type="button" variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </AppButton>
          ) : null}
        </div>
        <AppQuickFilterRow segments={quickFilterSegments} />
      </AppCard>

      {hasActiveFilters ? (
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap')}>
          {statusFilter !== 'all' ? (
            <FilterChip
              label={`Status: ${offboardingStatusLabel(statusFilter)}`}
              onRemove={() => setStatusQuickFilter('all')}
            />
          ) : null}
          {terminationTypeFilter !== 'all' ? (
            <FilterChip
              label={`Type: ${terminationTypeLabel(terminationTypeFilter)}`}
              onRemove={() => {
                const p = new URLSearchParams(searchParams);
                p.delete('termination_type');
                p.set('page', '1');
                setSearchParams(p);
              }}
            />
          ) : null}
          {hubAccessFilter !== 'all' ? (
            <FilterChip
              label={`Hub access: ${hubAccessFilter === 'active' ? 'Active' : 'Inactive'}`}
              onRemove={() => {
                const p = new URLSearchParams(searchParams);
                p.delete('hub_access');
                p.set('page', '1');
                setSearchParams(p);
              }}
            />
          ) : null}
          {assetsPendingFilter !== 'all' ? (
            <FilterChip
              label={`Assets: ${assetsPendingFilter === 'yes' ? 'Has pending' : 'None pending'}`}
              onRemove={() => {
                const p = new URLSearchParams(searchParams);
                p.delete('assets_pending');
                p.set('page', '1');
                setSearchParams(p);
              }}
            />
          ) : null}
        </div>
      ) : null}

      <AppCard
        className={uiShadows.card}
        bodyClassName="!p-0"
        footer={
          data && data.total > 0 ? (
            <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-between gap-3')}>
              <p className={uiTypography.helper}>
                Showing {(data.page - 1) * data.limit + 1} to {Math.min(data.page * data.limit, data.total)} of{' '}
                {data.total} cases
              </p>
              <div className={uiCx(uiLayout.actionsRow, 'items-center')}>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1 || isFetching}
                  onClick={() => {
                    const p = new URLSearchParams(searchParams);
                    p.set('page', String(page - 1));
                    setSearchParams(p);
                  }}
                >
                  Previous
                </AppButton>
                <span className={uiTypography.helper}>
                  Page {data.page} of {data.total_pages}
                </span>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page >= data.total_pages || isFetching}
                  onClick={() => {
                    const p = new URLSearchParams(searchParams);
                    p.set('page', String(page + 1));
                    setSearchParams(p);
                  }}
                >
                  Next
                </AppButton>
              </div>
            </div>
          ) : undefined
        }
      >
        {canWrite ? (
          <div className={uiSpacing.cardPadding}>
            <AppListCreateItem
              label="Start Offboarding"
              layout="row"
              className="w-full"
              onClick={() => setCreateOpen(true)}
            />
          </div>
        ) : null}

        {isLoading ? (
          <div className={uiCx(uiSpacing.cardPadding, 'text-center')}>
            <p className={uiTypography.helper}>Loading offboarding cases…</p>
          </div>
        ) : items.length > 0 ? (
          <div className="overflow-x-auto min-w-0">
            <table className={uiCx('w-full min-w-[960px] border-collapse', uiBorders.subtle)}>
              <thead>
                <tr className={uiCx(uiColors.surfaceSubtle, 'border-b border-gray-200')}>
                  <SortHeader
                    label="Employee"
                    column="employee"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setListSort}
                    title="Sort by employee"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                  <th className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}>Division</th>
                  <th className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}>Termination Date</th>
                  <th className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}>Last Working Day</th>
                  <th className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}>Hub Access</th>
                  <SortHeader
                    label="Status"
                    column="status"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setListSort}
                    title="Sort by status"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                  <th className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}>Assets Pending</th>
                  <SortHeader
                    label="Created"
                    column="created_at"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setListSort}
                    title="Sort by created date"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50 min-h-[52px]"
                    onClick={() => openCase(row.id)}
                    role="link"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openCase(row.id);
                      }
                    }}
                  >
                    <td className="min-w-0 px-3 py-3 align-top">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className={uiCx('truncate font-medium', uiTypography.helper, uiColors.textStrong)}>
                          {row.employee_name}
                        </span>
                        {row.position ? (
                          <span className={uiCx('truncate', uiTypography.helper)}>{row.position}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className={uiCx('px-3 py-3 align-top', uiTypography.helper)}>{row.division || '—'}</td>
                    <td className={uiCx('px-3 py-3 align-top whitespace-nowrap', uiTypography.helper)}>
                      {fmtDate(row.termination_date)}
                    </td>
                    <td className={uiCx('px-3 py-3 align-top whitespace-nowrap', uiTypography.helper)}>
                      {fmtDate(row.last_working_day)}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <HubAccessBadge active={row.hub_access_active} />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <OffboardingStatusBadge status={row.status} actionRequired={row.action_required} />
                    </td>
                    <td className={uiCx('px-3 py-3 align-top', uiTypography.helper)}>
                      {row.assets_pending_return}
                    </td>
                    <td className={uiCx('px-3 py-3 align-top whitespace-nowrap', uiTypography.helper)}>
                      {fmtDate(row.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={uiCx(uiSpacing.cardPadding, 'pb-10')}>
            <AppEmptyState
              title="No offboarding cases found"
              description={hasActiveFilters || q ? 'Try adjusting search or filters.' : undefined}
              className="border-0 bg-transparent p-0 shadow-none"
              action={
                canWrite ? (
                  <AppButton type="button" size="sm" onClick={() => setCreateOpen(true)}>
                    Start Offboarding
                  </AppButton>
                ) : undefined
              }
            />
          </div>
        )}
      </AppCard>

      <StartOffboardingModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(detail: OffboardingDetail) => {
          refetch();
          navigate(`/human-resources/offboarding/${encodeURIComponent(detail.id)}`);
        }}
      />

      <AppFormModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filters"
        size="md"
        quickInfo={filtersModalQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setFilterOpen(false)}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={applyFilters}>
              Apply Filters
            </AppButton>
          </div>
        }
      >
        <div className={uiSpacing.sectionStack}>
          <AppSelect
            label="Status"
            value={statusDraft}
            onChange={(e) => setStatusDraft(e.target.value)}
            options={[
              { value: 'all', label: 'All' },
              ...OFFBOARDING_STATUSES.map((s) => ({
                value: s,
                label: offboardingStatusLabel(s),
              })),
            ]}
            fieldHint={FILTER_HINTS.status}
          />
          <AppSelect
            label="Termination Type"
            value={typeDraft}
            onChange={(e) => setTypeDraft(e.target.value)}
            options={[{ value: 'all', label: 'All' }, ...TERMINATION_TYPES.map((t) => ({ value: t.value, label: t.label }))]}
            fieldHint={FILTER_HINTS.termination_type}
          />
          <AppSelect
            label="Hub Access"
            value={hubDraft}
            onChange={(e) => setHubDraft(e.target.value)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
            fieldHint={FILTER_HINTS.hub_access}
          />
          <AppSelect
            label="Assets Pending Return"
            value={assetsDraft}
            onChange={(e) => setAssetsDraft(e.target.value)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'yes', label: 'Has pending' },
              { value: 'no', label: 'None pending' },
            ]}
            fieldHint={FILTER_HINTS.assets_pending}
          />
        </div>
      </AppFormModal>
    </div>
  );
}
