import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type GlobalSearchItem = {
  type: string;
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
};

export type GlobalSearchSection = {
  id: string;
  label: string;
  items: GlobalSearchItem[];
};

type GlobalSearchResponse = { sections: GlobalSearchSection[] };

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function includesInsensitive(hay: string, needle: string) {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

export default function GlobalSearch({
  placeholder = 'Search',
  limit = 10,
  getLocalSections,
  onNavigate,
  recentsKey = 'mkhub.globalSearchRecents',
  maxRecents = 8,
  isItemAllowed,
  widthClassName = 'w-80',
}: {
  placeholder?: string;
  limit?: number;
  getLocalSections?: (q: string) => GlobalSearchSection[];
  onNavigate?: (item: GlobalSearchItem) => void;
  recentsKey?: string;
  maxRecents?: number;
  isItemAllowed?: (item: GlobalSearchItem) => boolean;
  widthClassName?: string;
}) {
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 250);
  const [recents, setRecents] = useState<GlobalSearchItem[]>(() => {
    try {
      const raw = localStorage.getItem(recentsKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(Boolean)
        .map((x: any) => ({
          type: String(x.type || 'recent'),
          id: String(x.id || x.href || ''),
          title: String(x.title || ''),
          subtitle: x.subtitle != null ? String(x.subtitle) : null,
          href: String(x.href || ''),
        }))
        .filter((x: GlobalSearchItem) => x.title && x.href)
        .slice(0, maxRecents);
    } catch {
      return [];
    }
  });

  // If key/max changes (unlikely), re-read.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(recentsKey);
      if (!raw) {
        setRecents([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setRecents([]);
        return;
      }
      const next = parsed
        .filter(Boolean)
        .map((x: any) => ({
          type: String(x.type || 'recent'),
          id: String(x.id || x.href || ''),
          title: String(x.title || ''),
          subtitle: x.subtitle != null ? String(x.subtitle) : null,
          href: String(x.href || ''),
        }))
        .filter((x: GlobalSearchItem) => x.title && x.href)
        .slice(0, maxRecents);
      setRecents(next);
    } catch {
      setRecents([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentsKey, maxRecents]);

  // Ctrl+K focuses the search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isK = (e.key || '').toLowerCase() === 'k';
      if ((e.ctrlKey || e.metaKey) && isK) {
        e.preventDefault();
        setOpen(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const shouldSearchRemote = open && debouncedQ.trim().length >= 2;
  const { data, isFetching } = useQuery({
    queryKey: ['global-search', debouncedQ.trim(), limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('q', debouncedQ.trim());
      params.set('limit', String(limit));
      return await api<GlobalSearchResponse>('GET', `/search?${params.toString()}`);
    },
    enabled: shouldSearchRemote,
    staleTime: 15_000,
  });

  const localSections = useMemo(() => {
    try {
      const query = q.trim();
      const secs: GlobalSearchSection[] = [];

      // Recent items when empty
      if (!query && recents.length > 0) {
        const allowedRecents = (isItemAllowed ? recents.filter(isItemAllowed) : recents).slice(0, maxRecents);
        if (allowedRecents.length > 0) {
          secs.push({ id: 'recents', label: 'Recent', items: allowedRecents });
        }
        // When empty, show ONLY recents (no pages/etc.)
        return secs;
      }

      // Pages / local sources
      const fromProps = getLocalSections ? getLocalSections(q) : [];
      secs.push(...(fromProps || []));

      // Always apply a basic filter here as a safety net
      if (!query) return secs;
      return secs
        .map((s) => ({
          ...s,
          items: s.items
            .filter((it) => includesInsensitive(`${it.title} ${it.subtitle || ''}`, query))
            .filter((it) => (isItemAllowed ? isItemAllowed(it) : true)),
        }))
        .filter((s) => s.items.length > 0);
    } catch {
      return [];
    }
  }, [getLocalSections, q, recents, isItemAllowed, maxRecents]);

  const remoteSections = (data?.sections || [])
    .map((s) => ({
      ...s,
      items: (s.items || []).filter((it) => (isItemAllowed ? isItemAllowed(it) : true)),
    }))
    .filter((s) => (s.items || []).length > 0);

  const sections: GlobalSearchSection[] = useMemo(() => {
    if (q.trim().length >= 2) {
      // Show local + remote together when searching
      const all = [...localSections, ...remoteSections];
      return all.filter((s) => (s.items || []).length > 0);
    }
    // When empty or too short, only local sections (pages/recents will be added later)
    return localSections.filter((s) => (s.items || []).length > 0);
  }, [q, localSections, remoteSections]);

  const flatItems = useMemo(() => {
    const out: GlobalSearchItem[] = [];
    for (const s of sections) for (const it of s.items) out.push(it);
    return out;
  }, [sections]);

  const [activeIndex, setActiveIndex] = useState<number>(0);

  // Reset selection when results change
  useEffect(() => {
    if (!open) return;
    if (flatItems.length === 0) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex(0);
    // reset refs
    itemRefs.current = [];
  }, [open, flatItems.length, debouncedQ]);

  // Keep highlighted item in view
  useEffect(() => {
    if (!open) return;
    const el = itemRefs.current[activeIndex];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeIndex]);

  const doNavigate = (item: GlobalSearchItem) => {
    setOpen(false);
    setQ('');
    try {
      const next = [
        { type: item.type, id: item.id, title: item.title, subtitle: item.subtitle || null, href: item.href, ts: Date.now() },
        ...recents.map((r) => ({ type: r.type, id: r.id, title: r.title, subtitle: r.subtitle || null, href: r.href, ts: Date.now() - 1 })),
      ];
      const seen = new Set<string>();
      const deduped = next.filter((r) => {
        const key = String(r.href || '');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const trimmed = deduped.slice(0, maxRecents);
      localStorage.setItem(recentsKey, JSON.stringify(trimmed));
      setRecents(trimmed.map((r) => ({ type: String(r.type), id: String(r.id), title: String(r.title), subtitle: r.subtitle, href: String(r.href) })));
    } catch {
      // ignore
    }
    onNavigate?.(item);
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
      setOpen(false);
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

  // Render helpers
  let globalIndex = -1;
  const nextIndex = () => {
    globalIndex += 1;
    return globalIndex;
  };

  return (
    <div className={`relative ${widthClassName}`}>
      {open && (
        <button
          className="fixed inset-0 z-40 cursor-default"
          aria-label="Close search"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
        <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
        className="w-full rounded-lg pl-10 pr-3 py-2 text-sm bg-gray-800/80 border border-gray-600/50 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 focus:bg-gray-800 transition-all duration-200"
      />

      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-xl border border-gray-200/20 bg-white shadow-2xl overflow-hidden">
          <div className="max-h-[60vh] overflow-auto">
            {isFetching && q.trim().length >= 2 && (
              <div className="px-4 py-3 text-xs text-gray-500 border-b bg-gray-50">
                Searching…
              </div>
            )}

            {sections.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-500">
                {q.trim().length < 2 ? 'Type at least 2 characters to search.' : 'No results.'}
              </div>
            ) : (
              <div className="py-2">
                {sections.map((section) => (
                  <div key={section.id} className="mb-2 last:mb-0">
                    <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
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
                            className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                              active ? 'bg-brand-red/10' : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className={`text-sm font-medium truncate ${active ? 'text-gray-900' : 'text-gray-800'}`}>
                                  {item.title}
                                </div>
                                {item.subtitle ? (
                                  <div className="text-xs text-gray-500 truncate">{item.subtitle}</div>
                                ) : null}
                              </div>
                              <div className="text-[10px] px-2 py-1 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
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
          <div className="px-4 py-2 text-[11px] text-gray-500 border-t bg-gray-50 flex items-center justify-between">
            <span>Ctrl+K to focus</span>
            <span>↑ ↓ Enter Esc</span>
          </div>
        </div>
      )}
    </div>
  );
}

