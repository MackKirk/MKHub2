import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import {
  AppButton,
  AppFormModal,
  FORM_MODAL_WIDE_DIALOG_COLLAPSED,
  FORM_MODAL_WIDE_DIALOG_EXPANDED,
  uiCx,
  uiLayout,
} from '@/components/ui';
import {
  buildEmptyFleetAssetForm,
  FleetAssetFormFields,
  fleetAssetFormCanSubmit,
  fleetAssetFormToPayload,
  type FleetAssetFormValues,
} from './FleetAssetFormFields';

type NewFleetAssetModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: (data: { id: string }) => void;
  initialAssetType?: string;
};

export default function NewFleetAssetModal({
  open,
  onClose,
  onSuccess,
  initialAssetType = 'vehicle',
}: NewFleetAssetModalProps) {
  const [form, setForm] = useState<FleetAssetFormValues>(() => buildEmptyFleetAssetForm(initialAssetType));

  useEffect(() => {
    if (!open) return;
    setForm(buildEmptyFleetAssetForm(initialAssetType));
  }, [open, initialAssetType]);

  const updateField = (field: keyof FleetAssetFormValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const createMutation = useMutation({
    mutationFn: async () => api<{ id: string }>('POST', '/fleet/assets', fleetAssetFormToPayload(form)),
    onSuccess: (data) => {
      toast.success('Asset created successfully');
      onSuccess(data);
      onClose();
    },
    onError: (error: { message?: string }) => {
      toast.error(error?.message || 'Failed to create asset');
    },
  });

  const canSubmit = fleetAssetFormCanSubmit(form) && !createMutation.isPending;

  const handleSubmit = () => {
    if (fleetAssetFormCanSubmit(form)) createMutation.mutate();
  };

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title="New Asset"
      description="Create a new fleet asset"
      formWidth="wide"
      dialogClassName={FORM_MODAL_WIDE_DIALOG_COLLAPSED}
      dialogClassNameExpanded={FORM_MODAL_WIDE_DIALOG_EXPANDED}
      quickInfo={
        <>
          <p>Add a vehicle, heavy machinery, or other fleet asset.</p>
          <p>Asset type is required; fill at least one other field before saving.</p>
          <p>After creation you will open the asset detail page.</p>
        </>
      }
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={createMutation.isPending}>
            Cancel
          </AppButton>
          <AppButton
            type="button"
            size="sm"
            disabled={!canSubmit}
            loading={createMutation.isPending}
            onClick={handleSubmit}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Asset'}
          </AppButton>
        </div>
      }
    >
      <FleetAssetFormFields
        formId="fleet-new-asset-modal-form"
        values={form}
        onChange={updateField}
        onSubmit={handleSubmit}
      />
    </AppFormModal>
  );
}
