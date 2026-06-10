import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Mail } from 'lucide-react';
import {
  FleetHeroStat,
  fleetHeroValueClass,
  fleetHeroValueMutedClass,
} from '@/components/fleet/FleetAssetHero';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppHeroEditButton,
  uiBorders,
  uiCx,
  uiRadius,
} from '@/components/ui';

const userHeroInviteButtonClass =
  'h-24 w-24 sm:h-28 sm:w-28 rounded-xl border-2 border-sky-400 bg-sky-50 text-sky-950 text-sm font-semibold shadow-sm hover:bg-sky-100 active:scale-[0.98] transition flex flex-col items-center justify-center gap-1 px-1 py-2 text-center leading-tight disabled:cursor-not-allowed disabled:opacity-50';

const HERO_PANEL_EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]';
const HERO_PANEL_TRANSITION_BASE = 'overflow-hidden';
const HERO_EXPAND_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const CUSTOMER_HERO_EXPANDED_MAX_PX = 320;
const HERO_EXPAND_BASE_MS = 1400;
const HERO_COLLAPSE_MS = 650;
const USER_HERO_COLLAPSED_PX = 72;

function UserAccountStatusBadge({
  isActive,
  saving,
  className,
}: {
  isActive?: boolean;
  saving?: boolean;
  className?: string;
}) {
  const active = isActive !== false;
  const label = saving ? 'Saving…' : active ? 'Active' : 'Inactive';
  return (
    <AppBadge variant={active ? 'success' : 'danger'} className={uiCx('normal-case !tracking-normal', className)}>
      {label}
    </AppBadge>
  );
}

type UserInfoHeroBodyProps = {
  primaryTitle: string;
  subtitleLine: string | null;
  photoUrl: string;
  phone: string;
  personalEmail: string;
  workEmail: string;
  hireDateDisplay: ReactNode;
  supervisor: string;
  age: string;
  isActive?: boolean;
  savingAccountStatus?: boolean;
  canManageAccountStatus?: boolean;
  onAccountStatusClick?: () => void;
  showAccessInvite?: boolean;
  sendingAccessInvite?: boolean;
  onSendAccessInvite?: () => void;
};

function UserInfoHeroBody({
  primaryTitle,
  subtitleLine,
  photoUrl,
  phone,
  personalEmail,
  workEmail,
  hireDateDisplay,
  supervisor,
  age,
  isActive,
  savingAccountStatus,
  canManageAccountStatus,
  onAccountStatusClick,
  showAccessInvite,
  sendingAccessInvite,
  onSendAccessInvite,
}: UserInfoHeroBodyProps) {
  return (
    <div className="overflow-visible p-2.5">
      <div className="flex items-center gap-5">
        <div className="w-48 shrink-0 overflow-visible self-center">
          <div
            className={uiCx(
              'relative h-36 w-48 overflow-hidden',
              uiRadius.card,
              uiBorders.subtle,
              'bg-gray-100',
            )}
          >
            <img src={photoUrl} alt={primaryTitle} className="h-full w-full object-cover" />
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

            <div className="grid grid-cols-[minmax(0,0.72fr)_minmax(0,1.14fr)_minmax(0,1.14fr)] gap-x-2.5 gap-y-1">
              <FleetHeroStat label="Phone">
                <div className={phone ? fleetHeroValueClass : fleetHeroValueMutedClass}>{phone || '—'}</div>
              </FleetHeroStat>
              <FleetHeroStat label="Personal Email">
                <div className={personalEmail ? fleetHeroValueClass : fleetHeroValueMutedClass}>
                  {personalEmail || '—'}
                </div>
              </FleetHeroStat>
              <FleetHeroStat label="Work Email">
                <div className={workEmail ? fleetHeroValueClass : fleetHeroValueMutedClass}>{workEmail || '—'}</div>
              </FleetHeroStat>
              <FleetHeroStat label="Hire Date">
                <div className={hireDateDisplay ? fleetHeroValueClass : fleetHeroValueMutedClass}>
                  {hireDateDisplay || '—'}
                </div>
              </FleetHeroStat>
              <FleetHeroStat label="Supervisor">
                <div className={supervisor ? fleetHeroValueClass : fleetHeroValueMutedClass}>{supervisor || '—'}</div>
              </FleetHeroStat>
              <FleetHeroStat
                label="Status"
                labelAction={
                  canManageAccountStatus && onAccountStatusClick ? (
                    <AppHeroEditButton
                      title="Edit status"
                      aria-label="Edit status"
                      onClick={onAccountStatusClick}
                      disabled={savingAccountStatus}
                    />
                  ) : null
                }
              >
                <UserAccountStatusBadge isActive={isActive} saving={savingAccountStatus} />
              </FleetHeroStat>
              <FleetHeroStat label="Age">
                <div className={age ? fleetHeroValueClass : fleetHeroValueMutedClass}>{age || '—'}</div>
              </FleetHeroStat>
            </div>
          </div>

          <div className="mt-4 flex flex-col items-center gap-1.5 lg:mt-0 lg:shrink-0 lg:self-center">
            {showAccessInvite ? (
              <button
                type="button"
                disabled={sendingAccessInvite}
                onClick={onSendAccessInvite}
                title="Email username, password setup link, and login URL"
                className={userHeroInviteButtonClass}
              >
                <Mail className="h-5 w-5 shrink-0" aria-hidden />
                {sendingAccessInvite ? (
                  <span>Sending…</span>
                ) : (
                  <>
                    <span>Send</span>
                    <span>access invite</span>
                  </>
                )}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

type UserInfoHeroProps = UserInfoHeroBodyProps & {
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
};

export function UserInfoHero({ isCollapsed = false, onToggleCollapsed, ...bodyProps }: UserInfoHeroProps) {
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
    bodyProps.phone,
    bodyProps.personalEmail,
    bodyProps.workEmail,
    bodyProps.supervisor,
    bodyProps.age,
    bodyProps.isActive,
    bodyProps.showAccessInvite,
    bodyProps.sendingAccessInvite,
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
      maxHeight: isCollapsed ? USER_HERO_COLLAPSED_PX : 0,
      opacity: isCollapsed ? 1 : 0,
    };
  }, [showCollapse, isCollapsed]);

  if (!showCollapse) {
    return (
      <AppCard bodyClassName="relative overflow-hidden p-0">
        <UserInfoHeroBody {...bodyProps} />
      </AppCard>
    );
  }

  const active = bodyProps.isActive !== false;

  return (
    <AppCard className={uiCx('transition-[margin]', HERO_PANEL_EASE)} bodyClassName="relative overflow-hidden p-0">
      <div
        className={uiCx(
          HERO_PANEL_TRANSITION_BASE,
          isCollapsed ? 'pointer-events-none' : 'pointer-events-auto',
        )}
        style={expandedStyle}
        aria-hidden={isCollapsed}
      >
        <div ref={measureRef} className="relative">
          <UserInfoHeroBody {...bodyProps} />
          {!isCollapsed ? (
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              className="absolute bottom-1 right-1 z-20 p-1"
              onClick={onToggleCollapsed}
              title="Collapse"
              aria-label="Collapse"
            >
              <ChevronUp className="h-3 w-3" />
            </AppButton>
          ) : null}
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
            <div className="flex shrink-0 items-center gap-1.5">
              <AppBadge variant={active ? 'success' : 'danger'} className="normal-case !tracking-normal">
                {active ? 'Active' : 'Inactive'}
              </AppBadge>
              {isCollapsed ? (
                <AppButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="p-1"
                  onClick={onToggleCollapsed}
                  title="Expand"
                  aria-label="Expand"
                >
                  <ChevronDown className="h-3 w-3" />
                </AppButton>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </AppCard>
  );
}

export function UserInfoHeroSkeleton() {
  return (
    <AppCard bodyClassName="relative overflow-hidden p-0">
      <div className="overflow-visible p-2.5">
        <div className="flex animate-pulse items-center gap-5">
          <div className="w-48 shrink-0">
            <div className={uiCx('h-36 w-48 bg-gray-100', uiRadius.card, uiBorders.subtle)} />
          </div>
          <div className="min-w-0 flex-1 lg:flex lg:items-center lg:justify-between lg:gap-4">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-1.5">
                <div className="h-4 w-48 max-w-full rounded bg-gray-100" />
                <div className="h-3 w-32 max-w-full rounded bg-gray-100" />
              </div>
              <div className="grid grid-cols-[minmax(0,0.72fr)_minmax(0,1.14fr)_minmax(0,1.14fr)] gap-x-2.5 gap-y-3">
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
