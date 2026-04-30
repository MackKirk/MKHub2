import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useMemo, useState } from 'react';
import { FleetAssetNewForm } from './FleetAssetNew';
import { EquipmentNewForm } from './EquipmentNew';
import OverlayPortal from '@/components/OverlayPortal';
import { FleetEquipmentPageHeader } from '@/components/fleet/FleetEquipmentPageHeader';

type DashboardData = {
  total_fleet_assets: number;
  total_vehicles: number;
  total_heavy_machinery: number;
  total_other_assets: number;
  assigned_now_count: number;
  inspections_due_count: number;
  inspections_due_total: number;
  inspections_due: Array<{ id: string; name: string; asset_type: string; last_inspection: string | null }>;
  open_work_orders_count: number;
  in_progress_work_orders_count: number;
  pending_parts_work_orders_count: number;
  overdue_equipment_count: number;
  overdue_equipment: Array<{ id: string; equipment_id: string; equipment_name: string; checked_out_by: string; expected_return_date: string | null }>;
  compliance_expiring_count: number;
  compliance_expiring: Array<{ id: string; fleet_asset_id: string; fleet_asset_name: string | null; record_type: string; expiry_date: string | null }>;
};

type KpiStatus = 'ok' | 'attention' | 'critical' | 'info' | 'coming_soon';
type DashboardIcon = React.FC<{ className?: string }>;

// --- Helpers ---
function getKpiState(
  value: number,
  options?: { attentionAbove?: number; criticalAbove?: number }
): KpiStatus {
  if (value === 0) return 'ok';
  const { attentionAbove = 0, criticalAbove = 10 } = options ?? {};
  if (criticalAbove > 0 && value >= criticalAbove) return 'critical';
  if (attentionAbove >= 0 && value > attentionAbove) return 'attention';
  return 'ok';
}

function formatCountSubtext(vehicles: number, heavy: number, other: number): string {
  return `${vehicles} vehicles • ${heavy} heavy • ${other} other`;
}

function buildAssetLink(id: string): string {
  return `/fleet/assets/${id}`;
}

// --- Icons (inline SVGs) ---
const IconFleet: DashboardIcon = ({ className = 'w-6 h-6 text-gray-500' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);
const IconUserCheck: DashboardIcon = ({ className = 'w-6 h-6 text-gray-500' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14v7m0 0v-7m0 7h4" />
  </svg>
);
const IconAlertCircle: DashboardIcon = ({ className = 'w-6 h-6 text-gray-500' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const IconWrench: DashboardIcon = ({ className = 'w-6 h-6 text-gray-500' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const IconHeavy: DashboardIcon = ({ className = 'w-6 h-6 text-gray-500' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16h16M6 16l2-6h8l2 6M8 10V7h8v3M7 19a2 2 0 100-4 2 2 0 000 4zm10 0a2 2 0 100-4 2 2 0 000 4z" />
  </svg>
);
const IconCalendar: DashboardIcon = ({ className = 'w-6 h-6 text-gray-500' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M5 11h14M5 7h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2z" />
  </svg>
);
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
      {children}
    </div>
  );
}

// --- KPIStatCard ---
function KPIStatCard({
  title,
  value,
  subtext,
  icon: Icon,
  status,
  onClick,
  tooltipTitle,
  iconTone = 'bg-gray-50 text-gray-600',
}: {
  title: string;
  value: number | string;
  subtext: string;
  icon: DashboardIcon;
  status: KpiStatus;
  onClick?: () => void;
  tooltipTitle?: string;
  iconTone?: string;
}) {
  const accentMap: Record<KpiStatus, string> = {
    ok: 'border-l-green-500',
    attention: 'border-l-amber-500',
    critical: 'border-l-red-500',
    info: 'border-l-blue-500',
    coming_soon: 'border-l-gray-400',
  };
  const pillMap: Record<KpiStatus, { label: string; className: string }> = {
    ok: { label: 'OK', className: 'bg-green-100 text-green-800' },
    attention: { label: 'Attention', className: 'bg-amber-100 text-amber-800' },
    critical: { label: 'Critical', className: 'bg-red-100 text-red-800' },
    info: { label: 'Info', className: 'bg-blue-100 text-blue-800' },
    coming_soon: { label: 'Coming soon', className: 'bg-gray-100 text-gray-600' },
  };
  const pill = pillMap[status];
  const accent = accentMap[status];
  const displayValue = typeof value === 'number' && value === 0 && status === 'coming_soon' ? '—' : value;

  return (
    <div
      role={onClick ? 'button' : undefined}
      onClick={onClick}
      title={tooltipTitle}
      className={`relative flex h-[130px] flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm border-l-4 ${accent} ${onClick ? 'cursor-pointer transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:bg-gray-50/50 hover:shadow' : ''}`}
    >
      {status !== 'ok' && (
        <div className="absolute top-3 right-3">
          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${pill.className}`}>
            {pill.label}
          </span>
        </div>
      )}
      <div className="flex items-start gap-3 flex-1">
        <div className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${iconTone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{title}</div>
          <div className="text-3xl font-bold text-gray-900 mt-1 tabular-nums">{displayValue}</div>
          <div className="text-xs text-gray-500 mt-2">{subtext}</div>
        </div>
      </div>
    </div>
  );
}

// --- FleetMixPanel ---
function FleetMixPanel({
  vehicles,
  heavy,
  other,
  total,
}: {
  vehicles: number;
  heavy: number;
  other: number;
  total: number;
}) {
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const rows = [
    { label: 'Vehicles', count: vehicles, pct: pct(vehicles), color: 'bg-blue-500' },
    { label: 'Heavy', count: heavy, pct: pct(heavy), color: 'bg-slate-500' },
    { label: 'Other', count: other, pct: pct(other), color: 'bg-violet-400' },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm min-w-0">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Fleet Mix</h2>
      <div className="space-y-4">
        {rows.map(({ label, count, pct, color }) => (
          <div key={label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium text-gray-700">{label}</span>
              <span className="text-gray-500 tabular-nums">{count} ({pct}%)</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${color}`}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 border-t border-gray-100 pt-3 text-xs">
        <div className="flex justify-between">
          <span className="font-medium text-gray-600">Total</span>
          <span className="font-semibold text-gray-900 tabular-nums">{total.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// --- ComplianceExpiringPanel ---
function ComplianceExpiringPanel({
  items,
  total,
  onViewAll,
  onOpenAsset,
}: {
  items: DashboardData['compliance_expiring'];
  total: number;
  onViewAll: () => void;
  onOpenAsset: (assetId: string) => void;
}) {
  const list = items.slice(0, 5);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm min-w-0">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">
          Compliance expiring{total > 0 ? ` (${total})` : ''}
        </h2>
        <button
          type="button"
          onClick={onViewAll}
          className="text-xs font-medium text-brand-red hover:underline"
        >
          View all
        </button>
      </div>
      {list.length === 0 ? (
        <div className="py-6 flex flex-col items-center justify-center text-center">
          <p className="text-xs text-gray-500">No compliance expiring in the next 30 days</p>
        </div>
      ) : (
        <ul className="space-y-0">
          {list.map((item, i) => (
            <li
              key={item.id}
              className={`flex items-center justify-between gap-3 py-3 px-3 rounded-lg hover:bg-gray-50 transition-colors ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-gray-900 truncate">{item.fleet_asset_name || 'Asset'}</div>
                <div className="text-[10px] text-gray-500">{item.record_type} · {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : ''}</div>
              </div>
              <button
                type="button"
                onClick={() => onOpenAsset(item.fleet_asset_id)}
                className="flex-shrink-0 text-xs font-medium text-brand-red hover:underline"
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- WorkOrdersPanel ---
function WorkOrdersPanel({
  openCount,
  inProgressCount,
  pendingPartsCount,
  onViewAll,
}: {
  openCount: number;
  inProgressCount: number;
  pendingPartsCount: number;
  onViewAll: () => void;
}) {
  const total = Math.max(openCount + inProgressCount + pendingPartsCount, 1);
  const rows = [
    { label: 'Open', count: openCount, color: 'bg-blue-500' },
    { label: 'In progress', count: inProgressCount, color: 'bg-amber-500' },
    { label: 'Pending parts', count: pendingPartsCount, color: 'bg-orange-400' },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm min-w-0">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Work Orders Snapshot</h2>
      <div className="space-y-3.5">
        {rows.map((row) => {
          const pct = row.count > 0 ? Math.max(Math.round((row.count / total) * 100), 4) : 0;
          return (
            <div key={row.label}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-gray-600">{row.label}</span>
                <span className="font-semibold text-gray-900 tabular-nums">{row.count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${row.color}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={onViewAll}
          className="text-xs font-medium text-brand-red hover:underline"
        >
          View all work orders →
        </button>
      </div>
    </div>
  );
}

// --- PendingInspectionsCard ---
function PendingInspectionsCard({
  bodyItems,
  mechanicalItems,
  onViewAll,
  onOpen,
}: {
  bodyItems: Array<{ id: string; fleet_asset_name?: string; inspection_date?: string }>;
  mechanicalItems: Array<{ id: string; fleet_asset_name?: string; inspection_date?: string }>;
  onViewAll: (type: 'body' | 'mechanical') => void;
  onOpen: (id: string) => void;
}) {
  const [activeType, setActiveType] = useState<'body' | 'mechanical'>('body');
  const items = activeType === 'body' ? bodyItems : mechanicalItems;
  const list = items.slice(0, 5);
  const emptyMessage = activeType === 'body' ? 'No pending body inspections' : 'No pending mechanical inspections';
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm min-w-0">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <IconAlertCircle className="h-5 w-5 text-amber-600" />
          <h2 className="text-sm font-semibold text-gray-900">Pending Inspections</h2>
        </div>
        <span className="text-xs font-semibold text-gray-700 tabular-nums">{bodyItems.length + mechanicalItems.length}</span>
      </div>
      <div className="mb-3 flex rounded-lg bg-gray-100 p-1">
        {(['body', 'mechanical'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setActiveType(type)}
            className={`flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors ${
              activeType === type ? 'bg-white text-brand-red shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {type} <span className="tabular-nums">({type === 'body' ? bodyItems.length : mechanicalItems.length})</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-gray-500 py-4">{emptyMessage}</p>
      ) : (
        <ul className="space-y-0">
          {list.map((item, i) => (
            <li
              key={item.id}
              className={`flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-gray-900 truncate">{item.fleet_asset_name || item.id}</div>
                {item.inspection_date && (
                  <div className="text-[10px] text-gray-500">{new Date(item.inspection_date).toLocaleDateString()}</div>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpen(item.id); }}
                className="flex-shrink-0 text-xs font-medium text-brand-red hover:underline"
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <button type="button" onClick={() => onViewAll(activeType)} className="text-xs font-medium text-brand-red hover:underline">
          View all →
        </button>
      </div>
    </div>
  );
}

// --- OpenWorkOrdersCard ---
function OpenWorkOrdersCard({
  items,
  total,
  onViewAll,
  onOpen,
}: {
  items: Array<{ id: string; work_order_number?: string; description?: string; status?: string }>;
  total: number;
  onViewAll: () => void;
  onOpen: (id: string) => void;
}) {
  const list = items.slice(0, 5);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm min-w-0">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Open Work Orders</h2>
        <span className="text-xs font-semibold text-gray-700 tabular-nums">{total}</span>
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-gray-500 py-4">No open work orders</p>
      ) : (
        <ul className="space-y-0">
          {list.map((item, i) => (
            <li
              key={item.id}
              className={`flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-gray-900 truncate">{item.work_order_number || item.id}</div>
                {item.description && <div className="text-[10px] text-gray-500 truncate">{item.description}</div>}
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpen(item.id); }}
                className="flex-shrink-0 text-xs font-medium text-brand-red hover:underline"
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <button type="button" onClick={onViewAll} className="text-xs font-medium text-brand-red hover:underline">
          View all work orders →
        </button>
      </div>
    </div>
  );
}

// --- RevisionsCalendarPanel ---
function RevisionsCalendarPanel({ onViewCalendar }: { onViewCalendar: () => void }) {
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const nextWeek = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const { data: todayEvents = [] } = useQuery({
    queryKey: ['fleet-calendar-today', today],
    queryFn: () => api<any[]>('GET', `/fleet/work-orders/calendar?start=${today}&end=${today}`),
  });
  const { data: weekEvents = [] } = useQuery({
    queryKey: ['fleet-calendar-week', today, nextWeek],
    queryFn: () => api<any[]>('GET', `/fleet/work-orders/calendar?start=${today}&end=${nextWeek}`),
  });
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm min-w-0">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <IconCalendar className="h-4 w-4" />
        </div>
        <h2 className="text-sm font-semibold text-gray-900">Scheduled services</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-blue-50 p-3">
          <div className="text-[10px] font-medium uppercase tracking-wide text-blue-700">Today</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-blue-900">{todayEvents.length}</div>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Next 7 days</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{weekEvents.length}</div>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={onViewCalendar}
          className="text-xs font-medium text-brand-red hover:underline"
        >
          View schedule →
        </button>
      </div>
    </div>
  );
}

// --- QuickActionsPanel ---
function QuickActionCard({
  title,
  subtitle,
  statsLine,
  manageLabel,
  onManage,
  onAddNew,
  icon: Icon,
  iconTone = 'bg-gray-100 text-gray-600',
}: {
  title: string;
  subtitle: string;
  statsLine: string;
  manageLabel: string;
  onManage: () => void;
  onAddNew: () => void;
  icon: DashboardIcon;
  iconTone?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm min-w-0 flex flex-col">
      <div className="flex items-start gap-3 mb-4">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${iconTone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
          {statsLine}
        </span>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onManage}
          className="px-3 py-2 text-xs font-medium text-white bg-brand-red rounded-lg hover:opacity-90 transition-opacity"
        >
          {manageLabel} →
        </button>
        <button
          type="button"
          onClick={onAddNew}
          className="text-xs font-medium text-gray-600 hover:text-gray-900 hover:underline"
        >
          Add new
        </button>
      </div>
    </div>
  );
}

// --- Main page ---
const DEFAULT_STATS: DashboardData = {
  total_fleet_assets: 0,
  total_vehicles: 0,
  total_heavy_machinery: 0,
  total_other_assets: 0,
  assigned_now_count: 0,
  inspections_due_count: 0,
  inspections_due_total: 0,
  inspections_due: [],
  open_work_orders_count: 0,
  in_progress_work_orders_count: 0,
  pending_parts_work_orders_count: 0,
  overdue_equipment_count: 0,
  overdue_equipment: [],
  compliance_expiring_count: 0,
  compliance_expiring: [],
};

export default function FleetDashboard() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [newAssetModalType, setNewAssetModalType] = useState<'vehicle' | 'heavy_machinery' | 'other' | null>(null);
  const [newEquipmentModalOpen, setNewEquipmentModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['fleetDashboard'],
    queryFn: () => api<DashboardData>('GET', '/fleet/dashboard'),
  });

  const { data: pendingBodyInspections = [] } = useQuery({
    queryKey: ['inspections', 'body', 'pending'],
    queryFn: () =>
      api<Array<{ id: string; fleet_asset_name?: string; inspection_date?: string }>>(
        'GET',
        '/fleet/inspections?inspection_type=body&result=pending&sort=inspection_date&dir=desc'
      ),
  });

  const { data: pendingMechanicalInspections = [] } = useQuery({
    queryKey: ['inspections', 'mechanical', 'pending'],
    queryFn: () =>
      api<Array<{ id: string; fleet_asset_name?: string; inspection_date?: string }>>(
        'GET',
        '/fleet/inspections?inspection_type=mechanical&result=pending&sort=inspection_date&dir=desc'
      ),
  });

  const { data: openWorkOrdersData } = useQuery({
    queryKey: ['work-orders', 'open'],
    queryFn: () =>
      api<{ items: Array<{ id: string; work_order_number?: string; description?: string; status?: string }>; total: number }>(
        'GET',
        '/fleet/work-orders?status=open&limit=10&page=1'
      ),
  });

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const stats = data ?? DEFAULT_STATS;

  const openWorkOrdersTotal =
    stats.open_work_orders_count +
    stats.in_progress_work_orders_count +
    stats.pending_parts_work_orders_count;

  const inspectionsStatus = getKpiState(stats.inspections_due_count, { attentionAbove: 0 });
  const workOrdersStatus = openWorkOrdersTotal > 0 ? 'info' : 'ok';

  if (isLoading) {
    return (
      <div className="space-y-4 min-w-0 overflow-x-hidden bg-gray-50/40">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="h-5 w-48 bg-gray-100 animate-pulse rounded" />
          <div className="h-3 w-40 mt-2 bg-gray-100 animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 h-[130px] shadow-sm">
              <div className="h-4 w-24 bg-gray-100 animate-pulse rounded mb-3" />
              <div className="h-8 w-16 bg-gray-100 animate-pulse rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 min-h-[220px] shadow-sm">
              <div className="h-4 w-32 bg-gray-100 animate-pulse rounded mb-4" />
              <div className="space-y-3">
                <div className="h-10 bg-gray-100 animate-pulse rounded" />
                <div className="h-10 bg-gray-100 animate-pulse rounded" />
                <div className="h-10 bg-gray-100 animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 min-w-0 overflow-x-hidden bg-gray-50/40">
      <FleetEquipmentPageHeader todayLabel={todayLabel} />

      {/* Row 1 — Operational Snapshot */}
      <section>
        <SectionLabel>Operational Snapshot</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPIStatCard
            title="Total Assets"
            value={stats.total_fleet_assets}
            subtext={formatCountSubtext(
              stats.total_vehicles,
              stats.total_heavy_machinery,
              stats.total_other_assets
            )}
            icon={IconFleet}
            iconTone="bg-blue-50 text-blue-600"
            status="ok"
            onClick={() => nav('/fleet/vehicles')}
          />
          <KPIStatCard
            title="Assigned Now"
            value={stats.assigned_now_count}
            subtext="Currently in the field"
            icon={IconUserCheck}
            iconTone="bg-emerald-50 text-emerald-600"
            status="ok"
            onClick={() => nav('/fleet/assets?assigned=true')}
          />
          <KPIStatCard
            title="Inspections Due"
            value={stats.inspections_due_count}
            subtext="Requires attention"
            icon={IconAlertCircle}
            iconTone="bg-amber-50 text-amber-600"
            status={stats.inspections_due_count >= 10 ? 'critical' : inspectionsStatus}
            onClick={() => nav('/fleet/inspections')}
          />
          <KPIStatCard
            title="Open Work Orders"
            value={openWorkOrdersTotal}
            subtext={`${stats.in_progress_work_orders_count} in progress • ${stats.pending_parts_work_orders_count} pending parts`}
            icon={IconWrench}
            iconTone="bg-purple-50 text-purple-600"
            status={workOrdersStatus}
            onClick={() => nav('/fleet/work-orders')}
          />
        </div>
      </section>

      {/* Row 2 — Attention Required */}
      <section>
        <SectionLabel>Attention Required</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PendingInspectionsCard
            bodyItems={pendingBodyInspections}
            mechanicalItems={pendingMechanicalInspections}
            onViewAll={(type) => nav(`/fleet/inspections?type=${type}`)}
            onOpen={(id) => nav(`/fleet/inspections/${id}`)}
          />
          <OpenWorkOrdersCard
            items={openWorkOrdersData?.items ?? []}
            total={openWorkOrdersData?.total ?? stats.open_work_orders_count}
            onViewAll={() => nav('/fleet/work-orders')}
            onOpen={(id) => nav(`/fleet/work-orders/${id}`)}
          />
          <ComplianceExpiringPanel
            items={stats.compliance_expiring}
            total={stats.compliance_expiring_count}
            onViewAll={() => nav('/fleet/assets')}
            onOpenAsset={(assetId) => nav(buildAssetLink(assetId))}
          />
        </div>
      </section>

      {/* Row 3 — Fleet & Services */}
      <section>
        <SectionLabel>Fleet & Services</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FleetMixPanel
            vehicles={stats.total_vehicles}
            heavy={stats.total_heavy_machinery}
            other={stats.total_other_assets}
            total={stats.total_fleet_assets}
          />
          <WorkOrdersPanel
            openCount={stats.open_work_orders_count}
            inProgressCount={stats.in_progress_work_orders_count}
            pendingPartsCount={stats.pending_parts_work_orders_count}
            onViewAll={() => nav('/fleet/work-orders')}
          />
          <RevisionsCalendarPanel onViewCalendar={() => nav('/fleet/calendar')} />
        </div>
      </section>

      {/* Row 4 — Quick Actions */}
      <section>
        <SectionLabel>Quick Access</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <QuickActionCard
            title="Vehicles"
            subtitle="Manage vehicle fleet"
            statsLine={`${stats.total_vehicles} assets`}
            manageLabel="Manage"
            onManage={() => nav('/fleet/vehicles')}
            onAddNew={() => setNewAssetModalType('vehicle')}
            icon={IconFleet}
            iconTone="bg-blue-50 text-blue-600"
          />
          <QuickActionCard
            title="Heavy Machinery"
            subtitle="Manage heavy machinery"
            statsLine={`${stats.total_heavy_machinery} assets`}
            manageLabel="Manage"
            onManage={() => nav('/fleet/heavy-machinery')}
            onAddNew={() => setNewAssetModalType('heavy_machinery')}
            icon={IconHeavy}
            iconTone="bg-slate-100 text-slate-700"
          />
          <QuickActionCard
            title="Equipment"
            subtitle="Manage tools and equipment"
            statsLine={`Equipment • tools, generators, safety`}
            manageLabel="Manage"
            onManage={() => nav('/company-assets/equipment')}
            onAddNew={() => setNewEquipmentModalOpen(true)}
            icon={IconWrench}
            iconTone="bg-amber-50 text-amber-700"
          />
        </div>
      </section>

      {/* New Asset Modal (same as FleetAssets page) */}
      {newAssetModalType !== null && (
        <OverlayPortal><div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4"
          onClick={() => setNewAssetModalType(null)}
        >
          <div
            className="w-[900px] max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-t-xl border-b border-gray-200 bg-white p-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setNewAssetModalType(null)}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center"
                    title="Close"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">New Asset</div>
                    <div className="text-xs text-gray-500 mt-0.5">Create a new fleet asset</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <FleetAssetNewForm
                initialAssetType={newAssetModalType}
                onSuccess={(data) => {
                  setNewAssetModalType(null);
                  queryClient.invalidateQueries({ queryKey: ['fleetDashboard'] });
                  queryClient.invalidateQueries({ queryKey: ['fleetAssets'] });
                  nav(`/fleet/assets/${data.id}`);
                }}
                onCancel={() => setNewAssetModalType(null)}
              />
            </div>
          </div>
        </div></OverlayPortal>
      )}

      {/* New Equipment Modal (same as EquipmentList page) */}
      {newEquipmentModalOpen && (
        <OverlayPortal><div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4"
          onClick={() => setNewEquipmentModalOpen(false)}
        >
          <div
            className="w-[900px] max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-t-xl border-b border-gray-200 bg-white p-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setNewEquipmentModalOpen(false)}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center"
                    title="Close"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">New Equipment</div>
                    <div className="text-xs text-gray-500 mt-0.5">Create a new equipment item</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <EquipmentNewForm
                initialCategory="generator"
                onSuccess={(data) => {
                  setNewEquipmentModalOpen(false);
                  queryClient.invalidateQueries({ queryKey: ['fleetDashboard'] });
                  queryClient.invalidateQueries({ queryKey: ['equipment'] });
                  nav(`/company-assets/equipment/${data.id}`);
                }}
                onCancel={() => setNewEquipmentModalOpen(false)}
              />
            </div>
          </div>
        </div></OverlayPortal>
      )}
    </div>
  );
}
