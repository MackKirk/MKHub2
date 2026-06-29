import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import {
  ACCESS_REVOCATION_OPTIONS,
  TERMINATION_TYPES,
  type OffboardingDetail,
} from './offboardingUtils';
import {
  AppButton,
  AppDatePicker,
  AppFieldHint,
  AppFormModal,
  AppInput,
  AppSelect,
  AppTextarea,
  AppUserSelect,
  type AppUserSelectUser,
} from '@/components/ui';

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (detail: OffboardingDetail) => void;
  initial?: OffboardingDetail | null;
  mode?: 'create' | 'edit';
};

function endOfDayLocal(dateStr: string): string {
  if (!dateStr) return '';
  return `${dateStr}T23:59:59`;
}

export default function StartOffboardingModal({
  open,
  onClose,
  onSaved,
  initial = null,
  mode = 'create',
}: Props) {
  const [userId, setUserId] = useState('');
  const [terminationType, setTerminationType] = useState('');
  const [terminationDate, setTerminationDate] = useState('');
  const [lastWorkingDay, setLastWorkingDay] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [accessTiming, setAccessTiming] = useState('');
  const [accessRevokeLocal, setAccessRevokeLocal] = useState('');
  const [submitting, setSubmitting] = useState<'draft' | 'start' | null>(null);

  const { data: meta } = useQuery({
    queryKey: ['offboarding-meta'],
    queryFn: () => api<{ company_timezone: string }>('GET', '/offboarding/meta'),
    enabled: open,
  });

  const { data: eligible = [] } = useQuery({
    queryKey: ['offboarding-eligible'],
    queryFn: () => api<{ id: string; name?: string; username?: string }[]>('GET', '/offboarding/eligible-employees'),
    enabled: open && mode === 'create',
  });

  const { data: profile } = useQuery({
    queryKey: ['offboarding-employee-profile', userId],
    queryFn: () => api<any>('GET', `/auth/users/${encodeURIComponent(userId)}/profile`),
    enabled: open && !!userId,
  });

  const eligibleUsers: AppUserSelectUser[] = useMemo(() => {
    const base = (eligible as any[]).map((u) => ({
      id: u.id,
      name: u.name || u.username,
      username: u.username,
    }));
    if (initial?.user_id && !base.some((u) => u.id === initial.user_id)) {
      base.unshift({ id: initial.user_id, name: initial.employee_name, username: undefined });
    }
    return base;
  }, [eligible, initial]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setUserId(initial.user_id);
      setTerminationType(initial.termination_type || '');
      setTerminationDate((initial.termination_date || '').slice(0, 10));
      setLastWorkingDay((initial.last_working_day || '').slice(0, 10));
      setInternalNotes(initial.internal_notes || '');
      setAccessTiming(initial.access_revocation_timing || '');
      setAccessRevokeLocal(initial.access_revoke_at_local || '');
    } else {
      setUserId('');
      setTerminationType('');
      setTerminationDate('');
      setLastWorkingDay('');
      setInternalNotes('');
      setAccessTiming('');
      setAccessRevokeLocal('');
    }
  }, [open, initial]);

  useEffect(() => {
    if (accessTiming === 'scheduled' && lastWorkingDay && !accessRevokeLocal) {
      setAccessRevokeLocal(endOfDayLocal(lastWorkingDay));
    }
  }, [accessTiming, lastWorkingDay, accessRevokeLocal]);

  const hubActive = profile?.user?.is_active !== false;
  const companyTz = meta?.company_timezone || initial?.company_timezone || 'America/Vancouver';

  const buildPayload = () => ({
    user_id: userId,
    termination_type: terminationType || undefined,
    termination_date: terminationDate || undefined,
    last_working_day: lastWorkingDay || undefined,
    internal_notes: internalNotes || undefined,
    access_revocation_timing: accessTiming || undefined,
    access_revoke_at_local: accessTiming === 'scheduled' ? accessRevokeLocal || undefined : undefined,
  });

  const handleDraft = async () => {
    if (!userId) {
      toast.error('Select an employee');
      return;
    }
    setSubmitting('draft');
    try {
      const detail = await api<OffboardingDetail>('POST', '/offboarding/draft', buildPayload());
      toast.success('Draft saved');
      onSaved(detail);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save draft');
    } finally {
      setSubmitting(null);
    }
  };

  const handleStart = async () => {
    if (!userId) {
      toast.error('Select an employee');
      return;
    }
    setSubmitting('start');
    try {
      const payload = buildPayload();
      let detail: OffboardingDetail;
      if (initial?.status === 'draft' && initial.id) {
        detail = await api<OffboardingDetail>(
          'POST',
          `/offboarding/${encodeURIComponent(initial.id)}/start`,
          payload,
        );
      } else if (mode === 'edit' && initial?.id) {
        await api('PATCH', `/offboarding/${encodeURIComponent(initial.id)}`, payload);
        detail = await api<OffboardingDetail>('GET', `/offboarding/${encodeURIComponent(initial.id)}`);
      } else {
        detail = await api<OffboardingDetail>('POST', '/offboarding', payload);
      }
      toast.success(initial?.status === 'draft' ? 'Offboarding started' : 'Offboarding saved');
      onSaved(detail);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to start offboarding');
    } finally {
      setSubmitting(null);
    }
  };

  const isDraftOnly = initial?.status === 'draft';

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit Offboarding' : 'Start Offboarding'}
      size="lg"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <AppButton variant="secondary" onClick={onClose} disabled={!!submitting}>
            Cancel
          </AppButton>
          {mode === 'create' || isDraftOnly ? (
            <AppButton variant="secondary" onClick={handleDraft} disabled={!!submitting}>
              {submitting === 'draft' ? 'Saving…' : 'Save Draft'}
            </AppButton>
          ) : null}
          <AppButton onClick={handleStart} disabled={!!submitting}>
            {submitting === 'start'
              ? 'Saving…'
              : isDraftOnly
                ? 'Start Offboarding'
                : mode === 'edit'
                  ? 'Save Changes'
                  : 'Start Offboarding'}
          </AppButton>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700">Employee</label>
          <AppUserSelect
            value={userId}
            onChange={(id) => setUserId(id)}
            users={eligibleUsers}
            disabled={mode === 'edit' && initial?.status !== 'draft'}
            placeholder="Select employee…"
          />
        </div>

        {userId && profile ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 space-y-1">
            <div><span className="font-medium">Position:</span> {profile?.profile?.job_title || '—'}</div>
            <div><span className="font-medium">Division:</span> {profile?.profile?.division || '—'}</div>
            <div><span className="font-medium">Manager:</span> {profile?.profile?.manager_name || '—'}</div>
            <div><span className="font-medium">Hub Access:</span> {hubActive ? 'Active' : 'Inactive'}</div>
            <div>
              <span className="font-medium">Current Job Termination Date:</span>{' '}
              {profile?.profile?.termination_date
                ? String(profile.profile.termination_date).slice(0, 10)
                : '—'}
            </div>
          </div>
        ) : null}

        <AppSelect
          label="Termination Type"
          value={terminationType}
          onChange={(e) => setTerminationType(e.target.value)}
          options={[{ value: '', label: 'Select…' }, ...TERMINATION_TYPES.map((t) => ({ value: t.value, label: t.label }))]}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-gray-700">Termination Date</label>
            <AppDatePicker value={terminationDate} onChange={setTerminationDate} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Last Working Day</label>
            <AppDatePicker value={lastWorkingDay} onChange={setLastWorkingDay} />
          </div>
        </div>

        <AppTextarea
          label="Internal Notes"
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={3}
        />

        <AppSelect
          label="Access Revocation Timing"
          value={accessTiming}
          onChange={(e) => setAccessTiming(e.target.value)}
          options={[
            { value: '', label: 'Select…' },
            ...ACCESS_REVOCATION_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          ]}
        />

        {accessTiming === 'scheduled' ? (
          <div>
            <AppInput
              label="Scheduled Revocation (company time)"
              type="datetime-local"
              value={accessRevokeLocal ? accessRevokeLocal.slice(0, 16) : ''}
              onChange={(e) => {
                const v = e.target.value;
                setAccessRevokeLocal(v ? `${v}:00` : '');
              }}
            />
            <AppFieldHint>Timezone: {companyTz}</AppFieldHint>
          </div>
        ) : null}
      </div>
    </AppFormModal>
  );
}
