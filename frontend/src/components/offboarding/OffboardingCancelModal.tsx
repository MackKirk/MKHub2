import { useState } from 'react';
import { AppButton, AppCheckbox, AppModal, AppTextarea } from '@/components/ui';

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (opts: { clearTerminationDate: boolean; reactivateHubAccess: boolean; reason: string }) => void;
  loading?: boolean;
};

export default function OffboardingCancelModal({ open, onClose, onConfirm, loading }: Props) {
  const [clearTerminationDate, setClearTerminationDate] = useState(false);
  const [reactivateHubAccess, setReactivateHubAccess] = useState(false);
  const [reason, setReason] = useState('');

  const handleClose = () => {
    setClearTerminationDate(false);
    setReactivateHubAccess(false);
    setReason('');
    onClose();
  };

  return (
    <AppModal open={open} onClose={handleClose} title="Cancel Offboarding" size="md">
      <div className="space-y-4 text-sm text-gray-700">
        <p>
          This will mark the offboarding case as cancelled. No employee data will change unless you
          explicitly select the options below.
        </p>

        <label className="flex items-start gap-2 cursor-pointer">
          <AppCheckbox checked={clearTerminationDate} onChange={setClearTerminationDate} />
          <span>Clear employee termination date</span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <AppCheckbox checked={reactivateHubAccess} onChange={setReactivateHubAccess} />
          <span>Reactivate Hub access</span>
        </label>

        <AppTextarea
          label="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
        />

        <div className="flex justify-end gap-2 pt-2">
          <AppButton variant="secondary" onClick={handleClose} disabled={loading}>
            Keep Case Open
          </AppButton>
          <AppButton variant="danger" onClick={() => onConfirm({ clearTerminationDate, reactivateHubAccess, reason })} disabled={loading}>
            {loading ? 'Cancelling…' : 'Cancel Offboarding'}
          </AppButton>
        </div>
      </div>
    </AppModal>
  );
}
