import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

export function useComboboxDropdown(open: boolean, setOpen: (open: boolean) => void) {
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
      setMenuRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      const portal = document.getElementById(portalListId);
      if (portal?.contains(t)) return;
      closeDropdown();
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [open, portalListId, closeDropdown]);

  return { anchorRef, portalListId, menuRect, closeDropdown };
}
