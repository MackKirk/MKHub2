import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import {
  FleetInspectionScheduleFormFields,
  type FleetInspectionScheduleFormValues,
} from '@/components/fleet/FleetInspectionScheduleFormFields';
import {
  AppButton,
  AppFormModal,
  uiCx,
  uiLayout,
} from '@/components/ui';

const FORM_ID = 'fleet-schedule-inspection-form';

type Props = {
  open: boolean;
  onClose: () => void;
  assetId: string;
  lockedVehicleDisplayName: string;
  onSuccess: () => void;
};

function buildInitialForm(assetId: string): FleetInspectionScheduleFormValues {
  return {
    fleet_asset_id: assetId.trim(),
    scheduled_at: formatDateLocal(new Date()),
    urgency: 'normal',
    category: 'inspection',
    notes: '',
  };
}

export default function ScheduleFleetInspectionModal({
  open,
  onClose,
  assetId,
  lockedVehicleDisplayName,
  onSuccess,
}: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FleetInspectionScheduleFormValues>(() => buildInitialForm(assetId));

  useEffect(() => {
    if (!open) return;
    setForm(buildInitialForm(assetId));
  }, [open, assetId]);

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
      queryClient.invalidateQueries({ queryKey: ['fleetAssetInspections', assetId] });
      onSuccess();
      onClose();
    },
    onError: () => {
      toast.error('Failed to schedule inspection');
    },
  });

  const canSubmit = form.fleet_asset_id.trim().length > 0 && form.scheduled_at.trim().length > 0;
  const submitDisabled = !canSubmit || createMutation.isPending;

  const handleSubmit = () => {
    if (canSubmit) createMutation.mutate();
  };

  const modalTitle = lockedVehicleDisplayName.trim()
    ? `Schedule inspection — ${lockedVehicleDisplayName.trim()}`
    : 'Schedule inspection';

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title={modalTitle}
      description="Creates the schedule and both Body and Mechanical inspections as pending. Open them from the calendar or inspection list when ready."
      formWidth="comfortable"
      quickInfo={
        <>
          <p>Scheduling creates pending Body and Mechanical inspections for this asset.</p>
          <p>Pick the planned date and optional urgency or notes.</p>
          <p>Complete each inspection from the fleet calendar or the Inspections tab when ready.</p>
        </>
      }
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
        vehicleMode="locked"
        lockedVehicleDisplayName={lockedVehicleDisplayName.trim() || assetId}
        disabled={createMutation.isPending}
        onChange={updateField}
        onSubmit={handleSubmit}
      />
    </AppFormModal>
  );
}
