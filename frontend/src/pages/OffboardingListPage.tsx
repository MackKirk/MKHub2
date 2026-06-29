import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import StartOffboardingModal from '@/components/offboarding/StartOffboardingModal';
import { HubAccessBadge, OffboardingStatusBadge } from '@/components/offboarding/OffboardingStatusBadge';
import { fmtDate, OFFBOARDING_STATUSES, TERMINATION_TYPES, type OffboardingDetail } from '@/components/offboarding/offboardingUtils';
import {
  AppButton,
  AppEmptyState,
  AppInput,
  AppListCreateItem,
  AppModal,
  AppPageHeader,
  AppSelect,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
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

const LIST_GRID = 'grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,0.7fr)]';

export default function OffboardingListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const q = searchParams.get('q') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const statusFilter = searchParams.get('status') || 'all';
  const terminationTypeFilter = searchParams.get('termination_type') || 'all';
  const hubAccessFilter = searchParams.get('hub_access') || 'all';
  const assetsPendingFilter = searchParams.get('assets_pending') || 'all';

  const [statusDraft, setStatusDraft] = useState(statusFilter);
  const [typeDraft, setTypeDraft] = useState(terminationTypeFilter);
  const [hubDraft, setHubDraft] = useState(hubAccessFilter);
  const [assetsDraft, setAssetsDraft] = useState(assetsPendingFilter);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    p.set('page', String(page));
    p.set('limit', '24');
    if (statusFilter !== 'all') p.set('status', statusFilter);
    if (terminationTypeFilter !== 'all') p.set('termination_type', terminationTypeFilter);
    if (hubAccessFilter === 'active') p.set('hub_access', 'active');
    if (hubAccessFilter === 'inactive') p.set('hub_access', 'inactive');
    if (assetsPendingFilter === 'yes') p.set('assets_pending', 'true');
    if (assetsPendingFilter === 'no') p.set('assets_pending', 'false');
    return p.toString();
  }, [q, page, statusFilter, terminationTypeFilter, hubAccessFilter, assetsPendingFilter]);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const canWrite = useMemo(() => {
    if (!me) return false;
    if ((me.roles || []).includes('admin')) return true;
    const perms = me.permissions || [];
    return perms.includes('hr:offboarding:write') || perms.includes('users:write');
  }, [me]);

  const { data, isLoading, refetch } = useQuery<ListResponse>({
    queryKey: ['offboarding-list', queryString],
    queryFn: () => api<ListResponse>('GET', `/offboarding?${queryString}`),
  });

  const items = data?.items || [];

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

  return (
    <div className="space-y-4">
      <AppPageHeader title="Offboarding" subtitle="Manage employee departure cases" />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] max-w-md">
          <AppInput
            value={q}
            onChange={(e) => {
              const p = new URLSearchParams(searchParams);
              if (e.target.value) p.set('q', e.target.value);
              else p.delete('q');
              p.set('page', '1');
              setSearchParams(p);
            }}
            placeholder="Search employees…"
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>
        <AppButton variant="secondary" leftIcon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setFilterOpen(true)}>
          Filters
        </AppButton>
      </div>

      <AppSortableEntityList>
        <AppSortableEntityListHeader gridClassName={LIST_GRID} minWidthClassName="min-w-[1100px]">
          <AppSortableEntityListSortColumn column="employee">Employee</AppSortableEntityListSortColumn>
          <AppSortableEntityListSortColumn column="position">Position</AppSortableEntityListSortColumn>
          <AppSortableEntityListSortColumn column="division">Division</AppSortableEntityListSortColumn>
          <span>Termination Date</span>
          <span>Last Working Day</span>
          <span>Hub Access</span>
          <span>Status</span>
          <span>Assets Pending</span>
          <span>Created</span>
          <span>Actions</span>
        </AppSortableEntityListHeader>
        <AppSortableEntityListFlatBody>
          {canWrite ? (
            <AppListCreateItem layout="row" label="Start Offboarding" onClick={() => setCreateOpen(true)} />
          ) : null}
          {isLoading ? (
            <div className="p-6 text-sm text-gray-500">Loading…</div>
          ) : items.length === 0 ? (
            <AppEmptyState title="No offboarding cases found" />
          ) : (
            items.map((row) => (
              <AppSortableEntityListRow
                key={row.id}
                gridClassName={LIST_GRID}
                onClick={() => navigate(`/human-resources/offboarding/${encodeURIComponent(row.id)}`)}
              >
                <span className="font-medium">{row.employee_name}</span>
                <span>{row.position || '—'}</span>
                <span>{row.division || '—'}</span>
                <span>{fmtDate(row.termination_date)}</span>
                <span>{fmtDate(row.last_working_day)}</span>
                <HubAccessBadge active={row.hub_access_active} />
                <OffboardingStatusBadge status={row.status} actionRequired={row.action_required} />
                <span>{row.assets_pending_return}</span>
                <span>{fmtDate(row.created_at)}</span>
                <Link
                  className="text-brand-red text-xs hover:underline"
                  to={`/human-resources/offboarding/${encodeURIComponent(row.id)}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  View
                </Link>
              </AppSortableEntityListRow>
            ))
          )}
        </AppSortableEntityListFlatBody>
      </AppSortableEntityList>

      {data && data.total_pages > 1 ? (
        <div className="flex justify-center gap-2">
          <AppButton
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              const p = new URLSearchParams(searchParams);
              p.set('page', String(page - 1));
              setSearchParams(p);
            }}
          >
            Previous
          </AppButton>
          <span className="text-sm text-gray-600 self-center">
            Page {data.page} of {data.total_pages}
          </span>
          <AppButton
            variant="secondary"
            size="sm"
            disabled={page >= data.total_pages}
            onClick={() => {
              const p = new URLSearchParams(searchParams);
              p.set('page', String(page + 1));
              setSearchParams(p);
            }}
          >
            Next
          </AppButton>
        </div>
      ) : null}

      <StartOffboardingModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(detail: OffboardingDetail) => {
          refetch();
          navigate(`/human-resources/offboarding/${encodeURIComponent(detail.id)}`);
        }}
      />

      <AppModal open={filterOpen} onClose={() => setFilterOpen(false)} title="Filters" size="md">
        <div className="space-y-3">
          <AppSelect
            label="Status"
            value={statusDraft}
            onChange={(e) => setStatusDraft(e.target.value)}
            options={[
              { value: 'all', label: 'All' },
              ...OFFBOARDING_STATUSES.map((s) => ({
                value: s,
                label: s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1),
              })),
            ]}
          />
          <AppSelect
            label="Termination Type"
            value={typeDraft}
            onChange={(e) => setTypeDraft(e.target.value)}
            options={[{ value: 'all', label: 'All' }, ...TERMINATION_TYPES.map((t) => ({ value: t.value, label: t.label }))]}
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
          />
          <div className="flex justify-end gap-2 pt-2">
            <AppButton variant="secondary" onClick={() => setFilterOpen(false)}>
              Cancel
            </AppButton>
            <AppButton onClick={applyFilters}>Apply</AppButton>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
