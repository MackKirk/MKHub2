import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, HeartPulse, Sun, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  formatShortDate,
  hoursToDays,
  isSickPolicy,
  type TimeOffRequest,
} from '@/lib/timeOff';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppPageHeader,
  AppQuickFilterRow,
  AppTabs,
  uiCx,
  uiSpacing,
  uiRadius,
  uiTypography,
} from '@/components/ui';

type RequestKindTab = 'sick' | 'time_off' | 'other';
type StatusFilter = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'all';

type HrTimeOffRequest = TimeOffRequest & {
  user_id: string;
  username: string;
  employee_name: string;
  email?: string | null;
};

type ListPayload = {
  items: HrTimeOffRequest[];
  total: number;
};

const KIND_TABS: { key: RequestKindTab; label: string }[] = [
  { key: 'sick', label: 'Sick leave' },
  { key: 'time_off', label: 'Time off' },
  { key: 'other', label: 'Other' },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

function statusBadgeVariant(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'cancelled') return 'neutral';
  return 'warning';
}

function isOtherPolicy(name: string): boolean {
  return !isSickPolicy(name) && !/(vacation|holiday|time off|day off|pto)/i.test(name);
}

export default function HrRequestsPage() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [actingId, setActingId] = useState<string | null>(null);

  const rawKind = searchParams.get('tab') || 'sick';
  const kind: RequestKindTab =
    rawKind === 'time_off' || rawKind === 'other' || rawKind === 'sick' ? rawKind : 'sick';
  const rawStatus = searchParams.get('status') || 'pending';
  const status: StatusFilter = (
    ['pending', 'approved', 'rejected', 'cancelled', 'all'] as StatusFilter[]
  ).includes(rawStatus as StatusFilter)
    ? (rawStatus as StatusFilter)
    : 'pending';

  const setKind = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  const setStatus = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('status', next);
    setSearchParams(params, { replace: true });
  };

  const apiKind = kind === 'time_off' ? 'vacation' : kind === 'sick' ? 'sick' : 'all';

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['hr-time-off-requests', apiKind, status],
    queryFn: async () => {
      const payload = await api<ListPayload | HrTimeOffRequest[]>(
        'GET',
        `/employees/time-off/requests?kind=${encodeURIComponent(apiKind)}&status=${encodeURIComponent(status)}&limit=200`,
      );
      if (Array.isArray(payload)) {
        return { items: payload, total: payload.length };
      }
      return {
        items: Array.isArray(payload?.items) ? payload.items : [],
        total: Number(payload?.total ?? payload?.items?.length ?? 0),
      };
    },
  });

  const items = useMemo(() => {
    const rows = data?.items || [];
    if (kind === 'other') {
      return rows.filter((row) => isOtherPolicy(row.policy_name));
    }
    if (kind === 'sick') {
      return rows.filter((row) => isSickPolicy(row.policy_name));
    }
    return rows.filter((row) => !isSickPolicy(row.policy_name) && !isOtherPolicy(row.policy_name));
  }, [data?.items, kind]);

  const { data: pendingSick } = useQuery({
    queryKey: ['hr-time-off-requests', 'sick', 'pending'],
    queryFn: () =>
      api<ListPayload>('GET', '/employees/time-off/requests?kind=sick&status=pending&limit=200'),
  });
  const { data: pendingVacation } = useQuery({
    queryKey: ['hr-time-off-requests', 'vacation', 'pending'],
    queryFn: () =>
      api<ListPayload>('GET', '/employees/time-off/requests?kind=vacation&status=pending&limit=200'),
  });
  const { data: pendingAll } = useQuery({
    queryKey: ['hr-time-off-requests', 'all', 'pending'],
    queryFn: () =>
      api<ListPayload>('GET', '/employees/time-off/requests?kind=all&status=pending&limit=200'),
  });

  const tabCounts = {
    sick: pendingSick?.total ?? 0,
    time_off: pendingVacation?.total ?? 0,
    other: (pendingAll?.items || []).filter((r) => isOtherPolicy(r.policy_name)).length,
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['hr-time-off-requests'] });
    queryClient.invalidateQueries({ queryKey: ['time-off-requests'] });
    queryClient.invalidateQueries({ queryKey: ['time-off-balance'] });
  };

  const review = async (row: HrTimeOffRequest, nextStatus: 'approved' | 'rejected') => {
    const result = await confirm({
      title: nextStatus === 'approved' ? 'Approve request' : 'Reject request',
      message:
        nextStatus === 'approved'
          ? `Approve ${row.policy_name} for ${row.employee_name}? Balance will be updated.`
          : `Reject ${row.policy_name} for ${row.employee_name}?`,
      confirmText: nextStatus === 'approved' ? 'Approve' : 'Reject',
      cancelText: 'Back',
    });
    if (result !== 'confirm') return;
    setActingId(row.id);
    try {
      await api('PATCH', `/employees/${row.user_id}/time-off/requests/${row.id}`, {
        status: nextStatus,
      });
      toast.success(nextStatus === 'approved' ? 'Request approved' : 'Request rejected');
      invalidate();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(err?.response?.data?.detail || err?.message || 'Could not update request');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack)}>
      <AppPageHeader
        title="HR Requests"
        subtitle="Review employee requests. Sick leave and time off for now — more types can be added as tabs later."
      />

      <AppTabs
        value={kind}
        onChange={setKind}
        tabs={KIND_TABS.map((tab) => ({
          key: tab.key,
          label: tab.label,
          count: tabCounts[tab.key],
        }))}
      />

      <AppQuickFilterRow
        segments={STATUS_FILTERS.map((f) => ({
          key: f.value,
          label: f.label,
          active: status === f.value,
          onClick: () => setStatus(f.value),
        }))}
      />

      <AppCard
        title={
          kind === 'sick' ? 'Sick leave requests' : kind === 'time_off' ? 'Time off requests' : 'Other requests'
        }
        subtitle={
          kind === 'other'
            ? 'Placeholder for future request types (loans, schedule changes, etc.).'
            : status === 'pending'
              ? 'Waiting for HR review'
              : undefined
        }
      >
        {isLoading ? (
          <div className={uiTypography.helper}>Loading…</div>
        ) : isError ? (
          <div className="text-sm text-red-600">
            Could not load requests
            {error instanceof Error && error.message ? `: ${error.message}` : '.'}
          </div>
        ) : items.length === 0 ? (
          <AppEmptyState
            icon={kind === 'sick' ? <HeartPulse className="h-6 w-6" /> : <Sun className="h-6 w-6" />}
            title={status === 'pending' ? 'No pending requests' : 'No requests'}
            description={
              kind === 'other'
                ? 'No other request types yet.'
                : 'When employees submit requests, they will show up here.'
            }
          />
        ) : (
          <div className="space-y-2">
            {items.map((row) => {
              const busy = actingId === row.id;
              return (
                <div
                  key={row.id}
                  className={uiCx(
                    'flex flex-col gap-3 border border-gray-100 bg-white p-3 sm:flex-row sm:items-start sm:justify-between',
                    uiRadius.control,
                  )}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/users/${row.user_id}`}
                        className="text-sm font-semibold text-gray-900 hover:underline"
                      >
                        {row.employee_name || row.username}
                      </Link>
                      <AppBadge variant={statusBadgeVariant(row.status)}>{row.status}</AppBadge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                      <span className="inline-flex items-center gap-1 font-medium text-gray-800">
                        {isSickPolicy(row.policy_name) ? (
                          <HeartPulse className="h-3.5 w-3.5 text-red-600" />
                        ) : (
                          <Sun className="h-3.5 w-3.5 text-orange-600" />
                        )}
                        {row.policy_name}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
                        {formatShortDate(row.start_date)}
                        {row.end_date !== row.start_date ? ` – ${formatShortDate(row.end_date)}` : ''}
                      </span>
                      <span className="font-semibold tabular-nums text-gray-900">
                        {hoursToDays(row.hours).toFixed(1)}d
                      </span>
                    </div>
                    {row.notes ? (
                      <p className="whitespace-pre-line text-xs text-gray-600">{row.notes}</p>
                    ) : null}
                  </div>
                  {row.status === 'pending' ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <AppButton
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void review(row, 'rejected')}
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </AppButton>
                      <AppButton
                        size="sm"
                        disabled={busy}
                        loading={busy}
                        onClick={() => void review(row, 'approved')}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve
                      </AppButton>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </AppCard>
    </div>
  );
}
