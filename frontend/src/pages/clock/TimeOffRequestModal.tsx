import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, HeartPulse, Info, Sun } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { earliestTimeOffDate, getTodayLocal } from '@/lib/dateUtils';
import {
  countInclusiveDays,
  daysToHours,
  formatShortDate,
  hoursToDays,
  isSickPolicy,
  isVacationPolicy,
  matchesTimeOffMode,
  resolvePolicyName,
  type TimeOffBalance,
  type TimeOffMode,
  type TimeOffRequest,
} from '@/lib/timeOff';
import {
  AppButton,
  AppCard,
  AppDatePicker,
  AppFormModal,
  AppTextarea,
  uiCx,
  uiLayout,
  uiRadius,
  uiTypography,
} from '@/components/ui';

type TimeOffRequestModalProps = {
  open: boolean;
  mode: TimeOffMode;
  onClose: () => void;
};

export function TimeOffRequestModal({ open, mode, onClose }: TimeOffRequestModalProps) {
  const queryClient = useQueryClient();
  const isSick = mode === 'sick';
  const today = getTodayLocal();
  const minStart = isSick ? today : earliestTimeOffDate();

  const [startDate, setStartDate] = useState(minStart);
  const [endDate, setEndDate] = useState(minStart);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: balances = [] } = useQuery({
    queryKey: ['time-off-balance', 'me'],
    queryFn: () => api<TimeOffBalance[]>('GET', '/employees/me/time-off/balance'),
    enabled: open,
  });

  const { data: requests = [] } = useQuery({
    queryKey: ['time-off-requests', 'me'],
    queryFn: () => api<TimeOffRequest[]>('GET', '/employees/me/time-off/requests'),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const nextStart = isSick ? getTodayLocal() : earliestTimeOffDate();
    setStartDate(nextStart);
    setEndDate(nextStart);
    setNotes('');
  }, [open, isSick]);

  const remainingDays = hoursToDays(
    (isSick
      ? balances.find((row) => isSickPolicy(row.policy_name))
      : balances.find((row) => isVacationPolicy(row.policy_name))
    )?.balance_hours ?? 0,
  );
  const otherBalanceDays = hoursToDays(
    (isSick
      ? balances.find((row) => isVacationPolicy(row.policy_name))
      : balances.find((row) => isSickPolicy(row.policy_name))
    )?.balance_hours ?? 0,
  );
  const policyName = resolvePolicyName(balances, mode);
  const days = startDate && endDate ? Math.max(0, countInclusiveDays(startDate, endDate)) : 0;
  const hours = daysToHours(days);
  const canSubmit =
    days > 0 &&
    endDate >= startDate &&
    startDate >= minStart &&
    (!isSick || notes.trim().length > 0) &&
    !submitting;

  const upcoming = useMemo(
    () =>
      [...requests]
        .filter((row) => matchesTimeOffMode(row.policy_name, mode))
        .filter(
          (row) =>
            row.status === 'pending' || (row.status === 'approved' && row.end_date >= today),
        )
        .sort((a, b) => a.start_date.localeCompare(b.start_date))
        .slice(0, 4),
    [requests, mode, today],
  );

  const rangeLabel =
    startDate && endDate
      ? startDate === endDate
        ? formatShortDate(startDate)
        : `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`
      : null;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api('POST', '/employees/me/time-off/requests', {
        policy_name: policyName,
        start_date: startDate,
        end_date: endDate,
        hours,
        notes: notes.trim() || undefined,
      });
      toast.success(isSick ? 'Sick leave submitted' : 'Time off request submitted');
      queryClient.invalidateQueries({ queryKey: ['time-off-balance', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['time-off-requests', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['time-off-history', 'me'] });
      onClose();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(err?.response?.data?.detail || err?.message || 'Could not submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const Icon = isSick ? HeartPulse : Sun;
  const heroGradient = isSick
    ? 'bg-gradient-to-br from-red-500 via-red-600 to-rose-800'
    : 'bg-gradient-to-br from-orange-400 via-orange-500 to-amber-700';
  const iconTone = isSick ? 'text-red-700' : 'text-orange-600';
  const tintSoft = isSick ? 'bg-red-50' : 'bg-orange-50';
  const tintText = isSick ? 'text-red-800' : 'text-orange-800';
  const submitClass = isSick
    ? 'bg-gradient-to-br from-red-500 via-red-600 to-rose-800'
    : 'bg-gradient-to-br from-orange-400 via-orange-500 to-amber-700';

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      formWidth="wide"
      title={isSick ? 'Report sick leave' : 'Request time off'}
      description={
        isSick
          ? 'A justification is required. Same-day sick leave is allowed.'
          : 'Time off must be requested at least 24 hours in advance.'
      }
      quickInfo={
        <>
          <p>
            {isSick
              ? 'Use this when you cannot work for health reasons. Same-day requests are allowed.'
              : 'Request vacation or planned time off at least 24 hours before the first day.'}
          </p>
          <p>Pick a start and end date. The total days and hours update automatically.</p>
          <p>
            {isSick
              ? 'A short justification is required so supervisors can approve the request.'
              : 'Notes are optional but help your supervisor plan coverage.'}
          </p>
        </>
      }
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton variant="secondary" onClick={onClose}>
            Cancel
          </AppButton>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className={uiCx(
              'inline-flex h-9 items-center justify-center gap-2 px-5 text-sm font-semibold text-white shadow-sm',
              submitClass,
              uiRadius.control,
              'hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {submitting ? 'Submitting…' : isSick ? 'Submit sick leave' : 'Submit request'}
          </button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)] md:items-start">
        <div className="space-y-3">
          <div className={uiCx('flex items-center gap-3 px-4 py-3.5 text-white shadow-sm', uiRadius.card, heroGradient)}>
            <span
              className={uiCx(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white',
                iconTone,
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-base font-semibold">
                {isSick ? 'Report sick leave' : 'Request time off'}
              </div>
              <div className="text-sm text-white/85">
                {rangeLabel
                  ? `${days} day${days === 1 ? '' : 's'} · ${rangeLabel}`
                  : isSick
                    ? 'Same-day requests allowed · justification required'
                    : 'Request at least 24 hours in advance'}
              </div>
            </div>
          </div>

          <div className={uiCx('rounded-xl border border-gray-200 bg-white px-3 py-2.5', uiRadius.control)}>
            <div className="text-xs font-semibold text-gray-600">Policy</div>
            <div className="mt-0.5 truncate text-sm font-semibold text-gray-900">{policyName}</div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AppDatePicker
              label="Start *"
              value={startDate}
              min={minStart}
              onChange={(e) => {
                const next = e.target.value;
                setStartDate(next);
                setEndDate((current) => (current < next ? next : current));
              }}
            />
            <AppDatePicker
              label="End *"
              value={endDate}
              min={startDate || minStart}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className={uiCx('rounded-xl border border-gray-200 bg-slate-50 p-3', uiRadius.control)}>
            <div className="text-sm font-semibold text-gray-900">
              {days} day{days === 1 ? '' : 's'} · {hours} hours
            </div>
            <div className="mt-0.5 text-sm text-gray-600">
              Available balance: {remainingDays.toFixed(1)} days
            </div>
          </div>

          <AppTextarea
            label={isSick ? 'Justification *' : 'Notes (optional)'}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={isSick ? 'Why do you need sick leave?' : 'Anything your supervisor should know'}
            rows={4}
          />
        </div>

        <div className="space-y-3">
          <div className={uiCx('rounded-2xl px-3.5 py-3.5', tintSoft)}>
            <div className={uiCx('text-xs font-semibold tracking-wide', tintText)}>
              {isSick ? 'SICK LEAVE' : 'VACATION'} · {new Date().getFullYear()}
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-gray-900">
              {remainingDays.toFixed(1)}
            </div>
            <div className="text-sm text-gray-600">days remaining</div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
              <div className="text-sm font-semibold tabular-nums text-orange-600">
                {(isSick ? otherBalanceDays : remainingDays).toFixed(1)}
              </div>
              <div className="text-xs text-gray-600">Vacation</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
              <div className="text-sm font-semibold tabular-nums text-red-600">
                {(isSick ? remainingDays : otherBalanceDays).toFixed(1)}
              </div>
              <div className="text-xs text-gray-600">Sick leave</div>
            </div>
          </div>

          <AppCard>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <CalendarDays className="h-3.5 w-3.5 text-gray-500" />
              Upcoming
            </div>
            {upcoming.length > 0 ? (
              <div className="mt-2 divide-y divide-gray-100">
                {upcoming.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">
                        {formatShortDate(row.start_date)}
                        {row.end_date !== row.start_date ? ` – ${formatShortDate(row.end_date)}` : ''}
                      </div>
                      <div className="text-xs capitalize text-gray-600">{row.status}</div>
                    </div>
                    <div className="text-sm font-semibold tabular-nums text-gray-900">
                      {hoursToDays(row.hours).toFixed(1)}d
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className={uiCx(uiTypography.helper, 'mt-2')}>No upcoming requests</p>
            )}
          </AppCard>

          <div className={uiCx('flex items-start gap-2.5 rounded-2xl px-3 py-3', tintSoft)}>
            <span
              className={uiCx(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white',
                iconTone,
              )}
            >
              <Info className="h-4 w-4" />
            </span>
            <p className={uiCx('pt-1 text-sm', tintText)}>
              {isSick
                ? 'Same-day sick leave is allowed. Add a clear justification before submitting.'
                : 'Time off must be requested at least 24 hours in advance of the first day.'}
            </p>
          </div>
        </div>
      </div>
    </AppFormModal>
  );
}
