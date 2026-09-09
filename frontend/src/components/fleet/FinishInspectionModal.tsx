import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { formatDateLocal } from '@/lib/dateUtils';
import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppCheckbox,
  AppDatePicker,
  AppFormModal,
  AppSelect,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const FORM_ID = 'finish-inspection-form';

export const NEXT_INSPECTION_INTERVALS = [
  { value: '30', label: 'In 30 days' },
  { value: '90', label: 'In 90 days' },
  { value: '180', label: 'In 180 days' },
  { value: '365', label: 'In 1 year' },
] as const;

export type FinishInspectionNextSchedule = {
  scheduleNext: true;
  scheduled_at: string;
  urgency: string;
  category: string;
};

export type FinishInspectionConfirmResult =
  | { scheduleNext: false }
  | FinishInspectionNextSchedule;

type Props = {
  open: boolean;
  title?: string;
  message: string;
  /** When true, show Schedule next (Pass-only path). */
  allowScheduleNext: boolean;
  defaultUrgency?: string;
  defaultCategory?: string;
  confirmText?: string;
  cancelText?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (result: FinishInspectionConfirmResult) => void;
};

function addDaysIsoDate(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return formatDateLocal(d);
}

/** Both legs Pass → eligible to offer scheduling the next inspection. */
export function canOfferScheduleNextInspection(args: {
  thisResult: string;
  otherLegResult?: string | null;
  fleetAssetId?: string | null;
}): boolean {
  const thisOk = (args.thisResult || '').toLowerCase() === 'pass';
  const otherOk = (args.otherLegResult || '').toLowerCase() === 'pass';
  return thisOk && otherOk && Boolean(args.fleetAssetId);
}

const QUICK_INFO = formModalQuickInfo({
  purpose: <>Confirm finishing this inspection and optionally schedule the next one for the same vehicle.</>,
  howToUse: (
    <>
      Review the result, then {uiLabel('Finish')}. When both Body and Mechanical passed, you can check{' '}
      {uiLabel('Schedule next inspection')} and pick an interval or date.
    </>
  ),
  behavior: <>Fail creates a work order automatically. Schedule next is only offered when both legs Pass.</>,
  actions: (
    <>
      {uiLabel('Finish')} saves the final result. {uiLabel('Cancel')} closes without finishing.
    </>
  ),
});

export default function FinishInspectionModal({
  open,
  title = 'Finish inspection',
  message,
  allowScheduleNext,
  defaultUrgency = 'normal',
  defaultCategory = 'inspection',
  confirmText = 'Finish',
  cancelText = 'Cancel',
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const [scheduleNext, setScheduleNext] = useState(false);
  const [intervalDays, setIntervalDays] = useState('90');
  const [scheduledAt, setScheduledAt] = useState(() => addDaysIsoDate(new Date(), 90));
  const [urgency, setUrgency] = useState(defaultUrgency);
  const [category, setCategory] = useState(defaultCategory);

  useEffect(() => {
    if (!open) return;
    setScheduleNext(false);
    setIntervalDays('90');
    setScheduledAt(addDaysIsoDate(new Date(), 90));
    setUrgency(defaultUrgency);
    setCategory(defaultCategory);
  }, [open, defaultUrgency, defaultCategory]);

  const canConfirmNext = useMemo(
    () => !scheduleNext || scheduledAt.trim().length > 0,
    [scheduleNext, scheduledAt],
  );

  const handleIntervalChange = (value: string) => {
    setIntervalDays(value);
    const days = Number(value);
    if (Number.isFinite(days) && days > 0) {
      setScheduledAt(addDaysIsoDate(new Date(), days));
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy || !canConfirmNext) return;
    if (allowScheduleNext && scheduleNext) {
      onConfirm({
        scheduleNext: true,
        scheduled_at: scheduledAt,
        urgency,
        category,
      });
      return;
    }
    onConfirm({ scheduleNext: false });
  };

  return (
    <AppFormModal
      open={open}
      onClose={onCancel}
      title={title}
      description={message}
      quickInfo={QUICK_INFO}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            {cancelText}
          </AppButton>
          <AppButton
            type="submit"
            form={FORM_ID}
            size="sm"
            disabled={busy || !canConfirmNext}
            loading={busy}
          >
            {busy ? 'Finishing…' : confirmText}
          </AppButton>
        </div>
      }
    >
      <form id={FORM_ID} className={uiSpacing.sectionStack} onSubmit={handleSubmit}>
        {allowScheduleNext ? (
          <div className={uiSpacing.sectionStack}>
            <AppCheckbox
              label="Schedule next inspection"
              checked={scheduleNext}
              onChange={setScheduleNext}
              disabled={busy}
              fieldHint="Both Body and Mechanical passed. Creates a new schedule for the same vehicle."
            />
            {scheduleNext ? (
              <div className={uiLayout.sectionGrid2}>
                <AppSelect
                  label="Interval"
                  value={intervalDays}
                  onChange={(e) => handleIntervalChange(e.target.value)}
                  options={[...NEXT_INSPECTION_INTERVALS]}
                  disabled={busy}
                  fieldHint="Preset gap from today. Changing this updates the next date."
                />
                <AppDatePicker
                  label="Next date"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  disabled={busy}
                  fieldHint="Scheduled date for the next Body + Mechanical inspection."
                />
              </div>
            ) : null}
            {scheduleNext ? (
              <p className={uiTypography.helper}>
                Creates a new schedule with Body and Mechanical pending for this vehicle.
              </p>
            ) : null}
          </div>
        ) : (
          <p className={uiTypography.helper}>This locks in the checklist and updates the inspection schedule.</p>
        )}
      </form>
    </AppFormModal>
  );
}
