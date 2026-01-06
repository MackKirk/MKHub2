import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export default function WorkOrderNew() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const entityType = searchParams.get('entity_type') || 'fleet';
  const entityId = searchParams.get('entity_id') || '';
  
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
  });

  const [form, setForm] = useState({
    entity_type: entityType,
    entity_id: entityId,
    description: '',
    category: 'maintenance',
    urgency: 'normal',
    status: 'open',
    assigned_to_user_id: '',
    labor_cost: '',
    parts_cost: '',
    other_cost: '',
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
      return api('POST', '/fleet/work-orders', payload);
    },
    onSuccess: (data: any) => {
      toast.success('Work order created successfully');
      nav(`/fleet/work-orders/${data.id}`);
    },
    onError: () => {
      toast.error('Failed to create work order');
    },
  });

  const canSubmit = form.description.trim().length > 0 && (form.entity_id || !entityId);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div>
          <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">New Work Order</div>
          <div className="text-sm text-gray-500 font-medium">Create a new work order</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
            <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
          </div>
          <button
            onClick={() => nav(-1)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700"
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
                Entity Type
              </label>
              <select
                value={form.entity_type}
                onChange={(e) => updateField('entity_type', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
              >
                <option value="fleet">Fleet Asset</option>
                <option value="equipment">Equipment</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                value={form.category}
                onChange={(e) => updateField('category', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
              >
                <option value="maintenance">Maintenance</option>
                <option value="repair">Repair</option>
                <option value="inspection">Inspection</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Urgency
              </label>
              <select
                value={form.urgency}
                onChange={(e) => updateField('urgency', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => updateField('status', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="pending_parts">Pending Parts</option>
                <option value="closed">Closed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assigned To
              </label>
              <select
                value={form.assigned_to_user_id}
                onChange={(e) => updateField('assigned_to_user_id', e.target.value)}
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
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Costs (Optional)</label>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Labor ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.labor_cost}
                  onChange={(e) => updateField('labor_cost', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Parts ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.parts_cost}
                  onChange={(e) => updateField('parts_cost', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Other ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.other_cost}
                  onChange={(e) => updateField('other_cost', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
                  min="0"
                />
              </div>
            </div>
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
              {createMutation.isPending ? 'Creating...' : 'Create Work Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

