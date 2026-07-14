import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { FLEET_WORK_ORDER_FIELD_HINTS as H } from '@/lib/fleetWorkOrderFieldHints';
import { WorkOrderAttachmentsPicker } from '@/components/fleet/WorkOrderAttachmentsPicker';
import {
  AppButton,
  AppFormModal,
  AppSelect,
  AppTextarea,
  AppUserSelect,
  uiCx,
  uiLayout,
  uiSpacing,
} from '@/components/ui';

const FORM_ID = 'fleet-new-work-order-form';

type FormValues = {
  description: string;
  category: string;
  urgency: string;
  assigned_to_user_id: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  assetId: string;
  assetDisplayName?: string;
  employees: unknown[];
  onSuccess: () => void;
  canAssign?: boolean;
};

function buildInitialForm(): FormValues {
  return {
    description: '',
    category: 'maintenance',
    urgency: 'normal',
    assigned_to_user_id: '',
  };
}

export default function NewFleetWorkOrderModal({
  open,
  onClose,
  assetId,
  assetDisplayName,
  employees,
  onSuccess,
  canAssign = true,
}: Props) {
  const [form, setForm] = useState<FormValues>(buildInitialForm);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(buildInitialForm());
    setPhotos([]);
    setUploading(false);
  }, [open]);

  const assignUsers = useMemo(
    () => (Array.isArray(employees) ? employees : []).map((e: any) => mapEmployeeToAppUserSelect(e)),
    [employees],
  );

  const updateField = (field: keyof FormValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        entity_type: 'fleet',
        entity_id: assetId,
        description: form.description.trim(),
        category: form.category,
        urgency: form.urgency,
        status: 'open',
        assigned_to_user_id: canAssign ? form.assigned_to_user_id || null : null,
        photos: photos.length > 0 ? photos : null,
        costs: { labor: [], parts: [], other: [], total: 0 },
        origin_source: 'manual',
      };
      return api('POST', '/fleet/work-orders', payload);
    },
    onSuccess: () => {
      toast.success('Work order created successfully');
      onSuccess();
      onClose();
    },
    onError: () => {
      toast.error('Failed to create work order');
    },
  });

  const submitDisabled = !form.description.trim() || createMutation.isPending || uploading;

  const handleSubmit = () => {
    if (form.description.trim()) createMutation.mutate();
  };

  const title = assetDisplayName?.trim()
    ? `New work order — ${assetDisplayName.trim()}`
    : 'New work order';

  const descriptionLabel: ReactNode = (
    <>
      Description / notes <span className="text-red-600">*</span>
    </>
  );

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title={title}
      description="Describe the work needed. Costs and invoice files can be added on the work order after it is created."
      formWidth="comfortable"
      quickInfo={
        <>
          <p>Create a work order linked to this fleet asset.</p>
          <p>Description is required. Assign a user now or leave unassigned.</p>
          <p>Add photos here or on the work order detail page after creation.</p>
          <p>Line-item costs and invoices are added from the work order detail page.</p>
        </>
      }
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={createMutation.isPending || uploading}
          >
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
      <form
        id={FORM_ID}
        className={uiSpacing.sectionStack}
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <div className={uiLayout.sectionGrid2}>
          <AppSelect
            label="Category"
            value={form.category}
            onChange={(e) => updateField('category', e.target.value)}
            disabled={createMutation.isPending || uploading}
            fieldHint={H.category}
            options={[
              { value: 'maintenance', label: 'Maintenance' },
              { value: 'repair', label: 'Repair' },
              { value: 'inspection', label: 'Inspection' },
              { value: 'other', label: 'Other' },
            ]}
          />
          <AppSelect
            label="Urgency"
            value={form.urgency}
            onChange={(e) => updateField('urgency', e.target.value)}
            disabled={createMutation.isPending || uploading}
            fieldHint={H.urgency}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'High' },
              { value: 'urgent', label: 'Urgent' },
            ]}
          />
          {canAssign ? (
            <AppUserSelect
              mode="single"
              label="Assigned to"
              users={assignUsers}
              value={form.assigned_to_user_id}
              onChange={(userId) => updateField('assigned_to_user_id', userId ?? '')}
              placeholder="Unassigned"
              disabled={createMutation.isPending || uploading}
              fieldHint={H.assigned_to}
            />
          ) : null}
        </div>

        <AppTextarea
          label={descriptionLabel}
          value={form.description}
          onChange={(e) => updateField('description', e.target.value)}
          rows={4}
          placeholder="Describe the issue, work needed, and any additional notes…"
          required
          disabled={createMutation.isPending || uploading}
          fieldHint={H.description}
        />

        <WorkOrderAttachmentsPicker
          fileIds={photos}
          onFileIdsChange={setPhotos}
          onUploadingChange={setUploading}
          disabled={createMutation.isPending || uploading}
        />

        <div className={uiCx('rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs text-gray-700')}>
          <strong className="font-medium text-gray-800">Tip:</strong> add line-item costs and invoices from the work
          order detail page after creation.
        </div>
      </form>
    </AppFormModal>
  );
}
