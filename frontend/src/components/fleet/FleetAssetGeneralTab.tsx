import type { ReactNode } from 'react';
import { withFileAccessToken } from '@/lib/api';
import {
  formatFleetAssetStatus,
  getFleetAssetStatusVariant,
  getFleetAssignmentBadgeVariant,
  getFleetDueStatusBadgeVariant,
} from '@/lib/fleetUi';
import { formatDateLocal } from '@/lib/dateUtils';
import type { FleetAssetGeneralEditSection } from '@/components/fleet/EditFleetAssetGeneralModal';
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

type FleetAsset = {
  asset_type: string;
  name: string;
  unit_number?: string;
  vin?: string;
  license_plate?: string;
  make?: string;
  model?: string;
  year?: number;
  condition?: string;
  status: string;
  fuel_type?: string;
  vehicle_type?: string;
  equipment_type_label?: string;
  icbc_registration_no?: string;
  vancouver_decals?: string[];
  ferry_length?: string;
  gvw_kg?: number;
  gvw_value?: number;
  gvw_unit?: string;
  propane_sticker_cert?: string;
  propane_sticker_date?: string;
  yard_location?: string;
  driver_contact_phone?: string;
  odometer_current?: number;
  odometer_last_service?: number;
  odometer_next_due_at?: number;
  odometer_noted_issues?: string;
  hours_current?: number;
  hours_last_service?: number;
  hours_next_due_at?: number;
  hours_noted_issues?: string;
  notes?: string;
  photos?: string[];
};

type OpenAssignment = {
  assigned_to_name?: string;
  assigned_to_user_id?: string;
  assigned_at: string;
  odometer_out?: number;
  hours_out?: number;
  phone_snapshot?: string;
  department_snapshot?: string;
};

type ComplianceBadge = { label: string; variant: ReturnType<typeof getFleetDueStatusBadgeVariant>; expiryDate: string };

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
  asset: FleetAsset;
  openAssignment: OpenAssignment | undefined;
  employeeName?: string;
  complianceStatusByType: Record<string, ComplianceBadge>;
  propaneStatus: { label: string; variant: ReturnType<typeof getFleetDueStatusBadgeVariant> } | null;
  odometerStatus: { label: string; variant: ReturnType<typeof getFleetDueStatusBadgeVariant> } | null;
  hoursStatus: { label: string; variant: ReturnType<typeof getFleetDueStatusBadgeVariant> } | null;
  onEditSection: (section: FleetAssetGeneralEditSection) => void;
  onViewCompliance: () => void;
};

export function FleetAssetGeneralTab({
  asset,
  openAssignment,
  employeeName,
  complianceStatusByType,
  propaneStatus,
  odometerStatus,
  hoursStatus,
  onEditSection,
  onViewCompliance,
}: Props) {
  const isVehicle = asset.asset_type === 'vehicle';
  const isHoursAsset = asset.asset_type === 'heavy_machinery' || asset.asset_type === 'other';
  const licenseLabel = isHoursAsset ? 'License' : 'License Plate';
  const showOdometerSection = isVehicle || isHoursAsset;

  return (
    <div className={uiSpacing.sectionStack}>
      <AppCard>
        <AppSectionHeader
          title="Basic Information"
          description="Identity, identification, and operational status."
          {...appSectionPresetProps('basicInformation')}
          action={<AppHeroEditButton title="Edit Basic Information" onClick={() => onEditSection('basic')} />}
        />
        <div className={uiCx('mt-4 grid gap-4 md:grid-cols-2')}>
          <ReadOnlyField label="Name *" value={asset.name} />
          <ReadOnlyField label="Make" value={asset.make} />
          <ReadOnlyField label="Model" value={asset.model} />
          <ReadOnlyField label="Year" value={asset.year != null ? String(asset.year) : undefined} />
          <ReadOnlyField label="VIN / Serial" value={asset.vin} />
          <ReadOnlyField label={licenseLabel} value={asset.license_plate} />
          <ReadOnlyField label="Unit Number" value={asset.unit_number} />
          {!isHoursAsset && <ReadOnlyField label="Vehicle Type" value={asset.vehicle_type} />}
          <ReadOnlyField label="Fuel Type" value={asset.fuel_type} />
          {isHoursAsset && <ReadOnlyField label="Type" value={asset.equipment_type_label} />}
          <div className="space-y-1">
            <div className={uiTypography.controlLabel}>Condition</div>
            <div className={uiCx(uiTypography.helper, 'font-medium capitalize text-gray-900')}>
              {asset.condition || EM_DASH}
            </div>
          </div>
          <div className="space-y-1">
            <div className={uiTypography.controlLabel}>Status</div>
            <AppBadge variant={getFleetAssetStatusVariant(asset.status)}>{formatFleetAssetStatus(asset.status)}</AppBadge>
          </div>
        </div>
      </AppCard>

      <AppCard>
        <AppSectionHeader
          title="Registration & Compliance"
          description="Registration numbers, GVW, and propane sticker summary."
          {...appSectionPresetProps('documents')}
          action={<AppHeroEditButton title="Edit Registration" onClick={() => onEditSection('registration')} />}
        />
        {Object.keys(complianceStatusByType).length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(complianceStatusByType).map(([type, s]) => (
              <span key={type} title={`${type} expires ${s.expiryDate}`}>
                <AppBadge variant={s.variant}>
                  {type}: {s.label}
                </AppBadge>
              </span>
            ))}
            <button type="button" onClick={onViewCompliance} className="text-xs text-brand-red hover:underline ml-1">
              View all →
            </button>
          </div>
        ) : null}
        <div className={uiCx('mt-4 grid gap-4 md:grid-cols-2')}>
          {isVehicle && (
            <>
              <ReadOnlyField label="ICBC Registration No." value={asset.icbc_registration_no} />
              <ReadOnlyField
                label="Vancouver Decal #"
                value={Array.isArray(asset.vancouver_decals) ? asset.vancouver_decals.join(', ') : undefined}
              />
              <ReadOnlyField label="Ferry Length" value={asset.ferry_length} />
              <ReadOnlyField label="GVW (kg)" value={asset.gvw_kg != null ? asset.gvw_kg.toLocaleString() : undefined} />
            </>
          )}
          <ReadOnlyField label="GVW Value" value={asset.gvw_value != null ? String(asset.gvw_value) : undefined} />
          <ReadOnlyField label="GVW Unit" value={asset.gvw_unit} />
          <ReadOnlyField label="Propane Sticker Cert" value={asset.propane_sticker_cert} />
          <div className="space-y-1">
            <div className={uiTypography.controlLabel}>Propane Sticker Date</div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={uiCx(uiTypography.helper, 'font-medium text-gray-900')}>
                {asset.propane_sticker_date ? asset.propane_sticker_date.slice(0, 10) : EM_DASH}
              </span>
              {propaneStatus ? <AppBadge variant={propaneStatus.variant}>{propaneStatus.label}</AppBadge> : null}
            </div>
          </div>
        </div>
      </AppCard>

      <AppCard>
        <AppSectionHeader
          title="Assignment & Location"
          description="Current assignment and default sleeps / yard location."
          {...appSectionPresetProps('employment')}
          action={<AppHeroEditButton title="Edit Assignment & Location" onClick={() => onEditSection('assignment')} />}
        />
        <div className={uiCx('mt-4 grid gap-4 md:grid-cols-2')}>
          <div className="space-y-1">
            <div className={uiTypography.controlLabel}>Assignment Status</div>
            <AppBadge variant={getFleetAssignmentBadgeVariant(!!openAssignment)}>
              {openAssignment ? 'Assigned' : 'Available'}
            </AppBadge>
          </div>
          {openAssignment && (
            <>
              <ReadOnlyField
                label="Assigned to"
                value={openAssignment.assigned_to_name || employeeName || openAssignment.assigned_to_user_id}
              />
              <ReadOnlyField label="Since" value={formatDateLocal(new Date(openAssignment.assigned_at))} />
              {openAssignment.odometer_out != null && (
                <ReadOnlyField label="Odometer out" value={String(openAssignment.odometer_out)} />
              )}
              {openAssignment.hours_out != null && <ReadOnlyField label="Hours out" value={String(openAssignment.hours_out)} />}
            </>
          )}
          <ReadOnlyField label="Phone" value={openAssignment?.phone_snapshot ?? asset.driver_contact_phone} />
          <ReadOnlyField label="Department" value={openAssignment?.department_snapshot} />
          <ReadOnlyField label="Sleeps" value={asset.yard_location} />
        </div>
      </AppCard>

      {showOdometerSection && (
        <AppCard>
          <AppSectionHeader
            title="Odometer & Maintenance"
            description={isVehicle ? 'Odometer readings and service due thresholds.' : 'Hour meter readings and service due thresholds.'}
            {...appSectionPresetProps('timesheet')}
            action={<AppHeroEditButton title="Edit Odometer & Maintenance" onClick={() => onEditSection('odometer')} />}
          />
          <div className={uiCx('mt-4 grid gap-4 md:grid-cols-2')}>
            {isVehicle && (
              <>
                <ReadOnlyField
                  label="Current Odometer"
                  value={asset.odometer_current != null ? asset.odometer_current.toLocaleString() : undefined}
                />
                <ReadOnlyField
                  label="Last Service Odometer"
                  value={asset.odometer_last_service != null ? asset.odometer_last_service.toLocaleString() : undefined}
                />
                <div className="space-y-1">
                  <div className={uiTypography.controlLabel}>Odometer Next Due At</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={uiCx(uiTypography.helper, 'font-medium text-gray-900')}>
                      {asset.odometer_next_due_at != null ? asset.odometer_next_due_at : EM_DASH}
                    </span>
                    {odometerStatus ? <AppBadge variant={odometerStatus.variant}>{odometerStatus.label}</AppBadge> : null}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <ReadOnlyField label="Odometer Noted Issues" value={asset.odometer_noted_issues} />
                </div>
              </>
            )}
            {isHoursAsset && (
              <>
                <ReadOnlyField
                  label="Current Hours"
                  value={asset.hours_current != null ? asset.hours_current.toLocaleString() : undefined}
                />
                <ReadOnlyField
                  label="Last Service Hours"
                  value={asset.hours_last_service != null ? asset.hours_last_service.toLocaleString() : undefined}
                />
                <div className="space-y-1">
                  <div className={uiTypography.controlLabel}>Hours Next Due At</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={uiCx(uiTypography.helper, 'font-medium text-gray-900')}>
                      {asset.hours_next_due_at != null ? asset.hours_next_due_at : EM_DASH}
                    </span>
                    {hoursStatus ? <AppBadge variant={hoursStatus.variant}>{hoursStatus.label}</AppBadge> : null}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <ReadOnlyField label="Hours Noted Issues" value={asset.hours_noted_issues} />
                </div>
              </>
            )}
          </div>
        </AppCard>
      )}

      <AppCard>
        <AppSectionHeader
          title="Notes & Photos"
          description="Internal notes and additional photos for this asset."
          {...appSectionPresetProps('description')}
          action={<AppHeroEditButton title="Edit Notes" onClick={() => onEditSection('notes')} />}
        />
        <div className={uiSpacing.sectionStack}>
          <div className={uiCx(uiTypography.helper, 'mt-4 whitespace-pre-wrap break-words font-medium text-gray-900')}>
            {asset.notes?.trim() ? asset.notes : EM_DASH}
          </div>
          {asset.photos && asset.photos.length > 1 ? (
            <div>
              <div className={uiCx(uiTypography.controlLabel, 'mb-2')}>Additional photos</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {asset.photos.slice(1).map((photoId, idx) => (
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
