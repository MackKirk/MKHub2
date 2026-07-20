import type { ReactNode } from 'react';
import { withFileAccessToken } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import {
  formatEquipmentStatus,
  getEquipmentAssignmentBadgeVariant,
  getEquipmentStatusBadgeVariant,
} from '@/lib/equipmentUi';
import type { EquipmentGeneralEditSection } from '@/components/companyAssets/EditEquipmentGeneralModal';
import {
  AppBadge,
  AppCard,
  AppHeroEditButton,
  AppSectionHeader,
  appSectionPresetProps,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const EM_DASH = '\u2014';

type Equipment = {
  category: string;
  name: string;
  unit_number?: string;
  serial_number?: string;
  brand?: string;
  model?: string;
  value?: number;
  warranty_expiry?: string;
  purchase_date?: string;
  status: string;
  photos?: string[];
  notes?: string;
};

type OpenAssignment = {
  assigned_to_name?: string;
  assigned_to_user_id?: string;
  assigned_at: string;
  department_snapshot?: string;
};

function ReadOnlyField({ label, value }: { label: ReactNode; value?: ReactNode }) {
  const display =
    value === null || value === undefined || (typeof value === 'string' && !value.trim()) ? EM_DASH : value;
  return (
    <div className="space-y-1">
      <div className={uiTypography.controlLabel}>{label}</div>
      <div className={uiCx(uiTypography.helper, 'break-words font-medium text-gray-900')}>{display}</div>
    </div>
  );
}

type Props = {
  equipment: Equipment;
  openAssignment: OpenAssignment | undefined;
  employeeName?: string;
  canEdit?: boolean;
  onEditSection: (section: EquipmentGeneralEditSection) => void;
};

export function EquipmentGeneralTab({
  equipment,
  openAssignment,
  employeeName,
  canEdit = true,
  onEditSection,
}: Props) {
  const categoryLabel = equipment.category?.replace(/_/g, ' ') || EM_DASH;

  return (
    <div className={uiSpacing.sectionStack}>
      <AppCard>
        <AppSectionHeader
          title="Basic Information"
          description="Identity, identification, and operational status."
          {...appSectionPresetProps('basicInformation')}
          action={
            canEdit ? (
              <AppHeroEditButton title="Edit Basic Information" onClick={() => onEditSection('basic')} />
            ) : undefined
          }
        />
        <div className={uiCx('mt-4 grid gap-4 md:grid-cols-2')}>
          <ReadOnlyField label="Name" value={equipment.name} />
          <ReadOnlyField label="Unit Number" value={equipment.unit_number} />
          <ReadOnlyField label="Category" value={categoryLabel} />
          <ReadOnlyField label="Serial Number" value={equipment.serial_number} />
          <ReadOnlyField label="Brand" value={equipment.brand} />
          <ReadOnlyField label="Model" value={equipment.model} />
          <ReadOnlyField
            label="Value"
            value={equipment.value != null ? `$${equipment.value.toLocaleString()}` : undefined}
          />
          <div className="space-y-1">
            <div className={uiTypography.controlLabel}>Status</div>
            <AppBadge variant={getEquipmentStatusBadgeVariant(equipment.status)} className="!normal-case">
              {formatEquipmentStatus(equipment.status)}
            </AppBadge>
          </div>
        </div>
      </AppCard>

      <AppCard>
        <AppSectionHeader
          title="Assignment & Dates"
          description="Current assignment, warranty, and purchase information."
          {...appSectionPresetProps('employment')}
          action={
            canEdit ? (
              <AppHeroEditButton title="Edit Assignment & Dates" onClick={() => onEditSection('dates')} />
            ) : undefined
          }
        />
        <div className={uiCx('mt-4 grid gap-4 md:grid-cols-2')}>
          <div className="space-y-1">
            <div className={uiTypography.controlLabel}>Assignment Status</div>
            <AppBadge variant={getEquipmentAssignmentBadgeVariant(!!openAssignment)} className="!normal-case">
              {openAssignment ? 'Assigned' : 'Available'}
            </AppBadge>
          </div>
          {openAssignment ? (
            <>
              <ReadOnlyField
                label="Assigned to"
                value={openAssignment.assigned_to_name || employeeName || openAssignment.assigned_to_user_id}
              />
              <ReadOnlyField label="Since" value={formatDateLocal(new Date(openAssignment.assigned_at))} />
              <ReadOnlyField label="Department" value={openAssignment.department_snapshot} />
            </>
          ) : null}
          <ReadOnlyField
            label="Warranty Expiry"
            value={
              equipment.warranty_expiry ? formatDateLocal(new Date(equipment.warranty_expiry)) : undefined
            }
          />
          <ReadOnlyField
            label="Purchase Date"
            value={equipment.purchase_date ? formatDateLocal(new Date(equipment.purchase_date)) : undefined}
          />
        </div>
      </AppCard>

      <AppCard>
        <AppSectionHeader
          title="Notes & Photos"
          description="Internal notes and additional photos for this equipment."
          {...appSectionPresetProps('description')}
          action={
            canEdit ? <AppHeroEditButton title="Edit Notes" onClick={() => onEditSection('notes')} /> : undefined
          }
        />
        <div className={uiSpacing.sectionStack}>
          <div className={uiCx(uiTypography.helper, 'mt-4 whitespace-pre-wrap break-words font-medium text-gray-900')}>
            {equipment.notes?.trim() ? equipment.notes : EM_DASH}
          </div>
          {equipment.photos && equipment.photos.length > 1 ? (
            <div>
              <div className={uiCx(uiTypography.controlLabel, 'mb-2')}>Additional photos</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {equipment.photos.slice(1).map((photoId, idx) => (
                  <img
                    key={`${photoId}-${idx}`}
                    src={withFileAccessToken(`/files/${encodeURIComponent(photoId)}/thumbnail?w=300`)}
                    alt=""
                    className="h-24 w-full rounded border object-cover"
                    loading="lazy"
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </AppCard>
    </div>
  );
}
