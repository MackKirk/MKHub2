import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { AppButton, uiCx, uiTypography } from '@/components/ui';

type Catalogs = {
  observation: { list_id: string; list_name: string };
  work_performed: { list_id: string; list_name: string };
};

type LeafOption = { value: string; label: string };

type ParsedPhrase = {
  id: string;
  roof: string;
  category: string;
  phrase: string;
  pathLabel: string;
};

type Props = {
  active?: boolean;
  disabled?: boolean;
  onInsert: (phraseText: string) => void;
  className?: string;
};

function parseLeaves(leaves: LeafOption[]): ParsedPhrase[] {
  return leaves.map((o) => {
    const parts = (o.label || '').split(' › ').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      return {
        id: o.value,
        roof: parts[0],
        category: parts[1],
        phrase: parts.slice(2).join(' › '),
        pathLabel: o.label,
      };
    }
    if (parts.length === 2) {
      return {
        id: o.value,
        roof: parts[0],
        category: 'General',
        phrase: parts[1],
        pathLabel: o.label,
      };
    }
    return {
      id: o.value,
      roof: 'Other',
      category: 'General',
      phrase: parts[0] || o.label,
      pathLabel: o.label,
    };
  });
}

export default function FieldworkPhraseLibraryPanel({
  active = true,
  disabled = false,
  onInsert,
  className,
}: Props) {
  const [entryType, setEntryType] = useState<'observation' | 'work_performed'>('observation');
  const [search, setSearch] = useState('');
  const [roof, setRoof] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: catalogs } = useQuery({
    queryKey: ['fieldworkPhraseCatalogs'],
    queryFn: () => api<Catalogs>('GET', '/fieldwork/phrase-catalogs'),
    enabled: active,
    staleTime: 60_000,
  });

  const listId =
    entryType === 'work_performed'
      ? catalogs?.work_performed?.list_id
      : catalogs?.observation?.list_id;

  const { data: listDetail, isLoading } = useQuery({
    queryKey: ['formCustomListRuntimeLeaves', listId],
    queryFn: () =>
      api<{ leaf_options?: LeafOption[] }>(
        'GET',
        `/form-custom-lists/${encodeURIComponent(listId!)}?for_runtime=true`
      ),
    enabled: active && !!listId,
    staleTime: 60_000,
  });

  const phrases = useMemo(
    () => parseLeaves(Array.isArray(listDetail?.leaf_options) ? listDetail!.leaf_options! : []),
    [listDetail?.leaf_options]
  );

  const phrasesById = useMemo(() => {
    const map = new Map<string, ParsedPhrase>();
    for (const p of phrases) map.set(p.id, p);
    return map;
  }, [phrases]);

  const tree = useMemo(() => {
    const roofs = new Map<string, Map<string, number>>();
    for (const p of phrases) {
      if (!roofs.has(p.roof)) roofs.set(p.roof, new Map());
      const cats = roofs.get(p.roof)!;
      cats.set(p.category, (cats.get(p.category) || 0) + 1);
    }
    return Array.from(roofs.entries()).map(([roofName, cats]) => ({
      roof: roofName,
      categories: Array.from(cats.entries()).map(([name, count]) => ({ name, count })),
      count: Array.from(cats.values()).reduce((a, b) => a + b, 0),
    }));
  }, [phrases]);

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;

  const visiblePhrases = useMemo(() => {
    if (searching) {
      return phrases.filter(
        (p) =>
          p.phrase.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.roof.toLowerCase().includes(q) ||
          p.pathLabel.toLowerCase().includes(q)
      );
    }
    if (roof && category) {
      return phrases.filter((p) => p.roof === roof && p.category === category);
    }
    if (roof) {
      return phrases.filter((p) => p.roof === roof);
    }
    return [];
  }, [phrases, searching, q, roof, category]);

  useEffect(() => {
    if (!active || !tree.length) return;
    if (roof && tree.some((t) => t.roof === roof)) return;
    const first = tree[0];
    setRoof(first.roof);
    setCategory(first.categories[0]?.name || null);
  }, [active, tree, roof]);

  useEffect(() => {
    if (!active) return;
    setSelectedIds([]);
    setSearch('');
    setRoof(null);
    setCategory(null);
  }, [active, entryType]);

  const toggleId = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleVisible = (selectAll: boolean) => {
    const ids = visiblePhrases.map((p) => p.id);
    setSelectedIds((prev) => {
      if (selectAll) {
        const set = new Set(prev);
        for (const id of ids) set.add(id);
        return Array.from(set);
      }
      const drop = new Set(ids);
      return prev.filter((id) => !drop.has(id));
    });
  };

  const selectedCount = selectedIds.length;
  const visibleSelectedCount = visiblePhrases.filter((p) => selectedIds.includes(p.id)).length;
  const allVisibleSelected =
    visiblePhrases.length > 0 && visibleSelectedCount === visiblePhrases.length;

  const insertSelected = () => {
    if (!selectedCount || disabled) return;
    const texts = selectedIds
      .map((id) => phrasesById.get(id)?.phrase)
      .filter((t): t is string => !!t && t.trim().length > 0);
    if (!texts.length) return;
    onInsert(texts.join('\n'));
    setSelectedIds([]);
  };

  const listTitle = searching
    ? `Search results (${visiblePhrases.length})`
    : category && roof
      ? `${roof} › ${category}`
      : roof
        ? `${roof} · all categories`
        : 'Select a category';

  return (
    <div className={uiCx('flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white', className)}>
      <div className="shrink-0 border-b border-gray-200 px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="grid grid-cols-2 gap-2 lg:w-[26rem] lg:shrink-0">
            <button
              type="button"
              className={uiCx(
                'rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
                entryType === 'observation'
                  ? 'border-brand-red bg-red-50 text-brand-red'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              )}
              onClick={() => setEntryType('observation')}
            >
              Observed Conditions
            </button>
            <button
              type="button"
              className={uiCx(
                'rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
                entryType === 'work_performed'
                  ? 'border-brand-red bg-red-50 text-brand-red'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              )}
              onClick={() => setEntryType('work_performed')}
            >
              Work Performed
            </button>
          </div>
          <label className="relative block min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by roof, category, or phrase…"
              className="w-full rounded-xl border border-gray-300 py-2 pl-10 pr-3 text-sm outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/20"
            />
          </label>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="flex max-h-[28vh] min-h-0 w-full shrink-0 flex-col border-b border-gray-200 bg-gray-50/70 md:max-h-none md:w-[20rem] md:border-b-0 md:border-r lg:w-[24rem]">
          <div className="shrink-0 border-b border-gray-200 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Categories</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {isLoading ? (
              <p className={uiCx(uiTypography.helper, 'px-2 py-3')}>Loading…</p>
            ) : tree.length === 0 ? (
              <p className={uiCx(uiTypography.helper, 'px-2 py-3')}>
                {entryType === 'work_performed'
                  ? 'No Work Performed phrases yet.'
                  : 'No phrases in this catalog yet.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {tree.map((node) => {
                  const roofActive = !searching && roof === node.roof;
                  return (
                    <li key={node.roof}>
                      <button
                        type="button"
                        className={uiCx(
                          'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold',
                          roofActive
                            ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                            : 'text-gray-800 hover:bg-white/80'
                        )}
                        onClick={() => {
                          setSearch('');
                          setRoof(node.roof);
                          setCategory(node.categories[0]?.name || null);
                        }}
                      >
                        <span className="min-w-0 truncate">{node.roof}</span>
                        <span className="shrink-0 text-xs font-medium text-gray-500">{node.count}</span>
                      </button>
                      {roofActive ? (
                        <ul className="ml-3 mt-1 space-y-0.5 border-l border-gray-200 pl-2">
                          <li>
                            <button
                              type="button"
                              className={uiCx(
                                'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm',
                                !category
                                  ? 'bg-red-50 font-semibold text-brand-red'
                                  : 'text-gray-700 hover:bg-white'
                              )}
                              onClick={() => {
                                setSearch('');
                                setCategory(null);
                              }}
                            >
                              <span>All categories</span>
                              <span className="text-xs text-gray-500">{node.count}</span>
                            </button>
                          </li>
                          {node.categories.map((cat) => {
                            const catActive = category === cat.name;
                            return (
                              <li key={cat.name}>
                                <button
                                  type="button"
                                  className={uiCx(
                                    'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm',
                                    catActive
                                      ? 'bg-red-50 font-semibold text-brand-red'
                                      : 'text-gray-700 hover:bg-white'
                                  )}
                                  onClick={() => {
                                    setSearch('');
                                    setCategory(cat.name);
                                  }}
                                >
                                  <span className="min-w-0 truncate">{cat.name}</span>
                                  <span className="shrink-0 text-xs text-gray-500">{cat.count}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-3 py-2 sm:px-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{listTitle}</p>
              <p className={uiCx(uiTypography.helper, 'mt-0.5')}>
                {visiblePhrases.length} phrase{visiblePhrases.length === 1 ? '' : 's'}
                {visibleSelectedCount ? ` · ${visibleSelectedCount} selected here` : ''}
              </p>
            </div>
            {visiblePhrases.length > 0 ? (
              <button
                type="button"
                className="shrink-0 text-sm font-semibold text-brand-red hover:underline"
                onClick={() => toggleVisible(!allVisibleSelected)}
              >
                {allVisibleSelected ? 'Clear visible' : 'Select visible'}
              </button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <p className={uiCx(uiTypography.helper, 'p-4')}>Loading phrases…</p>
            ) : !searching && !roof ? (
              <p className={uiCx(uiTypography.helper, 'p-4')}>
                Choose a category on the left to browse phrases.
              </p>
            ) : visiblePhrases.length === 0 ? (
              <p className={uiCx(uiTypography.helper, 'p-4')}>
                {searching ? `No phrases match “${search.trim()}”.` : 'No phrases in this category.'}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {visiblePhrases.map((p) => {
                  const checked = selectedIds.includes(p.id);
                  return (
                    <li key={p.id}>
                      <label
                        className={uiCx(
                          'flex cursor-pointer items-start gap-3 px-3 py-3 sm:px-4',
                          checked ? 'bg-red-50/60' : 'hover:bg-gray-50'
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-red focus:ring-brand-red/30"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleId(p.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium leading-snug text-gray-900">
                            {p.phrase}
                          </span>
                          {searching || !category ? (
                            <span className={uiCx(uiTypography.helper, 'mt-1 block')}>
                              {p.roof} › {p.category}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50/80 px-3 py-2.5 sm:px-4">
            <p className={uiCx(uiTypography.helper)}>
              {selectedCount
                ? `${selectedCount} phrase${selectedCount === 1 ? '' : 's'} selected`
                : 'Select phrases to insert into the comment'}
            </p>
            <div className="flex items-center gap-2">
              {selectedCount ? (
                <AppButton type="button" variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
                  Clear
                </AppButton>
              ) : null}
              <AppButton
                type="button"
                variant="primary"
                size="sm"
                disabled={disabled || !selectedCount}
                onClick={insertSelected}
              >
                Insert phrase{selectedCount === 1 ? '' : 's'}
                {selectedCount ? ` (${selectedCount})` : ''}
              </AppButton>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
