import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

const labelClass = 'text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1';
const inputClass = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300';

export function WorkOrderNewForm({
  initialEntityType = 'fleet',
  initialEntityId = '',
  onSuccess,
  onCancel,
  onValidationChange,
  formId = 'work-order-new-form',
}: {
  initialEntityType?: string;
  initialEntityId?: string;
  onSuccess: (data: { id: string }) => void;
  onCancel: () => void;
  onValidationChange?: (canSubmit: boolean, isPending: boolean) => void;
  formId?: string;
}) {
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
  });

  const [form, setForm] = useState({
    entity_type: initialEntityType,
    entity_id: initialEntityId,
    description: '',
    category: 'maintenance',
    urgency: 'normal',
    status: 'open',
    assigned_to_user_id: '',
    labor_cost: '',
    parts_cost: '',
    other_cost: '',
    scheduled_date: '',
    scheduled_time: '',
    estimated_duration_minutes: '',
    body_repair_required: false,
    new_stickers_applied: false,
  });

  const updateField = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const costs: any = {};
      if (form.labor_cost) costs.labor = parseFloat(form.labor_cost);
      if (form.parts_cost) costs.parts = parseFloat(form.parts_cost);
      if (form.other_cost) costs.other = parseFloat(form.other_cost);
      if (Object.keys(costs).length > 0) {
        costs.total = (costs.labor || 0) + (costs.parts || 0) + (costs.other || 0);
      }

      const payload: any = {
        entity_type: form.entity_type,
        entity_id: form.entity_id || null,
        description: form.description.trim(),
        category: form.category,
        urgency: form.urgency,
        status: form.status,
        assigned_to_user_id: form.assigned_to_user_id || null,
        costs: Object.keys(costs).length > 0 ? costs : null,
        origin_source: 'manual',
      };
      if (form.entity_type === 'fleet') {
        if (form.scheduled_date) {
          const dateTime = form.scheduled_time
            ? `${form.scheduled_date}T${form.scheduled_time}:00`
            : `${form.scheduled_date}T09:00:00`;
          payload.scheduled_start_at = new Date(dateTime).toISOString();
        }
        if (form.estimated_duration_minutes) payload.estimated_duration_minutes = parseInt(form.estimated_duration_minutes, 10);
        payload.body_repair_required = !!form.body_repair_required;
        payload.new_stickers_applied = !!form.new_stickers_applied;
      }
      return api('POST', '/fleet/work-orders', payload);
    },
    onSuccess: (data: any) => {
      toast.success('Work order created successfully');
      onSuccess(data);
    },
    onError: () => {
      toast.error('Failed to create work order');
    },
  });

  const canSubmit = form.description.trim().length > 0;

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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Entity Type</label>
            <select
              value={form.entity_type}
              onChange={(e) => updateField('entity_type', e.target.value)}
              className={inputClass}
            >
              <option value="fleet">Fleet Asset</option>
              <option value="equipment">Equipment</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Category</label>
            <select
              value={form.category}
              onChange={(e) => updateField('category', e.target.value)}
              className={inputClass}
            >
              <option value="maintenance">Maintenance</option>
              <option value="repair">Repair</option>
              <option value="inspection">Inspection</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Urgency</label>
            <select
              value={form.urgency}
              onChange={(e) => updateField('urgency', e.target.value)}
              className={inputClass}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select
              value={form.status}
              onChange={(e) => updateField('status', e.target.value)}
              className={inputClass}
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="pending_parts">Pending Parts</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Assigned To</label>
            <select
              value={form.assigned_to_user_id}
              onChange={(e) => updateField('assigned_to_user_id', e.target.value)}
              className={inputClass}
            >
              <option value="">Unassigned</option>
              {Array.isArray(employees) && employees.map((emp: any) => (
                <option key={emp.id} value={emp.id}>
                  {emp.profile?.preferred_name || emp.profile?.first_name || emp.username}
                </option>
              ))}
            </select>
          </div>
        </div>

        {form.entity_type === 'fleet' && (
          <div className="border-t border-gray-200 pt-4 mt-4 space-y-4">
            <h3 className={labelClass}>Service / Scheduling</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Scheduled date</label>
                <input
                  type="date"
                  value={form.scheduled_date}
                  onChange={(e) => updateField('scheduled_date', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Time</label>
                <input
                  type="time"
                  value={form.scheduled_time}
                  onChange={(e) => updateField('scheduled_time', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Estimated duration (min)</label>
                <input
                  type="number"
                  min={0}
                  placeholder="e.g. 120"
                  value={form.estimated_duration_minutes}
                  onChange={(e) => updateField('estimated_duration_minutes', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="col-span-2 flex gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.body_repair_required}
                    onChange={(e) => updateField('body_repair_required', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Body repair required
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.new_stickers_applied}
                    onChange={(e) => updateField('new_stickers_applied', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  New stickers applied
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4">
          <label className={labelClass}>Description <span className="text-red-600">*</span></label>
          <textarea
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            rows={4}
            className={inputClass}
            required
          />
        </div>

        <div className="mt-4">
          <label className={labelClass}>Costs (optional)</label>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Labor ($)</label>
              <input
                type="number"
                step="0.01"
                value={form.labor_cost}
                onChange={(e) => updateField('labor_cost', e.target.value)}
                className={inputClass}
                min={0}
              />
            </div>
            <div>
              <label className={labelClass}>Parts ($)</label>
              <input
                type="number"
                step="0.01"
                value={form.parts_cost}
                onChange={(e) => updateField('parts_cost', e.target.value)}
                className={inputClass}
                min={0}
              />
            </div>
            <div>
              <label className={labelClass}>Other ($)</label>
              <input
                type="number"
                step="0.01"
                value={form.other_cost}
                onChange={(e) => updateField('other_cost', e.target.value)}
                className={inputClass}
                min={0}
              />
            </div>
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
              {createMutation.isPending ? 'Creating...' : 'Create Work Order'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

export default function WorkOrderNew() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const entityType = searchParams.get('entity_type') || 'fleet';
  const entityId = searchParams.get('entity_id') || '';
  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">New Work Order</div>
            <div className="text-xs text-gray-500 mt-0.5">Create a new work order</div>
          </div>
          <button
            onClick={() => nav(-1)}
            className="px-3 py-2 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
      <WorkOrderNewForm
        initialEntityType={entityType}
        initialEntityId={entityId}
        onSuccess={(data) => nav(`/fleet/work-orders/${data.id}`)}
        onCancel={() => nav(-1)}
      />
    </div>
  );
}
