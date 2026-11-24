import type { ReactNode } from 'react';
import { uiBorders, uiColors, uiCx, uiRadius, uiTypography } from './tokens';

export type AppStickyActionBarStatus = 'dirty' | 'saved' | 'idle' | ReactNode;

type Props = {
  /** Left-side status (unsaved / saved chip, or custom node). */
  status?: AppStickyActionBarStatus;
  /** Primary / secondary action buttons (right side). */
  children: ReactNode;
  /** Optional leading actions (e.g. Back) before the flex spacer. */
  leading?: ReactNode;
  className?: string;
  /** Extra class on the inner pill bar. */
  barClassName?: string;
  /**
   * When true (default), render a bottom spacer so page content is not hidden
   * behind the fixed bar.
   */
  includeSpacer?: boolean;
};

function StatusChip({ status }: { status: AppStickyActionBarStatus }) {
  if (status == null || status === 'idle') return null;
  if (status !== 'dirty' && status !== 'saved') return <>{status}</>;
  if (status === 'dirty') {
    return (
      <div className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-sm font-semibold text-amber-800">
        Unsaved changes
      </div>
    );
  }
  return (
    <div className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-800">
      All changes saved
    </div>
  );
}

/**
 * Fixed bottom action bar for editable pages / long forms (Proposal-style).
 * Keeps Save / Submit / PDF within reach while scrolling.
 */
export function AppStickyActionBar({
  status = 'idle',
  children,
  leading,
  className,
  barClassName,
  includeSpacer = true,
}: Props) {
  return (
    <>
      {includeSpacer ? <div className="h-16 shrink-0" aria-hidden /> : null}
      <div
        className={uiCx(
          'pointer-events-none fixed bottom-0 right-0 z-40 flex justify-center',
          // Match Proposal / Estimate: offset main sidebar on desktop.
          'left-0 md:left-60',
          className
        )}
      >
        <div className="pointer-events-auto mx-auto w-full max-w-[56rem] px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4">
          <div
            className={uiCx(
              uiRadius.card,
              uiBorders.subtle,
              uiColors.surface,
              'flex flex-wrap items-center gap-2 rounded-t-xl border-t bg-white/95 p-2.5 shadow-[0_-6px_16px_rgba(0,0,0,0.08)] backdrop-blur',
              barClassName
            )}
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {leading}
              <StatusChip status={status} />
            </div>
            <div
              className={uiCx(
                'flex flex-wrap items-center justify-end gap-1.5',
                uiTypography.controlValue
              )}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
