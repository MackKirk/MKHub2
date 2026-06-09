import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

export type ComboboxMenuRect = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

export type ComboboxDropdownOptions = {
  /** When set, clamps horizontal position so a fixed-width menu stays inside the viewport. */
  menuWidth?: number;
  /** `start` — menu left aligns with anchor left; `end` — menu right aligns with anchor right. */
  menuAlign?: 'start' | 'end';
  /** Clicks on these targets do not close the dropdown (e.g. nested portaled AppSelect menus). */
  shouldIgnoreClose?: (target: Node) => boolean;
  /** Default max menu height before scrolling (matches tailwind max-h-56). */
  preferredMaxHeight?: number;
};

const VIEWPORT_EDGE_MARGIN = 8;
const DROPDOWN_GAP = 4;
const DEFAULT_MENU_MAX_HEIGHT = 224;

export function comboboxMenuStyle(rect: ComboboxMenuRect | null): CSSProperties | undefined {
  if (!rect) return undefined;
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    maxHeight: rect.maxHeight,
  };
}

function computeMenuRect(
  anchorRect: DOMRect,
  options?: ComboboxDropdownOptions,
): ComboboxMenuRect {
  let left = anchorRect.left;
  const menuWidth = options?.menuWidth;
  const width = menuWidth ?? anchorRect.width;

  if (menuWidth != null) {
    left = options?.menuAlign === 'end' ? anchorRect.right - menuWidth : anchorRect.left;
    const maxLeft = window.innerWidth - menuWidth - VIEWPORT_EDGE_MARGIN;
    left = Math.max(VIEWPORT_EDGE_MARGIN, Math.min(left, maxLeft));
  }

  const preferredMaxHeight = options?.preferredMaxHeight ?? DEFAULT_MENU_MAX_HEIGHT;
  const spaceBelow = window.innerHeight - anchorRect.bottom - DROPDOWN_GAP - VIEWPORT_EDGE_MARGIN;
  const spaceAbove = anchorRect.top - DROPDOWN_GAP - VIEWPORT_EDGE_MARGIN;
  const maxDown = Math.min(preferredMaxHeight, Math.max(0, spaceBelow));
  const maxUp = Math.min(preferredMaxHeight, Math.max(0, spaceAbove));

  const openDown = maxDown >= maxUp && maxDown > 0;

  if (openDown) {
    return {
      top: anchorRect.bottom + DROPDOWN_GAP,
      left,
      width,
      maxHeight: maxDown,
    };
  }

  if (maxUp > 0) {
    return {
      top: anchorRect.top - DROPDOWN_GAP - maxUp,
      left,
      width,
      maxHeight: maxUp,
    };
  }

  return {
    top: anchorRect.bottom + DROPDOWN_GAP,
    left,
    width,
    maxHeight: preferredMaxHeight,
  };
}

export function useComboboxDropdown(
  open: boolean,
  setOpen: (open: boolean) => void,
  options?: ComboboxDropdownOptions,
) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const portalListId = useId();
  const [menuRect, setMenuRect] = useState<ComboboxMenuRect | null>(null);

  const closeDropdown = useCallback(() => setOpen(false), [setOpen]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuRect(null);
      return;
    }
    const el = anchorRef.current;
    if (!el) return;
    const update = () => {
      setMenuRect(computeMenuRect(el.getBoundingClientRect(), options));
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, options?.menuWidth, options?.menuAlign, options?.preferredMaxHeight]);

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
