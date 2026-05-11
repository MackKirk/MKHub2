/** Shared SVG icons for document editor ribbon and selection strip (24px base in ribbon via className). */

export function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

export function TextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h14" />
    </svg>
  );
}

export function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
    </svg>
  );
}

export function ImageAreaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeDasharray="2 2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
    </svg>
  );
}

export function ExportPdfIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

export function UndoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  );
}

export function RedoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
    </svg>
  );
}

export function PageLayoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v4H4V5zm0 7h10v8H4v-8zm12 0h4v8h-4v-8z" />
    </svg>
  );
}

export function ZoomIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
    </svg>
  );
}

/** Collapse side panel (narrow strip). */
export function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

/** Expand side panel (narrow strip). */
export function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

/** Tiny stacked sheets — collapsed Pages rail hint. */
export function MiniPagesStackGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 22 28" fill="none" aria-hidden>
      <rect x="1.5" y="2" width="15" height="19" rx="1.5" fill="white" stroke="currentColor" strokeWidth="1.15" />
      <rect x="4" y="5.5" width="15" height="19" rx="1.5" fill="white" stroke="currentColor" strokeWidth="1.15" opacity="0.88" />
      <rect x="6.5" y="9" width="15" height="19" rx="1.5" fill="white" stroke="currentColor" strokeWidth="1.15" opacity="0.76" />
    </svg>
  );
}

/** Stacked planes — collapsed Layers rail hint. */
export function MiniLayersStackGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 22 26" fill="none" aria-hidden>
      <path d="M3 17 L11 20.5 L19 17" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      <path d="M3 12.5 L11 16 L19 12.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" opacity="0.72" />
      <path
        d="M3 8 L11 11.5 L19 8 L11 4.5 Z"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BlockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" />
    </svg>
  );
}

/** Compact 16×16 filled bars — scales cleanly at 16px (w-4 h-4); avoids blurry 1.5px strokes at small sizes. */
export function AlignLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="3" y="4" width="11" height="2" />
      <rect x="3" y="8" width="7" height="2" />
      <rect x="3" y="12" width="9" height="2" />
    </svg>
  );
}

export function AlignCenterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="4" y="4" width="8" height="2" />
      <rect x="2" y="8" width="12" height="2" />
      <rect x="5" y="12" width="6" height="2" />
    </svg>
  );
}

export function AlignRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="5" y="4" width="8" height="2" />
      <rect x="3" y="8" width="11" height="2" />
      <rect x="7" y="12" width="7" height="2" />
    </svg>
  );
}

export function AlignTopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="3" y="3" width="11" height="2" />
      <rect x="3" y="7" width="11" height="2" />
      <rect x="3" y="11" width="7" height="2" />
    </svg>
  );
}

export function AlignMiddleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="3" y="5" width="7" height="2" />
      <rect x="3" y="8" width="11" height="2" />
      <rect x="3" y="11" width="7" height="2" />
    </svg>
  );
}

export function AlignBottomIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="3" y="3" width="7" height="2" />
      <rect x="3" y="7" width="11" height="2" />
      <rect x="3" y="11" width="11" height="2" />
    </svg>
  );
}

export const POSITION_ICON_COORDS: Record<string, { cx: number; cy: number }> = {
  '0% 0%': { cx: 2, cy: 2 },
  '50% 0%': { cx: 6, cy: 2 },
  '100% 0%': { cx: 10, cy: 2 },
  '0% 50%': { cx: 2, cy: 6 },
  '50% 50%': { cx: 6, cy: 6 },
  '100% 50%': { cx: 10, cy: 6 },
  '0% 100%': { cx: 2, cy: 10 },
  '50% 100%': { cx: 6, cy: 10 },
  '100% 100%': { cx: 10, cy: 10 },
};

export function PositionIcon({ value }: { value: string }) {
  const { cx, cy } = POSITION_ICON_COORDS[value] ?? { cx: 6, cy: 6 };
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" className="block shrink-0">
      <rect x="0.5" y="0.5" width="11" height="11" rx="1" />
      <circle cx={cx} cy={cy} r="1.2" fill="currentColor" />
    </svg>
  );
}

export function LockIcon({ locked, className }: { locked: boolean; className?: string }) {
  return locked ? (
    <svg className={className ?? 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  ) : (
    <svg className={className ?? 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
    </svg>
  );
}

export function PinIcon({ className }: { pinned?: boolean; className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

/** Layer stack: one step backward. */
export function LayerBackwardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
    </svg>
  );
}

/** Layer stack: one step forward. */
export function LayerForwardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
    </svg>
  );
}

/** Layer stack: send to back. */
export function LayerToBackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
    </svg>
  );
}

/** Layer stack: bring to front. */
export function LayerToFrontIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M6 5l7 7-7 7" />
    </svg>
  );
}
