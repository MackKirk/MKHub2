import type { ReactNode } from 'react';

/** Card shell shared by every detail section on the Insights page. */
export function InsightsSection({
  title,
  subtitle,
  actions,
  children,
  bodyClassName,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm min-w-0 max-w-full overflow-hidden">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-x-4 px-4 pt-4 pb-3 border-b border-gray-100 min-w-0">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900 break-words">{title}</h3>
          {subtitle ? <p className="text-xs text-gray-500 mt-0.5 break-words">{subtitle}</p> : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 min-w-0 w-full sm:w-auto sm:justify-end">
            {actions}
          </div>
        ) : null}
      </header>
      <div className={`min-w-0 ${bodyClassName ?? 'p-4'}`}>{children}</div>
    </section>
  );
}

export function InsightsEmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 text-gray-500">
      <div className="w-10 h-10 mb-2 text-gray-300">
        {icon ?? (
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3v18h18M7 14l4-4 4 4 5-5" />
          </svg>
        )}
      </div>
      <div className="text-sm font-medium text-gray-700">{title}</div>
      {hint ? <div className="text-xs text-gray-500 mt-1">{hint}</div> : null}
    </div>
  );
}
