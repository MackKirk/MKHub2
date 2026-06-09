import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Truck } from 'lucide-react';
import { WORK_ORDER_STATUS_LABELS, URGENCY_LABELS, CATEGORY_LABELS } from '@/lib/fleetBadges';
import { getUrgencyBadgeVariant, getWorkOrderStatusBadgeVariant } from '@/lib/fleetUi';
import {
  FleetHeroStat,
  fleetHeroValueClass,
  fleetHeroValueMutedClass,
} from '@/components/fleet/FleetAssetHero';
import { AppBadge, AppButton, AppCard, AppHeroEditButton, uiBorders, uiCx, uiRadius } from '@/components/ui';

const woCheckInTileClass =
  'h-24 w-24 sm:h-28 sm:w-28 rounded-xl border-2 border-sky-400 bg-sky-50 text-sky-950 text-sm font-semibold shadow-sm hover:bg-sky-100 active:scale-[0.98] transition flex flex-col items-center justify-center gap-1 px-1 py-2 text-center leading-tight';

const woCheckOutTileClass =
  'h-24 w-24 sm:h-28 sm:w-28 rounded-xl border-2 border-emerald-600 bg-emerald-50 text-emerald-950 text-sm font-semibold shadow-sm hover:bg-emerald-100 active:scale-[0.98] transition flex flex-col items-center justify-center gap-1 px-1 py-2 text-center leading-tight';

const woReopenTileClass =
  'h-24 w-24 sm:h-28 sm:w-28 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm font-semibold hover:bg-amber-100 active:scale-[0.98] transition flex flex-col items-center justify-center';

const HERO_PANEL_EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]';
const HERO_PANEL_TRANSITION_BASE = 'overflow-hidden';
const HERO_EXPAND_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const CUSTOMER_HERO_EXPANDED_MAX_PX = 320;
const HERO_EXPAND_BASE_MS = 1400;
const HERO_COLLAPSE_MS = 650;
const FLEET_HERO_COLLAPSED_PX = 72;

type WorkOrderHeroBodyProps = {
  workOrder: {
    id: string;
    work_order_number: string;
    entity_type: string;
    entity_id: string;
    category: string;
    urgency: string;
    status: string;
    created_at: string;
  };
  primaryTitle: string;
  subtitleLine: string;
  assetPhotoUrl: string | null;
  assetName?: string | null;
  woHeroAssetLine: string;
  woHeroAssetLinePending: boolean;
  statusOptionsCount: number;
  statusEditPending: boolean;
  onEditStatus: () => void;
  canStartService: boolean;
  canFinishService: boolean;
  canReopen: boolean;
  onStartService: () => void;
  onEndService: () => void;
  onReopen: () => void;
};

function WorkOrderHeroBody({
  workOrder,
  primaryTitle,
  subtitleLine,
  assetPhotoUrl,
  assetName,
  woHeroAssetLine,
  woHeroAssetLinePending,
  statusOptionsCount,
  statusEditPending,
  onEditStatus,
  canStartService,
  canFinishService,
  canReopen,
  onStartService,
  onEndService,
  onReopen,
}: WorkOrderHeroBodyProps) {
  const categoryLabel = CATEGORY_LABELS[workOrder.category] ?? workOrder.category;
  const hasActions = canStartService || canFinishService || canReopen;

  return (
    <div className="overflow-visible p-2.5">
      <div className="flex items-start gap-5">
        <div className="w-48 shrink-0 overflow-visible">
          <div
            className={uiCx(
              'mb-3 h-36 w-48 overflow-hidden',
              uiRadius.card,
              uiBorders.subtle,
              'bg-gray-100',
            )}
          >
            {workOrder.entity_type === 'fleet' && assetPhotoUrl ? (
              <img src={assetPhotoUrl} alt={assetName || 'Asset'} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-gray-400">
                <Truck className="h-10 w-10" strokeWidth={1.5} aria-hidden />
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 lg:flex lg:items-center lg:justify-between lg:gap-4">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="mb-1">
              <h3 className="text-sm font-bold text-gray-900">{primaryTitle}</h3>
              <p className="mt-0.5 text-xs font-medium text-gray-600">{subtitleLine || categoryLabel}</p>
            </div>

            <div className="grid grid-cols-2 gap-x-2.5 gap-y-3 sm:grid-cols-4">
              <FleetHeroStat label="Asset">
                {workOrder.entity_type === 'fleet' || workOrder.entity_type === 'equipment' ? (
                  woHeroAssetLinePending ? (
                    <div className={fleetHeroValueMutedClass}>Loading…</div>
                  ) : (
                    <Link
                      to={
                        workOrder.entity_type === 'fleet'
                          ? `/fleet/assets/${encodeURIComponent(workOrder.entity_id)}`
                          : `/company-assets/equipment/${encodeURIComponent(workOrder.entity_id)}`
                      }
                      className="mt-0.5 block break-words text-xs font-semibold text-brand-red hover:text-[#a31414] hover:underline"
                      title={woHeroAssetLine || undefined}
                    >
                      {woHeroAssetLine || 'Open record'}
                    </Link>
                  )
                ) : (
                  <div className={fleetHeroValueMutedClass}>—</div>
                )}
              </FleetHeroStat>
              <FleetHeroStat label="Created">
                <div className={fleetHeroValueClass}>
                  {new Date(workOrder.created_at).toLocaleDateString()}
                </div>
              </FleetHeroStat>
              <FleetHeroStat label="Entity">
                <div className={uiCx(fleetHeroValueClass, 'truncate capitalize')}>{workOrder.entity_type}</div>
              </FleetHeroStat>
              <FleetHeroStat
                label="Status"
                labelAction={
                  statusOptionsCount > 1 ? (
                    <AppHeroEditButton
                      title="Edit status"
                      aria-label="Edit status"
                      onClick={onEditStatus}
                      disabled={statusEditPending}
                    />
                  ) : null
                }
              >
                <AppBadge variant={getWorkOrderStatusBadgeVariant(workOrder.status)}>
                  {WORK_ORDER_STATUS_LABELS[workOrder.status] || workOrder.status}
                </AppBadge>
              </FleetHeroStat>
              <FleetHeroStat label="Number">
                <div className={uiCx(fleetHeroValueClass, 'truncate')}>{workOrder.work_order_number}</div>
              </FleetHeroStat>
              <FleetHeroStat label="Urgency">
                <AppBadge variant={getUrgencyBadgeVariant(workOrder.urgency)}>
                  {URGENCY_LABELS[workOrder.urgency] ?? workOrder.urgency}
                </AppBadge>
              </FleetHeroStat>
              <FleetHeroStat label="Category">
                <div className={uiCx(fleetHeroValueClass, 'truncate capitalize')}>{categoryLabel}</div>
              </FleetHeroStat>
            </div>
          </div>

          {hasActions ? (
            <div className="mt-4 flex flex-col items-center gap-1.5 lg:mt-0 lg:shrink-0 lg:self-center">
              {canStartService ? (
                <button type="button" onClick={onStartService} className={woCheckInTileClass}>
                  <span>Check-in</span>
                  <span className="text-[10px] font-semibold normal-case text-sky-700">Start Service</span>
                </button>
              ) : null}
              {canFinishService ? (
                <button type="button" onClick={onEndService} className={woCheckOutTileClass}>
                  <span>Check-out</span>
                  <span className="text-[10px] font-semibold normal-case text-emerald-800">End Service</span>
                </button>
              ) : null}
              {canReopen ? (
                <button type="button" onClick={onReopen} className={woReopenTileClass}>
                  Reopen
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type WorkOrderHeroProps = WorkOrderHeroBodyProps & {
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
};

export function WorkOrderHero({ isCollapsed = false, onToggleCollapsed, ...bodyProps }: WorkOrderHeroProps) {
  const showCollapse = onToggleCollapsed != null;
  const measureRef = useRef<HTMLDivElement>(null);
  const [expandedHeight, setExpandedHeight] = useState(320);

  useLayoutEffect(() => {
    if (!showCollapse) return;
    const el = measureRef.current;
    if (!el) return;
    const measure = () => setExpandedHeight(el.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    showCollapse,
    bodyProps.primaryTitle,
    bodyProps.subtitleLine,
    bodyProps.workOrder.status,
    bodyProps.workOrder.urgency,
    bodyProps.canStartService,
    bodyProps.canFinishService,
    bodyProps.canReopen,
    bodyProps.assetPhotoUrl,
    bodyProps.woHeroAssetLinePending,
  ]);

  const expandMs = useMemo(
    () => Math.min(3200, Math.round((expandedHeight / CUSTOMER_HERO_EXPANDED_MAX_PX) * HERO_EXPAND_BASE_MS)),
    [expandedHeight],
  );

  const expandedStyle = useMemo((): CSSProperties | undefined => {
    if (!showCollapse) return undefined;
    return {
      transitionProperty: 'max-height, opacity',
      transitionDuration: isCollapsed ? `${HERO_COLLAPSE_MS}ms` : `${expandMs}ms`,
      transitionTimingFunction: HERO_EXPAND_EASING,
      maxHeight: isCollapsed ? 0 : expandedHeight,
      opacity: isCollapsed ? 0 : 1,
    };
  }, [showCollapse, isCollapsed, expandedHeight, expandMs]);

  const collapsedStyle = useMemo((): CSSProperties | undefined => {
    if (!showCollapse) return undefined;
    return {
      transitionProperty: 'max-height, opacity',
      transitionDuration: isCollapsed ? `${HERO_EXPAND_BASE_MS}ms` : `${HERO_COLLAPSE_MS}ms`,
      transitionTimingFunction: HERO_EXPAND_EASING,
      maxHeight: isCollapsed ? FLEET_HERO_COLLAPSED_PX : 0,
      opacity: isCollapsed ? 1 : 0,
    };
  }, [showCollapse, isCollapsed]);

  if (!showCollapse) {
    return (
      <AppCard bodyClassName="relative overflow-hidden p-0">
        <WorkOrderHeroBody {...bodyProps} />
      </AppCard>
    );
  }

  return (
    <AppCard className={uiCx('transition-[margin]', HERO_PANEL_EASE)} bodyClassName="relative overflow-hidden p-0">
      <div
        className={uiCx(HERO_PANEL_TRANSITION_BASE, isCollapsed ? 'pointer-events-none' : 'pointer-events-auto')}
        style={expandedStyle}
        aria-hidden={isCollapsed}
      >
        <div ref={measureRef} className="relative pr-10">
          <WorkOrderHeroBody {...bodyProps} />
        </div>
      </div>

      {!isCollapsed ? (
        <AppButton
          type="button"
          variant="ghost"
          size="sm"
          className="absolute bottom-2 right-2 z-20 p-1"
          onClick={onToggleCollapsed}
          title="Collapse"
          aria-label="Collapse"
        >
          <ChevronUp className="h-3 w-3" />
        </AppButton>
      ) : null}

      <div
        className={uiCx(HERO_PANEL_TRANSITION_BASE, isCollapsed ? 'pointer-events-auto' : 'pointer-events-none')}
        style={collapsedStyle}
        aria-hidden={!isCollapsed}
      >
        <div className="p-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold text-gray-900">{bodyProps.primaryTitle}</h3>
            </div>
            <div className="flex shrink-0 items-center gap-4 pr-8">
              <AppBadge variant={getWorkOrderStatusBadgeVariant(bodyProps.workOrder.status)}>
                {WORK_ORDER_STATUS_LABELS[bodyProps.workOrder.status] || bodyProps.workOrder.status}
              </AppBadge>
            </div>
          </div>
        </div>
        {isCollapsed ? (
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            className="absolute bottom-2 right-2 z-20 p-1"
            onClick={onToggleCollapsed}
            title="Expand"
            aria-label="Expand"
          >
            <ChevronDown className="h-3 w-3" />
          </AppButton>
        ) : null}
      </div>
    </AppCard>
  );
}

export function WorkOrderHeroSkeleton() {
  return (
    <AppCard bodyClassName="relative overflow-hidden p-0">
      <div className="overflow-visible p-2.5">
        <div className="flex animate-pulse items-start gap-5">
          <div className="w-48 shrink-0">
            <div className={uiCx('h-36 w-48 bg-gray-100', uiRadius.card, uiBorders.subtle)} />
          </div>
          <div className="min-w-0 flex-1 lg:flex lg:items-center lg:justify-between lg:gap-4">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-1.5">
                <div className="h-4 w-48 max-w-full rounded bg-gray-100" />
                <div className="h-3 w-32 max-w-full rounded bg-gray-100" />
              </div>
              <div className="grid grid-cols-2 gap-x-2.5 gap-y-3 sm:grid-cols-4">
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <div key={i}>
                    <div className="mb-1 h-2.5 w-12 rounded bg-gray-100" />
                    <div className="h-4 w-20 max-w-full rounded bg-gray-100" />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 flex justify-center lg:mt-0 lg:shrink-0 lg:justify-end lg:self-center">
              <div className="h-24 w-24 rounded-xl border border-gray-200/80 bg-gray-100 sm:h-28 sm:w-28" />
            </div>
          </div>
        </div>
      </div>
    </AppCard>
  );
}

export function buildWorkOrderHeroHeading(workOrder: {
  work_order_number: string;
  category: string;
}): { primaryTitle: string; subtitleLine: string } {
  const categoryLabel = CATEGORY_LABELS[workOrder.category] ?? workOrder.category;
  return {
    primaryTitle: workOrder.work_order_number,
    subtitleLine: categoryLabel,
  };
}
