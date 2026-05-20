import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getOverlayRoot } from '@/lib/overlayRoot';

export type AppFieldHintProps = {
  hint: ReactNode;
  /** Extra classes on the trigger (e.g. `ml-0.5`). */
  className?: string;
};

/** Accepts real newlines and literal `\\n` from strings / JSON. */
export function normalizeHintText(text: string) {
  return text.replace(/\\n/g, '\n').trim();
}

/** Double newline → title + body; single newlines → soft line breaks. */
function HintRichText({ text }: { text: string }) {
  const normalized = normalizeHintText(text);
  const blocks = normalized.split(/\n\n+/);
  if (blocks.length >= 2) {
    return (
      <>
        <span className="font-semibold text-slate-900">{blocks[0]}</span>
        <span className="mt-1.5 block whitespace-pre-line text-slate-600">{blocks.slice(1).join('\n\n')}</span>
      </>
    );
  }
  return <span className="whitespace-pre-line text-slate-700">{normalized}</span>;
}

const TOOLTIP_MAX_WIDTH = 288;
const TOOLTIP_GAP = 6;
const VIEWPORT_PAD = 12;

function computeTooltipPosition(anchor: DOMRect) {
  const top = anchor.bottom + TOOLTIP_GAP;
  let left = anchor.left;

  const maxLeft = window.innerWidth - VIEWPORT_PAD - TOOLTIP_MAX_WIDTH;
  if (left > maxLeft) left = maxLeft;
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;

  return { top, left };
}

/**
 * Small contextual help: subtle red dot with “?” and a hover/focus tooltip (not `title`).
 * Tooltip renders in the overlay portal so it is not clipped by modal overflow.
 */
export function AppFieldHint({ hint, className }: AppFieldHintProps) {
  const tipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const ariaLabel =
    typeof hint === 'string' ? normalizeHintText(hint).replace(/\n+/g, ' ') : 'Help';

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    setCoords(computeTooltipPosition(el.getBoundingClientRect()));
  }, []);

  const show = () => {
    updatePosition();
    setVisible(true);
  };

  const hide = () => setVisible(false);

  useEffect(() => {
    if (!visible) return;
    const onMove = () => updatePosition();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [visible, updatePosition]);

  const tooltip =
    visible &&
    createPortal(
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none fixed z-[120] rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-left shadow-xl ring-1 ring-slate-900/5"
        style={{ top: coords.top, left: coords.left, width: 'max-content', maxWidth: TOOLTIP_MAX_WIDTH }}
      >
        <span className="field-hint-content block text-[11px] leading-snug text-slate-700 [&_strong]:font-semibold [&_strong]:text-slate-900 [&_p+p]:mt-1.5 [&_br]:block">
          {typeof hint === 'string' ? <HintRichText text={hint} /> : hint}
        </span>
      </span>,
      getOverlayRoot(),
    );

  return (
    <>
      <span className="relative inline-flex shrink-0 align-middle">
        <button
          ref={triggerRef}
          type="button"
          className={
            [
              'inline-flex h-2 w-2 cursor-help items-center justify-center rounded-full p-0',
              'bg-red-100 text-[6px] font-bold leading-[1] text-red-700',
              'shadow-sm ring-1 ring-red-200/90 transition',
              'hover:bg-red-200/70 hover:text-red-800',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 focus-visible:ring-offset-1',
              className,
            ]
              .filter(Boolean)
              .join(' ')
          }
          aria-describedby={visible ? tipId : undefined}
          aria-label={ariaLabel}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={hide}
        >
          <span aria-hidden className="block leading-none">
            ?
          </span>
        </button>
      </span>
      {tooltip}
    </>
  );
}
