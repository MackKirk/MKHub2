export const FRAME_X_DEFAULT = 50;
export const FRAME_Y_DEFAULT = 0;
export const FRAME_ZOOM_DEFAULT = 1;
export const FRAME_ZOOM_MIN = 0.1;
export const FRAME_ZOOM_MAX = 3;
const WHEEL_ZOOM_STEP = 0.12;
export const FRAME_ASPECT = 16 / 9;

export type TutorialFrame = {
  frameX: number;
  frameY: number;
  frameZoom: number;
};

export const DEFAULT_TUTORIAL_FRAME: TutorialFrame = {
  frameX: FRAME_X_DEFAULT,
  frameY: FRAME_Y_DEFAULT,
  frameZoom: FRAME_ZOOM_DEFAULT,
};

/** Whole picture inside the 16:9 frame, centered. Zoom 1 stays the cover crop. */
export function fittedTutorialFrame(mediaAspect?: number): TutorialFrame {
  const ratio = mediaAspect ? coverToContainRatio(mediaAspect) : 1;
  return clampTutorialFrame({
    frameX: 50,
    frameY: 50,
    frameZoom: 1 / ratio,
  });
}

function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, value));
}

export function clampTutorialFrame(frame: TutorialFrame): TutorialFrame {
  const zoom = Number.isFinite(frame.frameZoom) ? frame.frameZoom : FRAME_ZOOM_DEFAULT;
  return {
    frameX: clampPercent(frame.frameX, FRAME_X_DEFAULT),
    frameY: clampPercent(frame.frameY, FRAME_Y_DEFAULT),
    frameZoom: Math.min(FRAME_ZOOM_MAX, Math.max(FRAME_ZOOM_MIN, zoom)),
  };
}

/** Dragging the image right moves the focal point left, in percent of the frame. */
export function frameAfterDrag(
  frame: TutorialFrame,
  deltaX: number,
  deltaY: number,
  frameWidth: number,
  frameHeight: number,
): TutorialFrame {
  const width = Math.max(1, frameWidth);
  const height = Math.max(1, frameHeight);
  return clampTutorialFrame({
    frameX: frame.frameX - (deltaX / width) * 100,
    frameY: frame.frameY - (deltaY / height) * 100,
    frameZoom: frame.frameZoom,
  });
}

/** Wheel zooms in 0.12 steps, including out past the cover crop. Zooming in pulls the focal point toward the pointer. */
export function frameAfterWheel(
  frame: TutorialFrame,
  deltaY: number,
  pointerXPercent: number,
  pointerYPercent: number,
): TutorialFrame {
  if (!Number.isFinite(deltaY) || deltaY === 0) return clampTutorialFrame(frame);
  const direction = deltaY < 0 ? 1 : -1;
  const nextZoom = clampTutorialFrame({
    ...frame,
    frameZoom: frame.frameZoom + direction * WHEEL_ZOOM_STEP,
  }).frameZoom;
  if (nextZoom === frame.frameZoom) return clampTutorialFrame(frame);
  const pull = direction > 0 ? 0.2 : 0;
  return clampTutorialFrame({
    frameX: frame.frameX + (pointerXPercent - frame.frameX) * pull,
    frameY: frame.frameY + (pointerYPercent - frame.frameY) * pull,
    frameZoom: nextZoom,
  });
}

/** How much larger object-cover is than object-contain, for this media in the 16:9 frame. */
export function coverToContainRatio(mediaAspect: number, frameAspect = FRAME_ASPECT): number {
  if (!Number.isFinite(mediaAspect) || mediaAspect <= 0) return 1;
  return mediaAspect >= frameAspect ? mediaAspect / frameAspect : frameAspect / mediaAspect;
}

/** Fraction of the media that object-cover shows at zoom 1. */
function coverWindowFractions(mediaAspect: number, frameAspect = FRAME_ASPECT): { w: number; h: number } {
  if (!Number.isFinite(mediaAspect) || mediaAspect <= 0) return { w: 1, h: 1 };
  if (mediaAspect >= frameAspect) return { w: frameAspect / mediaAspect, h: 1 };
  return { w: 1, h: mediaAspect / frameAspect };
}

function insetViewBox(frame: TutorialFrame, winW: number, winH: number): string {
  const left = frame.frameX - (frame.frameX / 100) * winW;
  const top = frame.frameY - (frame.frameY / 100) * winH;
  const right = 100 - left - winW;
  const bottom = 100 - top - winH;
  const n = (value: number) => Math.round(value * 1000) / 1000;
  return `inset(${n(top)}% ${n(right)}% ${n(bottom)}% ${n(left)}%)`;
}

/**
 * Crop the picture inside the video element box.
 * The element itself stays the size of the frame so the native control bar remains clickable.
 * A CSS transform on <video> stalls playback, and resizing the element pushes the bar out of view.
 * Zoom below 1 widens the view box (negative insets) so the picture shrinks and the rest of the clip appears.
 */
export function tutorialVideoPlaybackStyle(
  frame: TutorialFrame,
  mediaAspect?: number,
): {
  objectFit?: 'fill';
  objectPosition: string;
  objectViewBox?: string;
} {
  const next = clampTutorialFrame(frame);
  const position = `${next.frameX}% ${next.frameY}%`;
  const aspect = mediaAspect && mediaAspect > 0 ? mediaAspect : FRAME_ASPECT;
  const visible = coverWindowFractions(aspect);
  const winW = (visible.w / next.frameZoom) * 100;
  const winH = (visible.h / next.frameZoom) * 100;
  if (Math.abs(winW - 100) < 0.05 && Math.abs(winH - 100) < 0.05) {
    return { objectPosition: position };
  }
  return {
    objectFit: 'fill',
    objectPosition: position,
    objectViewBox: insetViewBox(next, winW, winH),
  };
}

/** Same crop as scale(), without a CSS transform. Transforms stall video playback in full screen. */
export function tutorialVideoFrameStyle(frame: TutorialFrame): {
  width: string;
  height: string;
  left: string;
  top: string;
  objectPosition: string;
} {
  const next = clampTutorialFrame(frame);
  const zoom = next.frameZoom;
  return {
    width: `${zoom * 100}%`,
    height: `${zoom * 100}%`,
    left: `${next.frameX * (1 - zoom)}%`,
    top: `${next.frameY * (1 - zoom)}%`,
    objectPosition: `${next.frameX}% ${next.frameY}%`,
  };
}

export function tutorialFrameStyle(
  frame: TutorialFrame,
  mediaAspect?: number,
): {
  objectFit: 'cover' | 'contain';
  objectPosition: string;
  transform: string;
  transformOrigin: string;
} {
  const next = clampTutorialFrame(frame);
  const position = `${next.frameX}% ${next.frameY}%`;
  const ratio = mediaAspect ? coverToContainRatio(mediaAspect) : 1;
  if (mediaAspect && ratio !== 1) {
    return {
      objectFit: 'contain',
      objectPosition: position,
      transform: `scale(${next.frameZoom * ratio})`,
      transformOrigin: position,
    };
  }
  return {
    objectFit: 'cover',
    objectPosition: position,
    transform: `scale(${next.frameZoom})`,
    transformOrigin: position,
  };
}
