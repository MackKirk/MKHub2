import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HeartPulse, Sun } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { getTodayLocal } from '@/lib/dateUtils';
import {
  formatShortDate,
  hoursToDays,
  isSickPolicy,
  isVacationPolicy,
  matchesTimeOffMode,
  type TimeOffBalance,
  type TimeOffHistoryItem,
  type TimeOffMode,
  type TimeOffRequest,
} from '@/lib/timeOff';
import { TimeOffRequestModal } from '@/pages/clock/TimeOffRequestModal';
import {
  AppBadge,
  AppCard,
  uiCx,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type MyTimeOffPanelProps = {
  mode: TimeOffMode;
};

function statusBadgeVariant(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'cancelled') return 'neutral';
  return 'warning';
}

export function MyTimeOffPanel({ mode }: MyTimeOffPanelProps) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const isSick = mode === 'sick';
  const accent = isSick ? 'text-red-700' : 'text-orange-600';
  const accentBtn = isSick
    ? 'bg-red-600 hover:bg-red-700'
    : 'bg-orange-600 hover:bg-orange-700';
  const today = getTodayLocal();

  const [modalOpen, setModalOpen] = useState(false);

  const { data: balances = [], isLoading: loadingBalances } = useQuery({
    queryKey: ['time-off-balance', 'me'],
    queryFn: () => api<TimeOffBalance[]>('GET', '/employees/me/time-off/balance'),
  });

  const { data: requests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ['time-off-requests', 'me'],
    queryFn: () => api<TimeOffRequest[]>('GET', '/employees/me/time-off/requests'),
  });

  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['time-off-history', 'me'],
    queryFn: () => api<TimeOffHistoryItem[]>('GET', '/employees/me/time-off/history'),
  });

  const vacation = balances.find((row) => isVacationPolicy(row.policy_name));
  const sick = balances.find((row) => isSickPolicy(row.policy_name));
  const vacationDays = hoursToDays(vacation?.balance_hours ?? 0);
  const sickDays = hoursToDays(sick?.balance_hours ?? 0);
  const remainingDays = isSick ? sickDays : vacationDays;

  const upcoming = useMemo(
    () =>
      [...requests]
        .filter((row) => matchesTimeOffMode(row.policy_name, mode))
        .filter(
          (row) =>
            row.status === 'pending' || (row.status === 'approved' && row.end_date >= today),
        )
        .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [requests, mode, today],
  );

  const historyRows = useMemo(
    () =>
      history
        .filter((row) => matchesTimeOffMode(row.policy_name, mode))
        .slice(0, 8),
    [history, mode],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['time-off-balance', 'me'] });
    queryClient.invalidateQueries({ queryKey: ['time-off-requests', 'me'] });
    queryClient.invalidateQueries({ queryKey: ['time-off-history', 'me'] });
  };

  const cancel = async (row: TimeOffRequest) => {
    const result = await confirm({
      title: 'Cancel request',
      message: 'Cancel this pending request?',
      confirmText: 'Cancel request',
      cancelText: 'Keep',
    });
    if (result !== 'confirm') return;
    try {
      await api('PATCH', `/employees/me/time-off/requests/${row.id}`, { status: 'cancelled' });
      toast.success('Request cancelled');
      invalidate();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(err?.response?.data?.detail || err?.message || 'Could not cancel');
    }
  };

  const loading = loadingBalances || loadingRequests || loadingHistory;

  return (
    <div className={uiCx(uiSpacing.sectionStack, 'max-w-2xl')}>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className={uiCx('h-1.5 w-full', isSick ? 'bg-red-600' : 'bg-orange-500')} />
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div className={uiCx('inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide', accent)}>
              {isSick ? <HeartPulse className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
              {isSick ? 'SICK LEAVE' : 'VACATION'}
            </div>
            <div className={uiTypography.helper}>{new Date().getFullYear()} balance</div>
          </div>
          <div className="mt-2 text-4xl font-semibold tabular-nums text-gray-900">
            {remainingDays.toFixed(1)}
          </div>
          <div className="text-sm text-gray-600">days remaining</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => navigate('/time-off')}
          className={uiCx(
            'rounded-2xl border bg-white p-4 text-left',
            isSick ? 'border-gray-200 hover:border-gray-300' : 'border-orange-200 ring-1 ring-orange-100',
          )}
        >
          <div className="text-xl font-semibold tabular-nums text-orange-600">{vacationDays.toFixed(1)}</div>
          <div className="mt-0.5 text-sm text-gray-600">Vacation</div>
        </button>
        <button
          type="button"
          onClick={() => navigate('/sick-leave')}
          className={uiCx(
            'rounded-2xl border bg-white p-4 text-left',
            isSick ? 'border-red-200 ring-1 ring-red-100' : 'border-gray-200 hover:border-gray-300',
          )}
        >
          <div className="text-xl font-semibold tabular-nums text-red-600">{sickDays.toFixed(1)}</div>
          <div className="mt-0.5 text-sm text-gray-600">Sick leave</div>
        </button>
      </div>

      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={uiCx(
          'flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white shadow-sm',
          accentBtn,
        )}
      >
        {isSick ? <HeartPulse className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        {isSick ? 'Report sick leave' : 'Request time off'}
      </button>

      <AppCard title="Upcoming">
        {loading ? (
          <div className={uiTypography.helper}>Loading…</div>
        ) : upcoming.length === 0 ? (
          <p className={uiTypography.helper}>No upcoming time off.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((row) => (
              <div
                key={row.id}
                className={uiCx('flex items-start justify-between gap-3 border border-gray-100 p-3', uiRadius.control)}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">{row.policy_name}</div>
                  <div className="mt-0.5 text-sm text-gray-600">
                    {formatShortDate(row.start_date)} – {formatShortDate(row.end_date)} ·{' '}
                    {hoursToDays(row.hours).toFixed(1)} days
                  </div>
                  {row.notes ? (
                    <div className="mt-1 line-clamp-2 text-sm text-gray-600">{row.notes}</div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <AppBadge variant={statusBadgeVariant(row.status)}>{row.status}</AppBadge>
                  {row.status === 'pending' ? (
                    <button
                      type="button"
                      onClick={() => void cancel(row)}
                      className="text-sm font-semibold text-red-600 hover:underline"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </AppCard>

      <AppCard title="History">
        {loading ? (
          <div className={uiTypography.helper}>Loading…</div>
        ) : historyRows.length === 0 ? (
          <p className={uiTypography.helper}>No history yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {historyRows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">{row.policy_name}</div>
                  <div className="mt-0.5 text-sm text-gray-600">
                    {formatShortDate(row.transaction_date)}
                    {row.description ? ` · ${row.description}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                  {Number(row.balance_after).toFixed(1)} days
                </div>
              </div>
            ))}
          </div>
        )}
      </AppCard>

      <TimeOffRequestModal open={modalOpen} mode={mode} onClose={() => setModalOpen(false)} />
    </div>
  );
}
