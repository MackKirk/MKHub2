import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  AppButton,
  AppCard,
  AppPageHeader,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { Truck } from 'lucide-react';
import {
  buildEmptyFleetAssetForm,
  FleetAssetFormFields,
  fleetAssetFormCanSubmit,
  fleetAssetFormToPayload,
  type FleetAssetFormValues,
} from '@/components/fleet/FleetAssetFormFields';

export type FleetAssetNewFormProps = {
  initialAssetType: string;
  onSuccess: (data: { id: string }) => void;
  onCancel: () => void;
  /** When provided (e.g. in modal), parent will render footer; this form only renders content and reports canSubmit/isPending */
  onValidationChange?: (canSubmit: boolean, isPending: boolean) => void;
  formId?: string;
};

export function FleetAssetNewForm({
  initialAssetType,
  onSuccess,
  onCancel,
  onValidationChange,
  formId = 'fleet-new-asset-form',
}: FleetAssetNewFormProps) {
  const [form, setForm] = useState<FleetAssetFormValues>(() => buildEmptyFleetAssetForm(initialAssetType));

  const updateField = (field: keyof FleetAssetFormValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const createMutation = useMutation({
    mutationFn: async () => api('POST', '/fleet/assets', fleetAssetFormToPayload(form)),
    onSuccess: (data: { id: string }) => {
      toast.success('Asset created successfully');
      onSuccess(data);
    },
    onError: (error: { message?: string }) => {
      toast.error(error?.message || 'Failed to create asset');
    },
  });

  const canSubmit = fleetAssetFormCanSubmit(form);

  useEffect(() => {
    onValidationChange?.(canSubmit, createMutation.isPending);
  }, [canSubmit, createMutation.isPending, onValidationChange]);

  const handleSubmit = () => {
    if (canSubmit) createMutation.mutate();
  };

  return (
    <>
      <FleetAssetFormFields
        formId={formId}
        values={form}
        onChange={updateField}
        onSubmit={handleSubmit}
      />
      {!onValidationChange ? (
        <div className={uiCx(uiLayout.actionsRow, 'mt-4 justify-end border-t border-gray-100 pt-4')}>
          <AppButton type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </AppButton>
          <AppButton type="submit" form={formId} disabled={!canSubmit || createMutation.isPending} loading={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Asset'}
          </AppButton>
        </div>
      ) : null}
    </>
  );
}

export default function FleetAssetNew() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const assetType = searchParams.get('type') || 'vehicle';

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title={`New ${assetType.replace('_', ' ')}`}
        subtitle="Create a new fleet asset"
        icon={<Truck className="h-4 w-4" />}
        onBack={() => nav(-1)}
        backLabel="Back"
      />
      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <FleetAssetNewForm
          initialAssetType={assetType}
          onSuccess={(data) => nav(`/fleet/assets/${data.id}`)}
          onCancel={() => nav(-1)}
        />
      </AppCard>
    </div>
  );
}
