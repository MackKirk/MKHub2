import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { fleetAssetsToComboboxOptions, fetchAllFleetAssetsAlphabetical } from '@/lib/fleetAssetPicker';
import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';
import {
  FleetScheduleWorkOrderFormFields,
  type FleetScheduleWorkOrderFormValues,
} from '@/components/fleet/FleetScheduleWorkOrderFormFields';
import {
  AppButton,
  AppFormModal,
  uiCx,
  uiLayout,
} from '@/components/ui';

const FORM_ID = 'fleet-schedule-work-order-form';

const QUICK_INFO = formModalQuickInfo({
  purpose: <>Create a fleet work order from the calendar.</>,
  howToUse: (
    <>
      Select {uiLabel('Vehicle')}, describe the work, and optionally set {uiLabel('Scheduled date')} to show it on
      the calendar.
    </>
  ),
  actions: (
    <>
      {uiLabel('Create work order')} saves and opens the work order detail. {uiLabel('Cancel')} closes without
      saving.
    </>
  ),
});

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: (data: { id: string }) => void;
};

function buildInitialForm(): FleetScheduleWorkOrderFormValues {
  return {
    entity_id: '',
    description: '',
    category: 'maintenance',
    urgency: 'normal',
    assigned_to_user_id: '',
    scheduled_date: '',
    scheduled_time: '',
    estimated_duration_minutes: '',
    body_repair_required: false,
    new_stickers_applied: false,
  };
}

export default function FleetScheduleWorkOrderModal({ open, onClose, onSuccess }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FleetScheduleWorkOrderFormValues>(buildInitialForm);

  useEffect(() => {
    if (!open) setForm(buildInitialForm());
  }, [open]);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<unknown[]>('GET', '/employees'),
    enabled: open,
  });

  const {
    data: assets = [],
    isLoading: assetsLoading,
    isError: assetsError,
    refetch: refetchAssets,
  } = useQuery({
    queryKey: ['fleetAssetsSchedulePicker'],
    queryFn: fetchAllFleetAssetsAlphabetical,
    enabled: open,
    staleTime: 60_000,
  });

  const vehicleOptions = useMemo(() => fleetAssetsToComboboxOptions(assets), [assets]);

  const updateField = (field: keyof FleetScheduleWorkOrderFormValues, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        entity_type: 'fleet',
        entity_id: form.entity_id,
        description: form.description.trim(),
        category: form.category,
        urgency: form.urgency,
        status: 'open',
        assigned_to_user_id: form.assigned_to_user_id || null,
        origin_source: 'manual',
        body_repair_required: form.body_repair_required,
        new_stickers_applied: form.new_stickers_applied,
      };

      if (form.scheduled_date) {
        const dateTime = form.scheduled_time
          ? `${form.scheduled_date}T${form.scheduled_time}:00`
          : `${form.scheduled_date}T09:00:00`;
        payload.scheduled_start_at = new Date(dateTime).toISOString();
      }
      if (form.estimated_duration_minutes) {
        payload.estimated_duration_minutes = parseInt(form.estimated_duration_minutes, 10);
      }

      return api<{ id: string }>('POST', '/fleet/work-orders', payload);
    },
    onSuccess: (data) => {
      toast.success('Work order created successfully');
      queryClient.invalidateQueries({ queryKey: ['fleet-work-orders-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['workOrders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders', 'open'] });
      onSuccess(data);
      onClose();
    },
    onError: () => {
      toast.error('Failed to create work order');
    },
  });

  const canSubmit =
    form.description.trim().length > 0 && form.entity_id.trim().length > 0;
  const submitDisabled = !canSubmit || createMutation.isPending || assetsLoading;

  const handleSubmit = () => {
    if (canSubmit) createMutation.mutate();
  };

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title="New work order"
      description="Select a vehicle, then add details. Appears on the schedule when a service date is set."
      formWidth="comfortable"
      quickInfo={QUICK_INFO}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={createMutation.isPending}>
            Cancel
          </AppButton>
          <AppButton
            type="submit"
            form={FORM_ID}
            size="sm"
            disabled={submitDisabled}
            loading={createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating…' : 'Create work order'}
          </AppButton>
        </div>
      }
    >
      <FleetScheduleWorkOrderFormFields
        formId={FORM_ID}
        values={form}
        employees={employees}
        vehicleOptions={vehicleOptions}
        vehicleLoading={assetsLoading}
        vehicleError={assetsError}
        onRetryVehicles={() => refetchAssets()}
        disabled={createMutation.isPending}
        onChange={updateField}
        onSubmit={handleSubmit}
      />
    </AppFormModal>
  );
}
