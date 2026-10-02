import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Paperclip } from 'lucide-react';
import { CommunityPostBanner } from '@/components/community/CommunityPostBanner';
import { CommunityPostBody } from '@/components/community/CommunityPostBody';
import { withFileAccessTokenIfNeeded } from '@/lib/api';
import {
  communityOrphanImageAttachments,
  communityPostRailColors,
  isCriticalCommunityPost,
  isUrgentCommunityPost,
} from '@/lib/communityPostPreview';
import { uiCx } from '@/components/ui';

export const COMMUNITY_FEED_AREA_LABELS: Record<string, string> = {
  general: 'General',
  projects: 'Projects',
  opportunities: 'Opportunities',
  repairs_maintenance: 'Repairs & Maintenance',
  safety: 'Safety',
  fleet: 'Fleet',
  hr: 'HR',
  payroll: 'Payroll',
  training: 'Training',
};

export type CommunityFeedPostSnippetPost = {
  id?: string;
  author_id?: string;
  author_name?: string;
  author_avatar?: string;
  created_at: string;
  title: string;
  content: string;
  related_area?: string;
  priority?: string;
  requires_read_confirmation?: boolean;
  tags?: string[];
  attachments?: { file_id?: string; url?: string; original_name?: string }[];
  photo_url?: string;
  banner_focal_x?: number;
  banner_focal_y?: number;
  document_url?: string;
  document_file_id?: string;
  is_unread?: boolean;
  user_has_confirmed?: boolean;
  user_has_liked?: boolean;
  likes_count?: number;
  comments_count?: number;
};

const SEE_MORE_PLAIN_CHARS = 320;

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

function plainTextLength(html: string | undefined): number {
  if (!html) return 0;
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

function contentHasEmbeddedMedia(html: string | undefined): boolean {
  if (!html) return false;
  return /<(img|video|iframe|embed|object|picture)\b/i.test(html);
}

function hasPostAttachment(post: CommunityFeedPostSnippetPost): boolean {
  return Boolean(
    post.document_url ||
      (Array.isArray(post.attachments) && post.attachments.length > 0) ||
      post.tags?.some((tag) => tag === 'Image' || tag === 'Document') ||
      contentHasEmbeddedMedia(post.content),
  );
}

type Props = {
  post: CommunityFeedPostSnippetPost;
  /** Overview feed: inline expand instead of opening a detail modal. */
  feedMode: boolean;
  /** Kept for callers; unused by the current layout. */
  featured?: boolean;
  /** Force the body open (e.g. jumped from announcements inbox). */
  forceExpanded?: boolean;
  interactive?: boolean;
  /** Used when not in feedMode (e.g. open detail modal). */
  onCardClick?: (e: React.MouseEvent) => void;
  /** Fired when the feed body expands/collapses (e.g. mark viewed). */
  onExpandChange?: (expanded: boolean) => void;
  onAuthorButtonClick?: (e: React.MouseEvent) => void;
  onLikeClick?: (e: React.MouseEvent) => void;
  onCommentClick?: (e: React.MouseEvent) => void;
  onOpenClick?: (e: React.MouseEvent) => void;
};

export function CommunityFeedPostSnippet({
  post,
  feedMode,
  forceExpanded = false,
  interactive = true,
  onCardClick,
  onExpandChange,
  onAuthorButtonClick,
  onLikeClick,
  onCommentClick,
  onOpenClick,
}: Props) {
  const [bodyExpanded, setBodyExpanded] = useState(false);
  useEffect(() => {
    if (forceExpanded) setBodyExpanded(true);
  }, [forceExpanded, post.id]);
  const isUrgent = isUrgentCommunityPost(post);
  const isCritical = isCriticalCommunityPost(post);
  const isRequired = post.requires_read_confirmation || post.tags?.includes('Required') || false;
  const isUnread = Boolean(post.is_unread);
  const [railFrom, railTo] = communityPostRailColors(post);
  const orphanImages = useMemo(() => communityOrphanImageAttachments(post), [post]);
  const attachmentCount = Array.isArray(post.attachments) ? post.attachments.length : 0;
  const hasAttachment = hasPostAttachment(post);
  const hasCover = Boolean(post.photo_url);
  const hasInlineMedia = contentHasEmbeddedMedia(post.content);
  const textLen = plainTextLength(post.content);
  const needsSeeMore =
    feedMode &&
    (textLen > SEE_MORE_PLAIN_CHARS || hasInlineMedia || orphanImages.length > 0);
  const showFullBody = !feedMode || bodyExpanded || !needsSeeMore;

  const toggleBodyExpanded = () => {
    setBodyExpanded((prev) => {
      const next = !prev;
      onExpandChange?.(next);
      return next;
    });
  };

  const handleArticleClick = (e: React.MouseEvent) => {
    if (!interactive) return;
    if (feedMode) {
      if (needsSeeMore) toggleBodyExpanded();
      return;
    }
    onCardClick?.(e);
  };

  const cardIsClickable = interactive && (feedMode ? needsSeeMore : Boolean(onCardClick));
  const outerInteractive = cardIsClickable
    ? 'cursor-pointer hover:shadow-md transition-shadow duration-200'
    : 'cursor-default';

  return (
    <article
      data-community-post-id={post.id || undefined}
      className={uiCx(
        'group flex overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm',
        forceExpanded && 'ring-2 ring-emerald-600/25',
        outerInteractive,
      )}
      onClick={handleArticleClick}
    >
      <div
        className="w-1.5 shrink-0 self-stretch"
        style={{ background: `linear-gradient(180deg, ${railFrom} 0%, ${railTo} 100%)` }}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        {hasCover ? (
          <CommunityPostBanner
            src={post.photo_url!}
            focalX={post.banner_focal_x}
            focalY={post.banner_focal_y}
          />
        ) : null}

        {/* Modal-aligned header: avatar + title + meta */}
        <div className="flex items-start gap-3 px-4 pt-3.5">
          <button
            type="button"
            className={uiCx(
              'flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-600',
              'ring-offset-2 hover:ring-2 hover:ring-emerald-600/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40',
              !interactive && 'pointer-events-none',
            )}
            onClick={(e) => {
              e.stopPropagation();
              onAuthorButtonClick?.(e);
            }}
            aria-label={`View profile: ${post.author_name || 'Author'}`}
          >
            {post.author_avatar ? (
              <img
                src={withFileAccessTokenIfNeeded(post.author_avatar)}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-sm font-semibold">{(post.author_name || 'U')[0].toUpperCase()}</span>
            )}
          </button>

          <div className="min-w-0 flex-1">
            <h4 className="line-clamp-2 text-base font-semibold leading-snug text-slate-950">{post.title}</h4>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
              <button
                type="button"
                className={uiCx(
                  'font-semibold text-slate-700 hover:text-emerald-800 hover:underline',
                  !interactive && 'pointer-events-none',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onAuthorButtonClick?.(e);
                }}
              >
                {post.author_name || 'Unknown'}
              </button>
              <span>{formatTimeAgo(post.created_at)}</span>
              {post.related_area ? (
                <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-semibold text-slate-600">
                  {COMMUNITY_FEED_AREA_LABELS[post.related_area] || post.related_area}
                </span>
              ) : null}
              {isUnread ? (
                <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-red-700">
                  New
                </span>
              ) : null}
              {isUrgent ? (
                <span
                  className={uiCx(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-bold tracking-wide',
                    isCritical ? 'bg-red-100 text-red-800' : 'bg-amber-50 text-amber-800',
                  )}
                >
                  {isCritical ? 'Critical' : 'Urgent'}
                </span>
              ) : null}
              {isRequired ? (
                <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-800">
                  Required
                </span>
              ) : null}
              {hasAttachment ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
                  <Paperclip className="h-3 w-3" />
                  {attachmentCount > 1 ? `${attachmentCount}` : '1'}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="px-4 pb-3.5 pt-3">
          <div
            className={uiCx(
              'max-w-full overflow-hidden text-sm leading-relaxed text-slate-800',
              !showFullBody && 'line-clamp-5',
            )}
          >
            <CommunityPostBody html={post.content} stripMedia={!showFullBody} />
          </div>

          {showFullBody && orphanImages.length > 0 ? (
            <div className="mt-3 space-y-2.5">
              {orphanImages.map((img) => (
                <figure key={img.key} className="overflow-hidden rounded-lg bg-slate-50">
                  <img
                    src={img.url}
                    alt={img.name || ''}
                    className="mx-auto h-auto max-h-[min(60vh,480px)] w-full object-contain"
                  />
                </figure>
              ))}
            </div>
          ) : null}

          {/* Collapsed: still surface the first image attachment so the feed isn't blank */}
          {!showFullBody && !hasCover && orphanImages[0] ? (
            <figure className="mt-3 overflow-hidden rounded-lg bg-slate-50">
              <img
                src={orphanImages[0].url}
                alt={orphanImages[0].name || ''}
                className="mx-auto h-auto max-h-56 w-full object-contain"
              />
            </figure>
          ) : null}

          {needsSeeMore ? (
            <button
              type="button"
              className="mt-1.5 text-sm font-semibold text-emerald-800 hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                toggleBodyExpanded();
              }}
            >
              {bodyExpanded ? 'See less' : 'See more'}
            </button>
          ) : null}

          {isRequired ? (
            <div
              className={uiCx(
                'mt-2.5 flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold',
                post.user_has_confirmed
                  ? 'border-emerald-200 text-emerald-800'
                  : 'border-red-200 text-red-800',
              )}
              style={{
                backgroundColor: post.user_has_confirmed ? '#ECFDF5' : '#FEF2F2',
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              {post.user_has_confirmed ? 'Read confirmed' : 'Confirmation required'}
            </div>
          ) : null}

          <div
            className={uiCx(
              'mt-3 flex items-center gap-1 border-t border-gray-100 pt-2.5 text-sm',
              !interactive && 'pointer-events-none',
            )}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLikeClick?.(e);
              }}
              className={uiCx(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 transition-all hover:bg-gray-50 active:opacity-60',
                post.user_has_liked ? 'text-red-600' : 'text-gray-600',
              )}
            >
              {post.user_has_liked ? (
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24" aria-hidden>
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
              )}
              <span className="font-semibold">{post.likes_count ?? 0}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCommentClick?.(e);
              }}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-gray-600 transition-all hover:bg-gray-50 active:opacity-60"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 10h8m-8 4h5m8 5l-3.5-3.5A9 9 0 1112 3a9 9 0 019 9 8.97 8.97 0 01-1.5 5z"
                />
              </svg>
              <span className="font-semibold">{post.comments_count ?? 0}</span>
            </button>
            {feedMode && !interactive ? (
              <span className="ml-auto px-2 text-sm font-semibold text-gray-600">Preview</span>
            ) : null}
            {!feedMode ? (
              <span className="ml-auto px-2 text-sm font-semibold text-gray-600">Click to view full post</span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
