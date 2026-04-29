import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import SafetySearchableSingle, { type SingleSelectRow } from '@/components/SafetySearchableSingle';

const labelClass = 'text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1';

/** Same chrome as `InspectionScheduleForm` / vehicle `SafetySearchableSingle` trigger. */
const scheduleFieldClass =
  'w-full min-h-[2.75rem] border-2 border-gray-200 rounded-xl bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 ' +
  'shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red ' +
  'disabled:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-70';

const scheduleTextareaClass = `${scheduleFieldClass} min-h-[5rem] resize-y py-2.5`;

const scheduleSelectClass = [
  scheduleFieldClass,
  'cursor-pointer appearance-none bg-[length:1rem_1rem] bg-[right_0.65rem_center] bg-no-repeat pr-10',
  "bg-[url(data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%236b7280%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M19%209l-7%207-7-7%22%2F%3E%3C%2Fsvg%3E)]",
].join(' ');

const FLEET_ASSETS_PAGE_LIMIT = 100;

async function fetchAllFleetAssetsAlphabetical(): Promise<any[]> {
  const limit = FLEET_ASSETS_PAGE_LIMIT;
  let page = 1;
  const all: any[] = [];
  for (;;) {
    const res = (await api<Record<string, unknown>>(
      'GET',
      `/fleet/assets?limit=${limit}&page=${page}&sort=name&dir=asc`
    )) as Record<string, unknown>;
    const raw = res?.items ?? (res as any)?.data;
    const items = Array.isArray(raw) ? raw : [];
    if (items.length === 0) break;
    all.push(...items);
    const total = typeof res.total === 'number' ? res.total : null;
    const totalPagesField =
      typeof (res as any).total_pages === 'number' ? Math.max(1, (res as any).total_pages as number) : null;
    const totalPagesComputed =
      total != null && total > 0 ? Math.max(1, Math.ceil(total / limit)) : null;
    const totalPages = totalPagesField ?? totalPagesComputed;
    if (totalPages != null) {
      if (page >= totalPages) break;
    } else if (items.length < limit) {
      break;
    }
    page += 1;
  }
  return all;
}

function fleetAssetToPickerLabel(asset: any): string {
  const type = String(asset.asset_type ?? 'asset').replace(/_/g, ' ');
  const unit =
    asset.unit_number != null && String(asset.unit_number).trim() !== ''
      ? ` · Unit ${String(asset.unit_number).trim()}`
      : '';
  const name =
    (asset.name != null && String(asset.name).trim() !== ''
      ? String(asset.name).trim()
      : [asset.make, asset.model].filter(Boolean).join(' ').trim()) || 'Unnamed';
  return `${name} (${type})${unit}`;
}

export function WorkOrderNewForm({
  initialEntityType = 'fleet',
  initialEntityId = '',
  onSuccess,
  onCancel,
  onValidationChange,
  formId = 'work-order-new-form',
  /** Searchable A–Z vehicle list (e.g. fleet schedule modal). Implies fleet entity. */
  vehiclePickerSearchable = false,
}: {
  initialEntityType?: string;
  initialEntityId?: string;
  onSuccess: (data: { id: string }) => void;
  onCancel: () => void;
  onValidationChange?: (canSubmit: boolean, isPending: boolean) => void;
  formId?: string;
  vehiclePickerSearchable?: boolean;
}) {
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
  });

  const [form, setForm] = useState({
    entity_type: vehiclePickerSearchable ? 'fleet' : initialEntityType,
    entity_id: initialEntityId,
    description: '',
    category: 'maintenance',
    urgency: 'normal',
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

  const {
    data: assetsForPicker = [],
    isLoading: fleetAssetsLoading,
    isError: fleetAssetsError,
    error: fleetAssetsErrorObj,
    refetch: refetchFleetAssets,
  } = useQuery({
    queryKey: ['fleetAssetsSchedulePicker'],
    queryFn: fetchAllFleetAssetsAlphabetical,
    enabled: vehiclePickerSearchable || form.entity_type === 'fleet',
    staleTime: 60_000,
  });

  const vehiclePickerRows: SingleSelectRow[] = useMemo(() => {
    const rows = assetsForPicker
      .filter((asset: any) => asset?.id != null && String(asset.id).trim() !== '')
      .map((asset: any) => ({
        value: String(asset.id),
        label: fleetAssetToPickerLabel(asset),
      }));
    rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    return rows;
  }, [assetsForPicker]);

  const updateField = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (!vehiclePickerSearchable) return;
    setForm((prev) => (prev.entity_type === 'fleet' ? prev : { ...prev, entity_type: 'fleet' }));
  }, [vehiclePickerSearchable]);

  useEffect(() => {
    if (!initialEntityId?.trim()) return;
    setForm((prev) => ({ ...prev, entity_id: initialEntityId.trim() }));
  }, [initialEntityId]);

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
        status: 'open',
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

  const fleetVehicleRequired = form.entity_type === 'fleet';
  const hasFleetVehicle = Boolean(form.entity_id && String(form.entity_id).trim() !== '');
  const canSubmit =
    form.description.trim().length > 0 && (!fleetVehicleRequired || hasFleetVehicle);

  useEffect(() => {
    onValidationChange?.(canSubmit, createMutation.isPending);
  }, [canSubmit, createMutation.isPending, onValidationChange]);

  const fieldClass = scheduleFieldClass;
  const selectClass = scheduleSelectClass;
  const textareaClass = scheduleTextareaClass;
  const checkboxClass =
    'h-4 w-4 shrink-0 rounded border-2 border-gray-300 text-brand-red focus:ring-2 focus:ring-brand-red/30 focus:ring-offset-0';

  const fleetVehicleField = (
    <div className="min-w-0">
      <label className={labelClass}>
        Vehicle <span className="text-red-600">*</span>
      </label>
      {fleetAssetsLoading ? (
        <div className={`${scheduleFieldClass} bg-gray-50 text-gray-500`}>Loading vehicles…</div>
      ) : fleetAssetsError ? (
        <div className="space-y-2">
          <div className={`${scheduleFieldClass} border-red-200 bg-red-50 text-red-800 text-sm`}>
            Could not load vehicles.
            {(fleetAssetsErrorObj as Error)?.message
              ? ` ${(fleetAssetsErrorObj as Error).message}`
              : ' Check your connection and permissions, then try again.'}
          </div>
          <button
            type="button"
            onClick={() => refetchFleetAssets()}
            className="text-xs font-medium text-brand-red hover:underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <SafetySearchableSingle
          hideLabel
          label="Vehicle"
          value={form.entity_id}
          onChange={(v) => updateField('entity_id', v)}
          rows={vehiclePickerRows}
          emptyLabel="Select vehicle"
          searchPlaceholder="Search by name, unit #, type…"
        />
      )}
    </div>
  );

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
          {vehiclePickerSearchable ? (
            fleetVehicleField
          ) : (
            <div>
              <label className={labelClass}>Entity Type</label>
              <select
                value={form.entity_type}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((prev) => ({ ...prev, entity_type: v, entity_id: '' }));
                }}
                className={selectClass}
              >
                <option value="fleet">Fleet Asset</option>
                <option value="equipment">Equipment</option>
              </select>
            </div>
          )}
          <div>
            <label className={labelClass}>Category</label>
            <select
              value={form.category}
              onChange={(e) => updateField('category', e.target.value)}
              className={selectClass}
            >
              <option value="maintenance">Maintenance</option>
              <option value="repair">Repair</option>
              <option value="inspection">Inspection</option>
              <option value="other">Other</option>
            </select>
          </div>
          {!vehiclePickerSearchable && form.entity_type === 'fleet' && fleetVehicleField}
          <div>
            <label className={labelClass}>Urgency</label>
            <select
              value={form.urgency}
              onChange={(e) => updateField('urgency', e.target.value)}
              className={selectClass}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Assigned To</label>
            <select
              value={form.assigned_to_user_id}
              onChange={(e) => updateField('assigned_to_user_id', e.target.value)}
              className={selectClass}
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
                  className={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>Time</label>
                <input
                  type="time"
                  value={form.scheduled_time}
                  onChange={(e) => updateField('scheduled_time', e.target.value)}
                  className={fieldClass}
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
                  className={fieldClass}
                />
              </div>
              <div className="col-span-2 flex gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.body_repair_required}
                    onChange={(e) => updateField('body_repair_required', e.target.checked)}
                    className={checkboxClass}
                  />
                  Body repair required
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.new_stickers_applied}
                    onChange={(e) => updateField('new_stickers_applied', e.target.checked)}
                    className={checkboxClass}
                  />
                  New decals required
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
            className={textareaClass}
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
                className={fieldClass}
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
                className={fieldClass}
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
                className={fieldClass}
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
