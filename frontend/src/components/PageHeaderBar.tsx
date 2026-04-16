import { useMemo, type ReactNode } from 'react';

export type PageHeaderBarProps = {
  /** e.g. back control before the title (same row as Opportunities / project detail). */
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Shown before the Today block (e.g. actions, links). */
  trailing?: ReactNode;
  showToday?: boolean;
  className?: string;
};

/**
 * Title bar matching `/business` (Business Dashboard): white rounded card, title + subtitle, optional trailing, Today on the right.
 */
export default function PageHeaderBar({
  leading,
  title,
  subtitle,
  trailing,
  showToday = true,
  className = '',
}: PageHeaderBarProps) {
  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-CA', {
        weekday: 'long',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    []
  );

  return (
    <div className={`rounded-xl border bg-white p-4 mb-4 ${className}`.trim()}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {leading}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">{title}</div>
            {subtitle != null && subtitle !== false && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end shrink-0">
          {trailing}
          {showToday && (
            <div className="text-right">
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
              <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
