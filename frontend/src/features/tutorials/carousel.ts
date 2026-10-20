export type CarouselAutoplayInput = {
  count: number;
  kind: 'image' | 'video';
  paused: boolean;
  hovered: boolean;
  focused: boolean;
  reducedMotion: boolean;
};

export function carouselShowsControls(count: number): boolean {
  return count >= 2;
}

/** Auto-advance only for multi-image slides the user is not interacting with. */
export function carouselShouldAutoplay(input: CarouselAutoplayInput): boolean {
  if (input.count < 2) return false;
  if (input.reducedMotion || input.paused || input.hovered || input.focused) return false;
  if (input.kind === 'video') return false;
  return true;
}

export const CAROUSEL_INTERVAL_MS = 4000;
export const CAROUSEL_MAX_ITEMS = 6;
