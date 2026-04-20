import { useState, useEffect, useMemo } from 'react';
import changelogRaw from '@/content/changelog.md?raw';
import { parseChangelog, type ChangelogEntry } from '@/lib/parseChangelog';
import OverlayPortal from '@/components/OverlayPortal';

const STORAGE_KEY = 'mkhub_changelog_seen_id';

function SectionBlock({
  title,
  items,
  accentClass,
}: {
  title: string;
  items: string[];
  accentClass: string;
}) {
  if (!items.length) return null;
  return (
    <div className="mb-3 last:mb-0">
      <div className={`mb-2 text-xs font-bold uppercase tracking-wide ${accentClass}`}>{title}</div>
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-700">
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
      <SectionBlock title="New" items={entry.newItems} accentClass="text-emerald-700" />
      <SectionBlock title="Improved" items={entry.improved} accentClass="text-blue-700" />
      <SectionBlock title="Fixed" items={entry.fixed} accentClass="text-amber-800" />
      <SectionBlock title="Known issues" items={entry.knownIssues} accentClass="text-red-800" />
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
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.429z"
          />
        </svg>
        {hasUnread && (
          <span
            className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-sky-400 ring-2 ring-gray-900/90"
            aria-label="New updates"
          />
        )}
      </button>

      {isOpen && (
        <OverlayPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsOpen(false);
            }}
          >
            <div
              id="mkhub-changelog-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mkhub-changelog-modal-title"
              className="flex max-h-[min(90vh,880px)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-gray-200/90 bg-white text-gray-900 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white px-5 py-4 sm:px-6 sm:py-5">
                <div className="min-w-0">
                  <h3 id="mkhub-changelog-modal-title" className="text-lg font-semibold text-gray-900 sm:text-xl">
                    What&apos;s new
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">Latest product updates</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
                  aria-label="Close"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
                {!featured ? (
                  <p className="py-10 text-center text-sm text-gray-500">No changelog entries yet.</p>
                ) : (
                  <>
                    <div className="mb-6 rounded-xl border border-brand-red/25 bg-red-50/60 p-4 sm:p-5">
                      <div className="mb-3 flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-brand-red">Latest</span>
                        <time className="text-xs text-gray-500" dateTime={featured.date}>
                          {formatDisplayDate(featured.date)}
                        </time>
                      </div>
                      {featured.title ? (
                        <h4 className="mb-3 text-base font-semibold text-gray-900 sm:text-lg">{featured.title}</h4>
                      ) : null}
                      <ReleaseDetail entry={featured} />
                    </div>

                    {older.length > 0 ? (
                      <div>
                        <div className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">
                          Previous updates
                        </div>
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
      )}
    </div>
  );
}
