import { useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatFleetAssetStatus, getFleetAssetStatusVariant } from '@/lib/fleetUi';
import {
  AppBadge,
  AppButton,
  AppCard,
  uiBorders,
  uiCx,
  uiRadius,
} from '@/components/ui';

const fleetHeroAssignButtonClass =
  'h-24 w-24 sm:h-28 sm:w-28 rounded-xl border-2 border-sky-400 bg-sky-50 text-sky-950 text-sm font-semibold shadow-sm hover:bg-sky-100 active:scale-[0.98] transition flex flex-col items-center justify-center gap-1 px-1 py-2 text-center leading-tight';

const fleetHeroReturnButtonClass =
  'h-24 w-24 sm:h-28 sm:w-28 rounded-xl border-2 border-emerald-600 bg-emerald-50 text-emerald-950 text-sm font-semibold shadow-sm hover:bg-emerald-100 active:scale-[0.98] transition flex flex-col items-center justify-center gap-1 px-1 py-2 text-center leading-tight';

/** Matches ProjectDetail hero metadata (design-system route). */
export const fleetHeroLabelClass = 'text-[10px] font-medium text-gray-500 uppercase tracking-wide';
export const fleetHeroValueClass = 'text-xs font-semibold text-gray-900 mt-0.5';
export const fleetHeroValueMutedClass = 'text-xs font-semibold text-gray-400 mt-0.5';

/** Hero expand/collapse — same timing as ProjectDetail / CustomerDetail. */
const HERO_PANEL_EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]';
const HERO_PANEL_TRANSITION_BASE = 'overflow-hidden';
const HERO_EXPAND_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const CUSTOMER_HERO_EXPANDED_MAX_PX = 320;
const HERO_EXPAND_BASE_MS = 1400;
const HERO_COLLAPSE_MS = 650;
const FLEET_HERO_COLLAPSED_PX = 72;

export function FleetHeroStat({
  label,
  labelAction,
  children,
}: {
  label: string;
  labelAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className={fleetHeroLabelClass}>{label}</span>
        {labelAction}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

type FleetAssetHeroAsset = {
  asset_type: string;
  name?: string;
  unit_number?: string;
  condition?: string;
  status: string;
  odometer_current?: number;
  hours_current?: number;
};

type FleetAssetHeroBodyProps = {
  primaryTitle: string;
  subtitleLine: string | null;
  asset: FleetAssetHeroAsset;
  isAssigned: boolean;
  photoUrl: string | null;
  photoBusy: boolean;
  photoInputRef?: RefObject<HTMLInputElement | null>;
  onPhotoClick: () => void;
  onPhotoFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onAssign: () => void;
  onReturn: () => void;
  collapseToggle?: ReactNode;
};

function FleetAssetHeroBody({
  primaryTitle,
  subtitleLine,
  asset,
  isAssigned,
  photoUrl,
  photoBusy,
  photoInputRef,
  onPhotoClick,
  onPhotoFileChange,
  onAssign,
  onReturn,
  collapseToggle,
}: FleetAssetHeroBodyProps) {
  const localFileInputRef = useRef<HTMLInputElement>(null);

  const meterLabel =
    asset.asset_type === 'vehicle'
      ? 'Odometer'
      : asset.asset_type === 'heavy_machinery' || asset.asset_type === 'other'
        ? 'Hours'
        : 'Odometer / Hours';

  const meterValue =
    asset.odometer_current != null
      ? asset.odometer_current.toLocaleString()
      : asset.hours_current != null
        ? asset.hours_current.toLocaleString()
        : null;

  const setFileInputRef = (el: HTMLInputElement | null) => {
    localFileInputRef.current = el;
    if (photoInputRef) photoInputRef.current = el;
  };

  return (
    <div className="overflow-visible p-2.5">
      <div className="flex items-start gap-5">
        <div className="w-48 shrink-0 overflow-visible">
          <input
            ref={setFileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={onPhotoFileChange}
            disabled={photoBusy}
          />
          <div
            className={uiCx(
              'group relative mb-3 h-36 w-48 overflow-hidden',
              uiRadius.card,
              uiBorders.subtle,
              'bg-gray-100',
            )}
          >
            {photoBusy ? (
              <div className="flex h-full w-full items-center justify-center text-xs font-medium text-gray-500">
                …
              </div>
            ) : photoUrl ? (
              <img src={photoUrl} alt={asset.name || 'Asset'} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center text-gray-400">
                <svg className="h-10 w-10 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}
            <button
              type="button"
              disabled={photoBusy}
              onClick={() => {
                if (photoBusy) return;
                if (!photoUrl) {
                  (photoInputRef?.current ?? localFileInputRef.current)?.click();
                  return;
                }
                onPhotoClick();
              }}
              className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:cursor-not-allowed"
            >
              {photoUrl ? 'Change' : 'Add photo'}
            </button>
          </div>
        </div>

        <div className="min-w-0 flex-1 lg:flex lg:items-center lg:justify-between lg:gap-4">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="mb-1">
              <h3 className="text-sm font-bold text-gray-900">{primaryTitle}</h3>
              {subtitleLine ? (
                <p className="mt-0.5 text-xs font-medium text-gray-600">{subtitleLine}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-3 gap-x-2.5 gap-y-1">
              <FleetHeroStat label="Unit">
                <div className={fleetHeroValueClass}>
                  {asset.unit_number != null && String(asset.unit_number).trim() !== ''
                    ? `#${asset.unit_number}`
                    : '—'}
                </div>
              </FleetHeroStat>
              <FleetHeroStat label="Type">
                <div className={uiCx(fleetHeroValueClass, 'capitalize')}>
                  {asset.asset_type.replace(/_/g, ' ')}
                </div>
              </FleetHeroStat>
              <FleetHeroStat label="Status">
                <AppBadge variant={getFleetAssetStatusVariant(asset.status)}>
                  {formatFleetAssetStatus(asset.status)}
                </AppBadge>
              </FleetHeroStat>
              {asset.condition ? (
                <FleetHeroStat label="Condition">
                  <AppBadge variant="neutral" className="capitalize">
                    {asset.condition}
                  </AppBadge>
                </FleetHeroStat>
              ) : null}
              <FleetHeroStat label={meterLabel}>
                <div className={meterValue != null ? fleetHeroValueClass : fleetHeroValueMutedClass}>
                  {meterValue ?? '—'}
                </div>
              </FleetHeroStat>
              <FleetHeroStat label="Assignment">
                <span
                  className={uiCx(
                    'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                    isAssigned ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800',
                  )}
                >
                  {isAssigned ? 'Assigned' : 'Available'}
                </span>
              </FleetHeroStat>
            </div>
          </div>

          <div className="mt-4 flex flex-col items-center gap-1.5 lg:mt-0 lg:shrink-0 lg:self-center">
            {isAssigned ? (
              <button type="button" onClick={onReturn} className={fleetHeroReturnButtonClass}>
                <span>Return</span>
              </button>
            ) : (
              <button type="button" onClick={onAssign} className={fleetHeroAssignButtonClass}>
                <span>Assign</span>
              </button>
            )}
            {collapseToggle ? <div className="flex w-full justify-end">{collapseToggle}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

type FleetAssetHeroProps = FleetAssetHeroBodyProps & {
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
};

export function FleetAssetHero({ isCollapsed = false, onToggleCollapsed, ...bodyProps }: FleetAssetHeroProps) {
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
    bodyProps.asset,
    bodyProps.isAssigned,
    bodyProps.photoUrl,
    bodyProps.asset.condition,
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
        <FleetAssetHeroBody {...bodyProps} />
      </AppCard>
    );
  }

  return (
    <AppCard
      className={uiCx('transition-[margin]', HERO_PANEL_EASE)}
      bodyClassName="relative overflow-hidden p-0"
    >
      <div
        className={uiCx(
          HERO_PANEL_TRANSITION_BASE,
          isCollapsed ? 'pointer-events-none' : 'pointer-events-auto',
        )}
        style={expandedStyle}
        aria-hidden={isCollapsed}
      >
        <div ref={measureRef}>
          <FleetAssetHeroBody
            {...bodyProps}
            collapseToggle={
              !isCollapsed ? (
                <AppButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="p-1"
                  onClick={onToggleCollapsed}
                  title="Collapse"
                  aria-label="Collapse"
                >
                  <ChevronUp className="h-3 w-3" />
                </AppButton>
              ) : undefined
            }
          />
        </div>
      </div>

      <div
        className={uiCx(
          HERO_PANEL_TRANSITION_BASE,
          isCollapsed ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        style={collapsedStyle}
        aria-hidden={!isCollapsed}
      >
        <div className="p-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold text-gray-900">{bodyProps.primaryTitle}</h3>
            </div>
            <div className="flex shrink-0 items-center gap-4 pr-8">
              <AppBadge variant={getFleetAssetStatusVariant(bodyProps.asset.status)}>
                {formatFleetAssetStatus(bodyProps.asset.status)}
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

export function FleetAssetHeroSkeleton() {
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
            <div className="grid grid-cols-3 gap-x-2.5 gap-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
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
