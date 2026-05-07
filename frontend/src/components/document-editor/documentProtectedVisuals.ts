/**
 * Shared hatch + fill for margin bands and block "Blocked Area" zones (main canvas + page thumbnails).
 * Tune darkness in one place.
 */

/** Page edge margin overlays (off-limits bands) */
export const MARGIN_PROTECTED_BG =
  'repeating-linear-gradient(135deg, rgba(217,119,6,0.26) 0px, rgba(217,119,6,0.26) 5px, rgba(245,158,11,0.17) 5px, rgba(245,158,11,0.17) 10px)';

/** Block / locked placement zones */
export const BLOCK_PROTECTED_BG = [
  'linear-gradient(rgba(254,243,199,0.52), rgba(254,243,199,0.52))',
  'repeating-linear-gradient(-45deg, rgba(217,119,6,0.34) 0px, rgba(217,119,6,0.34) 4px, rgba(245,158,11,0.22) 4px, rgba(245,158,11,0.22) 8px)',
].join(', ');

export const marginBandRingClass = 'ring-1 ring-inset ring-amber-700/18';

/** Block outline (matches main canvas) */
export const blockProtectedBorderClass = 'border border-dashed border-amber-700/58';
