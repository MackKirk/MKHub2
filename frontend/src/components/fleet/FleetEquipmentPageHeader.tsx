import type { ReactNode } from 'react';

/** Standard Fleet area page header (matches Fleet dashboard). */
export function FleetEquipmentPageHeader({
  todayLabel,
  onBack,
  headerExtra,
}: {
  todayLabel: string;
  /** When set (e.g. asset detail), back control sits in the header left, before the title. */
  onBack?: () => void;
  /** Right cluster before Today (e.g. admin actions on work order detail). */
  headerExtra?: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-white p-4 mb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center text-gray-600 hover:text-gray-900 flex-shrink-0"
              title="Back"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
          ) : null}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">Fleet & Equipment</div>
            <div className="text-xs text-gray-500 mt-0.5">Executive overview</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {headerExtra}
          <div className="text-right">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
