import type { ReactNode } from 'react';

/** Matches the standard list-page header used on Fleet Assets (`FleetAssets.tsx`). */
export function CommunityPageHeader({
  title,
  subtitle,
  onBack,
  backTitle = 'Back to Community',
  actions,
}: {
  title: string;
  subtitle: string;
  onBack?: () => void;
  backTitle?: string;
  /** Optional row of links/buttons (e.g. secondary navigation). */
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-white p-4 sm:p-5 mb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center text-gray-600 hover:text-gray-900 flex-shrink-0"
              title={backTitle}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
          ) : null}
          <div className="min-w-0">
            <div className="text-lg font-semibold text-gray-900 tracking-tight">{title}</div>
            <div className="text-sm text-gray-500 mt-0.5">{subtitle}</div>
          </div>
        </div>
        {actions ? <div className="hidden sm:flex items-center gap-2 flex-wrap justify-end shrink-0">{actions}</div> : null}
      </div>
      {actions ? <div className="mt-3 flex sm:hidden flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
