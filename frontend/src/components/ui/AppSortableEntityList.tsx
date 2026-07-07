import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { uiCx, uiSortableEntityList } from './tokens';
import { getAppListSortIndicator, type AppListSortDirection } from './useAppListSort';

/** Grid + min-width presets aligned with Business list pages. */
export const APP_SORTABLE_LIST_PRESETS = {
  opportunities: {
    gridCols: 'grid-cols-[8fr_5fr_4fr_3fr_3fr_3fr]',
    minWidth: 'min-w-[960px]',
  },
  projects: {
    gridCols: 'grid-cols-[10fr_3fr_3fr_4fr_4fr_4fr_auto]',
    minWidth: 'min-w-[800px]',
  },
  customers: {
    gridCols: 'grid-cols-[40fr_10fr_25fr_10fr_15fr]',
    minWidth: 'min-w-[640px]',
  },
  suppliers: {
    gridCols: 'grid-cols-[60fr_20fr_20fr]',
    minWidth: 'min-w-[640px]',
  },
  subcontractorWorkers: {
    gridCols: 'grid-cols-[10fr_5fr_6fr_4fr_4fr_4fr]',
    minWidth: 'min-w-[720px]',
  },
  workerTimesheet: {
    gridCols: 'grid-cols-[32px_4fr_4fr_6fr_3fr_3fr_3fr_auto]',
    minWidth: 'min-w-[720px]',
  },
  workerReports: {
    gridCols: 'grid-cols-[3fr_3fr_8fr_3fr_3fr_4fr_auto]',
    minWidth: 'min-w-[720px]',
  },
  workerTraining: {
    gridCols: 'grid-cols-[3fr_6fr_4fr_3fr_2fr_2fr_2fr_1fr_2fr_2fr_auto]',
    minWidth: 'min-w-[960px]',
  },
  workerTrainingReadOnly: {
    gridCols: 'grid-cols-[3fr_6fr_4fr_3fr_2fr_2fr_2fr_1fr_2fr_2fr]',
    minWidth: 'min-w-[900px]',
  },
  employeeLoans: {
    gridCols: 'grid-cols-[3fr_3fr_3fr_2fr_3fr_auto]',
    minWidth: 'min-w-[720px]',
  },
  employeeAssetsCurrent: {
    gridCols: 'grid-cols-[2fr_4fr_3fr_3fr_auto]',
    minWidth: 'min-w-[640px]',
  },
  employeeAssetsHistory: {
    gridCols: 'grid-cols-[2fr_4fr_3fr_3fr_2fr_auto]',
    minWidth: 'min-w-[720px]',
  },
  employeeReviews: {
    gridCols: 'grid-cols-[5fr_3fr_3fr_4fr_3fr_3fr_auto]',
    minWidth: 'min-w-[840px]',
  },
  employeeActivityLog: {
    gridCols: 'grid-cols-[8fr_4fr]',
    minWidth: 'min-w-[480px]',
  },
} as const;

export type AppSortableListPreset = keyof typeof APP_SORTABLE_LIST_PRESETS;

export function resolveAppSortableListPreset(preset: AppSortableListPreset) {
  return APP_SORTABLE_LIST_PRESETS[preset];
}

type GridProps = {
  /** Named preset or explicit `grid-cols-[…]` class. */
  preset?: AppSortableListPreset;
  gridCols?: string;
  minWidth?: string;
};

function resolveGrid({ preset, gridCols, minWidth }: GridProps) {
  const fromPreset = preset ? APP_SORTABLE_LIST_PRESETS[preset] : undefined;
  return {
    gridCols: gridCols ?? fromPreset?.gridCols ?? 'grid-cols-[10fr_5fr_5fr_5fr_auto]',
    minWidth: minWidth ?? fromPreset?.minWidth ?? 'min-w-[680px]',
  };
}

type AppSortableEntityListProps = HTMLAttributes<HTMLDivElement> & {
  /** `stack` — card rows with gap (Opportunities). `flat` — bordered table-style block (Customers). */
  layout?: 'stack' | 'flat';
};

/** Scrollable list shell; place create item, header, and rows inside. */
export function AppSortableEntityList({
  layout = 'stack',
  className,
  children,
  ...props
}: AppSortableEntityListProps) {
  return (
    <div
      className={uiCx(
        layout === 'stack' ? uiSortableEntityList.stack : 'overflow-x-auto',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type AppSortableEntityListHeaderProps = HTMLAttributes<HTMLDivElement> &
  GridProps & {
    children: ReactNode;
    /** `card` — standalone rounded header (Opportunities). `flat` — top of a connected table block. */
    variant?: 'card' | 'flat';
  };

export function AppSortableEntityListHeader({
  preset,
  gridCols,
  minWidth,
  variant = 'card',
  className,
  children,
  ...props
}: AppSortableEntityListHeaderProps) {
  const grid = resolveGrid({ preset, gridCols, minWidth });
  return (
    <div
      role="row"
      className={uiCx(
        grid.minWidth,
        'w-full',
        grid.gridCols,
        variant === 'flat' ? uiSortableEntityList.headerFlat : uiSortableEntityList.header,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type AppSortableEntityListSortColumnProps<T extends string> = {
  label: ReactNode;
  column: T;
  sortBy: T;
  sortDir: AppListSortDirection;
  onSort: (column: T, direction?: AppListSortDirection) => void;
  title?: string;
  className?: string;
  /** Non-sortable spacer column (e.g. action buttons). */
  sortable?: boolean;
};

export function AppSortableEntityListSortColumn<T extends string>({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
  title,
  className,
  sortable = true,
}: AppSortableEntityListSortColumnProps<T>) {
  if (!sortable) {
    return <div className={uiCx('min-w-0', className)}>{label}</div>;
  }

  const indicator = getAppListSortIndicator(sortBy, column, sortDir);
  const resolvedTitle = title ?? (typeof label === 'string' ? `Sort by ${label.toLowerCase()}` : undefined);

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={uiCx(uiSortableEntityList.sortColumn, className)}
      title={resolvedTitle}
    >
      {label}
      {indicator}
    </button>
  );
}

type AppSortableEntityListFlatBodyProps = HTMLAttributes<HTMLDivElement> & GridProps;

/** Bordered wrapper for flat rows (Customers list inside AppCard). */
export function AppSortableEntityListFlatBody({
  preset,
  gridCols,
  minWidth,
  className,
  children,
  ...props
}: AppSortableEntityListFlatBodyProps) {
  const grid = resolveGrid({ preset, gridCols, minWidth });
  return (
    <div className={uiCx(grid.minWidth, 'w-full', uiSortableEntityList.flatBody, className)} {...props}>
      {children}
    </div>
  );
}

type AppSortableEntityListRowBaseProps = GridProps & {
  children: ReactNode;
  className?: string;
  /** `card` — bordered card per row (Opportunities). `flat` — divider rows (Customers). */
  variant?: 'card' | 'flat';
};

type AppSortableEntityListRowLinkProps = AppSortableEntityListRowBaseProps & {
  as?: 'link';
  to: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'>;

type AppSortableEntityListRowButtonProps = AppSortableEntityListRowBaseProps & {
  as?: 'button';
  onClick?: () => void;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

type AppSortableEntityListRowDivProps = AppSortableEntityListRowBaseProps & {
  as?: 'div';
  onClick?: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  role?: string;
  tabIndex?: number;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children'>;

export type AppSortableEntityListRowProps =
  | AppSortableEntityListRowLinkProps
  | AppSortableEntityListRowButtonProps
  | AppSortableEntityListRowDivProps;

export function AppSortableEntityListRow(props: AppSortableEntityListRowProps) {
  const {
    preset,
    gridCols,
    minWidth,
    variant = 'card',
    className,
    children,
    as = 'link',
    ...rest
  } = props;

  const grid = resolveGrid({ preset, gridCols, minWidth });
  const gridClass = uiCx(
    grid.minWidth,
    'w-full',
    grid.gridCols,
    'items-center gap-2 overflow-hidden sm:gap-3 lg:gap-4',
    variant === 'flat' ? uiSortableEntityList.rowFlat : 'grid p-4',
  );

  if (variant === 'card' && as === 'link') {
    const { to, ...linkRest } = rest as AppSortableEntityListRowLinkProps;
    return (
      <Link
        to={to}
        className={uiCx(uiSortableEntityList.rowCard, gridClass, className)}
        {...linkRest}
      >
        {children}
      </Link>
    );
  }

  if (variant === 'flat') {
    const divProps = rest as AppSortableEntityListRowDivProps;
    return (
      <div className={uiCx(gridClass, className)} {...divProps}>
        {children}
      </div>
    );
  }

  if (as === 'button') {
    const buttonProps = rest as AppSortableEntityListRowButtonProps;
    return (
      <button type="button" className={uiCx(gridClass, 'text-left', className)} {...buttonProps}>
        {children}
      </button>
    );
  }

  const divProps = rest as AppSortableEntityListRowDivProps;
  return (
    <div className={uiCx(gridClass, className)} {...divProps}>
      {children}
    </div>
  );
}
