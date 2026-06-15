import { useState, useEffect, useRef, type SVGProps } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { CommunityNewPostPreviewModal } from '@/components/community/CommunityNewPostPreviewModal';
import { useConfirm } from '@/components/ConfirmProvider';
import { stripHtmlToPlain } from '@/lib/communityPostHtml';
import {
  AppBadge,
  AppButton,
  AppTabs,
  uiBorders,
  uiCx,
  uiDropdown,
  uiLayout,
  uiTypography,
} from '@/components/ui';

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

function statusBadgeVariant(status: string): 'success' | 'info' | 'warning' | 'neutral' {
  if (status === 'published') return 'success';
  if (status === 'scheduled') return 'info';
  if (status === 'cancelled') return 'warning';
  return 'neutral';
}

function priorityBadgeVariant(priority: string): 'danger' | 'warning' | 'neutral' {
  if (priority === 'critical' || priority === 'urgent') return 'danger';
  if (priority === 'important') return 'warning';
  return 'neutral';
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

  const approxPending = totalR > 0 ? Math.max(0, totalR - confC) : undefined;

  return (
    <div className={uiCx('relative flex overflow-hidden rounded-xl border bg-white shadow-sm', uiBorders.subtle)}>
      <div className={`w-1 shrink-0 ${statusAccentClass(status)}`} aria-hidden />
      <div className="min-w-0 flex-1 p-4 pl-3">
        <div className="flex flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                <h3 className={uiCx(uiTypography.sectionTitle, 'line-clamp-2 text-base leading-snug')}>{post.title}</h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  <AppBadge variant={statusBadgeVariant(status)} className="capitalize">
                    {status}
                  </AppBadge>
                  <AppBadge variant={priorityBadgeVariant(priority)}>
                    {PRI_LABELS[priority] || priority}
                  </AppBadge>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <AppBadge variant="info">{AREA_LABELS[area] || area}</AppBadge>
                  {post.requires_read_confirmation ? (
                    <AppBadge variant="warning">Read confirmation</AppBadge>
                  ) : null}
                </div>
                <p className={uiCx(uiTypography.body, 'line-clamp-3 break-words leading-relaxed text-gray-600')}>
                  {announcementListExcerpt(post.content)}
                </p>
                <div className={uiCx(uiTypography.helper, 'flex flex-wrap items-center gap-x-3 gap-y-1.5')}>
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
                    <div className={uiCx(uiTypography.helper, 'mb-1 flex justify-between')}>
                      <span>Confirmation progress</span>
                      <span>
                        {confC} / {totalR} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-2 rounded-full bg-brand-red transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </div>

              <div className={uiCx(uiLayout.actionsRow, 'flex-wrap border-t border-gray-100 pt-1 sm:max-w-[min(100%,20rem)] sm:flex-shrink-0 sm:justify-end sm:border-t-0 sm:pt-0')}>
                <AppButton type="button" variant="secondary" size="sm" onClick={() => setViewOpen(true)}>
                  View
                </AppButton>
                {canEdit ? (
                  <AppButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/community/posts/${post.id}/edit`)}
                  >
                    Edit
                  </AppButton>
                ) : null}
                {showPublishNow ? (
                  <AppButton
                    type="button"
                    size="sm"
                    onClick={() => publishMut.mutate()}
                    disabled={publishMut.isPending}
                    loading={publishMut.isPending}
                  >
                    Publish now
                  </AppButton>
                ) : null}

                <div className="relative" ref={actionsRef}>
                  <AppButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-expanded={actionsOpen}
                    aria-haspopup="true"
                    aria-label="More actions"
                    onClick={() => setActionsOpen((o) => !o)}
                  >
                    ···
                  </AppButton>
                  {actionsOpen ? (
                    <div className={uiCx(uiDropdown.menu, 'absolute right-0 top-full z-20 mt-1 min-w-[11rem] py-1')} role="menu">
                      {showCancelOrUnpublish ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => void handleUnpublishOrCancel()}
                          disabled={busyUnpublishOrCancel}
                          className={uiDropdown.option}
                        >
                          {status === 'published' ? 'Unpublish' : 'Cancel post'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void handleDelete()}
                        disabled={deleteMut.isPending}
                        className={uiCx(uiDropdown.option, 'text-red-700 hover:bg-red-50')}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

        {post.requires_read_confirmation && (
          <div className="border-t border-gray-100 pt-4">
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto w-full justify-between px-2 py-2 -mx-2"
              aria-expanded={readConfOpen}
              onClick={() => {
                setReadConfOpen((o) => !o);
                if (!readConfOpen) setReadConfSubTab('confirmed');
              }}
            >
              <span className={uiTypography.body}>
                Read confirmations
                <span className={uiCx(uiTypography.helper, 'ml-1 font-normal')}>
                  ({confC} confirmed
                  {approxPending !== undefined ? ` · ~${approxPending} pending` : ''})
                </span>
              </span>
              <ChevronDown
                className={uiCx('h-4 w-4 shrink-0 text-gray-500 transition-transform', readConfOpen && 'rotate-180')}
                aria-hidden
              />
            </AppButton>

            {readConfOpen && (
              <div className={uiCx('mt-2 rounded-lg border bg-gray-50/80 p-2', uiBorders.subtle)}>
                <AppTabs
                  tabs={[
                    { key: 'confirmed', label: `Confirmed (${post.confirmations_count || 0})` },
                    { key: 'pending', label: 'Pending' },
                  ]}
                  value={readConfSubTab}
                  onChange={(key) => setReadConfSubTab(key as 'confirmed' | 'pending')}
                />

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
