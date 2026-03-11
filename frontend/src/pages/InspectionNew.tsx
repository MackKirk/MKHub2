import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { formatDateLocal } from '@/lib/dateUtils';

const CATEGORY_OPTIONS = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'repair', label: 'Repair' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'other', label: 'Other' },
];

const URGENCY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

/** Form to create an inspection schedule (agendamento). Creates the schedule and both Body and Mechanical inspections as pending. */
export function InspectionScheduleForm({
  initialAssetId = '',
  onSuccess,
  onCancel,
}: {
  initialAssetId?: string;
  onSuccess: (data: { id: string }) => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: assetsRes } = useQuery({
    queryKey: ['fleetAssets'],
    queryFn: () => api<{ items: any[] }>('GET', '/fleet/assets?limit=500'),
  });
  const assets = assetsRes?.items ?? [];

  const [form, setForm] = useState({
    fleet_asset_id: initialAssetId,
    scheduled_at: formatDateLocal(new Date()),
    urgency: 'normal',
    category: 'inspection',
    notes: '',
  });

  const updateField = (field: string, value: string) => {
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
    onSuccess: (data) => {
      toast.success('Inspection scheduled successfully');
      queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-inspection-schedules-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['inspections'] });
      queryClient.invalidateQueries({ queryKey: ['inspections-sidebar'] });
      onSuccess(data);
    },
    onError: () => {
      toast.error('Failed to schedule inspection');
    },
  });

  const canSubmit = form.fleet_asset_id.trim().length > 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) createMutation.mutate();
        }}
        className="space-y-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vehicle <span className="text-red-500">*</span>
            </label>
            <select
              value={form.fleet_asset_id}
              onChange={(e) => updateField('fleet_asset_id', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
              required
            >
              <option value="">Select vehicle</option>
              {Array.isArray(assets) &&
                assets.map((asset: any) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name} ({asset.asset_type?.replace('_', ' ') ?? 'asset'})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.scheduled_at}
              onChange={(e) => updateField('scheduled_at', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Urgency</label>
            <select
              value={form.urgency}
              onChange={(e) => updateField('urgency', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
            >
              {URGENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={form.category}
              onChange={(e) => updateField('category', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            value={form.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
            placeholder="Observações..."
          />
        </div>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onCancel} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit || createMutation.isPending}
            className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createMutation.isPending ? 'Scheduling...' : 'Schedule inspection'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function InspectionNew() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const assetId = searchParams.get('asset_id') || '';
  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Schedule inspection</div>
            <div className="text-xs text-gray-500 mt-0.5">Creates the schedule and both Body and Mechanical inspections (pending). Open them from the list to fill the checklist.</div>
          </div>
          <button
            onClick={() => nav(-1)}
            className="px-3 py-2 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
      <InspectionScheduleForm
        initialAssetId={assetId}
        onSuccess={() => nav('/fleet/calendar')}
        onCancel={() => nav(-1)}
      />
    </div>
  );
}
