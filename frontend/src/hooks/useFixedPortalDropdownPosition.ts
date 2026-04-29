import { useLayoutEffect, useState, useCallback, type RefObject, type CSSProperties } from 'react';

export type FixedPortalDropdownOptions = {
  /** Gap between anchor bottom and panel top in px */
  marginTop?: number;
  paddingFromViewportBottom?: number;
  /** Upper bound for panel max-height in px */
  maxHeightPx?: number;
  /** Also cap height by this fraction of `window.innerHeight` (e.g. 0.7) */
  viewportMaxFraction?: number;
  /** Stacking above modals (e.g. z-50); default 100. */
  zIndex?: number;
};

/**
 * Positions a dropdown panel in `position:fixed` coordinates so it is not clipped by
 * scroll containers (e.g. main `overflow-y-auto` in AppShell). Use with `createPortal` to `document.body`.
 */
export function useFixedPortalDropdownPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  options?: FixedPortalDropdownOptions
): CSSProperties | null {
  const marginTop = options?.marginTop ?? 4;
  const paddingFromViewportBottom = options?.paddingFromViewportBottom ?? 8;
  const maxHeightPx = options?.maxHeightPx ?? 288;
  const viewportMaxFraction = options?.viewportMaxFraction;
  const zIndex = options?.zIndex ?? 100;

  const [style, setStyle] = useState<CSSProperties | null>(null);

  const update = useCallback(() => {
    const el = anchorRef.current;
    if (!el) {
      setStyle(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const top = r.bottom + marginTop;
    const spaceBelow = window.innerHeight - top - paddingFromViewportBottom;
    let ceiling = maxHeightPx;
    if (viewportMaxFraction != null) {
      ceiling = Math.min(ceiling, window.innerHeight * viewportMaxFraction);
    }
    const maxHeight = Math.min(ceiling, Math.max(120, spaceBelow));
    setStyle({
      position: 'fixed',
      zIndex,
      top,
      left: r.left,
      width: r.width,
      maxHeight,
    });
  }, [anchorRef, marginTop, paddingFromViewportBottom, maxHeightPx, viewportMaxFraction, zIndex]);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    update();
    const el = anchorRef.current;
    const ro = el ? new ResizeObserver(() => update()) : null;
    if (el) ro!.observe(el);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, update, anchorRef]);

  return open ? style : null;
}
