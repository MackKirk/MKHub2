import { useState, useEffect, useMemo } from 'react';
import { Megaphone, X } from 'lucide-react';
import changelogRaw from '@/content/changelog.md?raw';
import { parseChangelog, type ChangelogEntry } from '@/lib/parseChangelog';
import OverlayPortal from '@/components/OverlayPortal';
import { AppBadge, uiBorders, uiCx, uiRadius, uiShadows, uiSpacing, uiTypography } from '@/components/ui';

const STORAGE_KEY = 'mkhub_changelog_seen_id';

const SECTION_VARIANT = {
  New: 'success',
  Improved: 'info',
  Fixed: 'warning',
  'Known issues': 'danger',
} as const;

function SectionBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-3 last:mb-0">
      <AppBadge
        variant={SECTION_VARIANT[title as keyof typeof SECTION_VARIANT] ?? 'neutral'}
        className="mb-2"
      >
        {title}
      </AppBadge>
      <ul className={uiCx('list-disc space-y-1.5 pl-5', uiTypography.body)}>
        {items.map((line, idx) => (
          <li key={idx}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function ReleaseDetail({ entry }: { entry: ChangelogEntry }) {
  return (
    <div className="text-left">
      <SectionBlock title="New" items={entry.newItems} />
      <SectionBlock title="Improved" items={entry.improved} />
      <SectionBlock title="Fixed" items={entry.fixed} />
      <SectionBlock title="Known issues" items={entry.knownIssues} />
    </div>
  );
}

function formatDisplayDate(isoDate: string): string {
  const d = new Date(isoDate + (isoDate.length === 10 ? 'T12:00:00' : ''));
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ChangelogNewsPanel() {
  const [isOpen, setIsOpen] = useState(false);

  const entries = useMemo(() => parseChangelog(changelogRaw), []);

  const latestId = entries[0]?.id ?? '';

  const [seenId, setSeenId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const hasUnread = Boolean(latestId && seenId !== latestId);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const markSeen = () => {
    if (!latestId) return;
    try {
      localStorage.setItem(STORAGE_KEY, latestId);
      setSeenId(latestId);
    } catch {
      /* ignore */
    }
  };

  const openPanel = () => {
    setIsOpen(true);
    markSeen();
  };

  const featured = entries[0];
  const older = entries.slice(1);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : openPanel())}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/45 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
        title="What's new"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? 'mkhub-changelog-modal' : undefined}
      >
        <Megaphone className="h-5 w-5 text-white" aria-hidden />
        {hasUnread ? (
          <span
            className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-sky-400 ring-2 ring-gray-900/90"
            aria-label="New updates"
          />
        ) : null}
      </button>

      {isOpen ? (
        <OverlayPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm sm:p-6"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setIsOpen(false);
            }}
          >
            <div
              id="mkhub-changelog-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mkhub-changelog-modal-title"
              className={uiCx(
                'flex max-h-[min(90vh,880px)] w-full max-w-4xl flex-col overflow-hidden bg-white',
                uiRadius.modal,
                uiShadows.elevated,
              )}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <header
                className={uiCx(
                  'flex shrink-0 items-start justify-between gap-3 border-b border-gray-200',
                  uiSpacing.cardPadding,
                )}
              >
                <div className="min-w-0 space-y-1">
                  <h3 id="mkhub-changelog-modal-title" className={uiTypography.sectionTitle}>
                    What&apos;s new
                  </h3>
                  <p className={uiTypography.sectionSubtitle}>Latest product updates</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className={uiCx(
                    'inline-flex h-8 w-8 shrink-0 items-center justify-center bg-white text-gray-600 transition-colors hover:bg-gray-100',
                    uiRadius.control,
                    uiBorders.input,
                  )}
                  aria-label="Close modal"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6">
                {!featured ? (
                  <p className={uiCx('py-10 text-center', uiTypography.helper)}>No changelog entries yet.</p>
                ) : (
                  <>
                    <div className="mb-6 rounded-xl border border-brand-red/25 bg-red-50/60 p-4 sm:p-5">
                      <div className="mb-3 flex items-baseline justify-between gap-2">
                        <AppBadge className="!bg-brand-red/10 !text-brand-red">Latest</AppBadge>
                        <time className={uiTypography.helper} dateTime={featured.date}>
                          {formatDisplayDate(featured.date)}
                        </time>
                      </div>
                      {featured.title ? (
                        <h4 className={uiCx('mb-3', uiTypography.pageTitle)}>{featured.title}</h4>
                      ) : null}
                      <ReleaseDetail entry={featured} />
                    </div>

                    {older.length > 0 ? (
                      <div>
                        <div className={uiCx(uiTypography.overline, 'mb-3 text-gray-400')}>Previous updates</div>
                        <div className="space-y-2">
                          {older.map((entry) => (
                            <details
                              key={entry.id}
                              className="group rounded-xl border border-gray-200 bg-white open:bg-gray-50/90"
                            >
                              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
                                <span className="min-w-0 flex-1 truncate">
                                  {entry.title || `Update ${entry.date}`}
                                </span>
                                <span className="shrink-0 text-xs text-gray-500">{formatDisplayDate(entry.date)}</span>
                                <span className="shrink-0 text-xs text-gray-400 transition-transform group-open:rotate-180">
                                  ▼
                                </span>
                              </summary>
                              <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                                <ReleaseDetail entry={entry} />
                              </div>
                            </details>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        </OverlayPortal>
      ) : null}
    </div>
  );
}
