import { WORK_ORDER_STATUS_OPTIONS } from '@/lib/fleetBadges';
import {
  AppButton,
  AppFormModal,
  AppInput,
  AppSelect,
  AppTextarea,
  uiCx,
  uiLayout,
} from '@/components/ui';

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
          <div className="sm:col-span-2">
            <AppInput
              label="Check-in time"
              type="datetime-local"
              value={checkInForm.check_in_at}
              onChange={(e) => onCheckInFormChange({ check_in_at: e.target.value })}
            />
          </div>
          <AppInput
            label="Odometer reading"
            type="number"
            min={0}
            value={checkInForm.odometer_reading}
            onChange={(e) => onCheckInFormChange({ odometer_reading: e.target.value })}
          />
          <AppInput
            label="Hours reading"
            type="number"
            min={0}
            step="0.1"
            value={checkInForm.hours_reading}
            onChange={(e) => onCheckInFormChange({ hours_reading: e.target.value })}
          />
        </div>
      </AppFormModal>

      <AppFormModal
        open={showCheckOut}
        onClose={onCloseCheckOut}
        title="End service"
        description="Check-out records when work finished. Optional final odometer and hours readings are saved on the work order."
        formWidth="comfortable"
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
          <AppInput
            label="Check-out time"
            type="datetime-local"
            value={checkOutForm.check_out_at}
            onChange={(e) => onCheckOutFormChange({ check_out_at: e.target.value })}
          />
          <AppInput
            label="Odometer reading"
            type="number"
            min={0}
            value={checkOutForm.odometer_reading}
            onChange={(e) => onCheckOutFormChange({ odometer_reading: e.target.value })}
          />
          <div className="sm:col-span-2">
            <AppInput
              label="Hours reading"
              type="number"
              min={0}
              step="0.1"
              value={checkOutForm.hours_reading}
              onChange={(e) => onCheckOutFormChange({ hours_reading: e.target.value })}
            />
          </div>
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
