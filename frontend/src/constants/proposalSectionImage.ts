/** Section images in Proposal/Quote: same aspect as PDF layout (26:15). */
export const PROPOSAL_SECTION_IMAGE_TARGET_WIDTH = 1024;
export const PROPOSAL_SECTION_IMAGE_TARGET_HEIGHT = Math.round(
  (PROPOSAL_SECTION_IMAGE_TARGET_WIDTH * 15) / 26
);
/** 2× logical target → ~2048×1182 px JPEG for sharp PDF + UI zoom. */
export const PROPOSAL_SECTION_IMAGE_EXPORT_SCALE = 2;
/** Hard cap on longest canvas side (matches typical “master” tier). */
export const PROPOSAL_SECTION_IMAGE_MAX_EXPORT_LONG_SIDE = 2048;

/** Grid preview: small thumbnail request for fast list loading (~2× CSS width). */
export const SECTION_IMAGE_GRID_THUMB_W = 400;
/** Full-quality preview in lightbox (matches export cap). */
export const SECTION_IMAGE_LIGHTBOX_THUMB_W = 2048;
