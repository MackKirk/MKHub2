import { useEffect, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import OverlayPortal from '@/components/OverlayPortal';
import { AppButton, AppModal, uiCx, uiLayout } from '@/components/ui';
import type { FileImagePreviewItem } from './fileImagePreview';

type Props = {
  open: boolean;
  items: FileImagePreviewItem[];
  index: number;
  loading?: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  variant?: 'modal' | 'legacy';
  legacyActions?: (item: FileImagePreviewItem) => ReactNode;
};

function GalleryNavButtons({
  show,
  onPrev,
  onNext,
  className,
}: {
  show: boolean;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}) {
  if (!show) return null;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPrev();
        }}
        className={uiCx(
          'absolute left-1 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-700 shadow-sm hover:bg-white md:left-2 md:h-10 md:w-10',
          className,
        )}
        aria-label="Previous image"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onNext();
        }}
        className={uiCx(
          'absolute right-1 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-700 shadow-sm hover:bg-white md:right-2 md:h-10 md:w-10',
          className,
        )}
        aria-label="Next image"
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </>
  );
}

function ImageBody({
  item,
  loading,
  showNav,
  onPrev,
  onNext,
  imageClassName,
}: {
  item: FileImagePreviewItem | null;
  loading?: boolean;
  showNav: boolean;
  onPrev: () => void;
  onNext: () => void;
  imageClassName?: string;
}) {
  return (
    <div className="relative flex min-h-[200px] w-full flex-1 items-center justify-center">
      <GalleryNavButtons show={showNav} onPrev={onPrev} onNext={onNext} />
      {loading || !item?.url ? (
        <div className="h-48 w-full max-w-md animate-pulse rounded-lg bg-gray-100" aria-hidden />
      ) : (
        <img
          src={item.url}
          alt={item.name}
          className={uiCx('max-h-[calc(90vh-120px)] w-full object-contain', imageClassName)}
        />
      )}
    </div>
  );
}

export default function FileImagePreviewModal({
  open,
  items,
  index,
  loading,
  onClose,
  onPrev,
  onNext,
  variant = 'modal',
  legacyActions,
}: Props) {
  const current = items[index] ?? null;
  const showNav = items.length > 1;
  const counter = showNav ? (
    <span className="ml-2 text-xs font-normal tabular-nums text-gray-500">
      {index + 1} / {items.length}
    </span>
  ) : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onPrev, onNext]);

  if (!open || !current) return null;

  if (variant === 'legacy') {
    return (
      <OverlayPortal>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={onClose}
        >
          <div
            className="flex h-full max-h-[95vh] w-full max-w-[95vw] flex-col overflow-hidden rounded-lg bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-shrink-0 items-center justify-between border-b p-3">
              <h3 className="text-sm font-semibold">
                {current.name}
                {counter}
              </h3>
              <div className="flex items-center gap-2">
                {current.url ? (
                  <a
                    href={current.url}
                    download={current.name}
                    className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                    title="Download"
                  >
                    ⬇️
                  </a>
                ) : null}
                {legacyActions?.(current)}
                {current.url ? (
                  <a
                    href={current.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                    title="Open in new tab"
                  >
                    🔗
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="h-6 w-6 text-lg font-bold text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-3">
              <GalleryNavButtons show={showNav} onPrev={onPrev} onNext={onNext} />
              {loading || !current.url ? (
                <div className="h-48 w-full max-w-md animate-pulse rounded-lg bg-gray-100" aria-hidden />
              ) : (
                <img
                  src={current.url}
                  alt={current.name}
                  className="max-h-full max-w-full object-contain"
                />
              )}
            </div>
          </div>
        </div>
      </OverlayPortal>
    );
  }

  return (
    <AppModal
      open
      onClose={onClose}
      title={
        <>
          {current.name}
          {counter}
        </>
      }
      size="lg"
      bodyClassName="flex min-h-0 flex-1 items-center justify-center p-3"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end gap-2')}>
          <AppButton variant="secondary" size="sm" type="button" onClick={onClose}>
            Close
          </AppButton>
          <AppButton
            size="sm"
            type="button"
            disabled={!current.url}
            onClick={() => {
              if (!current.url) return;
              const a = document.createElement('a');
              a.href = current.url;
              a.download = current.name;
              a.click();
            }}
          >
            Download
          </AppButton>
        </div>
      }
    >
      <ImageBody
        item={current}
        loading={loading}
        showNav={showNav}
        onPrev={onPrev}
        onNext={onNext}
      />
    </AppModal>
  );
}
