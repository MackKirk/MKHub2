import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { earliestTimeOffDate, getTodayLocal } from '@/lib/dateUtils';
import {
  countInclusiveDays,
  daysToHours,
  hoursToDays,
  isSickPolicy,
  isVacationPolicy,
  resolvePolicyName,
  type TimeOffBalance,
  type TimeOffMode,
} from '@/lib/timeOff';
import {
  AppButton,
  AppDatePicker,
  AppFormModal,
  AppTextarea,
  uiCx,
  uiRadius,
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
  const policyName = resolvePolicyName(balances, mode);
  const days = startDate && endDate ? Math.max(0, countInclusiveDays(startDate, endDate)) : 0;
  const hours = daysToHours(days);
  const canSubmit =
    days > 0 &&
    endDate >= startDate &&
    startDate >= minStart &&
    (!isSick || notes.trim().length > 0) &&
    !submitting;

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

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title={isSick ? 'Report sick leave' : 'Request time off'}
      description={
        isSick
          ? 'A justification is required. Same-day sick leave is allowed.'
          : 'Time off must be requested at least 24 hours in advance.'
      }
      footer={
        <div className="flex justify-end gap-2">
          <AppButton variant="secondary" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton onClick={() => void submit()} disabled={!canSubmit} loading={submitting}>
            {isSick ? 'Submit sick leave' : 'Submit request'}
          </AppButton>
        </div>
      }
    >
      <div className="text-sm font-semibold text-gray-900">{policyName}</div>
      <div className="grid grid-cols-2 gap-3">
        <AppDatePicker
          label="Start"
          value={startDate}
          min={minStart}
          onChange={(e) => {
            const next = e.target.value;
            setStartDate(next);
            setEndDate((current) => (current < next ? next : current));
          }}
        />
        <AppDatePicker
          label="End"
          value={endDate}
          min={startDate || minStart}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>
      <div className={uiCx('rounded-xl bg-slate-50 p-3', uiRadius.control)}>
        <div className="text-sm font-semibold text-gray-900">
          {days} day{days === 1 ? '' : 's'} · {hours} hours
        </div>
        <div className="mt-0.5 text-xs text-gray-500">Available: {remainingDays.toFixed(1)} days</div>
      </div>
      <AppTextarea
        label={isSick ? 'Justification *' : 'Notes (optional)'}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={isSick ? 'Why do you need sick leave?' : 'Anything your supervisor should know'}
        rows={4}
      />
    </AppFormModal>
  );
}
