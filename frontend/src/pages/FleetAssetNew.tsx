import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export type FleetAssetNewFormProps = {
  initialAssetType: string;
  onSuccess: (data: { id: string }) => void;
  onCancel: () => void;
};

const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent';

export function FleetAssetNewForm({ initialAssetType, onSuccess, onCancel }: FleetAssetNewFormProps) {
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

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h4 className="font-semibold text-gray-900">Basic Information</h4>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) createMutation.mutate();
        }}
        className="p-4"
      >
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-gray-600 mb-1">Asset Type</div>
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
            <div className="text-gray-600 mb-1">Name</div>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <div className="text-gray-600 mb-1">Make</div>
            <input type="text" value={form.make} onChange={(e) => updateField('make', e.target.value)} className={inputClass} />
          </div>
          <div>
            <div className="text-gray-600 mb-1">Model</div>
            <input type="text" value={form.model} onChange={(e) => updateField('model', e.target.value)} className={inputClass} />
          </div>
          <div>
            <div className="text-gray-600 mb-1">Year</div>
            <input type="number" value={form.year} onChange={(e) => updateField('year', e.target.value)} className={inputClass} min={1900} max={new Date().getFullYear() + 1} />
          </div>
          <div>
            <div className="text-gray-600 mb-1">VIN / Serial</div>
            <input type="text" value={form.vin} onChange={(e) => updateField('vin', e.target.value)} className={inputClass} />
          </div>
          <div>
            <div className="text-gray-600 mb-1">{(form.asset_type === 'heavy_machinery' || form.asset_type === 'other') ? 'License' : 'License Plate'}</div>
            <input type="text" value={form.license_plate} onChange={(e) => updateField('license_plate', e.target.value)} className={inputClass} />
          </div>
          <div>
            <div className="text-gray-600 mb-1">Unit Number</div>
            <input type="text" value={form.unit_number} onChange={(e) => updateField('unit_number', e.target.value)} className={inputClass} />
          </div>
          {(form.asset_type !== 'heavy_machinery' && form.asset_type !== 'other') && (
            <div>
              <div className="text-gray-600 mb-1">Vehicle Type</div>
              <input type="text" value={form.vehicle_type} onChange={(e) => updateField('vehicle_type', e.target.value)} className={inputClass} />
            </div>
          )}
          <div>
            <div className="text-gray-600 mb-1">Fuel Type</div>
            <input type="text" value={form.fuel_type} onChange={(e) => updateField('fuel_type', e.target.value)} className={inputClass} />
          </div>
          {(form.asset_type === 'heavy_machinery' || form.asset_type === 'other') && (
            <div>
              <div className="text-gray-600 mb-1">{(form.asset_type === 'heavy_machinery' || form.asset_type === 'other') ? 'Type' : 'Equipment Type Label'}</div>
              <input type="text" value={form.equipment_type_label} onChange={(e) => updateField('equipment_type_label', e.target.value)} className={inputClass} />
            </div>
          )}
          <div>
            <div className="text-gray-600 mb-1">Condition</div>
            <select value={form.condition} onChange={(e) => updateField('condition', e.target.value)} className={inputClass}>
              <option value="">Select</option>
              <option value="new">New</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
            </select>
          </div>
          <div>
            <div className="text-gray-600 mb-1">Status</div>
            <select value={form.status} onChange={(e) => updateField('status', e.target.value)} className={inputClass}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="maintenance">Maintenance</option>
              <option value="retired">Retired</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-4 pt-4 border-t border-gray-200">
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit || createMutation.isPending}
            className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Asset'}
          </button>
        </div>
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
