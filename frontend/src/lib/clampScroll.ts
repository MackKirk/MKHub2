/** Walk ancestors and clamp scrollTop when content shrinks (avoids "stuck" empty scroll). */
export function clampOverflowScrollAncestors(startEl: HTMLElement | null) {
  let el: HTMLElement | null = startEl;
  while (el) {
    const { overflowY } = window.getComputedStyle(el);
    if (
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      el.scrollHeight > el.clientHeight
    ) {
      const max = el.scrollHeight - el.clientHeight;
      if (el.scrollTop > max) el.scrollTop = Math.max(0, max);
    }
    el = el.parentElement;
  }
}

export function findScrollableAncestor(startEl: HTMLElement | null): HTMLElement | null {
  let el: HTMLElement | null = startEl?.parentElement ?? null;
  while (el) {
    const { overflowY } = window.getComputedStyle(el);
    if (
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      el.scrollHeight > el.clientHeight
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}
