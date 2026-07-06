import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';
import {
  ACCESS_REVOCATION_OPTIONS,
  OFFBOARDING_START_FIELD_HINTS as H,
  TERMINATION_TYPES,
  type OffboardingDetail,
} from './offboardingUtils';
import { isCompleteLocalDatetime, LocalDateTimeFields } from '@/components/LocalDateTimeFields';
import {
  AppButton,
  AppDatePicker,
  AppFormModal,
  AppSelect,
  AppTextarea,
  AppUserSelect,
  uiSpacing,
} from '@/components/ui';

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (detail: OffboardingDetail) => void;
  initial?: OffboardingDetail | null;
  mode?: 'create' | 'edit';
};

const START_OFFBOARDING_QUICK_INFO = formModalQuickInfo({
  purpose: (
    <>
      Open an offboarding case for an employee leaving the company and capture termination details, access
      revocation, and internal notes.
    </>
  ),
  howToUse: (
    <>
      Select {uiLabel('Employee')}, then complete {uiLabel('Termination Type')}, {uiLabel('Termination Date')},{' '}
      {uiLabel('Last Working Day')}, and {uiLabel('Access Revocation Timing')}. A profile summary appears after you
      choose someone.
    </>
  ),
  behavior: (
    <>
      {uiLabel('Save Draft')} only requires an employee. {uiLabel('Start Offboarding')} needs every field marked with{' '}
      {uiLabel('*')}. Choosing {uiLabel('Scheduled')} shows when Hub access will be revoked in company local time.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without saving. {uiLabel('Save Draft')} stores a draft you can finish later.{' '}
      {uiLabel('Start Offboarding')} begins the workflow and opens the case.
    </>
  ),
});

function endOfDayLocal(dateStr: string): string {
  if (!dateStr) return '';
  return `${dateStr}T23:59`;
}

function validateStartFields(payload: {
  userId: string;
  terminationType: string;
  terminationDate: string;
  lastWorkingDay: string;
  accessTiming: string;
  accessRevokeLocal: string;
}): string | null {
  if (!payload.userId) return 'Select an employee';
  if (!payload.terminationType) return 'Select a termination type';
  if (!payload.terminationDate) return 'Select a termination date';
  if (!payload.lastWorkingDay) return 'Select a last working day';
  if (!payload.accessTiming) return 'Select access revocation timing';
  if (payload.accessTiming === 'scheduled' && !isCompleteLocalDatetime(payload.accessRevokeLocal)) {
    return 'Set a complete scheduled revocation date and time';
  }
  return null;
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

  const { data: profile } = useQuery({
    queryKey: ['offboarding-employee-profile', userId],
    queryFn: () => api<any>('GET', `/auth/users/${encodeURIComponent(userId)}/profile`),
    enabled: open && !!userId,
  });

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
    const validationError = validateStartFields({
      userId,
      terminationType,
      terminationDate,
      lastWorkingDay,
      accessTiming,
      accessRevokeLocal,
    });
    if (validationError) {
      toast.error(validationError);
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
      formWidth="comfortable"
      quickInfo={START_OFFBOARDING_QUICK_INFO}
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
      <div className={uiSpacing.sectionStack}>
        <AppUserSelect
          mode="single"
          label="Employee *"
          value={userId}
          onChange={(id) => setUserId(id)}
          disabled={mode === 'edit' && initial?.status !== 'draft'}
          placeholder="Search or select user…"
          fieldHint={H.employee}
        />

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
          label="Termination Type *"
          value={terminationType}
          onChange={(e) => setTerminationType(e.target.value)}
          options={[{ value: '', label: 'Select…' }, ...TERMINATION_TYPES.map((t) => ({ value: t.value, label: t.label }))]}
          fieldHint={H.termination_type}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AppDatePicker
            label="Termination Date *"
            value={terminationDate}
            onChange={(e) => setTerminationDate(e.target.value)}
            fieldHint={H.termination_date}
          />
          <AppDatePicker
            label="Last Working Day *"
            value={lastWorkingDay}
            onChange={(e) => setLastWorkingDay(e.target.value)}
            fieldHint={H.last_working_day}
          />
        </div>

        <AppTextarea
          label="Internal Notes"
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={3}
          fieldHint={H.internal_notes}
        />

        <AppSelect
          label="Access Revocation Timing *"
          value={accessTiming}
          onChange={(e) => setAccessTiming(e.target.value)}
          options={[
            { value: '', label: 'Select…' },
            ...ACCESS_REVOCATION_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          ]}
          fieldHint={H.access_revocation_timing}
        />

        {accessTiming === 'scheduled' ? (
          <LocalDateTimeFields
            label="Scheduled Revocation"
            value={accessRevokeLocal}
            onChange={setAccessRevokeLocal}
            required
            dateFieldHint={`${H.scheduled_revocation_date}\n\nTimezone: ${companyTz}.`}
            timeFieldHint={H.scheduled_revocation_time}
          />
        ) : null}
      </div>
    </AppFormModal>
  );
}
