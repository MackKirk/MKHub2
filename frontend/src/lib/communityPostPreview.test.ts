import { describe, expect, it, vi } from 'vitest';
import {
  communityOrphanImageAttachments,
  communityPostRailColors,
  firstImageSrcFromHtml,
  isUrgentCommunityPost,
  resolveCommunityPostPreviewImage,
} from './communityPostPreview';

vi.mock('@/lib/api', () => ({
  withFileAccessTokenIfNeeded: (url: string) => url,
}));

vi.mock('@/lib/communityPostBanner', () => ({
  communityBannerFileUrl: (fileId: string) => `/api/files/${fileId}`,
}));

describe('communityPostPreview', () => {
  it('prefers photo_url over HTML and attachments', () => {
    const preview = resolveCommunityPostPreviewImage({
      photo_url: 'https://cdn.example/banner.jpg',
      content: '<p><img src="https://cdn.example/inline.png" /></p>',
      attachments: [{ url: 'https://cdn.example/att.webp', original_name: 'att.webp' }],
    });
    expect(preview).toEqual({ url: 'https://cdn.example/banner.jpg', fromBanner: true });
  });

  it('falls back to first HTML img then image attachment', () => {
    expect(
      resolveCommunityPostPreviewImage({
        content: '<p>Hi <img src="https://cdn.example/from-html.jpg" alt=""></p>',
      }),
    ).toEqual({ url: 'https://cdn.example/from-html.jpg', fromBanner: false });

    expect(
      resolveCommunityPostPreviewImage({
        content: '<p>No image</p>',
        attachments: [{ file_id: '11111111-1111-1111-1111-111111111111', original_name: 'shot.png' }],
      }),
    ).toEqual({ url: '/api/files/11111111-1111-1111-1111-111111111111', fromBanner: false });
  });

  it('returns null for text-only posts', () => {
    expect(resolveCommunityPostPreviewImage({ content: '<p>Hello</p>', attachments: [] })).toBeNull();
  });

  it('parses first img src from HTML', () => {
    expect(firstImageSrcFromHtml('<div><img src="/a.png"><img src="/b.png"></div>')).toBe('/a.png');
    expect(firstImageSrcFromHtml('<p>none</p>')).toBeNull();
  });

  it('detects urgent posts and rail colors', () => {
    expect(isUrgentCommunityPost({ priority: 'urgent' })).toBe(true);
    expect(isUrgentCommunityPost({ tags: ['Urgent'] })).toBe(true);
    expect(isUrgentCommunityPost({ priority: 'normal' })).toBe(false);

    expect(communityPostRailColors({ priority: 'urgent' })).toEqual(['#B91C1C', '#F87171']);
    expect(communityPostRailColors({ is_unread: true })).toEqual(['#C22033', '#F87171']);
    expect(communityPostRailColors({ is_unread: false })).toEqual(['#147D36', '#4ADE80']);
  });

  it('lists image attachments not already in HTML', () => {
    expect(
      communityOrphanImageAttachments({
        content: '<p>Hi</p>',
        attachments: [{ file_id: '11111111-1111-1111-1111-111111111111', original_name: 'shot.png' }],
      }),
    ).toEqual([
      {
        key: '11111111-1111-1111-1111-111111111111',
        url: '/api/files/11111111-1111-1111-1111-111111111111',
        name: 'shot.png',
      },
    ]);

    expect(
      communityOrphanImageAttachments({
        content: '<p><img src="/files/11111111-1111-1111-1111-111111111111/thumbnail"></p>',
        attachments: [{ file_id: '11111111-1111-1111-1111-111111111111', original_name: 'shot.png' }],
      }),
    ).toEqual([]);
  });
});
