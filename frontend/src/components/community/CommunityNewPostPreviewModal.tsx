import { useMemo } from 'react';
import OverlayPortal from '@/components/OverlayPortal';
import { CommunityPostBody } from '@/components/community/CommunityPostBody';
import { COMMUNITY_FEED_AREA_LABELS } from '@/components/community/CommunityFeedPostSnippet';
import { sanitizeCommunityPostHtml } from '@/lib/communityPostHtml';
import { withFileAccessTokenIfNeeded } from '@/lib/api';

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

  if (!open) return null;

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="flex h-[min(92dvh,920px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
                {displayInitial}
              </div>
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="line-clamp-2 text-lg font-semibold leading-snug text-slate-950">
                  {previewTitle}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{displayAuthor}</span>
                  <span>{displayDate}</span>
                  {relatedArea && (
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-medium text-slate-600">
                      {COMMUNITY_FEED_AREA_LABELS[relatedArea] || relatedArea}
                    </span>
                  )}
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-medium text-slate-600">
                    {audienceSummary}
                  </span>
                  {priorityLabel && (
                    <span className="rounded-md border border-red-100 bg-red-50 px-1.5 py-0.5 font-semibold text-red-700">
                      {priorityLabel}
                    </span>
                  )}
                  {publishMode === 'draft' && (
                    <span className="rounded-md border border-amber-100 bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">
                      Draft
                    </span>
                  )}
                  {publishMode === 'scheduled' && (
                    <span className="rounded-md border border-blue-100 bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700">
                      Scheduled
                    </span>
                  )}
                  {publishMode === 'cancelled' && (
                    <span className="rounded-md border border-stone-200 bg-stone-100 px-1.5 py-0.5 font-semibold text-stone-700">
                      Cancelled
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close preview"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-4">
              <div className="min-h-full text-sm leading-relaxed text-slate-900">
                <CommunityPostBody html={previewHtml} />
              </div>
              {attachmentCount > 0 && (
                <section className="mt-6 border-t border-slate-100 pt-5" aria-label="Attachments">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-slate-950">Attachments</h4>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {attachmentCount}
                    </span>
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
                              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 transition-colors hover:border-slate-300 hover:bg-slate-50"
                            >
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200">
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7V5a2 2 0 012-2h5l5 5v11a2 2 0 01-2 2H9a2 2 0 01-2-2v-2" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 3v6h6M5 12h8m0 0l-3-3m3 3l-3 3" />
                                </svg>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-slate-800">{a.name}</div>
                                <div className="text-xs font-medium text-blue-600">Download</div>
                              </div>
                            </a>
                          ) : (
                            <div
                              key={a.fileId || a.name}
                              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 opacity-70"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-slate-800">{a.name}</div>
                                <div className="text-xs font-medium text-slate-500">File link unavailable</div>
                              </div>
                            </div>
                          )
                        )
                      : composeAttachments.map((a) => (
                          <div
                            key={a.fileId}
                            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5"
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200">
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7V5a2 2 0 012-2h5l5 5v11a2 2 0 01-2 2H9a2 2 0 01-2-2v-2" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 3v6h6M5 12h8m0 0l-3-3m3 3l-3 3" />
                              </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-slate-800">{a.name}</div>
                              <div className="text-xs font-medium text-slate-500">Will be available after publish</div>
                            </div>
                          </div>
                        ))}
                  </div>
                </section>
              )}
            </div>
          </div>
          {(attachmentCount > 0 || requiresReadConfirmation) && (
            <div className="shrink-0 border-t border-slate-100 bg-white px-5 pb-6 pt-4">
              {attachmentCount > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-slate-600">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.586-6.586a4 4 0 00-5.657-5.657L5.757 10.757a6 6 0 108.486 8.486L20 13.486"
                      />
                    </svg>
                    <span>{attachmentCount}</span>
                  </span>
                </div>
              )}
              {requiresReadConfirmation && (
                <div className={attachmentCount > 0 ? 'mt-3' : ''}>
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Read confirmation required
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </OverlayPortal>
  );
}
