import { useEffect, useRef, useState, type DragEvent } from 'react';
import { isOsFileDrag } from './fileListDnD';

/**
 * Tracks an OS file drag over a container, including when children stop propagation.
 * Highlight stays on while dragover keeps firing. A short leave delay covers Chrome,
 * which reports a null relatedTarget when the pointer crosses child elements.
 */
export function useOsFileDropHighlight(enabled = true) {
  const [active, setActive] = useState(false);
  const clearTimer = useRef<number | null>(null);

  const cancelClear = () => {
    if (clearTimer.current != null) {
      window.clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
  };

  useEffect(() => () => cancelClear(), []);

  const bind = {
    onDragOverCapture: (e: DragEvent) => {
      if (!enabled || !isOsFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      cancelClear();
      setActive(true);
    },
    onDragLeaveCapture: (e: DragEvent) => {
      if (!enabled || !isOsFileDrag(e.dataTransfer)) return;
      const related = e.relatedTarget as Node | null;
      if (related && e.currentTarget.contains(related)) return;
      cancelClear();
      clearTimer.current = window.setTimeout(() => setActive(false), 60);
    },
    onDropCapture: () => {
      if (!enabled) return;
      cancelClear();
      setActive(false);
    },
  };

  return { active, bind };
}

export function OsFileDropOverlay({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-brand-red bg-amber-50/80"
      aria-live="polite"
    >
      <p className="rounded-md bg-white/90 px-3 py-1.5 text-sm font-semibold text-brand-red shadow-sm">
        Drop files to upload
      </p>
    </div>
  );
}
