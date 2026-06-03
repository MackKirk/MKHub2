import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { FLEET_ASSET_FIELD_HINTS as H } from '@/lib/fleetAssetFieldHints';
import {
  AppButton,
  AppDatePicker,
  AppFormModal,
  AppInput,
  AppSelect,
  AppTextarea,
  uiCx,
  uiLayout,
  uiSpacing,
} from '@/components/ui';

export type FleetAssetGeneralEditSection = 'basic' | 'registration' | 'assignment' | 'odometer' | 'notes';

export type FleetAssetGeneralAsset = {
  id: string;
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
  odometer_current?: number;
  odometer_last_service?: number;
  odometer_next_due_at?: number;
  odometer_noted_issues?: string;
  hours_current?: number;
  hours_last_service?: number;
  hours_next_due_at?: number;
  hours_noted_issues?: string;
  notes?: string;
};

const SECTION_COPY: Record<
  FleetAssetGeneralEditSection,
  { title: string; description: string; quickInfo: ReactNode }
> = {
  basic: {
    title: 'Edit basic information',
    description: 'Identity, identification, and operational status for this asset.',
    quickInfo: (
      <>
        <p>Name is required. Status controls whether the asset is active in fleet lists.</p>
        <p>Vehicle-specific fields appear based on asset type.</p>
      </>
    ),
  },
  registration: {
    title: 'Edit registration & compliance',
    description: 'Registration numbers, GVW, and propane sticker details.',
    quickInfo: (
      <>
        <p>ICBC and decal fields apply to vehicles. Compliance certifications are managed on the Compliance tab.</p>
      </>
    ),
  },
  assignment: {
    title: 'Edit assignment & location',
    description: 'Default sleeps / yard location for this asset.',
    quickInfo: (
      <>
        <p>Active check-out details are edited via Assign and Return. This section only updates the sleeps field on the asset.</p>
      </>
    ),
  },
  odometer: {
    title: 'Edit odometer & maintenance',
    description: 'Current readings, service history, and due thresholds.',
    quickInfo: (
      <>
        <p>Vehicles use odometer fields; heavy machinery and other assets use hours.</p>
      </>
    ),
  },
  notes: {
    title: 'Edit notes',
    description: 'Internal notes for this asset.',
    quickInfo: <p>Optional notes visible on the asset record. Additional photos are managed from the hero area.</p>,
  },
};

type Props = {
  open: boolean;
  section: FleetAssetGeneralEditSection | null;
  onClose: () => void;
  asset: FleetAssetGeneralAsset | null | undefined;
  onSaved?: () => void;
};

export default function EditFleetAssetGeneralModal({ open, section, onClose, asset, onSaved }: Props) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const isVehicle = asset?.asset_type === 'vehicle';
  const isHoursAsset = asset?.asset_type === 'heavy_machinery' || asset?.asset_type === 'other';
  const licenseLabel = isHoursAsset ? 'License' : 'License Plate';

  const hydrate = useCallback((a: FleetAssetGeneralAsset) => {
    setForm({
      name: a.name || '',
      vin: a.vin || '',
      license_plate: a.license_plate || '',
      make: a.make || '',
      model: a.model || '',
      year: a.year != null ? String(a.year) : '',
      unit_number: a.unit_number || '',
      condition: a.condition || '',
      status: a.status || 'active',
      fuel_type: a.fuel_type || '',
      vehicle_type: a.vehicle_type || '',
      equipment_type_label: a.equipment_type_label || '',
      icbc_registration_no: a.icbc_registration_no || '',
      vancouver_decals: Array.isArray(a.vancouver_decals) ? a.vancouver_decals.join(', ') : '',
      ferry_length: a.ferry_length || '',
      gvw_kg: a.gvw_kg != null ? String(a.gvw_kg) : '',
      gvw_value: a.gvw_value != null ? String(a.gvw_value) : '',
      gvw_unit: a.gvw_unit || '',
      propane_sticker_cert: a.propane_sticker_cert || '',
      propane_sticker_date: a.propane_sticker_date ? a.propane_sticker_date.slice(0, 10) : '',
      yard_location: a.yard_location || '',
      odometer_current: a.odometer_current != null ? String(a.odometer_current) : '',
      odometer_last_service: a.odometer_last_service != null ? String(a.odometer_last_service) : '',
      odometer_next_due_at: a.odometer_next_due_at != null ? String(a.odometer_next_due_at) : '',
      odometer_noted_issues: a.odometer_noted_issues || '',
      hours_current: a.hours_current != null ? String(a.hours_current) : '',
      hours_last_service: a.hours_last_service != null ? String(a.hours_last_service) : '',
      hours_next_due_at: a.hours_next_due_at != null ? String(a.hours_next_due_at) : '',
      hours_noted_issues: a.hours_noted_issues || '',
      notes: a.notes || '',
    });
  }, []);

  useEffect(() => {
    if (!open || !section || !asset) return;
    hydrate(asset);
    setIsSaving(false);
  }, [open, section, asset, hydrate]);

  const handleClose = useCallback(() => {
    setIsSaving(false);
    onClose();
  }, [onClose]);

  const activeSection = open && section ? section : null;
  const meta = activeSection ? SECTION_COPY[activeSection] : null;

  const modalTitle = useMemo(() => {
    if (!meta || !asset) return 'Edit asset';
    const label = [asset.name, asset.unit_number ? `#${asset.unit_number}` : null].filter(Boolean).join(' · ');
    return label ? `${meta.title} — ${label}` : meta.title;
  }, [meta, asset]);

  const setField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const buildPayload = (): Record<string, unknown> | null => {
    if (!activeSection || !asset) return null;
    switch (activeSection) {
      case 'basic':
        return {
          name: form.name.trim(),
          vin: form.vin.trim() || null,
          license_plate: form.license_plate?.trim() || null,
          make: form.make?.trim() || null,
          model: form.model?.trim() || null,
          year: form.year ? parseInt(form.year, 10) : null,
          unit_number: form.unit_number?.trim() || null,
          condition: form.condition || null,
          status: form.status,
          fuel_type: form.fuel_type?.trim() || null,
          vehicle_type: form.vehicle_type?.trim() || null,
          equipment_type_label: form.equipment_type_label?.trim() || null,
        };
      case 'registration':
        return {
          icbc_registration_no: form.icbc_registration_no?.trim() || null,
          vancouver_decals: form.vancouver_decals
            ? form.vancouver_decals.split(',').map((s) => s.trim()).filter(Boolean)
            : null,
          ferry_length: form.ferry_length?.trim() || null,
          gvw_kg: form.gvw_kg ? parseInt(form.gvw_kg, 10) : null,
          gvw_value: form.gvw_value !== '' ? parseInt(form.gvw_value, 10) : null,
          gvw_unit: form.gvw_unit?.trim() || null,
          propane_sticker_cert: form.propane_sticker_cert?.trim() || null,
          propane_sticker_date: form.propane_sticker_date || null,
        };
      case 'assignment':
        return { yard_location: form.yard_location?.trim() || null };
      case 'odometer': {
        const payload: Record<string, unknown> = {
          odometer_next_due_at:
            form.odometer_next_due_at !== '' ? parseInt(form.odometer_next_due_at, 10) : null,
          odometer_noted_issues: form.odometer_noted_issues?.trim() || null,
          hours_next_due_at: form.hours_next_due_at !== '' ? parseFloat(form.hours_next_due_at) : null,
          hours_noted_issues: form.hours_noted_issues?.trim() || null,
        };
        if (isVehicle) {
          payload.odometer_current = form.odometer_current ? parseInt(form.odometer_current, 10) : null;
          payload.odometer_last_service = form.odometer_last_service
            ? parseInt(form.odometer_last_service, 10)
            : null;
        } else if (isHoursAsset) {
          payload.hours_current = form.hours_current ? parseFloat(form.hours_current) : null;
          payload.hours_last_service = form.hours_last_service ? parseFloat(form.hours_last_service) : null;
        }
        return payload;
      }
      case 'notes':
        return { notes: form.notes?.trim() || null };
      default:
        return null;
    }
  };

  const handleSave = async () => {
    if (!activeSection || !asset?.id || isSaving) return;
    if (activeSection === 'basic' && !form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    const payload = buildPayload();
    if (!payload) return;
    try {
      setIsSaving(true);
      await api('PUT', `/fleet/assets/${asset.id}`, payload);
      toast.success('Asset updated successfully');
      onSaved?.();
      handleClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update asset');
    } finally {
      setIsSaving(false);
    }
  };

  if (!open || !activeSection || !meta || !asset) return null;

  const formWidth =
    activeSection === 'basic' || activeSection === 'registration' || activeSection === 'odometer'
      ? 'comfortable'
      : 'default';

  return (
    <AppFormModal
      open={open}
      onClose={handleClose}
      title={modalTitle}
      description={meta.description}
      formWidth={formWidth}
      quickInfo={meta.quickInfo}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={handleClose} disabled={isSaving}>
            Cancel
          </AppButton>
          <AppButton type="button" size="sm" disabled={isSaving} loading={isSaving} onClick={handleSave}>
            {isSaving ? 'Saving…' : 'Save'}
          </AppButton>
        </div>
      }
    >
      {activeSection === 'basic' && (
        <div className={uiCx('grid gap-4 md:grid-cols-2')}>
          <AppInput label="Name *" value={form.name} onChange={(e) => setField('name', e.target.value)} disabled={isSaving} required fieldHint={H.name} />
          <AppInput label="Make" value={form.make} onChange={(e) => setField('make', e.target.value)} disabled={isSaving} fieldHint={H.make} />
          <AppInput label="Model" value={form.model} onChange={(e) => setField('model', e.target.value)} disabled={isSaving} fieldHint={H.model} />
          <AppInput
            label="Year"
            type="number"
            value={form.year}
            onChange={(e) => setField('year', e.target.value)}
            min={1900}
            max={new Date().getFullYear() + 1}
            disabled={isSaving}
            fieldHint={H.year}
          />
          <AppInput label="VIN / Serial" value={form.vin} onChange={(e) => setField('vin', e.target.value)} disabled={isSaving} fieldHint={H.vin} />
          <AppInput
            label={licenseLabel}
            value={form.license_plate}
            onChange={(e) => setField('license_plate', e.target.value)}
            disabled={isSaving}
            fieldHint={isHoursAsset ? H.license : H.license_plate}
          />
          <AppInput label="Unit Number" value={form.unit_number} onChange={(e) => setField('unit_number', e.target.value)} disabled={isSaving} fieldHint={H.unit_number} />
          {!isHoursAsset && (
            <AppInput label="Vehicle Type" value={form.vehicle_type} onChange={(e) => setField('vehicle_type', e.target.value)} disabled={isSaving} fieldHint={H.vehicle_type} />
          )}
          <AppInput label="Fuel Type" value={form.fuel_type} onChange={(e) => setField('fuel_type', e.target.value)} disabled={isSaving} fieldHint={H.fuel_type} />
          {isHoursAsset && (
            <AppInput label="Type" value={form.equipment_type_label} onChange={(e) => setField('equipment_type_label', e.target.value)} disabled={isSaving} fieldHint={H.equipment_type_label} />
          )}
          <AppSelect
            label="Condition"
            value={form.condition}
            onChange={(e) => setField('condition', e.target.value)}
            disabled={isSaving}
            fieldHint={H.condition}
            options={[
              { value: '', label: 'Select' },
              { value: 'new', label: 'New' },
              { value: 'good', label: 'Good' },
              { value: 'fair', label: 'Fair' },
              { value: 'poor', label: 'Poor' },
            ]}
          />
          <AppSelect
            label="Status"
            value={form.status}
            onChange={(e) => setField('status', e.target.value)}
            disabled={isSaving}
            fieldHint={H.status}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
              { value: 'maintenance', label: 'Maintenance' },
              { value: 'retired', label: 'Retired' },
            ]}
          />
        </div>
      )}

      {activeSection === 'registration' && (
        <div className={uiCx('grid gap-4 md:grid-cols-2')}>
          {isVehicle && (
            <>
              <AppInput
                label="ICBC Registration No."
                value={form.icbc_registration_no}
                onChange={(e) => setField('icbc_registration_no', e.target.value)}
                disabled={isSaving}
                fieldHint={H.icbc_registration_no}
              />
              <AppInput
                label="Vancouver Decal #"
                value={form.vancouver_decals}
                onChange={(e) => setField('vancouver_decals', e.target.value)}
                placeholder="e.g., 123, 456"
                disabled={isSaving}
                fieldHint={H.vancouver_decals}
              />
              <AppInput
                label="Ferry Length"
                value={form.ferry_length}
                onChange={(e) => setField('ferry_length', e.target.value)}
                placeholder="e.g., 22L 8H"
                disabled={isSaving}
                fieldHint={H.ferry_length}
              />
              <AppInput
                label="GVW (kg)"
                type="number"
                value={form.gvw_kg}
                onChange={(e) => setField('gvw_kg', e.target.value)}
                min={0}
                disabled={isSaving}
                fieldHint={H.gvw_kg}
              />
            </>
          )}
          <AppInput
            label="GVW Value"
            type="number"
            value={form.gvw_value}
            onChange={(e) => setField('gvw_value', e.target.value)}
            min={0}
            disabled={isSaving}
            fieldHint={H.gvw_value}
          />
          <AppSelect
            label="GVW Unit"
            value={form.gvw_unit}
            onChange={(e) => setField('gvw_unit', e.target.value)}
            disabled={isSaving}
            fieldHint={H.gvw_unit}
            options={[
              { value: '', label: '-' },
              { value: 'kg', label: 'kg' },
              { value: 'lbs', label: 'lbs' },
            ]}
          />
          <AppInput
            label="Propane Sticker Cert"
            value={form.propane_sticker_cert}
            onChange={(e) => setField('propane_sticker_cert', e.target.value)}
            disabled={isSaving}
            fieldHint={H.propane_sticker_cert}
          />
          <AppDatePicker
            label="Propane Sticker Date"
            value={form.propane_sticker_date}
            onChange={(e) => setField('propane_sticker_date', e.target.value)}
            disabled={isSaving}
            fieldHint={H.propane_sticker_date}
          />
        </div>
      )}

      {activeSection === 'assignment' && (
        <AppInput label="Sleeps" value={form.yard_location} onChange={(e) => setField('yard_location', e.target.value)} disabled={isSaving} fieldHint={H.yard_location} />
      )}

      {activeSection === 'odometer' && (
        <div className={uiSpacing.sectionStack}>
          {isVehicle && (
            <div className={uiCx('grid gap-4 md:grid-cols-2')}>
              <AppInput
                label="Current Odometer"
                type="number"
                value={form.odometer_current}
                onChange={(e) => setField('odometer_current', e.target.value)}
                min={0}
                disabled={isSaving}
                fieldHint={H.odometer_current}
              />
              <AppInput
                label="Last Service Odometer"
                type="number"
                value={form.odometer_last_service}
                onChange={(e) => setField('odometer_last_service', e.target.value)}
                min={0}
                disabled={isSaving}
                fieldHint={H.odometer_last_service}
              />
              <AppInput
                label="Odometer Next Due At"
                type="number"
                value={form.odometer_next_due_at}
                onChange={(e) => setField('odometer_next_due_at', e.target.value)}
                min={0}
                disabled={isSaving}
                fieldHint={H.odometer_next_due_at}
              />
              <div className="md:col-span-2">
                <AppTextarea
                  label="Odometer Noted Issues"
                  value={form.odometer_noted_issues}
                  onChange={(e) => setField('odometer_noted_issues', e.target.value)}
                  rows={2}
                  disabled={isSaving}
                  fieldHint={H.odometer_noted_issues}
                />
              </div>
            </div>
          )}
          {isHoursAsset && (
            <div className={uiCx('grid gap-4 md:grid-cols-2')}>
              <AppInput
                label="Current Hours"
                type="number"
                step="0.1"
                value={form.hours_current}
                onChange={(e) => setField('hours_current', e.target.value)}
                min={0}
                disabled={isSaving}
                fieldHint={H.hours_current}
              />
              <AppInput
                label="Last Service Hours"
                type="number"
                step="0.1"
                value={form.hours_last_service}
                onChange={(e) => setField('hours_last_service', e.target.value)}
                min={0}
                disabled={isSaving}
                fieldHint={H.hours_last_service}
              />
              <AppInput
                label="Hours Next Due At"
                type="number"
                step="0.1"
                value={form.hours_next_due_at}
                onChange={(e) => setField('hours_next_due_at', e.target.value)}
                min={0}
                disabled={isSaving}
                fieldHint={H.hours_next_due_at}
              />
              <div className="md:col-span-2">
                <AppTextarea
                  label="Hours Noted Issues"
                  value={form.hours_noted_issues}
                  onChange={(e) => setField('hours_noted_issues', e.target.value)}
                  rows={2}
                  disabled={isSaving}
                  fieldHint={H.hours_noted_issues}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {activeSection === 'notes' && (
        <AppTextarea label="Notes" value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={4} disabled={isSaving} fieldHint={H.notes} />
      )}
    </AppFormModal>
  );
}
