import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppHeroEditButton,
  AppSectionHeader,
  AppTextarea,
  appSectionPresetProps,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const EM_DASH = '—';

function ReadOnlyField({ label, value }: { label: ReactNode; value?: ReactNode }) {
  const display =
    value === null || value === undefined || (typeof value === 'string' && !String(value).trim())
      ? EM_DASH
      : value;
  return (
    <div className="space-y-1">
      <div className={uiTypography.controlLabel}>{label}</div>
      <div className={uiCx(uiTypography.helper, 'break-words font-medium text-gray-900')}>{display}</div>
    </div>
  );
}

type WorkOrderGeneral = {
  description: string;
  entity_type: string;
  scheduled_start_at?: string | null;
  estimated_duration_minutes?: number | null;
  body_repair_required?: boolean;
  new_stickers_applied?: boolean;
  check_in_at?: string | null;
  check_out_at?: string | null;
  origin_source?: string | null;
  origin_id?: string | null;
};

type Props = {
  workOrder: WorkOrderGeneral;
  canEditDescription: boolean;
  descriptionEditing: boolean;
  descriptionDraft: string;
  descriptionSavePending: boolean;
  onStartEditDescription: () => void;
  onCancelEditDescription: () => void;
  onDescriptionDraftChange: (value: string) => void;
  onSaveDescription: () => void;
  onNavigateInspection: (inspectionId: string) => void;
};

function WorkOrderGeneralTab({
  workOrder,
  canEditDescription,
  descriptionEditing,
  descriptionDraft,
  descriptionSavePending,
  onStartEditDescription,
  onCancelEditDescription,
  onDescriptionDraftChange,
  onSaveDescription,
  onNavigateInspection,
}: Props) {
  const scheduledDate = workOrder.scheduled_start_at
    ? new Date(workOrder.scheduled_start_at).toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;
  const scheduledTime = workOrder.scheduled_start_at
    ? new Date(workOrder.scheduled_start_at).toLocaleTimeString('en-CA', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
  const durationLabel =
    workOrder.estimated_duration_minutes != null
      ? `${Math.floor(workOrder.estimated_duration_minutes / 60)}h ${workOrder.estimated_duration_minutes % 60}min`
      : undefined;

  return (
    <div className={uiSpacing.sectionStack}>
      <AppCard>
        <AppSectionHeader
          title="Description"
          description="Work order details and notes."
          {...appSectionPresetProps('description')}
          action={
            canEditDescription && !descriptionEditing ? (
              <AppHeroEditButton title="Edit description" onClick={onStartEditDescription} />
            ) : undefined
          }
        />
        {descriptionEditing ? (
          <div className="mt-4 space-y-3">
            <AppTextarea
              value={descriptionDraft}
              onChange={(e) => onDescriptionDraftChange(e.target.value)}
              rows={5}
              placeholder="Description…"
            />
            <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={onCancelEditDescription}
                disabled={descriptionSavePending}
              >
                Cancel
              </AppButton>
              <AppButton type="button" size="sm" onClick={onSaveDescription} loading={descriptionSavePending}>
                {descriptionSavePending ? 'Saving…' : 'Save'}
              </AppButton>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className={uiCx(uiTypography.helper, 'whitespace-pre-wrap font-medium text-gray-900')}>
              {workOrder.description?.trim() ? workOrder.description : EM_DASH}
            </div>
            {workOrder.origin_source === 'inspection' && workOrder.origin_id ? (
              <Link
                to={`/fleet/inspections/${workOrder.origin_id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigateInspection(workOrder.origin_id!);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-red hover:underline"
              >
                View originating inspection
              </Link>
            ) : null}
          </div>
        )}
      </AppCard>

      {workOrder.entity_type === 'fleet' ? (
        <AppCard>
          <AppSectionHeader
            title="Service / Shop"
            description="Scheduling, shop flags, and check-in/out times."
            {...appSectionPresetProps('timesheet')}
          />
          <div className={uiCx('mt-4 grid gap-4 md:grid-cols-2')}>
            <ReadOnlyField label="Scheduled date" value={scheduledDate} />
            <ReadOnlyField label="Scheduled time" value={scheduledTime} />
            <ReadOnlyField label="Expected duration" value={durationLabel} />
            <div className="space-y-1">
              <div className={uiTypography.controlLabel}>Body repair required</div>
              <AppBadge variant={workOrder.body_repair_required ? 'warning' : 'neutral'}>
                {workOrder.body_repair_required ? 'Yes' : 'No'}
              </AppBadge>
            </div>
            <div className="space-y-1">
              <div className={uiTypography.controlLabel}>New decals required</div>
              <AppBadge variant={workOrder.new_stickers_applied ? 'info' : 'neutral'}>
                {workOrder.new_stickers_applied ? 'Yes' : 'No'}
              </AppBadge>
            </div>
            <ReadOnlyField
              label="Check-in"
              value={
                workOrder.check_in_at
                  ? new Date(workOrder.check_in_at).toLocaleString('en-CA', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })
                  : undefined
              }
            />
            <ReadOnlyField
              label="Check-out"
              value={
                workOrder.check_out_at
                  ? new Date(workOrder.check_out_at).toLocaleString('en-CA', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })
                  : undefined
              }
            />
          </div>
        </AppCard>
      ) : null}
    </div>
  );
}

export { WorkOrderGeneralTab };
