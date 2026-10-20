import { withFileAccessTokenIfNeeded } from '@/lib/api';
import type { TutorialMedia } from './types';

export type TutorialMediaItemDto = {
  id: string;
  file_id: string;
  url: string;
  content_type?: string | null;
  caption?: string | null;
  sort_order: number;
  frame_x?: number | null;
  frame_y?: number | null;
  frame_zoom?: number | null;
};

/** Group of slides for one section. Legacy responses may be a single file object. */
export type TutorialMediaSlotOverride = {
  items?: TutorialMediaItemDto[];
  file_id?: string;
  content_type?: string | null;
  url?: string;
};

export type TutorialMediaSlotsResponse = {
  tutorial_id: string;
  slots: Record<string, TutorialMediaSlotOverride>;
};

export type ResolvedTutorialMedia = {
  id: string;
  src: string;
  alt: string;
  caption?: string | null;
  kind: 'image' | 'video';
  isOverride: boolean;
};

export function isVideoContentType(contentType?: string | null, src?: string): boolean {
  const ct = (contentType || '').toLowerCase();
  if (ct.startsWith('video/')) return true;
  const path = (src || '').split('?')[0].toLowerCase();
  return path.endsWith('.mp4') || path.endsWith('.webm') || path.endsWith('.mov');
}

function resolveDto(
  item: TutorialMediaItemDto,
  altFallback: string,
): ResolvedTutorialMedia {
  const rawUrl = item.url || `/files/${item.file_id}`;
  const src = withFileAccessTokenIfNeeded(rawUrl);
  return {
    id: item.id,
    src,
    alt: item.caption || altFallback,
    caption: item.caption,
    kind: isVideoContentType(item.content_type, src) ? 'video' : 'image',
    isOverride: true,
  };
}

export function slotItems(slot: TutorialMediaSlotOverride | undefined): TutorialMediaItemDto[] {
  if (!slot) return [];
  if (Array.isArray(slot.items)) return slot.items;
  if (slot.file_id || slot.url) {
    return [
      {
        id: slot.file_id || 'legacy',
        file_id: slot.file_id || '',
        url: slot.url || (slot.file_id ? `/files/${slot.file_id}` : ''),
        content_type: slot.content_type,
        caption: null,
        sort_order: 0,
      },
    ];
  }
  return [];
}

export function resolveTutorialMediaItems(
  sectionId: string,
  fallback: TutorialMedia | undefined,
  slots: Record<string, TutorialMediaSlotOverride> | undefined,
): ResolvedTutorialMedia[] {
  const items = slotItems(slots?.[sectionId]);
  if (items.length) {
    return items.map((item) => resolveDto(item, fallback?.alt || sectionId));
  }
  if (fallback?.src) {
    return [
      {
        id: 'static',
        src: fallback.src,
        alt: fallback.alt,
        caption: null,
        kind: 'image',
        isOverride: false,
      },
    ];
  }
  return [];
}

/** First slide, for callers that still expect a single frame. */
export function resolveTutorialSectionMedia(
  sectionId: string,
  fallback: TutorialMedia | undefined,
  slots: Record<string, TutorialMediaSlotOverride> | undefined,
): ResolvedTutorialMedia | null {
  return resolveTutorialMediaItems(sectionId, fallback, slots)[0] ?? null;
}

export function sectionHasUploadedMedia(
  sectionId: string,
  slots: Record<string, TutorialMediaSlotOverride> | undefined,
): boolean {
  return slotItems(slots?.[sectionId]).length > 0;
}
