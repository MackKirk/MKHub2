import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import {
  FleetInspectionScheduleFormFields,
  type FleetInspectionScheduleFormValues,
} from '@/components/fleet/FleetInspectionScheduleFormFields';
import { fleetAssetsToComboboxOptions, fetchAllFleetAssetsAlphabetical } from '@/lib/fleetAssetPicker';
import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppFormModal,
  uiCx,
  uiLayout,
} from '@/components/ui';

const FORM_ID = 'fleet-schedule-inspection-calendar-form';

const QUICK_INFO = formModalQuickInfo({
  purpose: <>Schedule an inspection for a fleet vehicle from the calendar.</>,
  howToUse: (
    <>
      Select {uiLabel('Vehicle')} and {uiLabel('Date')}, then set urgency, category, and optional notes.
    </>
  ),
  actions: (
    <>
      {uiLabel('Schedule inspection')} creates pending Body and Mechanical inspections. {uiLabel('Cancel')} closes
      without saving.
    </>
  ),
});

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

function buildInitialForm(): FleetInspectionScheduleFormValues {
  return {
    fleet_asset_id: '',
    scheduled_at: formatDateLocal(new Date()),
    urgency: 'normal',
    category: 'inspection',
    notes: '',
  };
}

export default function FleetScheduleInspectionModal({ open, onClose, onSuccess }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FleetInspectionScheduleFormValues>(buildInitialForm);

  useEffect(() => {
    if (!open) setForm(buildInitialForm());
  }, [open]);

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

  const updateField = (field: keyof FleetInspectionScheduleFormValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        fleet_asset_id: form.fleet_asset_id,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        urgency: form.urgency,
        category: form.category,
        notes: form.notes.trim() || null,
      };
      return api<{ id: string }>('POST', '/fleet/inspection-schedules', payload);
    },
    onSuccess: () => {
      toast.success('Inspection scheduled successfully');
      queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-inspection-schedules-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['inspections'] });
      queryClient.invalidateQueries({ queryKey: ['inspections-sidebar'] });
      onSuccess();
      onClose();
    },
    onError: () => {
      toast.error('Failed to schedule inspection');
    },
  });

  const canSubmit = form.fleet_asset_id.trim().length > 0 && form.scheduled_at.trim().length > 0;
  const submitDisabled = !canSubmit || createMutation.isPending || assetsLoading;

  const handleSubmit = () => {
    if (canSubmit) createMutation.mutate();
  };

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title="Schedule inspection"
      description="Creates the schedule and both Body and Mechanical inspections as pending. Open them from the calendar when ready."
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
            {createMutation.isPending ? 'Scheduling…' : 'Schedule inspection'}
          </AppButton>
        </div>
      }
    >
      <FleetInspectionScheduleFormFields
        formId={FORM_ID}
        values={form}
        vehicleMode="picker"
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
