import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { fleetAssetsToComboboxOptions, fetchAllFleetAssetsAlphabetical } from '@/lib/fleetAssetPicker';
import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';
import {
  WorkOrderListNewFormFields,
  type WorkOrderListNewFormValues,
} from '@/components/fleet/WorkOrderListNewFormFields';
import {
  AppButton,
  AppFormModal,
  uiCx,
  uiLayout,
} from '@/components/ui';

const FORM_ID = 'work-order-list-new-form';

const QUICK_INFO = formModalQuickInfo({
  purpose: <>Create a work order for a fleet asset or equipment.</>,
  howToUse: (
    <>
      Choose {uiLabel('Entity type')}, link a {uiLabel('Vehicle')} when applicable, and describe the work. Set a{' '}
      {uiLabel('Scheduled date')} to show fleet work on the schedule calendar.
    </>
  ),
  actions: (
    <>
      {uiLabel('Create work order')} saves and opens the work order detail. {uiLabel('Cancel')} closes without saving.
    </>
  ),
});

export type WorkOrderListNewModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (data: { id: string }) => void;
};

function buildInitialForm(): WorkOrderListNewFormValues {
  return {
    entity_type: 'fleet',
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
    labor_cost: '',
    parts_cost: '',
    other_cost: '',
  };
}

export default function WorkOrderListNewModal({ open, onClose, onCreated }: WorkOrderListNewModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<WorkOrderListNewFormValues>(buildInitialForm);

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
    enabled: open && form.entity_type === 'fleet',
    staleTime: 60_000,
  });

  const vehicleOptions = useMemo(() => fleetAssetsToComboboxOptions(assets), [assets]);

  const updateField = (field: keyof WorkOrderListNewFormValues, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const costs: Record<string, number> = {};
      if (form.labor_cost) costs.labor = parseFloat(form.labor_cost);
      if (form.parts_cost) costs.parts = parseFloat(form.parts_cost);
      if (form.other_cost) costs.other = parseFloat(form.other_cost);
      if (Object.keys(costs).length > 0) {
        costs.total = (costs.labor || 0) + (costs.parts || 0) + (costs.other || 0);
      }

      const payload: Record<string, unknown> = {
        entity_type: form.entity_type,
        entity_id: form.entity_type === 'fleet' ? form.entity_id : form.entity_id || null,
        description: form.description.trim(),
        category: form.category,
        urgency: form.urgency,
        status: 'open',
        assigned_to_user_id: form.assigned_to_user_id || null,
        costs: Object.keys(costs).length > 0 ? costs : null,
        origin_source: 'manual',
      };

      if (form.entity_type === 'fleet') {
        if (form.scheduled_date) {
          const dateTime = form.scheduled_time
            ? `${form.scheduled_date}T${form.scheduled_time}:00`
            : `${form.scheduled_date}T09:00:00`;
          payload.scheduled_start_at = new Date(dateTime).toISOString();
        }
        if (form.estimated_duration_minutes) {
          payload.estimated_duration_minutes = parseInt(form.estimated_duration_minutes, 10);
        }
        payload.body_repair_required = form.body_repair_required;
        payload.new_stickers_applied = form.new_stickers_applied;
      }

      return api<{ id: string }>('POST', '/fleet/work-orders', payload);
    },
    onSuccess: (data) => {
      toast.success('Work order created successfully');
      queryClient.invalidateQueries({ queryKey: ['workOrders'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-work-orders-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders', 'open'] });
      onCreated(data);
      onClose();
    },
    onError: () => {
      toast.error('Failed to create work order');
    },
  });

  const fleetVehicleRequired = form.entity_type === 'fleet';
  const hasFleetVehicle = Boolean(form.entity_id.trim());
  const canSubmit =
    form.description.trim().length > 0 && (!fleetVehicleRequired || hasFleetVehicle);
  const submitDisabled = !canSubmit || createMutation.isPending || (fleetVehicleRequired && assetsLoading);

  const handleSubmit = () => {
    if (canSubmit) createMutation.mutate();
  };

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title="New work order"
      description="Select entity type and details. Fleet work orders can include a scheduled date for the calendar."
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
      <WorkOrderListNewFormFields
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
