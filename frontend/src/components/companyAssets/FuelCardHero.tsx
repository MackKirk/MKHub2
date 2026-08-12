import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatDateLocal, parseApiDateForDisplay } from '@/lib/dateUtils';
import {
  formatFuelCardStatus,
  getFuelCardCustodyBadgeVariant,
  getFuelCardStatusBadgeVariant,
} from '@/lib/fuelCardUi';
import { FleetHeroStat } from '@/components/fleet/FleetAssetHero';
import {
  AppBadge,
  AppButton,
  AppCard,
  uiBorders,
  uiCx,
  uiRadius,
  uiTypography,
} from '@/components/ui';

const fleetHeroAssignButtonClass =
  'h-24 w-24 sm:h-28 sm:w-28 rounded-xl border-2 border-sky-400 bg-sky-50 text-sky-950 text-sm font-semibold shadow-sm hover:bg-sky-100 active:scale-[0.98] transition flex flex-col items-center justify-center gap-1 px-1 py-2 text-center leading-tight';

const fleetHeroReturnButtonClass =
  'h-24 w-24 sm:h-28 sm:w-28 rounded-xl border-2 border-emerald-600 bg-emerald-50 text-emerald-950 text-sm font-semibold shadow-sm hover:bg-emerald-100 active:scale-[0.98] transition flex flex-col items-center justify-center gap-1 px-1 py-2 text-center leading-tight';

const fleetHeroValueClass = 'text-xs font-semibold text-gray-900 mt-0.5';
const fleetHeroValueMutedClass = 'text-xs font-semibold text-gray-400 mt-0.5';

const HERO_PANEL_EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]';
const HERO_PANEL_TRANSITION_BASE = 'overflow-hidden';
const HERO_EXPAND_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const CUSTOMER_HERO_EXPANDED_MAX_PX = 320;
const HERO_EXPAND_BASE_MS = 1400;
const HERO_COLLAPSE_MS = 650;
const FLEET_HERO_COLLAPSED_PX = 72;

function formatDateIssued(dateIssued?: string | null): string {
  if (!dateIssued) return '\u2014';
  const d = parseApiDateForDisplay(dateIssued);
  return d ? formatDateLocal(d) : '\u2014';
}

export function FuelCardHeroVisual({ cardNumber }: { cardNumber: string }) {
  return (
    <div className="relative flex h-36 w-48 flex-col justify-between rounded-xl bg-gradient-to-br from-emerald-700 via-teal-800 to-emerald-950 p-3 shadow-lg shadow-black/20 ring-1 ring-white/15">
      <div className="flex items-start justify-between gap-1">
        <div className="h-6 w-10 rounded bg-gradient-to-br from-amber-100 to-amber-200/90 shadow-inner" aria-hidden />
        <span className="max-w-[5.5rem] truncate text-[9px] font-bold uppercase tracking-wider text-white/75">
          Fuel card
        </span>
      </div>
      <div className="font-mono text-sm font-medium tracking-[0.12em] text-white drop-shadow-sm">
        {cardNumber || '\u2014'}
      </div>
    </div>
  );
}

type HeroCard = {
  card_number: string;
  pin: string;
  date_issued?: string | null;
  crew?: string | null;
  status: string;
};

export function buildFuelCardHeroHeading(card: HeroCard): {
  primaryTitle: string;
  subtitleLine: string | null;
} {
  const primaryTitle = card.card_number?.trim() || 'Fuel card';
  const parts: string[] = [];
  if (card.crew?.trim()) parts.push(card.crew.trim());
  if (card.date_issued) parts.push(`Issued ${formatDateIssued(card.date_issued)}`);
  const subtitleLine = parts.length > 0 ? parts.join(' \u00b7 ') : null;
  return { primaryTitle, subtitleLine };
}

type FuelCardHeroBodyProps = {
  primaryTitle: string;
  subtitleLine: string | null;
  card: HeroCard;
  isInCustody: boolean;
  assignedToName?: string | null;
  canAssign: boolean;
  onAssign: () => void;
  onReturn: () => void;
  collapseToggle?: ReactNode;
};

function FuelCardHeroBody({
  primaryTitle,
  subtitleLine,
  card,
  isInCustody,
  assignedToName,
  canAssign,
  onAssign,
  onReturn,
  collapseToggle,
}: FuelCardHeroBodyProps) {
  return (
    <div className="overflow-visible p-2.5">
      <div className="flex items-start gap-5">
        <div className="w-48 shrink-0 overflow-visible">
          <FuelCardHeroVisual cardNumber={card.card_number} />
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
              <FleetHeroStat label="Card #">
                <div className={uiCx(fleetHeroValueClass, 'font-mono tracking-wider')}>{card.card_number}</div>
              </FleetHeroStat>
              <FleetHeroStat label="PIN #">
                <div className={uiCx(fleetHeroValueClass, 'font-mono tracking-widest')}>{card.pin}</div>
              </FleetHeroStat>
              <FleetHeroStat label="Crew">
                <div className={fleetHeroValueClass}>{card.crew?.trim() || '\u2014'}</div>
              </FleetHeroStat>
              <FleetHeroStat label="Date issued">
                <div className={fleetHeroValueClass}>{formatDateIssued(card.date_issued)}</div>
              </FleetHeroStat>
              <FleetHeroStat label="Status">
                <AppBadge variant={getFuelCardStatusBadgeVariant(card.status)} className="!normal-case">
                  {formatFuelCardStatus(card.status)}
                </AppBadge>
              </FleetHeroStat>
              <FleetHeroStat label="Custody">
                <div className="space-y-0.5">
                  <AppBadge variant={getFuelCardCustodyBadgeVariant(isInCustody)} className="!normal-case">
                    {isInCustody ? 'Assigned' : 'Available'}
                  </AppBadge>
                  {isInCustody && assignedToName?.trim() ? (
                    <div className={uiCx(uiTypography.helper, 'truncate')}>{assignedToName.trim()}</div>
                  ) : null}
                </div>
              </FleetHeroStat>
            </div>
          </div>

          <div className="mt-4 flex flex-col items-center gap-1.5 lg:mt-0 lg:shrink-0 lg:self-center">
            {canAssign ? (
              isInCustody ? (
                <button type="button" onClick={onReturn} className={fleetHeroReturnButtonClass}>
                  <span>Return</span>
                </button>
              ) : (
                <button type="button" onClick={onAssign} className={fleetHeroAssignButtonClass}>
                  <span>Assign</span>
                </button>
              )
            ) : (
              <div className={uiCx(fleetHeroValueMutedClass, 'px-2 text-center text-xs')}>
                {card.status !== 'active' ? 'Not active' : '\u2014'}
              </div>
            )}
            {collapseToggle ? <div className="flex w-full justify-end">{collapseToggle}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

type FuelCardHeroProps = FuelCardHeroBodyProps & {
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
};

export function FuelCardHero({ isCollapsed = false, onToggleCollapsed, ...bodyProps }: FuelCardHeroProps) {
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
    bodyProps.card,
    bodyProps.isInCustody,
    bodyProps.assignedToName,
    bodyProps.canAssign,
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
        <FuelCardHeroBody {...bodyProps} />
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
        <div ref={measureRef}>
          <FuelCardHeroBody
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
        className={uiCx(HERO_PANEL_TRANSITION_BASE, isCollapsed ? 'pointer-events-auto' : 'pointer-events-none')}
        style={collapsedStyle}
        aria-hidden={!isCollapsed}
      >
        <div className="p-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold text-gray-900">{bodyProps.primaryTitle}</h3>
              {bodyProps.assignedToName?.trim() ? (
                <p className="mt-0.5 truncate text-xs text-gray-600">{bodyProps.assignedToName.trim()}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-4 pr-8">
              <AppBadge variant={getFuelCardStatusBadgeVariant(bodyProps.card.status)} className="!normal-case">
                {formatFuelCardStatus(bodyProps.card.status)}
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

export function FuelCardHeroSkeleton() {
  return (
    <AppCard bodyClassName="relative overflow-hidden p-0">
      <div className="overflow-visible p-2.5">
        <div className="flex animate-pulse items-start gap-5">
          <div className="w-48 shrink-0">
            <div className={uiCx('h-36 w-48 bg-gray-100', uiRadius.card, uiBorders.subtle)} />
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            <div className="space-y-2">
              <div className="h-4 w-48 rounded bg-gray-100" />
              <div className="h-3 w-64 rounded bg-gray-100" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 rounded bg-gray-100" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppCard>
  );
}
