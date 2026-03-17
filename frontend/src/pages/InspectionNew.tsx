import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { formatDateLocal } from '@/lib/dateUtils';

const labelClass = 'text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1';
const inputClass = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300';

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
  onValidationChange,
  formId = 'inspection-schedule-form',
}: {
  initialAssetId?: string;
  onSuccess: (data: { id: string }) => void;
  onCancel: () => void;
  onValidationChange?: (canSubmit: boolean, isPending: boolean) => void;
  formId?: string;
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

  useEffect(() => {
    onValidationChange?.(canSubmit, createMutation.isPending);
  }, [canSubmit, createMutation.isPending, onValidationChange]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <h4 className={labelClass}>Schedule</h4>
      </div>
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) createMutation.mutate();
        }}
        className="p-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Vehicle <span className="text-red-600">*</span></label>
            <select
              value={form.fleet_asset_id}
              onChange={(e) => updateField('fleet_asset_id', e.target.value)}
              className={inputClass}
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
            <label className={labelClass}>Date <span className="text-red-600">*</span></label>
            <input
              type="date"
              value={form.scheduled_at}
              onChange={(e) => updateField('scheduled_at', e.target.value)}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className={labelClass}>Urgency</label>
            <select
              value={form.urgency}
              onChange={(e) => updateField('urgency', e.target.value)}
              className={inputClass}
            >
              {URGENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Category</label>
            <select
              value={form.category}
              onChange={(e) => updateField('category', e.target.value)}
              className={inputClass}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className={labelClass}>Notes (optional)</label>
          <textarea
            value={form.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            rows={3}
            className={inputClass}
            placeholder="Observações..."
          />
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
              {createMutation.isPending ? 'Scheduling...' : 'Schedule inspection'}
            </button>
          </div>
        )}
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
