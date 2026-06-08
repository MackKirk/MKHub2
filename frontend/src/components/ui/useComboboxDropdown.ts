import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

export type ComboboxDropdownOptions = {
  /** When set, clamps horizontal position so a fixed-width menu stays inside the viewport. */
  menuWidth?: number;
  /** `start` — menu left aligns with anchor left; `end` — menu right aligns with anchor right. */
  menuAlign?: 'start' | 'end';
  /** Clicks on these targets do not close the dropdown (e.g. nested portaled AppSelect menus). */
  shouldIgnoreClose?: (target: Node) => boolean;
};

const VIEWPORT_EDGE_MARGIN = 8;

export function useComboboxDropdown(
  open: boolean,
  setOpen: (open: boolean) => void,
  options?: ComboboxDropdownOptions,
) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const portalListId = useId();
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const closeDropdown = useCallback(() => setOpen(false), [setOpen]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuRect(null);
      return;
    }
    const el = anchorRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      let left = r.left;
      const menuWidth = options?.menuWidth;
      if (menuWidth != null) {
        left = options?.menuAlign === 'end' ? r.right - menuWidth : r.left;
        const maxLeft = window.innerWidth - menuWidth - VIEWPORT_EDGE_MARGIN;
        left = Math.max(VIEWPORT_EDGE_MARGIN, Math.min(left, maxLeft));
      }
      setMenuRect({ top: r.bottom + 4, left, width: r.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, options?.menuWidth, options?.menuAlign]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      const portal = document.getElementById(portalListId);
      if (portal?.contains(t)) return;
      if (options?.shouldIgnoreClose?.(t)) return;
      closeDropdown();
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [open, portalListId, closeDropdown, options?.shouldIgnoreClose]);

  return { anchorRef, portalListId, menuRect, closeDropdown };
}
