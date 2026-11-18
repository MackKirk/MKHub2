import { Crown, Star } from 'lucide-react';
import { GRID_CARD_CLASS, GRID_CLASS } from '@/components/DocumentTypePicker';
import {
  AppTooltip,
  AppUserAvatar,
  uiCx,
  uiTypography,
} from '@/components/ui';
import { getUserDisplayName } from '@/lib/userDisplay';
import type { ShiftWorkerCandidate } from '@/components/ShiftWorkerDivisionPicker';

export function ShiftCrewMemberCards({
  employees,
  workerIds,
  disabled,
  groupLeadWorkerId = null,
  onGroupLeadClick,
  onsiteLeadEnabled = false,
  onsiteLeadWorkerIds,
  onOnsiteLeadStarClick,
}: {
  employees: ShiftWorkerCandidate[];
  workerIds: string[];
  disabled?: boolean;
  groupLeadWorkerId?: string | null;
  onGroupLeadClick?: (workerId: string) => void;
  onsiteLeadEnabled?: boolean;
  onsiteLeadWorkerIds?: Set<string> | string[] | null;
  onOnsiteLeadStarClick?: (workerId: string) => void;
}) {
  const onsiteLeadIdSet = (() => {
    if (!onsiteLeadWorkerIds) return new Set<string>();
    if (onsiteLeadWorkerIds instanceof Set) return onsiteLeadWorkerIds;
    return new Set(onsiteLeadWorkerIds.map(String));
  })();
  const byId = new Map(
    (Array.isArray(employees) ? employees : []).map((emp) => [String(emp.id), emp]),
  );
  const ordered = (Array.isArray(workerIds) ? workerIds : [])
    .map(String)
    .map((id) => byId.get(id))
    .filter(Boolean) as ShiftWorkerCandidate[];

  if (ordered.length === 0) {
    return (
      <p className={uiCx(uiTypography.helper, 'text-gray-500 py-4 text-center')}>
        No people selected.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className={GRID_CLASS}>
        {ordered.map((emp) => {
          const id = String(emp.id);
          const name = getUserDisplayName(emp) || emp.name || emp.username || 'Worker';
          const isGroupLead = Boolean(groupLeadWorkerId && String(groupLeadWorkerId) === id);
          const isOnsiteLead = onsiteLeadIdSet.has(id);

          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              aria-pressed={isGroupLead}
              onClick={() => {
                if (disabled) return;
                onGroupLeadClick?.(id);
              }}
              title={name}
              className={uiCx(
                GRID_CARD_CLASS,
                '!flex-row items-center gap-2 p-2 text-left',
                isGroupLead &&
                  'border-brand-red bg-red-50 ring-1 ring-inset ring-brand-red/30',
                disabled && 'opacity-60 cursor-not-allowed',
              )}
            >
              <span className="flex h-11 w-5 shrink-0 flex-col items-center justify-between py-0.5">
                <AppTooltip
                  content={
                    isGroupLead
                      ? 'Group lead — click to clear'
                      : 'Set as group lead'
                  }
                  placement="top"
                >
                  <span
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-label={
                      isGroupLead
                        ? `Clear group lead for ${name}`
                        : `Set ${name} as group lead`
                    }
                    aria-pressed={isGroupLead}
                    className={uiCx(
                      'inline-flex h-4 w-4 items-center justify-center rounded',
                      disabled
                        ? 'pointer-events-none opacity-50'
                        : 'hover:bg-red-50 cursor-pointer',
                    )}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (disabled) return;
                      onGroupLeadClick?.(id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        if (disabled) return;
                        onGroupLeadClick?.(id);
                      }
                    }}
                  >
                    <Crown
                      className={uiCx(
                        'h-3.5 w-3.5',
                        isGroupLead ? 'fill-current text-brand-red' : 'text-gray-400',
                      )}
                      strokeWidth={2}
                      aria-hidden
                    />
                  </span>
                </AppTooltip>
                {onsiteLeadEnabled ? (
                  <AppTooltip
                    content={
                      isOnsiteLead
                        ? 'On-site lead — click to edit'
                        : 'Assign as on-site lead'
                    }
                    placement="top"
                  >
                    <span
                      role="button"
                      tabIndex={disabled ? -1 : 0}
                      aria-label={
                        isOnsiteLead
                          ? `Edit on-site lead for ${name}`
                          : `Assign ${name} as on-site lead`
                      }
                      aria-pressed={isOnsiteLead}
                      className={uiCx(
                        'inline-flex h-4 w-4 items-center justify-center rounded',
                        disabled
                          ? 'pointer-events-none opacity-50'
                          : 'hover:bg-amber-50 cursor-pointer',
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (disabled) return;
                        onOnsiteLeadStarClick?.(id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (disabled) return;
                          onOnsiteLeadStarClick?.(id);
                        }
                      }}
                    >
                      <Star
                        className={uiCx(
                          'h-3.5 w-3.5',
                          isOnsiteLead
                            ? 'fill-amber-400 text-amber-500'
                            : 'text-gray-400',
                        )}
                        strokeWidth={2}
                        aria-hidden
                      />
                    </span>
                  </AppTooltip>
                ) : (
                  <span className="h-4 w-4" aria-hidden />
                )}
              </span>
              <AppUserAvatar
                user={emp}
                size="md"
                className="!h-11 !w-11 shrink-0 !rounded-lg !text-sm"
              />
              <span className="min-w-0 flex-1 self-stretch flex flex-col justify-center gap-0.5">
                <span className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">
                  {name}
                </span>
                {isGroupLead ? (
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-red">
                    Group lead
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <p className={uiCx(uiTypography.helper, 'text-gray-600')}>
        Crown = group lead for this crew. Star = project on-site lead.
      </p>
    </div>
  );
}
