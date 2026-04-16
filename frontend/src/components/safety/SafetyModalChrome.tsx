import type { HTMLAttributes, ReactNode } from 'react';
import OverlayPortal from '@/components/OverlayPortal';

/** Match New Supplier (`NewSupplierModal`) — overlay + shell */
export const SAFETY_MODAL_OVERLAY =
  'fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4';

export const SAFETY_MODAL_BTN_CANCEL =
  'px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50';

export const SAFETY_MODAL_BTN_PRIMARY =
  'px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed';

export const SAFETY_MODAL_FIELD_LABEL =
  'text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1';

export function ModalCloseChevron({ onClose, label = 'Close' }: { onClose: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center shrink-0"
      title={label}
      aria-label={label}
    >
      <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
    </button>
  );
}

export function SafetyFormModalLayout({
  widthClass,
  titleId,
  title,
  subtitle,
  onClose,
  children,
  footer,
  innerCard = true,
  innerCardClassName = '',
  innerCardProps,
  shellOverflow = 'hidden',
  bodyClassName = 'overflow-y-auto flex-1 p-4 min-h-0',
}: {
  widthClass: string;
  titleId: string;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  innerCard?: boolean;
  innerCardClassName?: string;
  innerCardProps?: HTMLAttributes<HTMLDivElement>;
  /** Use `visible` when the body contains portalled dropdowns (e.g. project combobox). */
  shellOverflow?: 'hidden' | 'visible';
  /** Middle scroll region; override when inner content must not clip (e.g. combobox). */
  bodyClassName?: string;
}) {
  return (
    <div
      className={`${widthClass} max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl ${
        shellOverflow === 'visible' ? 'overflow-visible' : 'overflow-hidden'
      } flex flex-col border border-gray-200 shadow-xl`}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="rounded-t-xl border-b border-gray-200 bg-white p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <ModalCloseChevron onClose={onClose} />
            <div className="min-w-0">
              <div id={titleId} className="text-sm font-semibold text-gray-900">
                {title}
              </div>
              {subtitle != null && subtitle !== '' && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
            </div>
          </div>
        </div>
      </div>
      <div className={bodyClassName}>
        {innerCard ? (
          <div
            className={`rounded-xl border border-gray-200 bg-white p-4 ${innerCardClassName}`.trim()}
            {...innerCardProps}
          >
            {children}
          </div>
        ) : (
          children
        )}
      </div>
      <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-2 rounded-b-xl">
        {footer}
      </div>
    </div>
  );
}

export function SafetyFormPdfPreviewShell({
  name,
  url,
  onClose,
  overlayZClass = 'z-[60]',
}: {
  name: string;
  url: string;
  onClose: () => void;
  /** Use higher z when stacking over other modals (e.g. template editor). */
  overlayZClass?: string;
}) {
  return (
    <OverlayPortal>
      <div
        className={`fixed inset-0 ${overlayZClass} bg-black/50 flex items-center justify-center overflow-y-auto p-4`}
        onClick={onClose}
        role="presentation"
      >
        <div
          className="w-full max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={name}
        >
          <div className="rounded-t-xl border-b border-gray-200 bg-white p-3 flex-shrink-0 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <ModalCloseChevron onClose={onClose} />
              <h3 className="text-sm font-semibold text-gray-900 truncate">{name}</h3>
            </div>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 shrink-0"
              title="Open in new tab"
            >
              🔗
            </a>
          </div>
          <div className="flex-1 min-h-0 p-4 bg-gray-100 overflow-hidden flex flex-col">
            <div className="flex-1 min-h-0 rounded-xl border border-gray-200 bg-white overflow-hidden">
              <iframe src={url} className="w-full h-full border-0 min-h-[65vh]" title={name} />
            </div>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
