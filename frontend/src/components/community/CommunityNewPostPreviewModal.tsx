import { useMemo } from 'react';
import { CommunityPostBody } from '@/components/community/CommunityPostBody';
import { COMMUNITY_FEED_AREA_LABELS } from '@/components/community/CommunityFeedPostSnippet';
import { sanitizeCommunityPostHtml } from '@/lib/communityPostHtml';
import { withFileAccessTokenIfNeeded } from '@/lib/api';
import { AppBadge, AppButton, AppModal, uiCx, uiTypography } from '@/components/ui';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  content: string;
  priority: string;
  relatedArea: string;
  requiresReadConfirmation: boolean;
  /** Compose preview: uploads not yet published */
  attachments: { fileId: string; name: string }[];
  /** Saved post: optional download links. When present (even `[]`), `attachments` is ignored for attachment UI. */
  savedAttachments?: { fileId: string; name: string; url: string }[];
  targetType: 'all' | 'divisions' | 'users' | 'groups';
  divisionCount: number;
  selectedEmployeeCount: number;
  selectedGroupCount?: number;
  groupAudienceHint?: string;
  publishMode: 'now' | 'scheduled' | 'draft' | 'cancelled';
  /** Defaults: “You” / “Just now” / “Y” */
  authorDisplayName?: string;
  dateDisplayLabel?: string;
  authorInitial?: string;
  titleId?: string;
};

export function CommunityNewPostPreviewModal({
  open,
  onClose,
  title,
  content,
  priority,
  relatedArea,
  requiresReadConfirmation,
  attachments,
  savedAttachments,
  targetType,
  divisionCount,
  selectedEmployeeCount,
  selectedGroupCount = 0,
  groupAudienceHint,
  publishMode,
  authorDisplayName,
  dateDisplayLabel,
  authorInitial,
  titleId = 'new-post-preview-title',
}: Props) {
  const previewTitle = title.trim() || 'Untitled announcement';
  const previewHtml = useMemo(() => sanitizeCommunityPostHtml(content), [content]);
  const useSavedAttachments = savedAttachments !== undefined;
  const activeSavedAttachments = useSavedAttachments ? savedAttachments! : [];
  const composeAttachments = attachments;
  const attachmentCount = useSavedAttachments ? activeSavedAttachments.length : composeAttachments.length;

  const displayAuthor = authorDisplayName ?? 'You';
  const displayDate = dateDisplayLabel ?? 'Just now';
  const displayInitial =
    (authorInitial || (displayAuthor.trim().charAt(0) || 'Y')).toUpperCase();

  const priorityLabel =
    priority && priority !== 'normal'
      ? priority.charAt(0).toUpperCase() + priority.slice(1)
      : null;

  const audienceSummary =
    targetType === 'all'
      ? 'All employees'
      : targetType === 'users'
        ? `${selectedEmployeeCount} selected employee${selectedEmployeeCount === 1 ? '' : 's'}`
        : targetType === 'groups'
          ? `${selectedGroupCount} community group${selectedGroupCount === 1 ? '' : 's'}${groupAudienceHint ? ` (${groupAudienceHint})` : ''}`
          : `${divisionCount} division${divisionCount === 1 ? '' : 's'}`;

  const headerMeta = (
    <div className="flex min-w-0 items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-500">
        {displayInitial}
      </div>
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className={uiCx(uiTypography.sectionTitle, 'line-clamp-2 text-lg leading-snug')}>
          {previewTitle}
        </h2>
        <div className={uiCx(uiTypography.helper, 'mt-1 flex flex-wrap items-center gap-2')}>
          <span className="font-semibold text-gray-700">{displayAuthor}</span>
          <span>{displayDate}</span>
          {relatedArea ? <AppBadge variant="info">{COMMUNITY_FEED_AREA_LABELS[relatedArea] || relatedArea}</AppBadge> : null}
          <AppBadge variant="neutral">{audienceSummary}</AppBadge>
          {priorityLabel ? <AppBadge variant="danger">{priorityLabel}</AppBadge> : null}
          {publishMode === 'draft' ? <AppBadge variant="warning">Draft</AppBadge> : null}
          {publishMode === 'scheduled' ? <AppBadge variant="info">Scheduled</AppBadge> : null}
          {publishMode === 'cancelled' ? <AppBadge variant="neutral">Cancelled</AppBadge> : null}
        </div>
      </div>
    </div>
  );

  return (
    <AppModal
      open={open}
      onClose={onClose}
      size="lg"
      dialogClassName="!max-w-5xl"
      bodyFill={false}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      headerContent={headerMeta}
      footer={
        <div className="flex justify-end">
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </AppButton>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-4">
          <div className={uiCx(uiTypography.body, 'min-h-full leading-relaxed text-gray-900')}>
            <CommunityPostBody html={previewHtml} />
          </div>
          {attachmentCount > 0 ? (
            <section className="mt-6 border-t border-gray-100 pt-5" aria-label="Attachments">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className={uiTypography.sectionTitle}>Attachments</h4>
                <AppBadge variant="neutral">{attachmentCount}</AppBadge>
              </div>
              <div className="space-y-2">
                {useSavedAttachments
                  ? activeSavedAttachments.map((a) =>
                      a.url ? (
                        <a
                          key={a.fileId || a.url}
                          href={withFileAccessTokenIfNeeded(String(a.url))}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={a.name || undefined}
                          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 transition-colors hover:border-gray-300 hover:bg-gray-50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className={uiCx(uiTypography.body, 'truncate font-medium')}>{a.name}</div>
                            <div className={uiCx(uiTypography.helper, 'text-blue-600')}>Download</div>
                          </div>
                        </a>
                      ) : (
                        <div
                          key={a.fileId || a.name}
                          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 opacity-70"
                        >
                          <div className="min-w-0 flex-1">
                            <div className={uiCx(uiTypography.body, 'truncate font-medium')}>{a.name}</div>
                            <div className={uiTypography.helper}>File link unavailable</div>
                          </div>
                        </div>
                      ),
                    )
                  : composeAttachments.map((a) => (
                      <div
                        key={a.fileId}
                        className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className={uiCx(uiTypography.body, 'truncate font-medium')}>{a.name}</div>
                          <div className={uiTypography.helper}>Will be available after publish</div>
                        </div>
                      </div>
                    ))}
              </div>
            </section>
          ) : null}
        </div>
        {(attachmentCount > 0 || requiresReadConfirmation) && (
          <div className="shrink-0 border-t border-gray-100 bg-white px-5 pb-6 pt-4">
            {attachmentCount > 0 ? (
              <AppBadge variant="neutral">
                {attachmentCount} attachment{attachmentCount === 1 ? '' : 's'}
              </AppBadge>
            ) : null}
            {requiresReadConfirmation ? (
              <div className={attachmentCount > 0 ? 'mt-3' : ''}>
                <AppBadge variant="warning">Read confirmation required</AppBadge>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </AppModal>
  );
}
