import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { uiCx, uiListCreateItem, uiRadius } from './tokens';

export type AppListCreateItemLayout = 'card' | 'row';

type AppListCreateItemBaseProps = {
  /** e.g. "New Opportunity", "New Contact" */
  label: ReactNode;
  /**
   * `card` — grid/card lists (e.g. Opportunities cards view).
   * `row` — table-style or full-width row lists (first item before rows).
   */
  layout?: AppListCreateItemLayout;
  className?: string;
};

export type AppListCreateItemProps =
  | (AppListCreateItemBaseProps & { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'>)
  | (AppListCreateItemBaseProps & { href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>);

export function getListCreateItemClassName(layout: AppListCreateItemLayout = 'card', className?: string) {
  return uiCx(
    uiListCreateItem.base,
    uiRadius.control,
    layout === 'card' ? uiListCreateItem.card : uiListCreateItem.row,
    className,
  );
}

/**
 * Standard “create new” control — always render as the **first** item in a list or grid,
 * before existing records. Typically navigates to a create route or opens a creation modal.
 */
export function AppListCreateItem({ label, layout = 'card', className, href, ...props }: AppListCreateItemProps) {
  const classes = getListCreateItemClassName(layout, className);

  const content = (
    <>
      <Plus className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
      <span className={uiListCreateItem.label}>{label}</span>
    </>
  );

  if (href) {
    const anchorProps = props as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a href={href} className={classes} {...anchorProps}>
        {content}
      </a>
    );
  }

  const buttonProps = props as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type="button" className={classes} {...buttonProps}>
      {content}
    </button>
  );
}
