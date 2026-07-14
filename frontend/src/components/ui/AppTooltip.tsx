import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { uiTooltip, uiCx } from './tokens';

const TOOLTIP_GAP_PX = 4;
const VIEWPORT_PAD_PX = 8;

export type AppTooltipPlacement = 'top' | 'bottom';

export type AppTooltipProps = {
  /** Label shown on hover/focus (e.g. user name, division name). */
  content: ReactNode;
  children: ReactNode;
  placement?: AppTooltipPlacement;
  /** When true, tooltip is not shown. */
  disabled?: boolean;
  /** Wrap long copy instead of single-line `whitespace-nowrap` (disabled actions, hints). */
  wrap?: boolean;
  className?: string;
};

type TooltipCoords = {
  top: number;
  left: number;
  /** Distance from tooltip panel left edge to arrow center (px). */
  arrowLeft: number;
  resolvedPlacement: AppTooltipPlacement;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function computeTooltipCoords(
  anchor: DOMRect,
  placement: AppTooltipPlacement,
  tipWidth: number,
  tipHeight: number,
): TooltipCoords {
  const centerX = anchor.left + anchor.width / 2;
  const maxLeft = Math.max(VIEWPORT_PAD_PX, window.innerWidth - tipWidth - VIEWPORT_PAD_PX);
  const left = clamp(centerX - tipWidth / 2, VIEWPORT_PAD_PX, maxLeft);
  const arrowLeft = clamp(centerX - left, 8, Math.max(8, tipWidth - 8));

  const spaceBelow = window.innerHeight - anchor.bottom - VIEWPORT_PAD_PX;
  const spaceAbove = anchor.top - VIEWPORT_PAD_PX;
  let resolvedPlacement = placement;

  if (placement === 'bottom' && tipHeight + TOOLTIP_GAP_PX > spaceBelow && spaceAbove > spaceBelow) {
    resolvedPlacement = 'top';
  } else if (placement === 'top' && tipHeight + TOOLTIP_GAP_PX > spaceAbove && spaceBelow > spaceAbove) {
    resolvedPlacement = 'bottom';
  }

  const top =
    resolvedPlacement === 'bottom'
      ? anchor.bottom + TOOLTIP_GAP_PX
      : anchor.top - TOOLTIP_GAP_PX - tipHeight;

  return { top, left, arrowLeft, resolvedPlacement };
}

/**
 * Dark hover/focus tooltip (Opportunities estimator avatar pattern).
 * Renders in document.body so position:fixed uses viewport coordinates.
 * Horizontally clamps to the viewport so tips near edges (e.g. after the menu/sidebar change) are not cut off.
 */
export function AppTooltip({
  content,
  children,
  placement = 'top',
  disabled = false,
  wrap = false,
  className,
}: AppTooltipProps) {
  const tipId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<TooltipCoords | null>(null);

  const updateCoords = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const tip = tipRef.current;
    const tipWidth = tip?.offsetWidth || 0;
    const tipHeight = tip?.offsetHeight || 0;
    // First paint may have 0 size — still place roughly; layout effect remeasures.
    const w = tipWidth || 160;
    const h = tipHeight || 28;
    setCoords(computeTooltipCoords(el.getBoundingClientRect(), placement, w, h));
  }, [placement]);

  const show = () => {
    if (disabled || content == null || content === '') return;
    updateCoords();
    setOpen(true);
  };

  const hide = () => setOpen(false);

  useLayoutEffect(() => {
    if (!open) return;
    updateCoords();
  }, [open, content, wrap, updateCoords]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => updateCoords();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, updateCoords]);

  const shellStyle: CSSProperties | undefined = coords
    ? { top: coords.top, left: coords.left }
    : undefined;

  const arrowStyle: CSSProperties | undefined = coords
    ? { left: coords.arrowLeft }
    : undefined;

  const arrowClass =
    coords?.resolvedPlacement === 'bottom' ? uiTooltip.arrowBottom : uiTooltip.arrowTop;

  const tooltip =
    open &&
    typeof document !== 'undefined' &&
    createPortal(
      <span
        ref={tipRef}
        id={tipId}
        role="tooltip"
        className={uiTooltip.shell}
        style={shellStyle}
      >
        <span className={wrap ? uiTooltip.panelWrap : uiTooltip.panel}>
          {content}
          <span className={arrowClass} style={arrowStyle} aria-hidden />
        </span>
      </span>,
      document.body,
    );

  return (
    <>
      <span
        ref={anchorRef}
        className={uiCx('inline-flex', className)}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <span className="inline-flex" aria-describedby={open ? tipId : undefined}>
          {children}
        </span>
      </span>
      {tooltip}
    </>
  );
}
