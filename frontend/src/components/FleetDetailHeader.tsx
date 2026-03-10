import { ReactNode } from 'react';

type Props = {
  onBack: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Optional right-side block (e.g. "Today" label + date) */
  right?: ReactNode;
};

/**
 * Shared header layout for Fleet detail pages (Inspection, Work Order, etc.):
 * back button, title, subtitle, optional actions, optional right block.
 */
export default function FleetDetailHeader({ onBack, title, subtitle, actions, right }: Props) {
  return (
    <div className="rounded-xl border bg-white p-4 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center text-gray-600 hover:text-gray-900 shrink-0"
            title="Back"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">{title}</div>
            {subtitle != null && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {actions}
          {right}
        </div>
      </div>
    </div>
  );
}
