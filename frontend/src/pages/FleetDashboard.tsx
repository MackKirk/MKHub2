import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useMemo, useState } from 'react';
import { FleetAssetNewForm } from './FleetAssetNew';
import { EquipmentNewForm } from './EquipmentNew';

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

function buildEquipmentLink(id: string): string {
  return `/fleet/equipment/${id}`;
}

// --- Icons (inline SVGs) ---
const IconFleet = () => (
  <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);
const IconUserCheck = () => (
  <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14v7m0 0v-7m0 7h4" />
  </svg>
);
const IconAlertCircle = () => (
  <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const IconWrench = () => (
  <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const IconEmpty = () => (
  <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

// --- DashboardHeader ---
function DashboardHeader({
  todayLabel,
  lastRefreshedAt,
}: {
  todayLabel: string;
  lastRefreshedAt: number | null;
}) {
  const refreshedLabel = lastRefreshedAt
    ? new Date(lastRefreshedAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
    : null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Fleet & Equipment</h1>
          <p className="text-sm text-gray-500 mt-0.5">Executive overview</p>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
          </div>
          {refreshedLabel && (
            <div className="text-[10px] text-gray-400">Last refreshed {refreshedLabel}</div>
          )}
        </div>
      </div>
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
}: {
  title: string;
  value: number | string;
  subtext: string;
  icon: React.FC;
  status: KpiStatus;
  onClick?: () => void;
  tooltipTitle?: string;
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
      className={`rounded-xl border border-gray-200 bg-white p-5 min-h-[120px] flex flex-col relative border-l-4 ${accent} ${onClick ? 'cursor-pointer hover:bg-gray-50/50 hover:border-gray-300 transition-all' : ''}`}
    >
      <div className="absolute top-3 right-3">
        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${pill.className}`}>
          {pill.label}
        </span>
      </div>
      <div className="flex items-start gap-3 flex-1">
        <div className="flex-shrink-0 mt-0.5">
          <Icon />
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

// --- RiskCompliancePanel ---
function RiskCompliancePanel({
  overdueEquipment,
  inspectionsDue,
  onViewAsset,
  onViewEquipment,
}: {
  overdueEquipment: DashboardData['overdue_equipment'];
  inspectionsDue: DashboardData['inspections_due'];
  onViewAsset: (id: string) => void;
  onViewEquipment: (id: string) => void;
}) {
  const merged = useMemo(() => {
    const items: Array<{ key: string; name: string; type: string; status: 'Overdue' | 'Due'; link: () => void }> = [];
    overdueEquipment.slice(0, 4).forEach((item) => {
      items.push({
        key: `eq-${item.id}`,
        name: item.equipment_name,
        type: 'Equipment',
        status: 'Overdue',
        link: () => onViewEquipment(item.equipment_id),
      });
    });
    inspectionsDue.slice(0, 4).forEach((item) => {
      items.push({
        key: `in-${item.id}`,
        name: item.name,
        type: item.asset_type.replace(/_/g, ' '),
        status: 'Due',
        link: () => onViewAsset(item.id),
      });
    });
    return items.slice(0, 7);
  }, [overdueEquipment, inspectionsDue, onViewAsset, onViewEquipment]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 min-w-0">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Risk & Compliance</h2>
      {merged.length === 0 ? (
        <div className="py-8 flex flex-col items-center justify-center text-center">
          <IconEmpty />
          <p className="text-xs text-gray-500 mt-2">No items requiring attention</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {merged.map((item) => (
            <li
              key={item.key}
              className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-gray-900 truncate">{item.name}</div>
                <div className="text-[10px] text-gray-500 capitalize">{item.type}</div>
              </div>
              <span
                className={`flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium ${
                  item.status === 'Overdue' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {item.status}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  item.link();
                }}
                className="text-xs font-medium text-brand-red hover:underline flex-shrink-0"
              >
                View
              </button>
            </li>
          ))}
        </ul>
      )}
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
    { label: 'Vehicles', count: vehicles, pct: pct(vehicles) },
    { label: 'Heavy', count: heavy, pct: pct(heavy) },
    { label: 'Other', count: other, pct: pct(other) },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 min-w-0">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Fleet Mix</h2>
      <div className="space-y-4">
        {rows.map(({ label, count, pct }) => (
          <div key={label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium text-gray-700">{label}</span>
              <span className="text-gray-500 tabular-nums">{count}</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gray-400 rounded-full transition-all"
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- DueInspectionsPanel ---
function DueInspectionsPanel({
  items,
  total,
  onViewAll,
  onOpen,
}: {
  items: DashboardData['inspections_due'];
  total?: number;
  onViewAll: () => void;
  onOpen: (id: string) => void;
}) {
  const list = items.slice(0, 5);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 min-w-0">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">
          Inspections Due{total !== undefined && total > 0 ? ` (${total})` : ''}
        </h2>
        <button
          type="button"
          onClick={onViewAll}
          className="text-xs font-medium text-brand-red hover:underline"
        >
          View All
        </button>
      </div>
      {list.length === 0 ? (
        <div className="py-8 flex flex-col items-center justify-center text-center">
          <IconEmpty />
          <p className="text-xs text-gray-500 mt-2">No inspections due</p>
        </div>
      ) : (
        <ul className="space-y-0">
          {list.map((item, i) => (
            <li
              key={item.id}
              className={`flex items-center justify-between gap-3 py-3 px-3 rounded-lg hover:bg-gray-50 transition-colors ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-gray-900 truncate">{item.name}</div>
                <div className="text-[10px] text-gray-500 capitalize">{item.asset_type.replace(/_/g, ' ')}</div>
              </div>
              <span className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                Due
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(item.id);
                }}
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
    <div className="rounded-xl border border-gray-200 bg-white p-5 min-w-0">
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
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 min-w-0">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Work Orders Snapshot</h2>
      <div className="space-y-3">
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">Open</span>
          <span className="font-semibold text-gray-900 tabular-nums">{openCount}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">In progress</span>
          <span className="font-semibold text-gray-900 tabular-nums">{inProgressCount}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">Pending parts</span>
          <span className="font-semibold text-gray-900 tabular-nums">{pendingPartsCount}</span>
        </div>
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
    <div className="rounded-xl border border-gray-200 bg-white p-5 min-w-0">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Scheduled services</h2>
      <div className="space-y-3">
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">Today</span>
          <span className="font-semibold text-gray-900 tabular-nums">{todayEvents.length}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">Próximos 7 dias</span>
          <span className="font-semibold text-gray-900 tabular-nums">{weekEvents.length}</span>
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
}: {
  title: string;
  subtitle: string;
  statsLine: string;
  manageLabel: string;
  onManage: () => void;
  onAddNew: () => void;
  icon: React.FC;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 min-w-0 flex flex-col">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-shrink-0">
          <Icon />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <p className="text-xs text-gray-600 mb-4">{statsLine}</p>
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
  inspections_due: [],
  open_work_orders_count: 0,
  in_progress_work_orders_count: 0,
  pending_parts_work_orders_count: 0,
  overdue_equipment_count: 0,
  overdue_equipment: [],
};

export default function FleetDashboard() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [newAssetModalType, setNewAssetModalType] = useState<'vehicle' | 'heavy_machinery' | 'other' | null>(null);
  const [newEquipmentModalOpen, setNewEquipmentModalOpen] = useState(false);

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['fleetDashboard'],
    queryFn: () => api<DashboardData>('GET', '/fleet/dashboard'),
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
      <div className="space-y-6 min-w-0 overflow-x-hidden">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="h-6 w-48 bg-gray-100 animate-pulse rounded" />
          <div className="h-4 w-32 mt-2 bg-gray-100 animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 min-h-[120px]">
              <div className="h-4 w-24 bg-gray-100 animate-pulse rounded mb-3" />
              <div className="h-8 w-16 bg-gray-100 animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 min-w-0 overflow-x-hidden">
      <DashboardHeader
        todayLabel={todayLabel}
        lastRefreshedAt={dataUpdatedAt ?? null}
      />

      {/* Row 1 — Operational Snapshot */}
      <section>
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
            status="ok"
            onClick={() => nav('/fleet/vehicles')}
          />
          <KPIStatCard
            title="Assigned Now"
            value={stats.assigned_now_count}
            subtext="Currently in the field"
            icon={IconUserCheck}
            status="ok"
            onClick={() => nav('/fleet/assets?assigned=true')}
          />
          <KPIStatCard
            title="Inspections Due"
            value={stats.inspections_due_count}
            subtext="Requires attention"
            icon={IconAlertCircle}
            status={stats.inspections_due_count >= 10 ? 'critical' : inspectionsStatus}
            onClick={() => nav('/fleet/inspections')}
          />
          <KPIStatCard
            title="Open Work Orders"
            value={openWorkOrdersTotal}
            subtext={`${stats.in_progress_work_orders_count} in progress • ${stats.pending_parts_work_orders_count} pending parts`}
            icon={IconWrench}
            status={workOrdersStatus}
            onClick={() => nav('/fleet/work-orders')}
          />
        </div>
      </section>

      {/* Row 2 — Compliance & Utilization */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <RiskCompliancePanel
            overdueEquipment={stats.overdue_equipment}
            inspectionsDue={stats.inspections_due}
            onViewAsset={(id) => nav(buildAssetLink(id))}
            onViewEquipment={(id) => nav(buildEquipmentLink(id))}
          />
        </div>
        <div>
          <FleetMixPanel
            vehicles={stats.total_vehicles}
            heavy={stats.total_heavy_machinery}
            other={stats.total_other_assets}
            total={stats.total_fleet_assets}
          />
        </div>
      </section>

      {/* Row 3 — Operations */}
      <section className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-2">
          <DueInspectionsPanel
            items={stats.inspections_due}
            total={stats.inspections_due_total}
            onViewAll={() => nav('/fleet/inspections')}
            onOpen={(id) => nav(buildAssetLink(id))}
          />
        </div>
        <div>
          <WorkOrdersPanel
            openCount={stats.open_work_orders_count}
            inProgressCount={stats.in_progress_work_orders_count}
            pendingPartsCount={stats.pending_parts_work_orders_count}
            onViewAll={() => nav('/fleet/work-orders')}
          />
        </div>
        <div>
          <RevisionsCalendarPanel onViewCalendar={() => nav('/fleet/calendar')} />
        </div>
      </section>

      {/* Row 3b — Compliance expiring */}
      <section className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-2">
          <ComplianceExpiringPanel
            items={stats.compliance_expiring}
            total={stats.compliance_expiring_count}
            onViewAll={() => nav('/fleet/assets')}
            onOpenAsset={(assetId) => nav(buildAssetLink(assetId))}
          />
        </div>
      </section>

      {/* Row 4 — Quick Actions */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <QuickActionCard
            title="Vehicles"
            subtitle="Manage vehicle fleet"
            statsLine={`${stats.total_vehicles} assets`}
            manageLabel="Manage"
            onManage={() => nav('/fleet/vehicles')}
            onAddNew={() => setNewAssetModalType('vehicle')}
            icon={IconFleet}
          />
          <QuickActionCard
            title="Heavy Machinery"
            subtitle="Manage heavy machinery"
            statsLine={`${stats.total_heavy_machinery} assets`}
            manageLabel="Manage"
            onManage={() => nav('/fleet/heavy-machinery')}
            onAddNew={() => setNewAssetModalType('heavy_machinery')}
            icon={IconFleet}
          />
          <QuickActionCard
            title="Equipment"
            subtitle="Manage tools and equipment"
            statsLine={`Equipment • tools, generators, safety`}
            manageLabel="Manage"
            onManage={() => nav('/fleet/equipment')}
            onAddNew={() => setNewEquipmentModalOpen(true)}
            icon={IconWrench}
          />
        </div>
      </section>

      {/* New Asset Modal (same as FleetAssets page) */}
      {newAssetModalType !== null && (
        <div
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
        </div>
      )}

      {/* New Equipment Modal (same as EquipmentList page) */}
      {newEquipmentModalOpen && (
        <div
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
                  nav(`/fleet/equipment/${data.id}`);
                }}
                onCancel={() => setNewEquipmentModalOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
