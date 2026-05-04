import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessTokenIfNeeded } from '@/lib/api';
import toast from 'react-hot-toast';
import { CommunityPageHeader } from '@/components/community/CommunityPageHeader';
import OverlayPortal from '@/components/OverlayPortal';
import { CommunityPostBody } from '@/components/community/CommunityPostBody';
import { useConfirm } from '@/components/ConfirmProvider';
import { stripHtmlToPlain } from '@/lib/communityPostHtml';

function announcementListExcerpt(html: string): string {
  const plain = stripHtmlToPlain(html || '');
  if (!plain.trim()) {
    return 'Rich content — tap View to see images and formatting.';
  }
  const max = 220;
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max).trim()}…`;
}

const AREA_LABELS: Record<string, string> = {
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

const PRI_LABELS: Record<string, string> = {
  normal: 'Normal',
  important: 'Important',
  urgent: 'Urgent',
  critical: 'Critical',
};

export default function Community() {
  const [searchParams] = useSearchParams();
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (searchParams.get('myAnnouncements') === '1') {
      setShowHistory(true);
    }
  }, [searchParams]);

  const cards = [
    {
      id: 'groups',
      label: 'Groups',
      icon: '👥',
      description: 'View and manage groups with members',
      color: 'bg-blue-100 text-blue-600',
      path: '/community/groups',
    },
    {
      id: 'insights',
      label: 'Insights',
      icon: '📊',
      description: 'Analytics and engagement metrics',
      color: 'bg-purple-100 text-purple-600',
      path: '/community/insights',
    },
    {
      id: 'new-post',
      label: 'New Post',
      icon: '📝',
      description: 'Create announcements and updates',
      color: 'bg-green-100 text-green-600',
      path: '/community/new-post',
    },
  ];

  const { data: myPostsData, isError, isPending, error } = useQuery({
    queryKey: ['my-community-posts'],
    queryFn: () => api<any[]>('GET', '/community/posts/my-posts'),
  });

  const myPosts: any[] = Array.isArray(myPostsData) ? myPostsData : [];

  return (
    <div className="space-y-4">
      <CommunityPageHeader
        title="Community"
        subtitle="Manage groups, view insights, and create posts."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map((card) => (
          <Link
            key={card.id}
            to={card.path}
            className="rounded-lg border bg-white p-4 hover:shadow-md transition-all text-left group"
          >
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-lg ${card.color} flex items-center justify-center text-xl flex-shrink-0 group-hover:scale-110 transition-transform`}>
                {card.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-base text-gray-900 mb-0.5">{card.label}</div>
                <div className="text-xs text-gray-500 line-clamp-1">{card.description}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border bg-white">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">My Announcements</h2>
              <p className="text-sm text-gray-600">Status, scheduling, confirmations, and actions</p>
            </div>
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition"
            >
              {showHistory ? 'Hide' : 'Show'} History
            </button>
          </div>

          {showHistory && (
            <div className="space-y-4 mt-4">
              {isError ? (
                <div className="text-center text-red-600 py-8 text-sm">
                  {error instanceof Error ? error.message : 'Could not load your announcements.'}
                </div>
              ) : isPending ? (
                <div className="text-center text-gray-500 py-8">Loading…</div>
              ) : myPosts.length === 0 ? (
                <div className="text-center text-gray-500 py-8">No announcements created yet</div>
              ) : (
                myPosts.map((post: any) => <PostHistoryItem key={post.id} post={post} />)
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PostHistoryItem({ post }: { post: any }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [showConfirmations, setShowConfirmations] = useState(false);
  const [showPending, setShowPending] = useState(false);

  const { data: confirmations = [] } = useQuery({
    queryKey: ['post-read-confirmations', post.id],
    queryFn: () => api<any[]>('GET', `/community/posts/${post.id}/read-confirmations`).catch(() => []),
    enabled: post.requires_read_confirmation && showConfirmations,
  });

  const { data: pendingData } = useQuery({
    queryKey: ['post-recipients-pending', post.id],
    queryFn: () => api<any>('GET', `/community/posts/${post.id}/recipients-pending`).catch(() => ({ pending: [] })),
    enabled: post.requires_read_confirmation && showPending,
  });

  const [viewOpen, setViewOpen] = useState(false);

  const { data: detailPost } = useQuery({
    queryKey: ['community-post-one', post.id],
    queryFn: () => api<any>('GET', `/community/posts/${post.id}`),
    enabled: viewOpen,
  });

  const publishMut = useMutation({
    mutationFn: () => api('POST', `/community/posts/${post.id}/publish`),
    onSuccess: () => {
      toast.success('Published');
      queryClient.invalidateQueries({ queryKey: ['my-community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to publish'),
  });

  const unpublishToDraftMut = useMutation({
    mutationFn: () => api('PATCH', `/community/posts/${post.id}`, { publish_mode: 'draft' }),
    onSuccess: () => {
      toast.success('Saved as draft — you can publish again with Publish now.');
      queryClient.invalidateQueries({ queryKey: ['my-community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['community-post-one', post.id] });
      setViewOpen(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to unpublish'),
  });

  const cancelMut = useMutation({
    mutationFn: () => api('POST', `/community/posts/${post.id}/cancel`),
    onSuccess: () => {
      toast.success('Announcement cancelled');
      queryClient.invalidateQueries({ queryKey: ['my-community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['community-post-one', post.id] });
      setViewOpen(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to cancel'),
  });

  const deleteMut = useMutation({
    mutationFn: () => api('DELETE', `/community/posts/${post.id}`),
    onSuccess: () => {
      toast.success('Announcement deleted');
      queryClient.invalidateQueries({ queryKey: ['my-community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      queryClient.removeQueries({ queryKey: ['community-post-one', post.id] });
      setViewOpen(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to delete'),
  });

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  const status = post.status || 'published';
  const priority = post.priority || 'normal';
  const area = post.related_area || 'general';
  const totalR = post.total_recipients || 0;
  const confC = post.confirmations_count || 0;
  const pct = totalR > 0 ? Math.min(100, Math.round((confC / totalR) * 100)) : 0;

  const canEdit = ['draft', 'scheduled', 'published', 'cancelled'].includes(status);
  const showPublishNow = ['draft', 'scheduled', 'cancelled'].includes(status);
  const showCancelOrUnpublish = ['draft', 'scheduled', 'published'].includes(status);
  const displayPost = detailPost || post;

  const busyUnpublishOrCancel = unpublishToDraftMut.isPending || cancelMut.isPending;

  const handleUnpublishOrCancel = async () => {
    if (busyUnpublishOrCancel) return;

    if (status === 'published') {
      const r = await confirm({
        title: 'Unpublish announcement?',
        message:
          'This removes the announcement from the employee feed and saves it as a draft. You can edit it and use Publish now when you are ready.',
        confirmText: 'Unpublish',
        cancelText: 'Keep published',
      });
      if (r !== 'confirm') return;
      unpublishToDraftMut.mutate();
      return;
    }

    const r = await confirm({
      title: 'Cancel this announcement?',
      message:
        'This marks the announcement as cancelled. It will not appear in the feed. Cancelled posts cannot be published again from here.',
      confirmText: 'Cancel post',
      cancelText: 'Go back',
    });
    if (r !== 'confirm') return;
    cancelMut.mutate();
  };

  const handleDelete = async () => {
    if (deleteMut.isPending) return;
    const r = await confirm({
      title: 'Delete announcement?',
      message:
        'This permanently deletes the announcement, including comments and read confirmations. This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (r !== 'confirm') return;
    deleteMut.mutate();
  };

  const statusStyles =
    status === 'published'
      ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
      : status === 'draft'
        ? 'bg-slate-100 text-slate-800 border-slate-200'
        : status === 'scheduled'
          ? 'bg-sky-50 text-sky-900 border-sky-200'
          : status === 'cancelled'
            ? 'bg-stone-100 text-stone-700 border-stone-300'
            : 'bg-gray-50 text-gray-700 border-gray-200';

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 min-w-0">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-gray-900 text-base leading-snug">{post.title}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-md border capitalize font-medium ${statusStyles}`}>{status}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-md border ${
                  priority === 'critical'
                    ? 'bg-red-900 text-white border-red-900'
                    : priority === 'urgent'
                      ? 'bg-red-100 text-red-900 border-red-300'
                      : priority === 'important'
                        ? 'bg-amber-50 text-amber-900 border-amber-200'
                        : 'bg-gray-50 text-gray-600 border-gray-200'
                }`}
              >
                {PRI_LABELS[priority] || priority}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-100">
                {AREA_LABELS[area] || area}
              </span>
              {post.requires_read_confirmation && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-yellow-100 text-yellow-800 border border-yellow-300">
                  Read confirmation
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 break-words">
              {announcementListExcerpt(post.content)}
            </p>
            <div className="text-xs text-gray-500 flex flex-wrap gap-x-2 gap-y-1">
              <span>{post.target_type === 'all' ? 'All employees' : `Divisions (${(post.target_division_ids || []).length})`}</span>
              <span className="text-gray-300">·</span>
              <span>Created {formatTimeAgo(post.created_at)}</span>
              {post.publish_at && (
                <>
                  <span className="text-gray-300">·</span>
                  <span>Scheduled/published {formatTimeAgo(post.publish_at)}</span>
                </>
              )}
              <span className="text-gray-300">·</span>
              <span>{post.views_count || 0} views</span>
              {post.requires_read_confirmation && (
                <>
                  <span className="text-gray-300">·</span>
                  <span>
                    {confC}/{totalR || '?'} confirmed
                  </span>
                </>
              )}
            </div>

            {post.requires_read_confirmation && totalR > 0 && (
              <div className="pt-1">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>Confirmation progress</span>
                  <span>
                    {confC} / {totalR} ({pct}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-brand-red h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 lg:flex-shrink-0 lg:max-w-[min(100%,22rem)] lg:justify-end pt-1 border-t border-gray-100 lg:border-t-0 lg:pt-0">
            <button
              type="button"
              onClick={() => setViewOpen(true)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
            >
              View
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => navigate(`/community/posts/${post.id}/edit`)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
              >
                Edit
              </button>
            )}
            {showPublishNow && (
              <button
                type="button"
                onClick={() => publishMut.mutate()}
                disabled={publishMut.isPending}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-red text-white hover:bg-red-700 disabled:opacity-50"
              >
                Publish now
              </button>
            )}
            {showCancelOrUnpublish && (
              <button
                type="button"
                onClick={() => void handleUnpublishOrCancel()}
                disabled={busyUnpublishOrCancel}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-400 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {status === 'published' ? 'Unpublish' : 'Cancel post'}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleteMut.isPending}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {viewOpen && (
        <OverlayPortal>
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setViewOpen(false)}
            role="presentation"
          >
            <div
              className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`announcement-view-${post.id}`}
            >
              <div className="p-4 border-b flex items-start justify-between gap-3">
                <h3 id={`announcement-view-${post.id}`} className="text-lg font-semibold text-gray-900 pr-2">
                  {displayPost.title || 'Announcement'}
                </h3>
                <button
                  type="button"
                  onClick={() => setViewOpen(false)}
                  className="flex-shrink-0 text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-100"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div className="overflow-y-auto p-4 space-y-4 flex-1 min-h-0">
                {(displayPost as any).photo_url && (
                  <img
                    src={withFileAccessTokenIfNeeded(String((displayPost as any).photo_url))}
                    alt=""
                    className="rounded-lg border max-h-64 w-full object-contain bg-gray-50"
                  />
                )}
                {(displayPost as any).document_url && (
                  <a
                    href={withFileAccessTokenIfNeeded(String((displayPost as any).document_url))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex text-sm text-blue-600 hover:underline"
                  >
                    Open attached document →
                  </a>
                )}
                <CommunityPostBody html={String(displayPost.content || '')} className="text-sm text-gray-800" />
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}

      {post.requires_read_confirmation && (
        <div className="mt-4 pt-4 border-t space-y-2">
          <button
            type="button"
            onClick={() => setShowConfirmations(!showConfirmations)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {showConfirmations ? 'Hide' : 'Show'} who confirmed ({post.confirmations_count || 0})
          </button>
          <button
            type="button"
            onClick={() => setShowPending(!showPending)}
            className="ml-4 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {showPending ? 'Hide' : 'Show'} pending confirmations
          </button>

          {showConfirmations && confirmations.length > 0 && (
            <div className="mt-3 space-y-2">
              {confirmations.map((conf: any) => (
                <div key={conf.user_id} className="flex items-center gap-2 text-sm">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    {conf.user_avatar ? (
                      <img src={conf.user_avatar} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <span className="text-gray-500 text-xs">{(conf.user_name || 'U')[0].toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{conf.user_name || 'Unknown'}</div>
                    <div className="text-xs text-gray-500">Confirmed {formatTimeAgo(conf.confirmed_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {showConfirmations && confirmations.length === 0 && <div className="mt-3 text-sm text-gray-500">No confirmations yet</div>}

          {showPending && pendingData?.pending?.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto space-y-1 text-sm text-gray-700">
              {pendingData.pending.map((p: any) => (
                <div key={p.user_id}>{p.user_name}</div>
              ))}
            </div>
          )}
          {showPending && (!pendingData?.pending || pendingData.pending.length === 0) && (
            <div className="mt-3 text-sm text-gray-500">No pending recipients (or everyone confirmed)</div>
          )}
        </div>
      )}
    </div>
  );
}
