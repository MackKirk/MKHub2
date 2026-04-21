import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

const labelClass = 'text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1';
const inputClass = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300';

export function EquipmentNewForm({
  initialCategory = 'generator',
  onSuccess,
  onCancel,
  onValidationChange,
  formId = 'equipment-new-form',
}: {
  initialCategory?: string;
  onSuccess: (data: { id: string }) => void;
  onCancel: () => void;
  onValidationChange?: (canSubmit: boolean, isPending: boolean) => void;
  formId?: string;
}) {
  const [form, setForm] = useState({
    category: initialCategory,
    name: '',
    unit_number: '',
    serial_number: '',
    brand: '',
    model: '',
    value: '',
    warranty_expiry: '',
    purchase_date: '',
    status: 'available',
    notes: '',
  });

  const updateField = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        category: form.category,
        name: form.name.trim(),
        unit_number: form.unit_number.trim() || null,
        serial_number: form.serial_number.trim() || null,
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        value: form.value ? parseFloat(form.value) : null,
        warranty_expiry: form.warranty_expiry || null,
        purchase_date: form.purchase_date || null,
        status: form.status,
        notes: form.notes.trim() || null,
      };
      return api('POST', '/fleet/equipment', payload);
    },
    onSuccess: (data: any) => {
      toast.success('Equipment created successfully');
      onSuccess(data);
    },
    onError: () => {
      toast.error('Failed to create equipment');
    },
  });

  const canSubmit = form.name.trim().length > 0 && form.unit_number.trim().length > 0;

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
            <label className={labelClass}>Name <span className="text-red-600">*</span></label>
            <input type="text" value={form.name} onChange={(e) => updateField('name', e.target.value)} className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Unit Number <span className="text-red-600">*</span></label>
            <input type="text" value={form.unit_number} onChange={(e) => updateField('unit_number', e.target.value)} className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Category <span className="text-red-600">*</span></label>
            <select value={form.category} onChange={(e) => updateField('category', e.target.value)} className={inputClass} required>
              <option value="generator">Generator</option>
              <option value="tool">Tool</option>
              <option value="electronics">Electronics</option>
              <option value="small_tool">Small Tool</option>
              <option value="safety">Safety Equipment</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Serial Number</label>
            <input type="text" value={form.serial_number} onChange={(e) => updateField('serial_number', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Brand</label>
            <input type="text" value={form.brand} onChange={(e) => updateField('brand', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Model</label>
            <input type="text" value={form.model} onChange={(e) => updateField('model', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Value ($)</label>
            <input type="number" step="0.01" value={form.value} onChange={(e) => updateField('value', e.target.value)} className={inputClass} min={0} />
          </div>
          <div>
            <label className={labelClass}>Warranty Expiry</label>
            <input type="date" value={form.warranty_expiry} onChange={(e) => updateField('warranty_expiry', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Purchase Date</label>
            <input type="date" value={form.purchase_date} onChange={(e) => updateField('purchase_date', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select value={form.status} onChange={(e) => updateField('status', e.target.value)} className={inputClass}>
              <option value="available">Available</option>
              <option value="checked_out">Checked Out</option>
              <option value="maintenance">Maintenance</option>
              <option value="retired">Retired</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className={labelClass}>Notes</label>
          <textarea value={form.notes} onChange={(e) => updateField('notes', e.target.value)} rows={4} className={inputClass} />
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
              {createMutation.isPending ? 'Creating...' : 'Create Equipment'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

export default function EquipmentNew() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const categoryFromUrl = searchParams.get('category') || 'generator';

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">New Equipment</div>
            <div className="text-xs text-gray-500 mt-0.5">Create a new equipment item</div>
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
      <EquipmentNewForm
        initialCategory={categoryFromUrl}
        onSuccess={(data) => nav(`/company-assets/equipment/${data.id}`)}
        onCancel={() => nav(-1)}
      />
    </div>
  );
}

