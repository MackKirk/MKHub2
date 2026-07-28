import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { WARRANTY_FIELD_HINTS as H } from '@/lib/warrantyFieldHints';
import { AppButton, AppFormModal, AppTextarea, uiCx, uiLayout } from '@/components/ui';

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  claimId: string;
  claimNumber: string;
  onSuccess: () => void;
};

export default function WarrantyClaimCancelModal({
  open,
  onClose,
  projectId,
  claimId,
  claimNumber,
  onSuccess,
}: Props) {
  const [reason, setReason] = useState('');

  const cancelMutation = useMutation({
    mutationFn: () =>
      api('POST', `/projects/${projectId}/warranty-claims/${claimId}/cancel`, {
        cancelled_reason: reason.trim(),
      }),
    onSuccess: () => {
      toast.success('Claim cancelled');
      setReason('');
      onSuccess();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to cancel claim'),
  });

  const handleClose = () => {
    if (cancelMutation.isPending) return;
    setReason('');
    onClose();
  };

  const canSubmit = reason.trim().length > 0;

  return (
    <AppFormModal
      open={open}
      onClose={handleClose}
      title="Cancel claim"
      description={`Provide a reason for cancelling ${claimNumber}.`}
      overlayClassName="z-[200]"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={handleClose} disabled={cancelMutation.isPending}>
            Back
          </AppButton>
          <AppButton
            type="button"
            size="sm"
            variant="danger"
            disabled={!canSubmit || cancelMutation.isPending}
            loading={cancelMutation.isPending}
            onClick={() => {
              if (canSubmit) cancelMutation.mutate();
            }}
          >
            Cancel claim
          </AppButton>
        </div>
      }
    >
      <AppTextarea
        label={
          <>
            Cancellation reason <span className="text-brand-red">*</span>
          </>
        }
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={4}
        disabled={cancelMutation.isPending}
        fieldHint={H.claim_cancel_reason}
      />
    </AppFormModal>
  );
}
