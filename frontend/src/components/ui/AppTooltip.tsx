import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { uiTooltip, uiCx } from './tokens';

const TOOLTIP_GAP_PX = 4;

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
  transform: string;
  arrowClass: string;
};

function computeTooltipCoords(anchor: DOMRect, placement: AppTooltipPlacement): TooltipCoords {
  const centerX = anchor.left + anchor.width / 2;

  if (placement === 'bottom') {
    return {
      top: anchor.bottom + TOOLTIP_GAP_PX,
      left: centerX,
      transform: 'translateX(-50%)',
      arrowClass: uiTooltip.arrowBottom,
    };
  }

  return {
    top: anchor.top - TOOLTIP_GAP_PX,
    left: centerX,
    transform: 'translate(-50%, -100%)',
    arrowClass: uiTooltip.arrowTop,
  };
}

/**
 * Dark hover/focus tooltip (Opportunities estimator avatar pattern).
 * Renders in document.body so position:fixed uses viewport coordinates.
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
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<TooltipCoords | null>(null);

  const updateCoords = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    setCoords(computeTooltipCoords(el.getBoundingClientRect(), placement));
  }, [placement]);

  const show = () => {
    if (disabled || content == null || content === '') return;
    updateCoords();
    setOpen(true);
  };

  const hide = () => setOpen(false);

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
    ? { top: coords.top, left: coords.left, transform: coords.transform }
    : undefined;

  const tooltip =
    open &&
    coords &&
    typeof document !== 'undefined' &&
    createPortal(
      <span id={tipId} role="tooltip" className={uiTooltip.shell} style={shellStyle}>
        <span className={wrap ? uiTooltip.panelWrap : uiTooltip.panel}>
          {content}
          <span className={coords.arrowClass} aria-hidden />
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
