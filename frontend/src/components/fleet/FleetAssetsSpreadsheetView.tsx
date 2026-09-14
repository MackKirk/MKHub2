import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import {
  AppBadge,
  AppTooltip,
  uiBorders,
  uiColors,
  uiCx,
  uiTypography,
} from '@/components/ui';
import {
  formatFleetAssetStatus,
  getFleetDueStatusBadgeVariant,
} from '@/lib/fleetUi';

const EM_DASH = '—';
const COMPLIANCE_TYPE_ORDER = ['CVIP', 'NDT', 'CRANE', 'PROPANE'] as const;

export type FleetSpreadsheetComplianceStatus = {
  label: string;
  expiry_date?: string | null;
};

export type FleetSpreadsheetAsset = {
  id: string;
  asset_type: string;
  name?: string;
  unit_number?: string;
  vin?: string;
  license_plate?: string;
  make?: string;
  model?: string;
  year?: number;
  condition?: string;
  status: string;
  driver_id?: string;
  driver_name?: string;
  assigned_to_name?: string | null;
  driver_contact_phone?: string;
  department?: string | null;
  fuel_type?: string;
  vehicle_type?: string;
  yard_location?: string;
  icbc_registration_no?: string;
  vancouver_decals?: string[];
  ferry_length?: string;
  gvw_kg?: number;
  gvw_value?: number;
  gvw_unit?: string;
  compliance_by_type?: Record<string, FleetSpreadsheetComplianceStatus>;
};

type SortColumn =
  | 'unit_number'
  | 'name'
  | 'type'
  | 'year'
  | 'plate_vin'
  | 'assignment'
  | 'compliance'
  | 'status';

type Props = {
  assets: FleetSpreadsheetAsset[];
  sortBy: SortColumn;
  sortDir: 'asc' | 'desc';
  onSort: (column: SortColumn) => void;
  onRowNavigate: (assetId: string) => void;
  isFetching?: boolean;
};

function getAssetTypeLabel(assetType: string): string {
  if (assetType === 'vehicle') return 'Vehicle';
  if (assetType === 'heavy_machinery') return 'Heavy Machinery';
  if (assetType === 'other') return 'Other Asset';
  return assetType;
}

function statusDotClass(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-500';
    case 'maintenance':
      return 'bg-amber-500';
    case 'retired':
      return 'bg-red-500';
    case 'inactive':
      return 'bg-gray-400';
    default:
      return 'bg-gray-400';
  }
}

function PopoverSection({ title, rows }: { title?: string; rows: Array<{ label: string; value: ReactNode }> }) {
  if (!rows.length) return null;
  return (
    <div className="space-y-1.5">
      {title ? <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-300">{title}</div> : null}
      <dl className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[5.5rem_1fr] gap-x-2">
            <dt className="text-gray-400">{row.label}</dt>
            <dd className="min-w-0 break-words font-medium text-white">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CopyValueButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={copied ? 'Copied' : label}
      aria-label={copied ? 'Copied' : label}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function SortableTh({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  column: SortColumn;
  sortBy: SortColumn;
  sortDir: 'asc' | 'desc';
  onSort: (column: SortColumn) => void;
  className?: string;
}) {
  const active = sortBy === column;
  const arrow = sortDir === 'asc' ? '↑' : '↓';
  return (
    <th className={uiCx('px-2 py-1.5 text-left', uiTypography.controlLabel, className)}>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-semibold text-gray-700 hover:text-gray-900"
        onClick={() => onSort(column)}
        title={`Sort by ${label.toLowerCase()}`}
      >
        <span>{label}</span>
        <span className={uiCx('inline-block w-3 shrink-0 text-center', active ? undefined : 'invisible')} aria-hidden={!active}>
          {active ? arrow : '↑'}
        </span>
      </button>
    </th>
  );
}

function StaticTh({ label, className }: { label: string; className?: string }) {
  return (
    <th className={uiCx('px-2 py-1.5 text-left font-semibold text-gray-700', uiTypography.controlLabel, className)}>
      {label}
    </th>
  );
}

function formatGvw(asset: FleetSpreadsheetAsset): string | null {
  if (asset.gvw_kg != null) return `${asset.gvw_kg.toLocaleString()} kg`;
  if (asset.gvw_value != null) {
    const unit = asset.gvw_unit?.trim();
    return unit ? `${asset.gvw_value.toLocaleString()} ${unit}` : asset.gvw_value.toLocaleString();
  }
  return null;
}

function formatExpiry(iso?: string | null): string | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso.slice(0, 10));
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function FleetAssetsSpreadsheetView({
  assets,
  sortBy,
  sortDir,
  onSort,
  onRowNavigate,
  isFetching,
}: Props) {
  return (
    <div
      className={uiCx(
        'overflow-x-auto min-w-0',
        isFetching && assets.length > 0 ? 'opacity-60 pointer-events-none' : undefined,
      )}
    >
      <table className={uiCx('w-full min-w-[980px] table-fixed border-collapse', uiBorders.subtle)}>
        <colgroup>
          <col className="w-[9%]" />
          <col className="w-[16%]" />
          <col className="w-[16%]" />
          <col className="w-[12%]" />
          <col className="w-[16%]" />
          <col className="w-[13%]" />
          <col className="w-[18%]" />
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className={uiCx(uiColors.surfaceSubtle, 'border-b border-gray-200')}>
            <SortableTh label="Unit #" column="unit_number" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <SortableTh label="Assigned" column="assignment" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <SortableTh label="Model" column="name" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <SortableTh label="License Plate" column="plate_vin" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <StaticTh label="VIN" />
            <StaticTh label="ICBC Registration" />
            <SortableTh label="Compliance" column="compliance" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            const assignee =
              (asset.assigned_to_name && asset.assigned_to_name.trim()) ||
              (asset.driver_name && asset.driver_name.trim()) ||
              null;
            const modelLabel =
              (asset.model && asset.model.trim()) ||
              [asset.make, asset.model].filter(Boolean).join(' ').trim() ||
              (asset.name && asset.name.trim()) ||
              EM_DASH;
            const byType = asset.compliance_by_type || {};
            const complianceEntries = COMPLIANCE_TYPE_ORDER.filter((t) => byType[t]).map(
              (t) => [t, byType[t]] as const,
            );
            const decals = Array.isArray(asset.vancouver_decals)
              ? asset.vancouver_decals.map((d) => String(d).trim()).filter(Boolean)
              : [];
            const gvw = formatGvw(asset);
            const unitRows = [
              { label: 'Status', value: formatFleetAssetStatus(asset.status) },
              { label: 'Asset Type', value: getAssetTypeLabel(asset.asset_type) },
            ];
            const assignedRows = [
              asset.driver_contact_phone?.trim()
                ? { label: 'Phone', value: asset.driver_contact_phone.trim() }
                : null,
              asset.department?.trim() ? { label: 'Department', value: asset.department.trim() } : null,
              asset.yard_location?.trim() ? { label: 'Sleeps', value: asset.yard_location.trim() } : null,
            ].filter(Boolean) as Array<{ label: string; value: ReactNode }>;
            const modelRows = [
              asset.make?.trim() ? { label: 'Make', value: asset.make.trim() } : null,
              asset.model?.trim() ? { label: 'Model', value: asset.model.trim() } : null,
              asset.year != null ? { label: 'Year', value: String(asset.year) } : null,
              asset.fuel_type?.trim() ? { label: 'Fuel', value: asset.fuel_type.trim() } : null,
              asset.vehicle_type?.trim() ? { label: 'Vehicle Type', value: asset.vehicle_type.trim() } : null,
              asset.condition?.trim() ? { label: 'Condition', value: asset.condition.trim() } : null,
              gvw ? { label: 'GVWR', value: gvw } : null,
              asset.ferry_length?.trim() ? { label: 'Ferry Length', value: asset.ferry_length.trim() } : null,
            ].filter(Boolean) as Array<{ label: string; value: ReactNode }>;

            return (
              <tr
                key={asset.id}
                className="cursor-pointer border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50 h-10"
                onClick={() => onRowNavigate(asset.id)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onRowNavigate(asset.id);
                  }
                }}
              >
                <td className="px-2 py-1.5 align-middle">
                  <AppTooltip
                    wrap
                    content={
                      <div className="space-y-2">
                        <div className="font-semibold text-white">
                          Unit #{asset.unit_number?.trim() || EM_DASH}
                        </div>
                        <PopoverSection rows={unitRows} />
                      </div>
                    }
                  >
                    <button
                      type="button"
                      className="inline-flex max-w-full items-center gap-1.5 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Unit ${asset.unit_number || 'unknown'} details`}
                    >
                      <span className={uiCx('truncate text-sm font-medium tabular-nums', uiColors.textStrong)}>
                        {asset.unit_number?.trim() || EM_DASH}
                      </span>
                      <span
                        className={uiCx('h-1.5 w-1.5 shrink-0 rounded-full', statusDotClass(asset.status))}
                        title={formatFleetAssetStatus(asset.status)}
                        aria-hidden
                      />
                      <span className="sr-only">{formatFleetAssetStatus(asset.status)}</span>
                    </button>
                  </AppTooltip>
                </td>

                <td className="min-w-0 px-2 py-1.5 align-middle">
                  {assignee ? (
                    <AppTooltip
                      wrap
                      disabled={assignedRows.length === 0}
                      content={
                        <div className="space-y-2">
                          <div className="font-semibold text-white">{assignee}</div>
                          <PopoverSection rows={assignedRows} />
                        </div>
                      }
                    >
                      <button
                        type="button"
                        className="max-w-full truncate rounded text-left text-sm text-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {assignee}
                      </button>
                    </AppTooltip>
                  ) : (
                    <AppBadge variant="success" className="!px-1.5 !py-0 !text-[10px]">
                      Available
                    </AppBadge>
                  )}
                </td>

                <td className="min-w-0 px-2 py-1.5 align-middle">
                  <AppTooltip
                    wrap
                    disabled={modelRows.length === 0}
                    content={
                      <div className="space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-300">
                          Asset Details
                        </div>
                        <PopoverSection rows={modelRows} />
                      </div>
                    }
                  >
                    <button
                      type="button"
                      className="max-w-full truncate rounded text-left text-sm font-medium text-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {modelLabel}
                    </button>
                  </AppTooltip>
                </td>

                <td className="min-w-0 px-2 py-1.5 align-middle">
                  {asset.license_plate?.trim() ? (
                    <div className="flex min-w-0 items-center gap-0.5">
                      <AppTooltip
                        wrap
                        content={
                          <div className="space-y-2">
                            <div className="font-semibold text-white">{asset.license_plate.trim()}</div>
                            {decals.length ? (
                              <PopoverSection
                                rows={[{ label: 'Van. Decal', value: decals.join(', ') }]}
                              />
                            ) : (
                              <div className="text-gray-400">No Vancouver decal on file</div>
                            )}
                          </div>
                        }
                      >
                        <button
                          type="button"
                          className="min-w-0 truncate whitespace-nowrap rounded text-left text-sm tabular-nums text-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {asset.license_plate.trim()}
                        </button>
                      </AppTooltip>
                      <CopyValueButton value={asset.license_plate.trim()} label="Copy plate" />
                    </div>
                  ) : (
                    <span className={uiTypography.helper}>{EM_DASH}</span>
                  )}
                </td>

                <td className="min-w-0 px-2 py-1.5 align-middle">
                  {asset.vin?.trim() ? (
                    <div className="flex min-w-0 items-center gap-0.5">
                      <AppTooltip
                        wrap
                        content={
                          <div className="break-all font-semibold text-white">{asset.vin.trim()}</div>
                        }
                      >
                        <button
                          type="button"
                          className="min-w-0 truncate whitespace-nowrap rounded text-left text-sm tabular-nums text-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {asset.vin.trim()}
                        </button>
                      </AppTooltip>
                      <CopyValueButton value={asset.vin.trim()} label="Copy VIN" />
                    </div>
                  ) : (
                    <span className={uiTypography.helper}>{EM_DASH}</span>
                  )}
                </td>

                <td className="min-w-0 px-2 py-1.5 align-middle">
                  {asset.icbc_registration_no?.trim() ? (
                    <div className="flex min-w-0 items-center gap-0.5">
                      <span className="min-w-0 truncate whitespace-nowrap text-sm tabular-nums text-gray-900">
                        {asset.icbc_registration_no.trim()}
                      </span>
                      <CopyValueButton
                        value={asset.icbc_registration_no.trim()}
                        label="Copy registration"
                      />
                    </div>
                  ) : (
                    <span className={uiTypography.helper}>{EM_DASH}</span>
                  )}
                </td>

                <td className="min-w-0 px-2 py-1.5 align-middle">
                  {complianceEntries.length === 0 ? (
                    <span className={uiTypography.helper}>{EM_DASH}</span>
                  ) : (
                    <AppTooltip
                      wrap
                      content={
                        <div className="space-y-2.5">
                          {complianceEntries.map(([type, s]) => (
                            <PopoverSection
                              key={type}
                              title={type}
                              rows={[
                                { label: 'Status', value: s.label },
                                ...(formatExpiry(s.expiry_date)
                                  ? [{ label: 'Expiry', value: formatExpiry(s.expiry_date) as string }]
                                  : []),
                              ]}
                            />
                          ))}
                        </div>
                      }
                    >
                      <button
                        type="button"
                        className="flex max-w-full flex-wrap gap-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Compliance details"
                      >
                        {complianceEntries.map(([type, s]) => (
                          <AppBadge
                            key={type}
                            variant={getFleetDueStatusBadgeVariant(s.label)}
                            className="!px-1.5 !py-0 !text-[10px] uppercase"
                          >
                            {type}: {s.label}
                          </AppBadge>
                        ))}
                      </button>
                    </AppTooltip>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
