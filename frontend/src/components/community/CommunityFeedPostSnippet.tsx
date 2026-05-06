import { CommunityPostBody } from '@/components/community/CommunityPostBody';
import { withFileAccessTokenIfNeeded } from '@/lib/api';

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
  document_url?: string;
  document_file_id?: string;
  is_unread?: boolean;
  user_has_confirmed?: boolean;
  user_has_liked?: boolean;
  likes_count?: number;
  comments_count?: number;
};

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

function getTagColor(tag: string) {
  switch (tag) {
    case 'Announcement':
      return 'bg-red-50 text-red-700';
    case 'Urgent':
      return 'bg-red-50 text-red-700';
    case 'Required':
      return 'bg-red-50 text-red-700';
    case 'Image':
      return 'bg-green-50 text-green-700';
    case 'Document':
      return 'bg-green-50 text-green-700';
    case 'Groups':
      return 'bg-blue-50 text-blue-700';
    case 'Mack Kirk News':
      return 'bg-blue-50 text-blue-700';
    default:
      return 'bg-gray-50 text-gray-700';
  }
}

function getTagPriority(tag: string): number {
  switch (tag) {
    case 'Urgent':
      return 1;
    case 'Required':
      return 2;
    case 'Announcement':
      return 3;
    case 'Groups':
      return 4;
    case 'Image':
    case 'Document':
      return 5;
    default:
      return 99;
  }
}

function sortTagsByPriority(tags: string[]): string[] {
  if (!Array.isArray(tags)) return [];
  return [...tags].sort((a, b) => getTagPriority(a) - getTagPriority(b));
}

function contentHasEmbeddedMedia(html: string | undefined): boolean {
  if (!html) return false;
  return /<(img|video|iframe|embed|object|picture)\b/i.test(html);
}

function hasPostAttachment(post: CommunityFeedPostSnippetPost): boolean {
  return Boolean(
    post.photo_url ||
      post.document_url ||
      (Array.isArray(post.attachments) && post.attachments.length > 0) ||
      post.tags?.some((tag) => tag === 'Image' || tag === 'Document') ||
      contentHasEmbeddedMedia(post.content)
  );
}

type Props = {
  post: CommunityFeedPostSnippetPost;
  /** Overview feed uses `true` (line-clamp-2 + stripMedia on body). */
  feedMode: boolean;
  interactive?: boolean;
  onCardClick?: (e: React.MouseEvent) => void;
  onAuthorButtonClick?: (e: React.MouseEvent) => void;
  onLikeClick?: (e: React.MouseEvent) => void;
  onCommentClick?: (e: React.MouseEvent) => void;
  onOpenClick?: (e: React.MouseEvent) => void;
};

export function CommunityFeedPostSnippet({
  post,
  feedMode,
  interactive = true,
  onCardClick,
  onAuthorButtonClick,
  onLikeClick,
  onCommentClick,
  onOpenClick,
}: Props) {
  const pr = post.priority || '';
  const isUrgent = pr === 'urgent' || pr === 'critical' || post.tags?.includes('Urgent') || false;
  const isCritical = pr === 'critical';
  const isRequired = post.requires_read_confirmation || post.tags?.includes('Required') || false;
  const tagsWithoutMedia = sortTagsByPriority(post.tags || []).filter(
    (tag) =>
      tag !== 'Image' &&
      tag !== 'Document' &&
      tag.trim().toLowerCase() !== 'announcement'
  );
  const redundantTagKeys = new Set<string>();
  if (isCritical) {
    redundantTagKeys.add('critical');
    redundantTagKeys.add('urgent');
  } else if (isUrgent) {
    redundantTagKeys.add('urgent');
  }
  if (isRequired) {
    redundantTagKeys.add('required');
  }
  const filteredTagsForChips = tagsWithoutMedia.filter((tag) => !redundantTagKeys.has(tag.trim().toLowerCase()));
  const visibleTags = filteredTagsForChips.slice(0, 2);
  const hiddenTagCount = Math.max(0, filteredTagsForChips.length - visibleTags.length);
  const attachmentCount = Array.isArray(post.attachments) ? post.attachments.length : 0;
  const hasAttachment = hasPostAttachment(post);

  const outerInteractive =
    interactive && onCardClick
      ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200'
      : 'cursor-default';

  return (
    <div
      className={`group border rounded-xl border-l-[3px] px-3.5 py-3 overflow-hidden bg-white shadow-sm ${outerInteractive} ${
        isCritical
          ? 'border-gray-200 border-l-red-700'
          : isUrgent
            ? 'border-gray-200 border-l-red-500'
            : isRequired
              ? 'border-gray-200 border-l-amber-500'
              : 'border-gray-200 border-l-gray-200'
      }`}
      onClick={interactive ? onCardClick : undefined}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          className={`w-8 h-8 shrink-0 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden ring-offset-2 hover:ring-2 hover:ring-[#7f1010]/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7f1010]/45 ${!interactive ? 'pointer-events-none' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onAuthorButtonClick?.(e);
          }}
          aria-label={`View profile: ${post.author_name || 'Author'}`}
        >
          {post.author_avatar ? (
            <img src={withFileAccessTokenIfNeeded(post.author_avatar)} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-gray-500 text-sm">{(post.author_name || 'U')[0].toUpperCase()}</span>
          )}
        </button>

        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 mb-1">
            {post.is_unread && (
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" aria-label="Unread"></div>
            )}
            <button
              type="button"
              className={`font-semibold text-xs text-gray-700 hover:text-[#7f1010] hover:underline truncate ${!interactive ? 'pointer-events-none' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onAuthorButtonClick?.(e);
              }}
            >
              {post.author_name || 'Unknown'}
            </button>
            <span className="text-xs text-gray-400">· {formatTimeAgo(post.created_at)}</span>
            {post.related_area && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">
                {COMMUNITY_FEED_AREA_LABELS[post.related_area] || post.related_area}
              </span>
            )}
          </div>

          <h4 className="font-semibold text-sm text-gray-900 truncate tracking-tight mb-1">{post.title}</h4>

          {(visibleTags.length > 0 || isCritical || isUrgent || isRequired || hasAttachment || post.user_has_confirmed) && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(isCritical || isUrgent || isRequired) && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 tracking-wide ${
                    isCritical ? 'bg-red-100 text-red-800' : isUrgent ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {isCritical ? 'CRITICAL' : isUrgent ? 'URGENT' : 'REQUIRED'}
                </span>
              )}
              {hasAttachment && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
                  {attachmentCount > 1 ? `${attachmentCount} attachments` : 'Attachment'}
                </span>
              )}
              {post.user_has_confirmed && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-100">
                  Confirmed
                </span>
              )}
              {visibleTags.map((tag) => (
                <span key={tag} className={`px-1.5 py-0.5 rounded text-[10px] ${getTagColor(tag)}`}>
                  {tag}
                </span>
              ))}
              {hiddenTagCount > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-50 text-gray-500">+{hiddenTagCount}</span>
              )}
            </div>
          )}

          <div
            className={`text-xs mb-2 leading-relaxed max-w-full overflow-hidden ${
              feedMode ? 'line-clamp-2' : 'line-clamp-1'
            } text-gray-500`}
          >
            <CommunityPostBody html={post.content} stripMedia />
          </div>

          <div className={`flex items-center gap-2 text-xs ${!interactive ? 'pointer-events-none' : ''}`}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLikeClick?.(e);
              }}
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-gray-100 active:opacity-60 transition-all ${
                post.user_has_liked ? 'text-red-600' : 'text-gray-500'
              }`}
            >
              {post.user_has_liked ? (
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden>
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
              )}
              <span className="font-medium">{post.likes_count ?? 0}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCommentClick?.(e);
              }}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-gray-100 active:opacity-60 transition-all text-gray-500"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 10h8m-8 4h5m8 5l-3.5-3.5A9 9 0 1112 3a9 9 0 019 9 8.97 8.97 0 01-1.5 5z"
                />
              </svg>
              <span className="font-medium">{post.comments_count ?? 0}</span>
            </button>
            {feedMode && interactive && onOpenClick && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenClick(e);
                }}
                className="ml-auto px-2 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 active:bg-slate-100 rounded-lg transition-all duration-150 active:scale-[0.98]"
              >
                Open
              </button>
            )}
            {feedMode && !interactive && (
              <span className="ml-auto text-xs text-gray-400 font-medium">Preview</span>
            )}
            {!feedMode && (
              <span className="ml-auto text-xs text-gray-400 font-medium">Click to view full post</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
