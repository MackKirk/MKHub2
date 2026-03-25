/** Root node for modal overlays (see `index.html` #overlay-root). Keeps `position:fixed` backdrops covering the full viewport, including the app top bar. */
export function getOverlayRoot(): HTMLElement {
  const el = document.getElementById('overlay-root');
  if (!el) {
    const created = document.createElement('div');
    created.id = 'overlay-root';
    document.body.appendChild(created);
    return created;
  }
  return el;
}
