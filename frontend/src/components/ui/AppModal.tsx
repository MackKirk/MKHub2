import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import OverlayPortal from '@/components/OverlayPortal';
import { uiBorders, uiColors, uiCx, uiRadius, uiShadows, uiSpacing, uiTypography } from './tokens';

type AppModalProps = {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg';
};

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
} as const;

export function AppModal({ open, title, description, children, footer, onClose, size = 'md' }: AppModalProps) {
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
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onMouseDown={onClose}
        role="presentation"
      >
        <div
          className={uiCx(
            'w-full overflow-hidden',
            uiRadius.modal,
            uiShadows.elevated,
            uiColors.surface,
            sizeClasses[size],
          )}
          onMouseDown={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <header className={uiCx('flex items-start justify-between gap-3', uiSpacing.cardPadding, uiBorders.subtle)}>
            <div className="min-w-0 space-y-1">
              <h3 className={uiTypography.sectionTitle}>{title}</h3>
              {description ? <p className={uiTypography.sectionSubtitle}>{description}</p> : null}
            </div>
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
          </header>
          <div className={uiSpacing.cardPadding}>{children}</div>
          {footer ? <footer className={uiCx(uiSpacing.cardPadding, 'border-t border-gray-100')}>{footer}</footer> : null}
        </div>
      </div>
    </OverlayPortal>
  );
}
