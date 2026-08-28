/** Wide cover shown at the top of a community post (width : height). */
export const COMMUNITY_POST_BANNER_ASPECT_RATIO = 10 / 3;
export const COMMUNITY_POST_BANNER_ASPECT_CSS = '10 / 3';
export const COMMUNITY_POST_BANNER_WIDTH_PX = 1200;
export const COMMUNITY_POST_BANNER_HEIGHT_PX = 360;
export const COMMUNITY_POST_BANNER_MAX_BYTES = 8 * 1024 * 1024;
export const COMMUNITY_POST_BANNER_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

export function clampBannerFocal(value: unknown, fallback = 50): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

export function communityBannerObjectPosition(focalX?: number | null, focalY?: number | null): string {
  return `${clampBannerFocal(focalX)}% ${clampBannerFocal(focalY)}%`;
}

export function communityBannerFileUrl(fileId: string): string {
  return `/files/${fileId}/thumbnail?w=1600`;
}

export function isCommunityBannerImageFile(file: File): boolean {
  if (file.size > COMMUNITY_POST_BANNER_MAX_BYTES) return false;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('image/') && type !== 'image/svg+xml') return true;
  return /\.(png|jpe?g|webp|gif)$/i.test(name);
}
