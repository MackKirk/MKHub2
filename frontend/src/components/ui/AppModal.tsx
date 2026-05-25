import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import OverlayPortal from '@/components/OverlayPortal';
import { uiBorders, uiColors, uiCx, uiRadius, uiShadows, uiSpacing, uiTypography } from './tokens';

type AppModalProps = {
  open: boolean;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg';
  /** Rendered between the title block and the close button (e.g. quick-info toggle). */
  headerActions?: ReactNode;
  /** Replaces the default title/description block; close button remains on the right. */
  headerContent?: ReactNode;
  /** When false, only the dialog shell and body render (no title row). */
  showHeader?: boolean;
  /** Extra classes on the backdrop (e.g. `z-[200]` when stacked on another modal). */
  overlayClassName?: string;
  /** Extra classes on the dialog panel (e.g. width transitions). */
  dialogClassName?: string;
  /** Body wrapper classes; when set, default body padding is omitted. */
  bodyClassName?: string;
  /** When false with a footer, body height follows content instead of filling the dialog. */
  bodyFill?: boolean;
};

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
} as const;

export function AppModal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  size = 'md',
  headerActions,
  headerContent,
  showHeader = true,
  overlayClassName,
  dialogClassName,
  bodyClassName,
  bodyFill = true,
}: AppModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <OverlayPortal>
      <div
        className={uiCx(
          'fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm',
          overlayClassName,
        )}
        onMouseDown={onClose}
        role="presentation"
      >
        <div
          className={uiCx(
            'flex max-h-[90vh] w-full flex-col overflow-hidden',
            uiRadius.modal,
            uiShadows.elevated,
            uiColors.surface,
            sizeClasses[size],
            dialogClassName,
          )}
          onMouseDown={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          {showHeader ? (
            <header className={uiCx('flex shrink-0 items-start justify-between gap-3', uiSpacing.cardPadding, uiBorders.subtle)}>
              {headerContent ?? (
                <div className="min-w-0 space-y-1">
                  {title ? <h3 className={uiTypography.sectionTitle}>{title}</h3> : null}
                  {description ? <p className={uiTypography.sectionSubtitle}>{description}</p> : null}
                </div>
              )}
              <div className="flex shrink-0 items-center gap-1.5">
                {headerActions}
                <button
                  type="button"
                  onClick={onClose}
                  className={uiCx(
                    'inline-flex h-8 w-8 items-center justify-center bg-white text-gray-600 transition-colors hover:bg-gray-100',
                    uiRadius.control,
                    uiBorders.input,
                  )}
                  aria-label="Close modal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>
          ) : null}
          <div
            className={uiCx(
              bodyClassName === undefined ? uiSpacing.cardPadding : '',
              bodyClassName,
              footer
                ? uiCx(
                    'flex min-h-0 flex-col overflow-hidden',
                    bodyFill && 'flex-1',
                  )
                : '',
            )}
          >
            {children}
          </div>
          {footer ? (
            <footer className={uiCx('shrink-0', uiSpacing.cardPadding, uiBorders.subtle)}>{footer}</footer>
          ) : null}
        </div>
      </div>
    </OverlayPortal>
  );
}
