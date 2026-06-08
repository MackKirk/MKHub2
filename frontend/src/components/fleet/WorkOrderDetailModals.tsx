import { WORK_ORDER_STATUS_OPTIONS } from '@/lib/fleetBadges';
import { FLEET_WORK_ORDER_FIELD_HINTS as H } from '@/lib/fleetWorkOrderFieldHints';
import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppDatePicker,
  AppFormModal,
  AppInput,
  AppSelect,
  AppTextarea,
  AppTimePicker,
  uiCx,
  uiLayout,
} from '@/components/ui';

function localDatePart(value: string): string {
  if (!value?.includes('T')) return value?.trim() || '';
  return value.split('T')[0] || '';
}

function localTimePart(value: string): string {
  if (!value?.includes('T')) return '';
  const timePart = value.split('T')[1] || '';
  return /^\d{2}:\d{2}/.test(timePart) ? timePart.slice(0, 5) : '';
}

const DEFAULT_SERVICE_TIME = '09:00';

const START_SERVICE_QUICK_INFO = formModalQuickInfo({
  purpose: <>Record when service work began on this work order and optional asset readings at check-in.</>,
  howToUse: (
    <>
      Confirm or edit {uiLabel('Date')} and {uiLabel('Time')}. Add {uiLabel('Odometer reading')} or{' '}
      {uiLabel('Hours reading')} when the linked vehicle or equipment has meters you want captured on the work order.
    </>
  ),
  behavior: (
    <>
      Starting service moves the work order to in progress. Readings are optional but help track usage across service
      events.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without starting. {uiLabel('Start service')} saves check-in and updates the work order
      status.
    </>
  ),
});

const END_SERVICE_QUICK_INFO = formModalQuickInfo({
  purpose: <>Record when service work finished and optional final asset readings at check-out.</>,
  howToUse: (
    <>
      Confirm or edit {uiLabel('Date')} and {uiLabel('Time')}. Add final {uiLabel('Odometer reading')} or{' '}
      {uiLabel('Hours reading')} when you want them stored on the work order.
    </>
  ),
  behavior: (
    <>
      Finishing service completes the work order. Final readings should be at or above the values recorded at check-in
      when both are entered.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without finishing. {uiLabel('Finish service')} saves check-out and completes the work
      order.
    </>
  ),
});

type CheckInForm = { check_in_at: string; odometer_reading: string; hours_reading: string };
type CheckOutForm = { check_out_at: string; odometer_reading: string; hours_reading: string };

type Props = {
  showCheckIn: boolean;
  onCloseCheckIn: () => void;
  checkInForm: CheckInForm;
  onCheckInFormChange: (patch: Partial<CheckInForm>) => void;
  onSubmitCheckIn: () => void;
  checkInPending: boolean;

  showCheckOut: boolean;
  onCloseCheckOut: () => void;
  checkOutForm: CheckOutForm;
  onCheckOutFormChange: (patch: Partial<CheckOutForm>) => void;
  onSubmitCheckOut: () => void;
  checkOutPending: boolean;

  showEditStatus: boolean;
  onCloseEditStatus: () => void;
  statusEditDraft: string;
  onStatusEditDraftChange: (value: string) => void;
  statusOptionsForCurrent: string[];
  onApplyStatusEdit: () => void;
  statusUpdatePending: boolean;

  showStatusReason: boolean;
  onCloseStatusReason: () => void;
  statusReason: string;
  onStatusReasonChange: (value: string) => void;
  onConfirmStatusReason: () => void;
  statusReasonPending: boolean;

  showReopen: boolean;
  onCloseReopen: () => void;
  reopenReason: string;
  onReopenReasonChange: (value: string) => void;
  onSubmitReopen: () => void;
  reopenPending: boolean;
};

export function WorkOrderDetailModals({
  showCheckIn,
  onCloseCheckIn,
  checkInForm,
  onCheckInFormChange,
  onSubmitCheckIn,
  checkInPending,
  showCheckOut,
  onCloseCheckOut,
  checkOutForm,
  onCheckOutFormChange,
  onSubmitCheckOut,
  checkOutPending,
  showEditStatus,
  onCloseEditStatus,
  statusEditDraft,
  onStatusEditDraftChange,
  statusOptionsForCurrent,
  onApplyStatusEdit,
  statusUpdatePending,
  showStatusReason,
  onCloseStatusReason,
  statusReason,
  onStatusReasonChange,
  onConfirmStatusReason,
  statusReasonPending,
  showReopen,
  onCloseReopen,
  reopenReason,
  onReopenReasonChange,
  onSubmitReopen,
  reopenPending,
}: Props) {
  const statusSelectOptions = WORK_ORDER_STATUS_OPTIONS.filter((opt) =>
    statusOptionsForCurrent.includes(opt.value),
  ).map((opt) => ({ value: opt.value, label: opt.label }));

  return (
    <>
      <AppFormModal
        open={showCheckIn}
        onClose={onCloseCheckIn}
        title="Start service"
        description="Check-in records when work began. Optional odometer and hours readings are saved on the work order."
        formWidth="comfortable"
        quickInfo={START_SERVICE_QUICK_INFO}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onCloseCheckIn} disabled={checkInPending}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={onSubmitCheckIn} loading={checkInPending}>
              {checkInPending ? 'Starting…' : 'Start service'}
            </AppButton>
          </div>
        }
      >
        <div className={uiLayout.sectionGrid2}>
          <AppDatePicker
            label="Date"
            value={localDatePart(checkInForm.check_in_at)}
            onChange={(e) => {
              const d = e.target.value;
              const time = localTimePart(checkInForm.check_in_at);
              if (!d) {
                onCheckInFormChange({ check_in_at: '' });
                return;
              }
              onCheckInFormChange({ check_in_at: time ? `${d}T${time}` : `${d}T${DEFAULT_SERVICE_TIME}` });
            }}
            disabled={checkInPending}
            fieldHint={H.check_in_date}
          />
          <AppTimePicker
            label="Time"
            value={localTimePart(checkInForm.check_in_at)}
            onChange={(e) => {
              const t = e.target.value;
              const date = localDatePart(checkInForm.check_in_at);
              if (!date) return;
              onCheckInFormChange({ check_in_at: t ? `${date}T${t}` : `${date}T` });
            }}
            disabled={checkInPending || !localDatePart(checkInForm.check_in_at)}
            fieldHint={H.check_in_time}
          />
          <AppInput
            label="Odometer reading"
            type="number"
            min={0}
            value={checkInForm.odometer_reading}
            onChange={(e) => onCheckInFormChange({ odometer_reading: e.target.value })}
            fieldHint={H.odometer_reading}
          />
          <AppInput
            label="Hours reading"
            type="number"
            min={0}
            step="0.1"
            value={checkInForm.hours_reading}
            onChange={(e) => onCheckInFormChange({ hours_reading: e.target.value })}
            fieldHint={H.hours_reading}
          />
        </div>
      </AppFormModal>

      <AppFormModal
        open={showCheckOut}
        onClose={onCloseCheckOut}
        title="End service"
        description="Check-out records when work finished. Optional final odometer and hours readings are saved on the work order."
        formWidth="comfortable"
        quickInfo={END_SERVICE_QUICK_INFO}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onCloseCheckOut} disabled={checkOutPending}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={onSubmitCheckOut} loading={checkOutPending}>
              {checkOutPending ? 'Finishing…' : 'Finish service'}
            </AppButton>
          </div>
        }
      >
        <div className={uiLayout.sectionGrid2}>
          <AppDatePicker
            label="Date"
            value={localDatePart(checkOutForm.check_out_at)}
            onChange={(e) => {
              const d = e.target.value;
              const time = localTimePart(checkOutForm.check_out_at);
              if (!d) {
                onCheckOutFormChange({ check_out_at: '' });
                return;
              }
              onCheckOutFormChange({ check_out_at: time ? `${d}T${time}` : `${d}T${DEFAULT_SERVICE_TIME}` });
            }}
            disabled={checkOutPending}
            fieldHint={H.check_out_date}
          />
          <AppTimePicker
            label="Time"
            value={localTimePart(checkOutForm.check_out_at)}
            onChange={(e) => {
              const t = e.target.value;
              const date = localDatePart(checkOutForm.check_out_at);
              if (!date) return;
              onCheckOutFormChange({ check_out_at: t ? `${date}T${t}` : `${date}T` });
            }}
            disabled={checkOutPending || !localDatePart(checkOutForm.check_out_at)}
            fieldHint={H.check_out_time}
          />
          <AppInput
            label="Odometer reading"
            type="number"
            min={0}
            value={checkOutForm.odometer_reading}
            onChange={(e) => onCheckOutFormChange({ odometer_reading: e.target.value })}
            fieldHint={H.odometer_reading}
          />
          <AppInput
            label="Hours reading"
            type="number"
            min={0}
            step="0.1"
            value={checkOutForm.hours_reading}
            onChange={(e) => onCheckOutFormChange({ hours_reading: e.target.value })}
            fieldHint={H.hours_reading}
          />
        </div>
      </AppFormModal>

      <AppFormModal
        open={showEditStatus}
        onClose={onCloseEditStatus}
        title="Edit status"
        description="Choose a new status for this work order."
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={onCloseEditStatus}
              disabled={statusUpdatePending}
            >
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={onApplyStatusEdit} loading={statusUpdatePending}>
              {statusUpdatePending ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        <AppSelect
          label="Status"
          value={statusEditDraft}
          onChange={(e) => onStatusEditDraftChange(e.target.value)}
          options={statusSelectOptions}
          disabled={statusUpdatePending}
        />
      </AppFormModal>

      <AppFormModal
        open={showStatusReason}
        onClose={onCloseStatusReason}
        title="Cancellation reason"
        description="Provide a reason to change this work order to cancelled."
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onCloseStatusReason}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              onClick={onConfirmStatusReason}
              disabled={statusReasonPending || !statusReason.trim()}
              loading={statusReasonPending}
            >
              {statusReasonPending ? 'Saving…' : 'Confirm'}
            </AppButton>
          </div>
        }
      >
        <AppTextarea
          label="Reason"
          value={statusReason}
          onChange={(e) => onStatusReasonChange(e.target.value)}
          rows={5}
          placeholder="Reason for cancellation…"
        />
      </AppFormModal>

      <AppFormModal
        open={showReopen}
        onClose={onCloseReopen}
        title="Reopen work order"
        description="Explain why this work order is being reopened to pending."
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onCloseReopen}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              onClick={onSubmitReopen}
              disabled={reopenPending || !reopenReason.trim()}
              loading={reopenPending}
            >
              {reopenPending ? 'Reopening…' : 'Reopen'}
            </AppButton>
          </div>
        }
      >
        <AppTextarea
          label="Reason for reopen"
          value={reopenReason}
          onChange={(e) => onReopenReasonChange(e.target.value)}
          rows={5}
          placeholder="Reason for reopen…"
        />
      </AppFormModal>
    </>
  );
}
