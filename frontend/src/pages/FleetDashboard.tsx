import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useMemo, useState } from 'react';
import NewFleetAssetModal from '@/components/fleet/NewFleetAssetModal';
import { EquipmentNewForm } from './EquipmentNew';
import { formModalQuickInfo } from '@/lib/formModalQuickInfo';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppFormModal,
  FORM_MODAL_WIDE_DIALOG_COLLAPSED,
  FORM_MODAL_WIDE_DIALOG_EXPANDED,
  uiLayout,
  AppPageHeader,
  AppTabs,
  uiColors,
  uiCx,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import {
  AlertCircle,
  Calendar,
  Package,
  Truck,
  UserCheck,
  Wrench,
} from 'lucide-react';

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

const linkButtonClass = uiCx('h-auto px-0 text-brand-red hover:bg-transparent hover:text-brand-red');

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

function kpiAccentBorder(status: KpiStatus): string {
  const accentMap: Record<KpiStatus, string> = {
    ok: 'border-l-green-500',
    attention: 'border-l-amber-500',
    critical: 'border-l-red-500',
    info: 'border-l-blue-500',
    coming_soon: 'border-l-gray-400',
  };
  return accentMap[status];
}

function kpiBadgeProps(status: KpiStatus): { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' } {
  const pillMap: Record<KpiStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
    ok: { label: 'OK', variant: 'success' },
    attention: { label: 'Attention', variant: 'warning' },
    critical: { label: 'Critical', variant: 'danger' },
    info: { label: 'Info', variant: 'info' },
    coming_soon: { label: 'Coming soon', variant: 'neutral' },
  };
  return pillMap[status];
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className={uiCx(uiTypography.overline, 'px-1 pb-2')}>{children}</div>;
}

function ProgressBarFill({ pct, colorClass }: { pct: number; colorClass: string }) {
  return (
    <div
      className={uiCx('h-full rounded-full transition-all', colorClass)}
      style={{ width: `${Math.max(pct, 2)}%` }}
      role="presentation"
    />
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
  icon: React.FC<{ className?: string }>;
  status: KpiStatus;
  onClick?: () => void;
  tooltipTitle?: string;
  iconTone?: string;
}) {
  const badge = kpiBadgeProps(status);
  const displayValue = typeof value === 'number' && value === 0 && status === 'coming_soon' ? '—' : value;

  const card = (
    <AppCard
      className={uiCx(
        'relative flex h-[130px] flex-col border-l-4',
        kpiAccentBorder(status),
        uiShadows.card,
        onClick && 'cursor-pointer transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:bg-gray-50/50',
      )}
      bodyClassName={uiCx(uiSpacing.cardPadding, 'flex flex-1 flex-col')}
    >
      {status !== 'ok' ? (
        <div className="absolute top-3 right-3">
          <AppBadge variant={badge.variant}>{badge.label}</AppBadge>
        </div>
      ) : null}
      <div className="flex flex-1 items-start gap-3">
        <div className={uiCx('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center', uiRadius.card, iconTone)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className={uiTypography.overline}>{title}</div>
          <div className={uiCx('mt-1 text-3xl font-bold tabular-nums', uiColors.textStrong)}>{displayValue}</div>
          <div className={uiCx('mt-2', uiTypography.helper)}>{subtext}</div>
        </div>
      </div>
    </AppCard>
  );

  if (!onClick) return card;
  return (
    <div
      role="button"
      tabIndex={0}
      title={tooltipTitle}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="min-w-0"
    >
      {card}
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
    <AppCard title="Fleet Mix" bodyClassName={uiSpacing.sectionStack}>
      {rows.map(({ label, count, pct: rowPct, color }) => (
        <div key={label}>
          <div className={uiCx('mb-1 flex justify-between', uiTypography.helper)}>
            <span className="font-medium text-gray-700">{label}</span>
            <span className="tabular-nums">
              {count} ({rowPct}%)
            </span>
          </div>
          <div className={uiCx('h-2 overflow-hidden rounded-full bg-gray-200')}>
            <ProgressBarFill pct={rowPct} colorClass={color} />
          </div>
        </div>
      ))}
      <div className={uiCx('border-t border-gray-100 pt-3', uiTypography.helper)}>
        <div className="flex justify-between">
          <span className="font-medium text-gray-600">Total</span>
          <span className={uiCx('font-semibold tabular-nums', uiColors.textStrong)}>{total.toLocaleString()}</span>
        </div>
      </div>
    </AppCard>
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
    <AppCard
      title={`Compliance expiring${total > 0 ? ` (${total})` : ''}`}
      actions={
        <AppButton type="button" variant="ghost" size="sm" className={linkButtonClass} onClick={onViewAll}>
          View all
        </AppButton>
      }
      bodyClassName={list.length === 0 ? uiSpacing.cardPadding : '!p-0'}
    >
      {list.length === 0 ? (
        <AppEmptyState
          title="No compliance expiring in the next 30 days"
          className={uiCx('border-0 bg-transparent shadow-none')}
        />
      ) : (
        <ul>
          {list.map((item, i) => (
            <li
              key={item.id}
              className={uiCx(
                'flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-gray-50',
                i % 2 === 1 && 'bg-gray-50/50',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className={uiCx('truncate font-semibold', uiTypography.helper, uiColors.textStrong)}>
                  {item.fleet_asset_name || 'Asset'}
                </div>
                <div className={uiTypography.overline}>
                  {item.record_type} · {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : ''}
                </div>
              </div>
              <AppButton type="button" variant="ghost" size="sm" className={linkButtonClass} onClick={() => onOpenAsset(item.fleet_asset_id)}>
                Open
              </AppButton>
            </li>
          ))}
        </ul>
      )}
    </AppCard>
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
    <AppCard
      title="Work Orders Snapshot"
      bodyClassName={uiSpacing.sectionStack}
      footer={
        <AppButton type="button" variant="ghost" size="sm" className={linkButtonClass} onClick={onViewAll}>
          View all work orders →
        </AppButton>
      }
    >
      {rows.map((row) => {
        const pct = row.count > 0 ? Math.max(Math.round((row.count / total) * 100), 4) : 0;
        return (
          <div key={row.label}>
            <div className={uiCx('mb-1 flex justify-between', uiTypography.helper)}>
              <span>{row.label}</span>
              <span className={uiCx('font-semibold tabular-nums', uiColors.textStrong)}>{row.count}</span>
            </div>
            <div className={uiCx('h-2 overflow-hidden rounded-full bg-gray-100')}>
              <ProgressBarFill pct={pct} colorClass={row.color} />
            </div>
          </div>
        );
      })}
    </AppCard>
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
    <AppCard
      title={
        <span className="inline-flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          Pending Inspections
        </span>
      }
      actions={
        <span className={uiCx(uiTypography.helper, 'font-semibold tabular-nums text-gray-700')}>
          {bodyItems.length + mechanicalItems.length}
        </span>
      }
      bodyClassName={uiSpacing.sectionStack}
      footer={
        <AppButton type="button" variant="ghost" size="sm" className={linkButtonClass} onClick={() => onViewAll(activeType)}>
          View all →
        </AppButton>
      }
    >
      <AppTabs
          tabs={[
            { key: 'body', label: 'Body', count: bodyItems.length },
            { key: 'mechanical', label: 'Mechanical', count: mechanicalItems.length },
          ]}
          value={activeType}
          onChange={(key) => setActiveType(key as 'body' | 'mechanical')}
        />
      {list.length === 0 ? (
        <AppEmptyState title={emptyMessage} className={uiCx('border-0 bg-transparent py-2 shadow-none')} />
      ) : (
        <ul>
          {list.map((item, i) => (
            <li
              key={item.id}
              className={uiCx(
                'flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-gray-50',
                i % 2 === 1 && 'bg-gray-50/50',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className={uiCx('truncate font-medium', uiTypography.helper, uiColors.textStrong)}>
                  {item.fleet_asset_name || item.id}
                </div>
                {item.inspection_date ? (
                  <div className={uiTypography.overline}>{new Date(item.inspection_date).toLocaleDateString()}</div>
                ) : null}
              </div>
              <AppButton
                type="button"
                variant="ghost"
                size="sm"
                className={linkButtonClass}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(item.id);
                }}
              >
                Open
              </AppButton>
            </li>
          ))}
        </ul>
      )}
    </AppCard>
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
    <AppCard
      title="Open Work Orders"
      actions={
        <span className={uiCx(uiTypography.helper, 'font-semibold tabular-nums text-gray-700')}>{total}</span>
      }
      bodyClassName={list.length === 0 ? uiSpacing.cardPadding : '!p-0'}
      footer={
        <AppButton type="button" variant="ghost" size="sm" className={linkButtonClass} onClick={onViewAll}>
          View all work orders →
        </AppButton>
      }
    >
      {list.length === 0 ? (
        <AppEmptyState title="No open work orders" className={uiCx('border-0 bg-transparent py-2 shadow-none')} />
      ) : (
        <ul>
          {list.map((item, i) => (
            <li
              key={item.id}
              className={uiCx(
                'flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50',
                i % 2 === 1 && 'bg-gray-50/50',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className={uiCx('truncate font-medium', uiTypography.helper, uiColors.textStrong)}>
                  {item.work_order_number || item.id}
                </div>
                {item.description ? (
                  <div className={uiCx(uiTypography.overline, 'truncate')}>{item.description}</div>
                ) : null}
              </div>
              <AppButton
                type="button"
                variant="ghost"
                size="sm"
                className={linkButtonClass}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(item.id);
                }}
              >
                Open
              </AppButton>
            </li>
          ))}
        </ul>
      )}
    </AppCard>
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
    <AppCard
      title={
        <span className="inline-flex items-center gap-2">
          <span className={uiCx('flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700')}>
            <Calendar className="h-4 w-4" aria-hidden />
          </span>
          Scheduled services
        </span>
      }
      bodyClassName={uiSpacing.sectionStack}
      footer={
        <AppButton type="button" variant="ghost" size="sm" className={linkButtonClass} onClick={onViewCalendar}>
          View schedule →
        </AppButton>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className={uiCx(uiRadius.control, 'bg-blue-50 p-3')}>
          <div className={uiCx(uiTypography.overline, 'text-blue-700')}>Today</div>
          <div className={uiCx('mt-1 text-2xl font-bold tabular-nums text-blue-900')}>{todayEvents.length}</div>
        </div>
        <div className={uiCx(uiRadius.control, uiColors.surfaceSubtle, 'p-3')}>
          <div className={uiTypography.overline}>Next 7 days</div>
          <div className={uiCx('mt-1 text-2xl font-bold tabular-nums', uiColors.textStrong)}>{weekEvents.length}</div>
        </div>
      </div>
    </AppCard>
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
  icon: React.FC<{ className?: string }>;
  iconTone?: string;
}) {
  return (
    <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'flex min-w-0 flex-col')}>
      <div className="mb-4 flex items-start gap-3">
        <div className={uiCx('flex h-10 w-10 shrink-0 items-center justify-center', uiRadius.card, iconTone)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={uiTypography.sectionTitle}>{title}</h3>
          <p className={uiCx('mt-0.5', uiTypography.helper)}>{subtitle}</p>
        </div>
        <AppBadge variant="neutral">{statsLine}</AppBadge>
      </div>
      <div className={uiCx('mt-auto flex flex-wrap items-center gap-2')}>
        <AppButton type="button" size="sm" onClick={onManage}>
          {manageLabel} →
        </AppButton>
        <AppButton type="button" variant="ghost" size="sm" onClick={onAddNew}>
          Add new
        </AppButton>
      </div>
    </AppCard>
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
  const [newEquipmentCanSubmit, setNewEquipmentCanSubmit] = useState(false);
  const [newEquipmentIsPending, setNewEquipmentIsPending] = useState(false);

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
      <main className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <div className={uiCx('h-5 w-48 animate-pulse rounded bg-gray-100')} />
          <div className={uiCx('mt-2 h-3 w-40 animate-pulse rounded bg-gray-100')} />
        </AppCard>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <AppCard key={i} className="h-[130px]" bodyClassName={uiSpacing.cardPadding}>
              <div className={uiCx('mb-3 h-4 w-24 animate-pulse rounded bg-gray-100')} />
              <div className={uiCx('h-8 w-16 animate-pulse rounded bg-gray-100')} />
            </AppCard>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <AppCard key={i} className="min-h-[220px]" bodyClassName={uiSpacing.cardPadding}>
              <div className={uiCx('mb-4 h-4 w-32 animate-pulse rounded bg-gray-100')} />
              <div className={uiSpacing.sectionStack}>
                <div className={uiCx('h-10 animate-pulse rounded bg-gray-100')} />
                <div className={uiCx('h-10 animate-pulse rounded bg-gray-100')} />
                <div className={uiCx('h-10 animate-pulse rounded bg-gray-100')} />
              </div>
            </AppCard>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Fleet & Equipment"
        subtitle="Executive overview"
        icon={<Truck className="h-4 w-4" />}
        actions={
          <div className="text-right">
            <div className={uiTypography.overline}>Today</div>
            <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
          </div>
        }
      />

      <section>
        <SectionLabel>Operational Snapshot</SectionLabel>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KPIStatCard
            title="Total Assets"
            value={stats.total_fleet_assets}
            subtext={formatCountSubtext(
              stats.total_vehicles,
              stats.total_heavy_machinery,
              stats.total_other_assets
            )}
            icon={Package}
            iconTone="bg-blue-50 text-blue-600"
            status="ok"
            onClick={() => nav('/fleet/vehicles')}
          />
          <KPIStatCard
            title="Assigned Now"
            value={stats.assigned_now_count}
            subtext="Currently in the field"
            icon={UserCheck}
            iconTone="bg-emerald-50 text-emerald-600"
            status="ok"
            onClick={() => nav('/fleet/assets?assigned=true')}
          />
          <KPIStatCard
            title="Inspections Due"
            value={stats.inspections_due_count}
            subtext="Requires attention"
            icon={AlertCircle}
            iconTone="bg-amber-50 text-amber-600"
            status={stats.inspections_due_count >= 10 ? 'critical' : inspectionsStatus}
            onClick={() => nav('/fleet/inspections')}
          />
          <KPIStatCard
            title="Open Work Orders"
            value={openWorkOrdersTotal}
            subtext={`${stats.in_progress_work_orders_count} in progress • ${stats.pending_parts_work_orders_count} pending parts`}
            icon={Wrench}
            iconTone="bg-purple-50 text-purple-600"
            status={workOrdersStatus}
            onClick={() => nav('/fleet/work-orders')}
          />
        </div>
      </section>

      <section>
        <SectionLabel>Attention Required</SectionLabel>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

      <section>
        <SectionLabel>Fleet & Services</SectionLabel>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

      <section>
        <SectionLabel>Quick Access</SectionLabel>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <QuickActionCard
            title="Vehicles"
            subtitle="Manage vehicle fleet"
            statsLine={`${stats.total_vehicles} assets`}
            manageLabel="Manage"
            onManage={() => nav('/fleet/vehicles')}
            onAddNew={() => setNewAssetModalType('vehicle')}
            icon={Truck}
            iconTone="bg-blue-50 text-blue-600"
          />
          <QuickActionCard
            title="Heavy Machinery"
            subtitle="Manage heavy machinery"
            statsLine={`${stats.total_heavy_machinery} assets`}
            manageLabel="Manage"
            onManage={() => nav('/fleet/heavy-machinery')}
            onAddNew={() => setNewAssetModalType('heavy_machinery')}
            icon={Package}
            iconTone="bg-slate-100 text-slate-700"
          />
          <QuickActionCard
            title="Equipment"
            subtitle="Manage tools and equipment"
            statsLine="Equipment • tools, generators, safety"
            manageLabel="Manage"
            onManage={() => nav('/company-assets/equipment')}
            onAddNew={() => setNewEquipmentModalOpen(true)}
            icon={Wrench}
            iconTone="bg-amber-50 text-amber-700"
          />
        </div>
      </section>

      <NewFleetAssetModal
        open={newAssetModalType !== null}
        onClose={() => setNewAssetModalType(null)}
        initialAssetType={newAssetModalType ?? 'vehicle'}
        onSuccess={(data) => {
          setNewAssetModalType(null);
          queryClient.invalidateQueries({ queryKey: ['fleetDashboard'] });
          queryClient.invalidateQueries({ queryKey: ['fleetAssets'] });
          nav(`/fleet/assets/${data.id}`);
        }}
      />

      <AppFormModal
        open={newEquipmentModalOpen}
        onClose={() => setNewEquipmentModalOpen(false)}
        title="New Equipment"
        description="Create a new equipment item"
        formWidth="wide"
        dialogClassName={FORM_MODAL_WIDE_DIALOG_COLLAPSED}
        dialogClassNameExpanded={FORM_MODAL_WIDE_DIALOG_EXPANDED}
        quickInfo={formModalQuickInfo({
          purpose: <>Add company equipment from the fleet dashboard.</>,
          howToUse: <>Fill identity fields; unit number is required for checkout tracking.</>,
          actions: <>Create Equipment saves and opens the equipment detail.</>,
        })}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setNewEquipmentModalOpen(false)}
            >
              Cancel
            </AppButton>
            <AppButton
              type="submit"
              form="fleet-dashboard-new-equipment-form"
              size="sm"
              disabled={!newEquipmentCanSubmit || newEquipmentIsPending}
              loading={newEquipmentIsPending}
            >
              {newEquipmentIsPending ? 'Creating…' : 'Create Equipment'}
            </AppButton>
          </div>
        }
      >
        <EquipmentNewForm
          formId="fleet-dashboard-new-equipment-form"
          initialCategory="generator"
          onSuccess={(data) => {
            setNewEquipmentModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['fleetDashboard'] });
            queryClient.invalidateQueries({ queryKey: ['equipment'] });
            nav(`/company-assets/equipment/${data.id}`);
          }}
          onCancel={() => setNewEquipmentModalOpen(false)}
          onValidationChange={(canSubmit, isPending) => {
            setNewEquipmentCanSubmit(canSubmit);
            setNewEquipmentIsPending(isPending);
          }}
        />
      </AppFormModal>
    </main>
  );
}
