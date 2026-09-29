import { withFileAccessTokenIfNeeded } from '@/lib/api';
import { communityBannerFileUrl } from '@/lib/communityPostBanner';

export type CommunityPostPreviewSource = {
  content?: string | null;
  photo_url?: string | null;
  banner_focal_x?: number | null;
  banner_focal_y?: number | null;
  is_unread?: boolean;
  priority?: string | null;
  tags?: string[] | null;
  attachments?: Array<{
    file_id?: string | null;
    url?: string | null;
    original_name?: string | null;
  }> | null;
};

export type CommunityPostPreviewImage = {
  url: string;
  /** True when preview comes from the official post banner (supports focal point). */
  fromBanner: boolean;
};

const IMAGE_PATH_RE = /\.(png|jpe?g|webp|gif|bmp|heic)$/i;

export function looksLikeCommunityImagePath(nameOrUrl?: string | null): boolean {
  if (!nameOrUrl) return false;
  const path = nameOrUrl.split('?')[0].toLowerCase();
  return IMAGE_PATH_RE.test(path);
}

export function firstImageSrcFromHtml(html?: string | null): string | null {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1]?.trim() || null;
}

function resolvePreviewUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // file id only
  if (/^[0-9a-f-]{36}$/i.test(trimmed)) {
    return withFileAccessTokenIfNeeded(communityBannerFileUrl(trimmed));
  }
  return withFileAccessTokenIfNeeded(trimmed);
}

/**
 * Mobile-aligned preview: photo_url → first HTML img → first image attachment.
 */
export function resolveCommunityPostPreviewImage(
  post: CommunityPostPreviewSource,
): CommunityPostPreviewImage | null {
  if (post.photo_url) {
    const url = resolvePreviewUrl(post.photo_url);
    if (url) return { url, fromBanner: true };
  }

  const fromHtml = firstImageSrcFromHtml(post.content);
  if (fromHtml) {
    const url = resolvePreviewUrl(fromHtml);
    if (url) return { url, fromBanner: false };
  }

  const imageAtt = (post.attachments || []).find(
    (att) =>
      looksLikeCommunityImagePath(att.original_name) ||
      looksLikeCommunityImagePath(att.url) ||
      Boolean(att.file_id && !att.original_name),
  );
  if (imageAtt) {
    if (imageAtt.file_id) {
      const url = withFileAccessTokenIfNeeded(communityBannerFileUrl(imageAtt.file_id));
      if (url) return { url, fromBanner: false };
    }
    if (imageAtt.url) {
      const url = resolvePreviewUrl(imageAtt.url);
      if (url) return { url, fromBanner: false };
    }
  }

  return null;
}

export function isUrgentCommunityPost(post: CommunityPostPreviewSource): boolean {
  const pr = (post.priority || '').toLowerCase();
  return pr === 'urgent' || pr === 'critical' || Boolean(post.tags?.includes('Urgent'));
}

export function isCriticalCommunityPost(post: CommunityPostPreviewSource): boolean {
  return (post.priority || '').toLowerCase() === 'critical';
}

export type CommunityOrphanImageAttachment = {
  key: string;
  url: string;
  name?: string;
};

/**
 * Image attachments that are not already embedded in the post HTML
 * (so the modal/feed can render them in the body instead of only in the dock).
 */
export function communityOrphanImageAttachments(
  post: CommunityPostPreviewSource & {
    document_url?: string | null;
    document_file_id?: string | null;
    document_original_name?: string | null;
  },
): CommunityOrphanImageAttachment[] {
  const content = post.content || '';
  const rawAtts = [...(post.attachments || [])];
  if (
    (!rawAtts.length || !rawAtts.some((a) => a.file_id || a.url)) &&
    (post.document_file_id || post.document_url)
  ) {
    rawAtts.push({
      file_id: post.document_file_id,
      url: post.document_url,
      original_name: post.document_original_name,
    });
  }

  const out: CommunityOrphanImageAttachment[] = [];

  for (const att of rawAtts) {
    const isImage =
      looksLikeCommunityImagePath(att.original_name) ||
      looksLikeCommunityImagePath(att.url) ||
      Boolean(att.file_id && !att.original_name);
    if (!isImage) continue;

    const fileId = (att.file_id || '').trim();
    const rawUrl = (att.url || '').trim();
    if (fileId && content.includes(fileId)) continue;
    if (rawUrl) {
      const bare = rawUrl.split('?')[0];
      if (bare && content.includes(bare)) continue;
    }

    let url = '';
    if (fileId) url = withFileAccessTokenIfNeeded(communityBannerFileUrl(fileId));
    else if (rawUrl) url = resolvePreviewUrl(rawUrl);
    if (!url) continue;

    out.push({
      key: fileId || rawUrl,
      url,
      name: att.original_name || undefined,
    });
  }

  return out;
}

/** Gradient rail stops matching mobile CommunityScreen.postRail. */
export function communityPostRailColors(post: CommunityPostPreviewSource): readonly [string, string] {
  if (isUrgentCommunityPost(post)) return ['#B91C1C', '#F87171'];
  if (post.is_unread) return ['#C22033', '#F87171'];
  return ['#147D36', '#4ADE80'];
}
