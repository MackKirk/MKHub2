import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type ChecklistTemplate = {
  sections: Array<{
    id: string;
    title: string;
    items: Array<{
      key: string;
      label: string;
      category: string;
    }>;
  }>;
  status_options: Array<{
    value: string;
    label: string;
  }>;
  metadata_fields: Array<{
    key: string;
    label: string;
    type: string;
  }>;
};

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

  const { data: checklistTemplate } = useQuery<ChecklistTemplate>({
    queryKey: ['inspectionChecklistTemplate'],
    queryFn: () => api<ChecklistTemplate>('GET', '/fleet/inspections/checklist-template'),
  });

  const [form, setForm] = useState({
    fleet_asset_id: assetId,
    inspection_date: new Date().toISOString().split('T')[0],
    inspector_user_id: '',
    result: 'pass',
    notes: '',
    odometer_reading: '',
    hours_reading: '',
  });

  const [checklist, setChecklist] = useState<Record<string, { status?: string; comments?: string }>>({});
  const [metadata, setMetadata] = useState<Record<string, string>>({
    unit_number: '',
    km: '',
    hours: '',
    mechanic: '',
    next_pm_due: '',
  });

  const updateField = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const updateChecklist = (key: string, field: 'status' | 'comments', value: string) => {
    setChecklist(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }));
  };

  const updateMetadata = (key: string, value: string) => {
    setMetadata(prev => ({ ...prev, [key]: value }));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      // Build checklist results - merge metadata into items structure
      // The backend expects a flat dict, so we'll include metadata as special keys
      const checklistResults: any = {
        ...checklist,
        _metadata: metadata, // Store metadata with underscore prefix to avoid conflicts
      };

      const payload: any = {
        fleet_asset_id: form.fleet_asset_id,
        inspection_date: new Date(form.inspection_date).toISOString(),
        inspector_user_id: form.inspector_user_id || null,
        checklist_results: Object.keys(checklist).length > 0 ? checklistResults : null,
        result: form.result,
        notes: form.notes.trim() || null,
        odometer_reading: form.odometer_reading ? parseInt(form.odometer_reading) : null,
        hours_reading: form.hours_reading ? parseFloat(form.hours_reading) : null,
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
          {/* Metadata Fields */}
          <div className="bg-gray-50 p-4 rounded-lg border">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Inspection Information</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit #</label>
                <input
                  type="text"
                  value={metadata.unit_number}
                  onChange={(e) => updateMetadata('unit_number', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                  placeholder="Unit number"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">KM</label>
                <input
                  type="number"
                  value={metadata.km}
                  onChange={(e) => updateMetadata('km', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                  placeholder="Kilometers"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hours</label>
                <input
                  type="number"
                  value={metadata.hours}
                  onChange={(e) => updateMetadata('hours', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                  placeholder="Hours"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mechanic</label>
                <input
                  type="text"
                  value={metadata.mechanic}
                  onChange={(e) => updateMetadata('mechanic', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                  placeholder="Mechanic name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Next PM Due On</label>
                <input
                  type="date"
                  value={metadata.next_pm_due}
                  onChange={(e) => updateMetadata('next_pm_due', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                />
              </div>
            </div>
          </div>

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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Odometer Reading
              </label>
              <input
                type="number"
                value={form.odometer_reading}
                onChange={(e) => updateField('odometer_reading', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                placeholder="Current odometer"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hours Reading
              </label>
              <input
                type="number"
                step="0.1"
                value={form.hours_reading}
                onChange={(e) => updateField('hours_reading', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                placeholder="Current hours"
              />
            </div>
          </div>

          {/* Complete Checklist */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Inspection Checklist</label>
            {checklistTemplate ? (
              <div className="space-y-6 border rounded-lg p-4 bg-white">
                {checklistTemplate.sections.map((section) => (
                  <div key={section.id} className="border-b pb-4 last:border-b-0 last:pb-0">
                    <h4 className="text-base font-semibold text-gray-800 mb-3">
                      {section.id}. {section.title}
                    </h4>
                    <div className="space-y-2">
                      {section.items.map((item) => (
                        <div key={item.key} className="grid grid-cols-12 gap-2 items-center py-2 border-b border-gray-100 last:border-b-0">
                          <div className="col-span-5 text-sm text-gray-700">
                            {item.key}. {item.label}
                          </div>
                          <div className="col-span-3">
                            <select
                              value={checklist[item.key]?.status || ''}
                              onChange={(e) => updateChecklist(item.key, 'status', e.target.value)}
                              className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand-red"
                            >
                              <option value="">-</option>
                              {checklistTemplate.status_options.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-4">
                            <input
                              type="text"
                              value={checklist[item.key]?.comments || ''}
                              onChange={(e) => updateChecklist(item.key, 'comments', e.target.value)}
                              className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand-red"
                              placeholder="Comments & Parts List"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">Loading checklist template...</div>
            )}
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

