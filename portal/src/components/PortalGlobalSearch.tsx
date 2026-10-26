import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { portalApi } from '@/lib/api';

export type PortalSearchItem = {
  type: string;
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
};

export type PortalSearchSection = {
  id: string;
  label: string;
  items: PortalSearchItem[];
};

type SearchResponse = { sections: PortalSearchSection[] };

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [delayMs, value]);
  return debounced;
}

function includesInsensitive(hay: string, needle: string) {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

function useMinWidthLg() {
  const [isLg, setIsLg] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true,
  );
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsLg(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isLg;
}

const RECENTS_KEY = 'mkhub.portal.globalSearchRecents';

export default function PortalGlobalSearch({
  placeholder = 'Search',
  limit = 10,
  getLocalSections,
  widthClassName = 'w-80',
  compactToggle = false,
  maxRecents = 8,
}: {
  placeholder?: string;
  limit?: number;
  getLocalSections?: (q: string) => PortalSearchSection[];
  widthClassName?: string;
  compactToggle?: boolean;
  maxRecents?: number;
}) {
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isLg = useMinWidthLg();

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 250);
  const [remoteSections, setRemoteSections] = useState<PortalSearchSection[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [recents, setRecents] = useState<PortalSearchItem[]>(() => {
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(Boolean)
        .map((x: Record<string, unknown>) => ({
          type: String(x.type || 'recent'),
          id: String(x.id || x.href || ''),
          title: String(x.title || ''),
          subtitle: x.subtitle != null ? String(x.subtitle) : null,
          href: String(x.href || ''),
        }))
        .filter((x: PortalSearchItem) => x.title && x.href)
        .slice(0, maxRecents);
    } catch {
      return [];
    }
  });

  const showField = !compactToggle || isLg || expanded || open;

  const collapseCompact = () => {
    setOpen(false);
    setQ('');
    if (compactToggle && !isLg) setExpanded(false);
  };

  const openSearch = () => {
    if (compactToggle && !isLg) setExpanded(true);
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isK = (e.key || '').toLowerCase() === 'k';
      if ((e.ctrlKey || e.metaKey) && isK) {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compactToggle, isLg]);

  useEffect(() => {
    if (isLg) setExpanded(false);
  }, [isLg]);

  useEffect(() => {
    const query = debouncedQ.trim();
    if (!open || query.length < 2) {
      setRemoteSections([]);
      setIsFetching(false);
      return;
    }
    let cancelled = false;
    setIsFetching(true);
    const params = new URLSearchParams();
    params.set('q', query);
    params.set('limit', String(limit));
    portalApi<SearchResponse>('GET', `/portal/hub/search?${params.toString()}`)
      .then((data) => {
        if (!cancelled) setRemoteSections(data?.sections || []);
      })
      .catch(() => {
        if (!cancelled) setRemoteSections([]);
      })
      .finally(() => {
        if (!cancelled) setIsFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, limit, open]);

  const localSections = useMemo(() => {
    try {
      const query = q.trim();
      const secs: PortalSearchSection[] = [];

      if (!query && recents.length > 0) {
        secs.push({ id: 'recents', label: 'Recent', items: recents.slice(0, maxRecents) });
        return secs;
      }

      const fromProps = getLocalSections ? getLocalSections(q) : [];
      secs.push(...(fromProps || []));

      if (!query) return secs;
      return secs
        .map((s) => ({
          ...s,
          items: s.items.filter((it) => includesInsensitive(`${it.title} ${it.subtitle || ''}`, query)),
        }))
        .filter((s) => s.items.length > 0);
    } catch {
      return [];
    }
  }, [getLocalSections, q, recents, maxRecents]);

  const sections: PortalSearchSection[] = useMemo(() => {
    if (q.trim().length >= 2) {
      return [...localSections, ...remoteSections].filter((s) => (s.items || []).length > 0);
    }
    return localSections.filter((s) => (s.items || []).length > 0);
  }, [q, localSections, remoteSections]);

  const flatItems = useMemo(() => {
    const out: PortalSearchItem[] = [];
    for (const s of sections) for (const it of s.items) out.push(it);
    return out;
  }, [sections]);

  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    itemRefs.current = [];
  }, [open, flatItems.length, debouncedQ]);

  useEffect(() => {
    if (!open) return;
    const el = itemRefs.current[activeIndex];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeIndex]);

  const doNavigate = (item: PortalSearchItem) => {
    collapseCompact();
    try {
      const next = [
        {
          type: item.type,
          id: item.id,
          title: item.title,
          subtitle: item.subtitle || null,
          href: item.href,
          ts: Date.now(),
        },
        ...recents.map((r) => ({
          type: r.type,
          id: r.id,
          title: r.title,
          subtitle: r.subtitle || null,
          href: r.href,
          ts: Date.now() - 1,
        })),
      ];
      const seen = new Set<string>();
      const deduped = next.filter((r) => {
        const key = String(r.href || '');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const trimmed = deduped.slice(0, maxRecents);
      localStorage.setItem(RECENTS_KEY, JSON.stringify(trimmed));
      setRecents(
        trimmed.map((r) => ({
          type: String(r.type),
          id: String(r.id),
          title: String(r.title),
          subtitle: r.subtitle,
          href: String(r.href),
        })),
      );
    } catch {
      /* ignore */
    }
    nav(item.href);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    const count = flatItems.length;
    if (e.key === 'Escape') {
      e.preventDefault();
      collapseCompact();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (count > 0) setActiveIndex((v) => (v + 1) % count);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (count > 0) setActiveIndex((v) => (v - 1 + count) % count);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (count === 1) {
        doNavigate(flatItems[0]);
        return;
      }
      if (count > 0) {
        const idx = Math.min(Math.max(0, activeIndex), count - 1);
        doNavigate(flatItems[idx]);
      }
    }
  };

  let globalIndex = -1;
  const nextIndex = () => {
    globalIndex += 1;
    return globalIndex;
  };

  if (!showField) {
    return (
      <div className={`relative ${widthClassName}`}>
        <button
          type="button"
          onClick={openSearch}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-gray-900/45 text-gray-300 shadow-inner transition-colors hover:bg-gray-900/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
          aria-label="Open search"
          title="Search (Ctrl+K)"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className={`relative ${widthClassName}`}>
      {open && (
        <button className="fixed inset-0 z-40 cursor-default" aria-label="Close search" onClick={collapseCompact} />
      )}

      <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2">
        <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKeyDown}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-white/10 bg-gray-900/45 py-0 pl-10 pr-3 text-sm text-gray-100 placeholder-gray-400 shadow-inner transition-all duration-200 focus:border-brand-red/50 focus:bg-gray-900/60 focus:outline-none focus:ring-2 focus:ring-brand-red/40"
      />

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-gray-200/20 bg-white shadow-2xl">
          <div className="max-h-[60vh] overflow-auto">
            {isFetching && q.trim().length >= 2 && (
              <div className="border-b bg-gray-50 px-4 py-3 text-sm text-gray-600">Searching…</div>
            )}

            {sections.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-600">
                {q.trim().length < 2 ? 'Type at least 2 characters to search.' : 'No results.'}
              </div>
            ) : (
              <div className="py-2">
                {sections.map((section) => (
                  <div key={section.id} className="mb-2 last:mb-0">
                    <div className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
                      {section.label}
                    </div>
                    <div className="px-2">
                      {section.items.map((item) => {
                        const idx = nextIndex();
                        const active = idx === activeIndex;
                        return (
                          <button
                            key={`${section.id}:${item.type}:${item.id}`}
                            ref={(el) => {
                              itemRefs.current[idx] = el;
                            }}
                            type="button"
                            onMouseEnter={() => setActiveIndex(idx)}
                            onClick={() => doNavigate(item)}
                            className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                              active ? 'bg-brand-red/10' : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div
                                  className={`truncate text-sm font-semibold ${
                                    active ? 'text-gray-900' : 'text-gray-800'
                                  }`}
                                >
                                  {item.title}
                                </div>
                                {item.subtitle ? (
                                  <div className="truncate text-sm text-gray-600">{item.subtitle}</div>
                                ) : null}
                              </div>
                              <div className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
                                {item.type}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t bg-gray-50 px-4 py-2 text-xs text-gray-600">
            <span>Ctrl+K to focus</span>
            <span>↑ ↓ Enter Esc</span>
          </div>
        </div>
      )}
    </div>
  );
}
