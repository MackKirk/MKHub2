import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AppEmptyState, uiCx, uiTypography } from '@/components/ui';

/** Compact flat list rows — same hover/divider language as AppSortableEntityList flat variant. */
export const homeWidgetListRowClass = uiCx(
  'flex min-w-0 items-center justify-between gap-2 border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50',
  'py-[clamp(0.375rem,2.5cqh,0.625rem)]',
);

type HomeWidgetListProps = {
  children: ReactNode;
  className?: string;
};

export function HomeWidgetList({ children, className }: HomeWidgetListProps) {
  return (
    <ul className={uiCx('flex min-h-0 flex-1 flex-col overflow-y-auto', className)}>
      {children}
    </ul>
  );
}

type HomeWidgetListRowProps = {
  to: string;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
};

export function HomeWidgetListRow({ to, title, meta, trailing }: HomeWidgetListRowProps) {
  return (
    <li className="shrink-0">
      <Link to={to} className={homeWidgetListRowClass}>
        <div className="min-w-0 flex-1">
          <div
            className="truncate font-semibold text-gray-900"
            style={{ fontSize: 'clamp(0.625rem, 5cqh, 0.8125rem)' }}
          >
            {title}
          </div>
          {meta ? (
            <div
              className={uiCx(uiTypography.helper, 'mt-0.5 truncate')}
              style={{ fontSize: 'clamp(0.5rem, 3.5cqh, 0.625rem)' }}
            >
              {meta}
            </div>
          ) : null}
        </div>
        {trailing ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">{trailing}</div> : null}
      </Link>
    </li>
  );
}

type HomeWidgetListEmptyProps = {
  icon: ReactNode;
  title: string;
  description?: string;
};

export function HomeWidgetListEmpty({ icon, title, description }: HomeWidgetListEmptyProps) {
  return (
    <li className="flex min-h-0 flex-1 items-center justify-center">
      <AppEmptyState
        icon={icon}
        title={title}
        description={description}
        className="border-0 bg-transparent p-0 shadow-none"
      />
    </li>
  );
}

type HomeWidgetListFooterProps = {
  to: string;
  label: string;
};

export function HomeWidgetListFooter({ to, label }: HomeWidgetListFooterProps) {
  return (
    <div className="shrink-0 border-t border-gray-100 pt-1.5">
      <Link
        to={to}
        className={uiCx(uiTypography.helper, 'inline-block font-medium text-brand-red hover:underline')}
        style={{ fontSize: 'clamp(0.5rem, 4cqh, 0.75rem)' }}
      >
        {label}
      </Link>
    </div>
  );
}

/** Schedule shift row — flat list hover (design-system flat rows). */
export const homeWidgetScheduleRowClass = uiCx(
  'block border-b border-gray-100 py-2 transition-colors last:border-b-0 hover:bg-gray-50',
);
