import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { fleetAssetsToComboboxOptions, fetchAllFleetAssetsAlphabetical } from '@/lib/fleetAssetPicker';
import { equipmentToComboboxOptions, fetchAllEquipmentAlphabetical } from '@/lib/equipmentPicker';
import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';
import type { WorkOrderListScope } from '@/lib/workOrderPaths';
import { invalidateEquipmentAfterWorkOrderChange } from '@/lib/equipmentWorkOrderSync';
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

function buildQuickInfo(scope: WorkOrderListScope) {
  if (scope === 'equipment') {
    return formModalQuickInfo({
      purpose: <>Create a work order for a company equipment item.</>,
      howToUse: (
        <>
          Link {uiLabel('Equipment')} and describe the work. Costs can be added after the work order is created.
        </>
      ),
      actions: (
        <>
          {uiLabel('Create work order')} saves and opens the work order detail. {uiLabel('Cancel')} closes without
          saving.
        </>
      ),
    });
  }
  return formModalQuickInfo({
    purpose: <>Create a work order for a fleet asset.</>,
    howToUse: (
      <>
        Link a {uiLabel('Vehicle')} and describe the work. Set a {uiLabel('Scheduled date')} to show fleet work on the
        schedule calendar.
      </>
    ),
    actions: (
      <>
        {uiLabel('Create work order')} saves and opens the work order detail. {uiLabel('Cancel')} closes without saving.
      </>
    ),
  });
}

export type WorkOrderListNewModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (data: { id: string }) => void;
  canAssign?: boolean;
  entityScope?: WorkOrderListScope;
};

function buildInitialForm(entityScope: WorkOrderListScope): WorkOrderListNewFormValues {
  return {
    entity_type: entityScope,
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

export default function WorkOrderListNewModal({
  open,
  onClose,
  onCreated,
  canAssign = true,
  entityScope = 'fleet',
}: WorkOrderListNewModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<WorkOrderListNewFormValues>(() => buildInitialForm(entityScope));

  useEffect(() => {
    if (!open) setForm(buildInitialForm(entityScope));
  }, [open, entityScope]);

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
    enabled: open && entityScope === 'fleet',
    staleTime: 60_000,
  });

  const {
    data: equipment = [],
    isLoading: equipmentLoading,
    isError: equipmentError,
    refetch: refetchEquipment,
  } = useQuery({
    queryKey: ['equipmentWorkOrderPicker'],
    queryFn: fetchAllEquipmentAlphabetical,
    enabled: open && entityScope === 'equipment',
    staleTime: 60_000,
  });

  const vehicleOptions = useMemo(() => fleetAssetsToComboboxOptions(assets), [assets]);
  const equipmentOptions = useMemo(() => equipmentToComboboxOptions(equipment), [equipment]);

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
        entity_type: entityScope,
        entity_id: form.entity_id,
        description: form.description.trim(),
        category: form.category,
        urgency: form.urgency,
        status: 'open',
        assigned_to_user_id: canAssign ? form.assigned_to_user_id || null : null,
        costs: Object.keys(costs).length > 0 ? costs : null,
        origin_source: 'manual',
      };

      if (entityScope === 'fleet') {
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
      if (entityScope === 'equipment' && form.entity_id) {
        invalidateEquipmentAfterWorkOrderChange(queryClient, form.entity_id);
        queryClient.invalidateQueries({ queryKey: ['equipmentWorkOrders', form.entity_id] });
      }
      onCreated(data);
      onClose();
    },
    onError: () => {
      toast.error('Failed to create work order');
    },
  });

  const hasLinkedEntity = Boolean(form.entity_id.trim());
  const pickerLoading = entityScope === 'fleet' ? assetsLoading : equipmentLoading;
  const canSubmit = form.description.trim().length > 0 && hasLinkedEntity;
  const submitDisabled = !canSubmit || createMutation.isPending || pickerLoading;

  const handleSubmit = () => {
    if (canSubmit) createMutation.mutate();
  };

  const description =
    entityScope === 'equipment'
      ? 'Select equipment and describe the work needed.'
      : 'Select a fleet asset and details. Fleet work orders can include a scheduled date for the calendar.';

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title="New work order"
      description={description}
      formWidth="comfortable"
      quickInfo={buildQuickInfo(entityScope)}
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
        lockedEntityType={entityScope}
        vehicleOptions={vehicleOptions}
        vehicleLoading={assetsLoading}
        vehicleError={assetsError}
        onRetryVehicles={() => refetchAssets()}
        equipmentOptions={equipmentOptions}
        equipmentLoading={equipmentLoading}
        equipmentError={equipmentError}
        onRetryEquipment={() => refetchEquipment()}
        disabled={createMutation.isPending}
        canAssign={canAssign}
        onChange={updateField}
        onSubmit={handleSubmit}
      />
    </AppFormModal>
  );
}
