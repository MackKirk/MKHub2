import type { ReactNode } from 'react';

export type PageHeaderBarProps = {
  /** e.g. back control before the title (same row as Opportunities / project detail). */
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Shown on the right (e.g. actions, links). */
  trailing?: ReactNode;
  className?: string;
};

/**
 * Title bar matching `/business` (Business Dashboard): white rounded card, title + subtitle, optional trailing.
 */
export default function PageHeaderBar({
  leading,
  title,
  subtitle,
  trailing,
  className = '',
}: PageHeaderBarProps) {
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
        {trailing ? (
          <div className="flex items-center gap-3 flex-wrap justify-end shrink-0">{trailing}</div>
        ) : null}
      </div>
    </div>
  );
}
