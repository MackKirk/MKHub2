import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, Paperclip } from 'lucide-react';
import { api } from '@/lib/api';
import { AppEmptyState, uiCx, uiTypography } from '@/components/ui';
import { isUrgentCommunityPost } from '@/lib/communityPostPreview';

type CommunityPostRow = {
  id: string;
  title: string;
  content?: string;
  author_name?: string;
  created_at: string;
  is_unread?: boolean;
  priority?: string;
  tags?: string[];
  requires_read_confirmation?: boolean;
  attachments?: unknown[];
  document_url?: string;
  photo_url?: string;
};

function stripHtml(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatInboxDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: '2-digit' });
}

type Props = {
  activePostId?: string | null;
  onSelectPost: (postId: string) => void;
};

export function OverviewAnnouncementsInbox({ activePostId, onSelectPost }: Props) {
  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['community-posts', { filter: 'all' }],
    queryFn: async () => {
      const result = await api<unknown>('GET', '/community/posts?filter=all');
      if (Array.isArray(result)) return result as CommunityPostRow[];
      if (result && typeof result === 'object' && Array.isArray((result as { data?: unknown }).data)) {
        return (result as { data: CommunityPostRow[] }).data;
      }
      return [];
    },
  });

  const rows = useMemo(() => {
    return [...posts].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [posts]);

  if (isLoading) {
    return <p className={uiCx(uiTypography.helper, 'px-1 py-6 text-center')}>Loading announcements…</p>;
  }

  if (rows.length === 0) {
    return <AppEmptyState title="No announcements" className="py-8" />;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain -mx-1">
      <ul className="divide-y divide-gray-100" role="list">
        {rows.map((post) => {
          const unread = Boolean(post.is_unread);
          const urgent = isUrgentCommunityPost(post);
          const required = Boolean(post.requires_read_confirmation || post.tags?.includes('Required'));
          const preview = stripHtml(post.content);
          const hasAttachment =
            Boolean(post.document_url) ||
            Boolean(post.photo_url) ||
            (Array.isArray(post.attachments) && post.attachments.length > 0);
          const active = activePostId === post.id;

          return (
            <li key={post.id}>
              <button
                type="button"
                onClick={() => onSelectPost(post.id)}
                className={uiCx(
                  'flex w-full gap-2.5 px-2.5 py-2.5 text-left transition-colors',
                  active ? 'bg-emerald-50/80' : 'hover:bg-gray-50',
                  unread && 'bg-red-50/40',
                )}
              >
                <span
                  className={uiCx(
                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                    unread ? 'bg-red-600' : 'bg-transparent',
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span
                      className={uiCx(
                        'truncate text-sm',
                        unread ? 'font-bold text-slate-950' : 'font-medium text-slate-800',
                      )}
                    >
                      {post.author_name || 'Announcement'}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                      {formatInboxDate(post.created_at)}
                    </span>
                  </span>
                  <span
                    className={uiCx(
                      'mt-0.5 block truncate text-sm',
                      unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700',
                    )}
                  >
                    {post.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                      {preview || 'No preview'}
                    </span>
                    {hasAttachment ? <Paperclip className="h-3 w-3 shrink-0 text-slate-400" aria-hidden /> : null}
                  </span>
                  {(urgent || required) && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {urgent ? (
                        <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                          Urgent
                        </span>
                      ) : null}
                      {required ? (
                        <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                          Required
                        </span>
                      ) : null}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-center gap-1.5 px-2 py-3 text-[11px] text-slate-400">
        <Mail className="h-3 w-3" aria-hidden />
        Click to jump in the feed
      </div>
    </div>
  );
}
