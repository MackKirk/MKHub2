import { useState, useEffect, useRef, useMemo } from 'react';
import changelogRaw from '@/content/changelog.md?raw';
import { parseChangelog, type ChangelogEntry } from '@/lib/parseChangelog';

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
      <div className={`text-[10px] font-bold uppercase tracking-wide mb-1.5 ${accentClass}`}>{title}</div>
      <ul className="list-disc pl-4 space-y-1 text-xs text-gray-700">
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
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : openPanel())}
        className="relative p-2 rounded-lg hover:bg-gray-700 transition-colors"
        title="What's new"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
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
            className="absolute top-1 right-1 w-2 h-2 bg-sky-400 rounded-full ring-2 ring-gray-700"
            aria-label="New updates"
          />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-[min(100vw-2rem,28rem)] max-h-[min(80vh,32rem)] rounded-lg border bg-white shadow-xl z-50 flex flex-col text-gray-900">
          <div className="p-4 border-b bg-gray-50 shrink-0">
            <h3 className="font-semibold text-gray-900">What&apos;s new</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">Latest product updates</p>
          </div>

          <div className="overflow-y-auto flex-1 p-4">
            {!featured ? (
              <p className="text-sm text-gray-500 text-center py-6">No changelog entries yet.</p>
            ) : (
              <>
                <div className="rounded-lg border border-brand-red/30 bg-red-50/50 p-3 mb-4">
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-red">Latest</span>
                    <time className="text-[10px] text-gray-500" dateTime={featured.date}>
                      {formatDisplayDate(featured.date)}
                    </time>
                  </div>
                  {featured.title ? (
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">{featured.title}</h4>
                  ) : null}
                  <ReleaseDetail entry={featured} />
                </div>

                {older.length > 0 ? (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">
                      Previous updates
                    </div>
                    <div className="space-y-2">
                      {older.map((entry) => (
                        <details
                          key={entry.id}
                          className="group rounded-lg border border-gray-200 bg-white open:bg-gray-50/80"
                        >
                          <summary className="cursor-pointer list-none px-3 py-2 flex items-center justify-between gap-2 text-sm font-medium text-gray-800 hover:bg-gray-50 rounded-lg [&::-webkit-details-marker]:hidden">
                            <span className="truncate min-w-0 flex-1">{entry.title || `Update ${entry.date}`}</span>
                            <span className="text-[10px] text-gray-500 shrink-0">{formatDisplayDate(entry.date)}</span>
                            <span className="text-gray-400 text-[10px] shrink-0 group-open:rotate-180 transition-transform">
                              ▼
                            </span>
                          </summary>
                          <div className="px-3 pb-3 pt-0 border-t border-transparent">
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
      )}
    </div>
  );
}
