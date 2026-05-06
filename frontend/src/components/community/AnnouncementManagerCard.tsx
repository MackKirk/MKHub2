import { useState, useEffect, useRef, type SVGProps } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { CommunityNewPostPreviewModal } from '@/components/community/CommunityNewPostPreviewModal';
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

function mapStatusToPreviewPublishMode(st: string): 'now' | 'scheduled' | 'draft' | 'cancelled' {
  if (st === 'draft') return 'draft';
  if (st === 'scheduled') return 'scheduled';
  if (st === 'cancelled') return 'cancelled';
  return 'now';
}

function postToSavedAttachments(p: Record<string, unknown>): { fileId: string; name: string; url: string }[] {
  const raw = Array.isArray(p.attachments) ? p.attachments : [];
  if (raw.length > 0) {
    return (raw as { file_id?: string; original_name?: string; url?: string }[])
      .map((a) => ({
        fileId: String(a.file_id || ''),
        name: String(a.original_name || 'Attachment'),
        url: String(a.url || ''),
      }))
      .filter((a) => a.fileId || a.url);
  }
  if (p.document_url) {
    return [
      {
        fileId: String(p.document_file_id || ''),
        name: String(p.document_original_name || 'Attachment'),
        url: String(p.document_url),
      },
    ];
  }
  return [];
}

function authorInitialFromName(name: unknown): string | undefined {
  const s = String(name || '').trim();
  if (!s) return undefined;
  return s.charAt(0).toUpperCase();
}

function IconUsers(props: SVGProps<SVGSVGElement>) {
  return (
    <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function IconCalendar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function IconEye(props: SVGProps<SVGSVGElement>) {
  return (
    <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function IconCheckCircle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function statusAccentClass(status: string): string {
  switch (status) {
    case 'published':
      return 'bg-emerald-500';
    case 'draft':
      return 'bg-slate-400';
    case 'scheduled':
      return 'bg-sky-500';
    case 'cancelled':
      return 'bg-stone-400';
    default:
      return 'bg-gray-300';
  }
}

export function AnnouncementManagerCard({ post }: { post: any }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [readConfOpen, setReadConfOpen] = useState(false);
  const [readConfSubTab, setReadConfSubTab] = useState<'confirmed' | 'pending'>('confirmed');
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!actionsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActionsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [actionsOpen]);

  const showConfirmations = readConfOpen && readConfSubTab === 'confirmed';
  const showPending = readConfOpen && readConfSubTab === 'pending';

  const { data: confirmations = [] } = useQuery({
    queryKey: ['post-read-confirmations', post.id],
    queryFn: () => api<any[]>('GET', `/community/posts/${post.id}/read-confirmations`).catch(() => []),
    enabled: post.requires_read_confirmation && showConfirmations,
  });

  const { data: pendingData } = useQuery({
    queryKey: ['post-recipients-pending', post.id],
    queryFn: () => api<any>('GET', `/community/posts/${post.id}/recipients-pending`).catch(() => ({ pending: [] })),
    enabled: post.requires_read_confirmation && readConfOpen && readConfSubTab === 'pending',
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

  const ttRaw = String(displayPost.target_type || 'all');
  const previewAudienceTarget: 'all' | 'divisions' | 'users' | 'groups' =
    ttRaw === 'divisions' ? 'divisions' : ttRaw === 'users' ? 'users' : ttRaw === 'groups' ? 'groups' : 'all';

  const busyUnpublishOrCancel = unpublishToDraftMut.isPending || cancelMut.isPending;

  const handleUnpublishOrCancel = async () => {
    if (busyUnpublishOrCancel) return;
    setActionsOpen(false);

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
    setActionsOpen(false);
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

  const approxPending =
    totalR > 0 ? Math.max(0, totalR - confC) : undefined;

  return (
    <div className="relative flex rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className={`w-1 shrink-0 ${statusAccentClass(status)}`} aria-hidden />
      <div className="flex-1 min-w-0 p-4 pl-3">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-start gap-x-2 gap-y-1.5">
                  <h3 className="font-semibold text-gray-900 text-base leading-snug line-clamp-2 pr-1">{post.title}</h3>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
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
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-100">
                    {AREA_LABELS[area] || area}
                  </span>
                  {post.requires_read_confirmation && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-amber-50 text-amber-900 border border-amber-200">
                      Read confirmation
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 break-words">
                  {announcementListExcerpt(post.content)}
                </p>
                <div className="text-xs text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-gray-600">
                    <IconUsers className="text-gray-400" />
                    {post.target_type === 'all'
                      ? 'All employees'
                      : post.target_type === 'users'
                        ? `Specific employees (${(post.target_user_ids || []).length})`
                        : `Divisions (${(post.target_division_ids || []).length})`}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-gray-600">
                    <IconCalendar className="text-gray-400" />
                    Created {formatTimeAgo(post.created_at)}
                  </span>
                  {post.publish_at && (
                    <span className="inline-flex items-center gap-1.5 text-gray-600">
                      <IconCalendar className="text-gray-400" />
                      Live {formatTimeAgo(post.publish_at)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 text-gray-600">
                    <IconEye className="text-gray-400" />
                    {post.views_count || 0} views
                  </span>
                  {post.requires_read_confirmation && (
                    <span className="inline-flex items-center gap-1.5 text-gray-600">
                      <IconCheckCircle className="text-gray-400" />
                      {confC}/{totalR || '?'} confirmed
                    </span>
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

              <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:flex-shrink-0 sm:max-w-[min(100%,20rem)] pt-1 sm:pt-0 border-t border-gray-100 sm:border-t-0">
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

                <div className="relative" ref={actionsRef}>
                  <button
                    type="button"
                    onClick={() => setActionsOpen((o) => !o)}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
                    aria-expanded={actionsOpen}
                    aria-haspopup="true"
                    aria-label="More actions"
                  >
                    ···
                  </button>
                  {actionsOpen && (
                    <div
                      className="absolute right-0 top-full mt-1 z-20 min-w-[11rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                      role="menu"
                    >
                      {showCancelOrUnpublish && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => void handleUnpublishOrCancel()}
                          disabled={busyUnpublishOrCancel}
                          className="w-full text-left px-3 py-2 text-xs text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {status === 'published' ? 'Unpublish' : 'Cancel post'}
                        </button>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void handleDelete()}
                        disabled={deleteMut.isPending}
                        className="w-full text-left px-3 py-2 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

        {post.requires_read_confirmation && (
          <div className="pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                setReadConfOpen((o) => !o);
                if (!readConfOpen) setReadConfSubTab('confirmed');
              }}
              className="flex w-full items-center justify-between gap-2 text-left rounded-lg px-2 py-2 -mx-2 hover:bg-gray-50 transition-colors"
              aria-expanded={readConfOpen}
            >
              <span className="text-sm font-medium text-gray-900">
                Read confirmations
                <span className="font-normal text-gray-500 ml-1">
                  ({confC} confirmed
                  {approxPending !== undefined ? ` · ~${approxPending} pending` : ''})
                </span>
              </span>
              <svg
                className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${readConfOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {readConfOpen && (
              <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50/80 p-2">
                <div className="flex gap-1 p-0.5 rounded-md bg-gray-200/60" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={readConfSubTab === 'confirmed'}
                    onClick={() => setReadConfSubTab('confirmed')}
                    className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                      readConfSubTab === 'confirmed' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Confirmed ({post.confirmations_count || 0})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={readConfSubTab === 'pending'}
                    onClick={() => setReadConfSubTab('pending')}
                    className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                      readConfSubTab === 'pending' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Pending
                  </button>
                </div>

                <div className="mt-3 px-1" role="tabpanel">
                  {showConfirmations && confirmations.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {confirmations.map((conf: any) => (
                        <div key={conf.user_id} className="flex items-center gap-2 text-sm">
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                            {conf.user_avatar ? (
                              <img src={conf.user_avatar} alt="" className="w-full h-full rounded-full object-cover" />
                            ) : (
                              <span className="text-gray-500 text-xs">{(conf.user_name || 'U')[0].toUpperCase()}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">{conf.user_name || 'Unknown'}</div>
                            <div className="text-xs text-gray-500">Confirmed {formatTimeAgo(conf.confirmed_at)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {showConfirmations && confirmations.length === 0 && (
                    <div className="text-sm text-gray-500 py-2">No confirmations yet</div>
                  )}

                  {showPending && pendingData?.pending?.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1 text-sm text-gray-700">
                      {pendingData.pending.map((p: any) => (
                        <div key={p.user_id} className="truncate">
                          {p.user_name}
                        </div>
                      ))}
                    </div>
                  )}
                  {showPending && (!pendingData?.pending || pendingData.pending.length === 0) && (
                    <div className="text-sm text-gray-500 py-2">No pending recipients (or everyone confirmed)</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        </div>

        <CommunityNewPostPreviewModal
          open={viewOpen}
          onClose={() => setViewOpen(false)}
          title={String(displayPost.title || '')}
          content={String(displayPost.content || '')}
          priority={String(displayPost.priority || 'normal')}
          relatedArea={String(displayPost.related_area || 'general')}
          requiresReadConfirmation={!!displayPost.requires_read_confirmation}
          attachments={[]}
          savedAttachments={postToSavedAttachments(displayPost as Record<string, unknown>)}
          targetType={previewAudienceTarget}
          divisionCount={(displayPost.target_division_ids || []).length}
          selectedEmployeeCount={(displayPost.target_user_ids || []).length}
          selectedGroupCount={0}
          publishMode={mapStatusToPreviewPublishMode(String(displayPost.status || status))}
          authorDisplayName={displayPost.author_name ? String(displayPost.author_name) : undefined}
          dateDisplayLabel={
            displayPost.updated_at || displayPost.created_at
              ? formatTimeAgo(String(displayPost.updated_at || displayPost.created_at))
              : undefined
          }
          authorInitial={authorInitialFromName(displayPost.author_name)}
          titleId={`announcement-preview-${post.id}`}
        />
      </div>
    </div>
  );
}
