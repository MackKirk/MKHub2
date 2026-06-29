/** Section images in Proposal/Quote: same aspect as PDF layout (26:15). */
import { withFileAccessToken } from '@/lib/api';

export const PROPOSAL_SECTION_IMAGE_TARGET_WIDTH = 1024;
export const PROPOSAL_SECTION_IMAGE_TARGET_HEIGHT = Math.round(
  (PROPOSAL_SECTION_IMAGE_TARGET_WIDTH * 15) / 26,
);
/** 2× logical target → ~2048×1182 px JPEG for sharp PDF + UI zoom. */
export const PROPOSAL_SECTION_IMAGE_EXPORT_SCALE = 2;
/** Hard cap on longest canvas side (matches typical “master” tier). */
export const PROPOSAL_SECTION_IMAGE_MAX_EXPORT_LONG_SIDE = 2048;

/** Uniform scale from crop pixels → PDF points (landscape width drives the ratio). */
export const PROPOSAL_SECTION_IMAGE_CROP_TO_PDF_SCALE =
  260 / PROPOSAL_SECTION_IMAGE_TARGET_WIDTH;

/** PDF landscape slot (pt / CSS px). */
export const PROPOSAL_SECTION_IMAGE_PDF_LANDSCAPE_WIDTH = Math.round(
  PROPOSAL_SECTION_IMAGE_TARGET_WIDTH * PROPOSAL_SECTION_IMAGE_CROP_TO_PDF_SCALE,
);
export const PROPOSAL_SECTION_IMAGE_PDF_LANDSCAPE_HEIGHT = Math.round(
  PROPOSAL_SECTION_IMAGE_TARGET_HEIGHT * PROPOSAL_SECTION_IMAGE_CROP_TO_PDF_SCALE,
);

/** Portrait crop — exact 15:26; PDF height derived with the same scale as landscape. */
const PORTRAIT_PDF_HEIGHT_TARGET = 235;
export const PROPOSAL_SECTION_IMAGE_PORTRAIT_TARGET_HEIGHT = Math.round(
  PORTRAIT_PDF_HEIGHT_TARGET / PROPOSAL_SECTION_IMAGE_CROP_TO_PDF_SCALE,
);
export const PROPOSAL_SECTION_IMAGE_PORTRAIT_TARGET_WIDTH = Math.round(
  (PROPOSAL_SECTION_IMAGE_PORTRAIT_TARGET_HEIGHT * 15) / 26,
);
export const PROPOSAL_SECTION_IMAGE_PDF_PORTRAIT_WIDTH = Math.round(
  PROPOSAL_SECTION_IMAGE_PORTRAIT_TARGET_WIDTH * PROPOSAL_SECTION_IMAGE_CROP_TO_PDF_SCALE,
);
export const PROPOSAL_SECTION_IMAGE_PDF_PORTRAIT_HEIGHT = Math.round(
  PROPOSAL_SECTION_IMAGE_PORTRAIT_TARGET_HEIGHT * PROPOSAL_SECTION_IMAGE_CROP_TO_PDF_SCALE,
);

/** Full-quality preview in lightbox (matches export cap). */
export const SECTION_IMAGE_LIGHTBOX_THUMB_W = 2048;

export type ProposalSectionImageOrientation = 'landscape' | 'portrait';

export function normalizeProposalSectionImageOrientation(
  value?: string | null,
): ProposalSectionImageOrientation {
  return value === 'portrait' ? 'portrait' : 'landscape';
}

export function getProposalSectionImageTargetDimensions(
  orientation?: ProposalSectionImageOrientation | string | null,
): { width: number; height: number } {
  if (normalizeProposalSectionImageOrientation(orientation) === 'portrait') {
    return {
      width: PROPOSAL_SECTION_IMAGE_PORTRAIT_TARGET_WIDTH,
      height: PROPOSAL_SECTION_IMAGE_PORTRAIT_TARGET_HEIGHT,
    };
  }
  return {
    width: PROPOSAL_SECTION_IMAGE_TARGET_WIDTH,
    height: PROPOSAL_SECTION_IMAGE_TARGET_HEIGHT,
  };
}

/** PDF / section grid slot size in CSS px — same proportions as the generated PDF. */
export function getProposalSectionImagePreviewSize(
  orientation?: ProposalSectionImageOrientation | string | null,
): { width: number; height: number } {
  if (normalizeProposalSectionImageOrientation(orientation) === 'portrait') {
    return {
      width: PROPOSAL_SECTION_IMAGE_PDF_PORTRAIT_WIDTH,
      height: PROPOSAL_SECTION_IMAGE_PDF_PORTRAIT_HEIGHT,
    };
  }
  return {
    width: PROPOSAL_SECTION_IMAGE_PDF_LANDSCAPE_WIDTH,
    height: PROPOSAL_SECTION_IMAGE_PDF_LANDSCAPE_HEIGHT,
  };
}

/** Inline file URL for the exact derived JPEG used in the PDF (not a re-cropped thumbnail). */
export function getProposalSectionImageFileUrl(fileObjectId: string): string {
  return withFileAccessToken(`/files/${fileObjectId}`);
}
