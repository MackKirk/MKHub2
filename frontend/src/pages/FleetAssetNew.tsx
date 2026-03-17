import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export type FleetAssetNewFormProps = {
  initialAssetType: string;
  onSuccess: (data: { id: string }) => void;
  onCancel: () => void;
  /** When provided (e.g. in modal), parent will render footer; this form only renders content and reports canSubmit/isPending */
  onValidationChange?: (canSubmit: boolean, isPending: boolean) => void;
  formId?: string;
};

const labelClass = 'text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1';
const inputClass = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300';

export function FleetAssetNewForm({ initialAssetType, onSuccess, onCancel, onValidationChange, formId = 'fleet-new-asset-form' }: FleetAssetNewFormProps) {
  const [form, setForm] = useState({
    asset_type: initialAssetType,
    name: '',
    make: '',
    model: '',
    year: '',
    vin: '',
    license_plate: '',
    unit_number: '',
    vehicle_type: '',
    fuel_type: '',
    equipment_type_label: '',
    condition: '',
    status: 'active',
  });

  const updateField = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        asset_type: form.asset_type,
        name: form.name.trim(),
        make: form.make.trim() || null,
        model: form.model.trim() || null,
        year: form.year ? parseInt(form.year) : null,
        vin: form.vin.trim() || null,
        license_plate: form.license_plate.trim() || null,
        unit_number: form.unit_number.trim() || null,
        vehicle_type: form.vehicle_type.trim() || null,
        fuel_type: form.fuel_type.trim() || null,
        equipment_type_label: (form.asset_type === 'heavy_machinery' || form.asset_type === 'other') ? (form.equipment_type_label.trim() || null) : null,
        condition: form.condition || null,
        status: form.status,
      };
      return api('POST', '/fleet/assets', payload);
    },
    onSuccess: (data: any) => {
      toast.success('Asset created successfully');
      onSuccess(data);
    },
    onError: (error: any) => {
      const message = error?.message || 'Failed to create asset';
      toast.error(message);
    },
  });

  // At least one field (other than Asset Type) must be filled to create
  const fillableValues = [
    form.name,
    form.make,
    form.model,
    form.year,
    form.vin,
    form.license_plate,
    form.unit_number,
    form.vehicle_type,
    form.fuel_type,
    form.equipment_type_label,
    form.condition,
  ];
  const hasAtLeastOne = fillableValues.some((v) => String(v ?? '').trim() !== '');
  const canSubmit = hasAtLeastOne;

  useEffect(() => {
    onValidationChange?.(canSubmit, createMutation.isPending);
  }, [canSubmit, createMutation.isPending, onValidationChange]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <h4 className={labelClass}>Basic Information</h4>
      </div>
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) createMutation.mutate();
        }}
        className="p-4"
      >
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Asset Type</label>
            <select
              value={form.asset_type}
              onChange={(e) => updateField('asset_type', e.target.value)}
              className={inputClass}
            >
              <option value="vehicle">Vehicle</option>
              <option value="heavy_machinery">Heavy Machinery</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Make</label>
            <input type="text" value={form.make} onChange={(e) => updateField('make', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Model</label>
            <input type="text" value={form.model} onChange={(e) => updateField('model', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Year</label>
            <input type="number" value={form.year} onChange={(e) => updateField('year', e.target.value)} className={inputClass} min={1900} max={new Date().getFullYear() + 1} />
          </div>
          <div>
            <label className={labelClass}>VIN / Serial</label>
            <input type="text" value={form.vin} onChange={(e) => updateField('vin', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{(form.asset_type === 'heavy_machinery' || form.asset_type === 'other') ? 'License' : 'License Plate'}</label>
            <input type="text" value={form.license_plate} onChange={(e) => updateField('license_plate', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Unit Number</label>
            <input type="text" value={form.unit_number} onChange={(e) => updateField('unit_number', e.target.value)} className={inputClass} />
          </div>
          {(form.asset_type !== 'heavy_machinery' && form.asset_type !== 'other') && (
            <div>
              <label className={labelClass}>Vehicle Type</label>
              <input type="text" value={form.vehicle_type} onChange={(e) => updateField('vehicle_type', e.target.value)} className={inputClass} />
            </div>
          )}
          <div>
            <label className={labelClass}>Fuel Type</label>
            <input type="text" value={form.fuel_type} onChange={(e) => updateField('fuel_type', e.target.value)} className={inputClass} />
          </div>
          {(form.asset_type === 'heavy_machinery' || form.asset_type === 'other') && (
            <div>
              <label className={labelClass}>{(form.asset_type === 'heavy_machinery' || form.asset_type === 'other') ? 'Type' : 'Equipment Type Label'}</label>
              <input type="text" value={form.equipment_type_label} onChange={(e) => updateField('equipment_type_label', e.target.value)} className={inputClass} />
            </div>
          )}
          <div>
            <label className={labelClass}>Condition</label>
            <select value={form.condition} onChange={(e) => updateField('condition', e.target.value)} className={inputClass}>
              <option value="">Select</option>
              <option value="new">New</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select value={form.status} onChange={(e) => updateField('status', e.target.value)} className={inputClass}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="maintenance">Maintenance</option>
              <option value="retired">Retired</option>
            </select>
          </div>
        </div>
        {!onValidationChange && (
          <div className="flex gap-3 justify-end mt-4 pt-4 border-t border-gray-200">
            <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || createMutation.isPending}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Asset'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

export default function FleetAssetNew() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const assetType = searchParams.get('type') || 'vehicle';
  const todayLabel = new Date().toLocaleDateString('en-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div>
              <div className="text-sm font-semibold text-gray-900">New {assetType.replace('_', ' ')}</div>
              <div className="text-xs text-gray-500 mt-0.5">Create a new fleet asset</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
              <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
            </div>
            <button
              onClick={() => nav(-1)}
              className="px-3 py-2 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
      <FleetAssetNewForm
        initialAssetType={assetType}
        onSuccess={(data) => nav(`/fleet/assets/${data.id}`)}
        onCancel={() => nav(-1)}
      />
    </div>
  );
}
