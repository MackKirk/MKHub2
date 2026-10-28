import { useEffect, useState } from 'react';
import OverlayPortal from '@/components/OverlayPortal';
import { uiCx, uiRadius, uiTypography } from '@/components/ui';

export type DocumentExportPdfProgress = {
  phase: 'loading_images' | 'building_pages' | 'working';
  current: number;
  total: number;
  pct: number;
};

type Props = {
  open: boolean;
  progress?: DocumentExportPdfProgress | null;
};

function phaseLabel(phase: DocumentExportPdfProgress['phase'] | undefined): string {
  if (phase === 'loading_images') return 'Loading images…';
  if (phase === 'building_pages') return 'Building pages…';
  return 'Working…';
}

/** Full-screen feedback while the document PDF is generating. */
export default function DocumentExportPdfOverlay({ open, progress }: Props) {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!open) {
      setElapsedSec(0);
      return;
    }
    setElapsedSec(0);
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [open]);

  if (!open) return null;

  const pct = progress && progress.total > 0 ? Math.max(0, Math.min(100, progress.pct)) : null;
  const detail =
    progress && progress.total > 0
      ? `${phaseLabel(progress.phase)} ${progress.current} / ${progress.total}`
      : phaseLabel(progress?.phase);

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-[230] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]"
        role="alertdialog"
        aria-modal="true"
        aria-busy="true"
        aria-labelledby="document-export-pdf-title"
      >
        <div
          className={uiCx(
            'w-full max-w-sm border border-slate-200 bg-white p-5 shadow-lg',
            uiRadius.modal,
          )}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <h2 id="document-export-pdf-title" className="text-base font-semibold text-slate-900">
            Generating PDF…
          </h2>
          <p className={uiCx(uiTypography.helper, 'mt-1.5')}>
            Large documents with many images can take a while. Please keep this tab open.
          </p>
          <div className="mt-4 space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={uiCx(
                  'h-full rounded-full bg-brand-red transition-[width] duration-300 ease-out',
                  pct == null && 'w-1/3 animate-pulse',
                )}
                style={pct != null ? { width: `${pct}%` } : undefined}
              />
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-slate-600">
              <span className="min-w-0 truncate">{detail}</span>
              <span className="shrink-0 tabular-nums">{elapsedSec}s</span>
            </div>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
