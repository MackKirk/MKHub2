import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

const checklistItems = [
  { key: 'tire_condition', label: 'Tire Condition' },
  { key: 'oil_level', label: 'Oil Level' },
  { key: 'fluids', label: 'Fluids' },
  { key: 'lights', label: 'Lights' },
  { key: 'seatbelts', label: 'Seatbelts' },
  { key: 'dashboard_warnings', label: 'Dashboard Warnings' },
  { key: 'interior_condition', label: 'Interior Condition' },
  { key: 'exterior_condition', label: 'Exterior Condition' },
];

export default function InspectionNew() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const assetId = searchParams.get('asset_id') || '';
  
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
  });

  const { data: assets = [] } = useQuery({
    queryKey: ['fleetAssets'],
    queryFn: () => api<any[]>('GET', '/fleet/assets'),
  });

  const [form, setForm] = useState({
    fleet_asset_id: assetId,
    inspection_date: new Date().toISOString().split('T')[0],
    inspector_user_id: '',
    result: 'pass',
    notes: '',
  });

  const [checklist, setChecklist] = useState<Record<string, string>>({});

  const updateField = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const updateChecklist = (key: string, value: string) => {
    setChecklist(prev => ({ ...prev, [key]: value }));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        fleet_asset_id: form.fleet_asset_id,
        inspection_date: new Date(form.inspection_date).toISOString(),
        inspector_user_id: form.inspector_user_id || null,
        checklist_results: Object.keys(checklist).length > 0 ? checklist : null,
        result: form.result,
        notes: form.notes.trim() || null,
      };
      return api('POST', '/fleet/inspections', payload);
    },
    onSuccess: (data: any) => {
      toast.success('Inspection created successfully');
      nav(`/fleet/inspections/${data.id}`);
    },
    onError: () => {
      toast.error('Failed to create inspection');
    },
  });

  const canSubmit = form.fleet_asset_id.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-extrabold">New Inspection</div>
            <div className="text-sm opacity-90">Create a new fleet inspection</div>
          </div>
          <button
            onClick={() => nav(-1)}
            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm"
          >
            ← Cancel
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) {
              createMutation.mutate();
            }
          }}
          className="space-y-6"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fleet Asset <span className="text-red-500">*</span>
              </label>
              <select
                value={form.fleet_asset_id}
                onChange={(e) => updateField('fleet_asset_id', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                required
              >
                <option value="">Select Asset</option>
                {Array.isArray(assets) && assets.map((asset: any) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name} ({asset.asset_type.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Inspection Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.inspection_date}
                onChange={(e) => updateField('inspection_date', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Inspector
              </label>
              <select
                value={form.inspector_user_id}
                onChange={(e) => updateField('inspector_user_id', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
              >
                <option value="">Unassigned</option>
                {Array.isArray(employees) && employees.map((emp: any) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.profile?.preferred_name || emp.profile?.first_name || emp.username}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Result <span className="text-red-500">*</span>
              </label>
              <select
                value={form.result}
                onChange={(e) => updateField('result', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                required
              >
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="conditional">Conditional</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Checklist Results</label>
            <div className="space-y-2">
              {checklistItems.map(item => (
                <div key={item.key} className="flex items-center justify-between p-2 border rounded">
                  <span className="text-sm">{item.label}</span>
                  <select
                    value={checklist[item.key] || ''}
                    onChange={(e) => updateChecklist(item.key, e.target.value)}
                    className="px-2 py-1 border rounded text-sm"
                  >
                    <option value="">N/A</option>
                    <option value="pass">Pass</option>
                    <option value="fail">Fail</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
            />
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => nav(-1)}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || createMutation.isPending}
              className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Inspection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

