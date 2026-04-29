import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { formatDateLocal } from '@/lib/dateUtils';
import SafetySearchableSingle, { type SingleSelectRow } from '@/components/SafetySearchableSingle';

const labelClass = 'text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1';

/** Matches `SafetySearchableSingle` trigger — use for date, selects, and read-only rows in the schedule form. */
const scheduleFieldClass =
  'w-full min-h-[2.75rem] border-2 border-gray-200 rounded-xl bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 ' +
  'shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red ' +
  'disabled:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-70';

const scheduleTextareaClass =
  `${scheduleFieldClass} min-h-[5rem] resize-y py-2.5`;

/** Native selects: same chrome + chevron (encoded SVG, no nested quotes for Tailwind). */
const scheduleSelectClass = [
  scheduleFieldClass,
  'cursor-pointer appearance-none bg-[length:1rem_1rem] bg-[right_0.65rem_center] bg-no-repeat pr-10',
  "bg-[url(data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%236b7280%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M19%209l-7%207-7-7%22%2F%3E%3C%2Fsvg%3E)]",
].join(' ');

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

const FLEET_ASSETS_PAGE_LIMIT = 100;

/** Loads every fleet asset (paginates); list is ordered A→Z in the picker via `vehiclePickerRows`. */
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

/** Form to create an inspection schedule (agendamento). Creates the schedule and both Body and Mechanical inspections as pending. */
export function InspectionScheduleForm({
  initialAssetId = '',
  onSuccess,
  onCancel,
  onValidationChange,
  formId = 'inspection-schedule-form',
  /** When true, render only the form fields (for use inside SafetyFormModalLayout). */
  embedded = false,
  /** When true (with a non-empty initialAssetId), vehicle is fixed to that asset and cannot be changed. */
  vehicleSelectionLocked = false,
  /** Shown when vehicleSelectionLocked; falls back to initialAssetId if omitted. */
  lockedVehicleDisplayName,
  /** Searchable combobox + portal dropdown (e.g. fleet calendar modal). */
  vehiclePickerSearchable = false,
}: {
  initialAssetId?: string;
  onSuccess: (data: { id: string }) => void;
  onCancel: () => void;
  onValidationChange?: (canSubmit: boolean, isPending: boolean) => void;
  formId?: string;
  embedded?: boolean;
  vehicleSelectionLocked?: boolean;
  lockedVehicleDisplayName?: string;
  vehiclePickerSearchable?: boolean;
}) {
  const queryClient = useQueryClient();
  const isVehicleLocked = Boolean(vehicleSelectionLocked && initialAssetId?.trim());

  const {
    data: assetsForPicker = [],
    isLoading: fleetAssetsLoading,
    isError: fleetAssetsError,
    error: fleetAssetsErrorObj,
    refetch: refetchFleetAssets,
  } = useQuery({
    queryKey: ['fleetAssetsSchedulePicker'],
    queryFn: fetchAllFleetAssetsAlphabetical,
    enabled: !isVehicleLocked,
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

  const [form, setForm] = useState({
    fleet_asset_id: initialAssetId?.trim() ?? '',
    scheduled_at: formatDateLocal(new Date()),
    urgency: 'normal',
    category: 'inspection',
    notes: '',
  });

  useEffect(() => {
    if (!isVehicleLocked || !initialAssetId?.trim()) return;
    setForm((prev) => ({ ...prev, fleet_asset_id: initialAssetId.trim() }));
  }, [isVehicleLocked, initialAssetId]);

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

  const formEl = (
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) createMutation.mutate();
        }}
        className={embedded ? 'space-y-4' : 'p-4'}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Vehicle <span className="text-red-600">*</span></label>
            {isVehicleLocked ? (
              <div
                className={`${scheduleFieldClass} bg-gray-50 text-gray-800 cursor-default`}
                title="This schedule is for the asset you opened"
              >
                {lockedVehicleDisplayName?.trim() || initialAssetId}
              </div>
            ) : fleetAssetsLoading ? (
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
            ) : vehiclePickerSearchable ? (
              <SafetySearchableSingle
                hideLabel
                label="Vehicle"
                value={form.fleet_asset_id}
                onChange={(v) => updateField('fleet_asset_id', v)}
                rows={vehiclePickerRows}
                emptyLabel="Select vehicle"
                searchPlaceholder="Search by name, unit #, type…"
              />
            ) : (
              <select
                value={form.fleet_asset_id}
                onChange={(e) => updateField('fleet_asset_id', e.target.value)}
                className={scheduleSelectClass}
                required
              >
                <option value="">Select vehicle</option>
                {vehiclePickerRows.map((row) => (
                  <option key={row.value} value={row.value}>
                    {row.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className={labelClass}>Date <span className="text-red-600">*</span></label>
            <input
              type="date"
              value={form.scheduled_at}
              onChange={(e) => updateField('scheduled_at', e.target.value)}
              className={scheduleFieldClass}
              required
            />
          </div>
          <div>
            <label className={labelClass}>Urgency</label>
            <select
              value={form.urgency}
              onChange={(e) => updateField('urgency', e.target.value)}
              className={scheduleSelectClass}
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
              className={scheduleSelectClass}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={embedded ? '' : 'mt-4'}>
          <label className={labelClass}>Notes (optional)</label>
          <textarea
            value={form.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            rows={3}
            className={scheduleTextareaClass}
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
  );

  if (embedded) {
    return formEl;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <h4 className={labelClass}>Schedule</h4>
      </div>
      {formEl}
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
