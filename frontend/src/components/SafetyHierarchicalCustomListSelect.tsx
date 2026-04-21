import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useFixedPortalDropdownPosition } from '@/hooks/useFixedPortalDropdownPosition';
import { type FormCustomListTreeNode, getChildrenAtPath } from '@/utils/customListTree';

const SEP = ' › ';

type LeafRow = { value: string; label: string };

function breadcrumbTrail(roots: FormCustomListTreeNode[], pathIds: string[]): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  let cur = roots;
  for (const id of pathIds) {
    const n = cur.find((x) => x.id === id);
    if (!n) break;
    out.push({ id: n.id, name: n.name || '' });
    cur = n.children ?? [];
  }
  return out;
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function useCloseOnOutsideAndEscape(
  open: boolean,
  setOpen: (v: boolean) => void,
  rootRef: RefObject<HTMLDivElement | null>,
  panelRef?: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (panelRef?.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, setOpen, rootRef, panelRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);
}

type PanelChromeProps = {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  pathIds: string[];
  setPathIds: (p: string[]) => void;
  items: FormCustomListTreeNode[];
  children: ReactNode;
  footer?: ReactNode;
  panelRef: RefObject<HTMLDivElement | null>;
  fixedOverlayStyle: CSSProperties;
};

function PickerPanel({
  searchQuery,
  setSearchQuery,
  searchInputRef,
  pathIds,
  setPathIds,
  items,
  children,
  footer,
  panelRef,
  fixedOverlayStyle,
}: PanelChromeProps) {
  const trail = breadcrumbTrail(items, pathIds);
  const showSearch = true;

  return (
    <div
      ref={panelRef}
      style={fixedOverlayStyle}
      className="fixed flex flex-col rounded-xl border-2 border-gray-200 bg-white shadow-lg overflow-hidden min-h-0"
      role="dialog"
      aria-label="Custom list picker"
    >
      {showSearch && (
        <div className="shrink-0 border-b border-gray-100 p-2 bg-gray-50/80">
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full min-h-[2.5rem] px-3 py-2 text-sm border-2 border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {!searchQuery.trim() && (
        <div className="shrink-0 flex flex-wrap items-center gap-1 px-2 py-2 border-b border-gray-100 text-xs text-gray-600 bg-white">
          <button
            type="button"
            className={`rounded-lg px-2 py-1 font-medium ${pathIds.length === 0 ? 'bg-gray-100 text-gray-900' : 'hover:bg-gray-50'}`}
            onClick={() => setPathIds([])}
          >
            Top
          </button>
          {trail.map((seg, i) => (
            <span key={seg.id} className="flex items-center gap-1 min-w-0">
              <span className="text-gray-300" aria-hidden>
                {SEP}
              </span>
              <button
                type="button"
                className={`truncate max-w-[10rem] rounded-lg px-2 py-1 font-medium ${
                  i === trail.length - 1 ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50'
                }`}
                title={seg.name}
                onClick={() => setPathIds(pathIds.slice(0, i + 1))}
              >
                {seg.name || '—'}
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-gray-100">{children}</div>
      {footer && <div className="shrink-0 border-t border-gray-100 p-2 bg-gray-50/80 flex flex-wrap gap-2 justify-end">{footer}</div>}
    </div>
  );
}

type SingleProps = {
  label: string;
  hideLabel?: boolean;
  items: FormCustomListTreeNode[];
  leafOptions: LeafRow[];
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** When no leaf is selected (trigger and clear row). */
  emptyLabel?: string;
};

export function SafetyHierarchicalCustomListSingle({
  label,
  hideLabel,
  items,
  leafOptions,
  value,
  onChange,
  disabled,
  emptyLabel = 'Select One',
}: SingleProps) {
  const [open, setOpen] = useState(false);
  const [pathIds, setPathIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fixedPanelStyle = useFixedPortalDropdownPosition(open && !disabled, anchorRef, {
    maxHeightPx: 384,
    viewportMaxFraction: 0.7,
  });

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of leafOptions) m.set(r.value, r.label);
    return m;
  }, [leafOptions]);

  const summary = !value.trim() ? emptyLabel : labelById.get(value) ?? value;

  useCloseOnOutsideAndEscape(open, setOpen, rootRef, panelRef);

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setPathIds([]);
      return;
    }
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const levelNodes = useMemo(() => getChildrenAtPath(items, pathIds), [items, pathIds]);

  const searchHits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return leafOptions.filter(
      (r) => r.label.toLowerCase().includes(q) || r.value.toLowerCase().includes(q)
    );
  }, [leafOptions, searchQuery]);

  const pickLeaf = useCallback(
    (id: string) => {
      onChange(id);
      setOpen(false);
      setPathIds([]);
      setSearchQuery('');
    },
    [onChange]
  );

  const clearSingle = useCallback(() => {
    onChange('');
    setOpen(false);
    setPathIds([]);
    setSearchQuery('');
  }, [onChange]);

  return (
    <div ref={rootRef} className="relative">
      {!hideLabel && <label className="block text-sm font-medium text-gray-600 mb-2">{label}</label>}
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => !disabled && setOpen((o) => !o)}
        className="w-full min-h-[2.75rem] flex items-center justify-between gap-2 px-3 py-2 border-2 border-gray-200 rounded-xl text-sm text-left bg-white text-gray-900 disabled:bg-gray-50 disabled:cursor-not-allowed hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
      >
        <span className={`truncate min-w-0 ${!value.trim() ? 'text-gray-500' : 'text-gray-900'}`}>{summary}</span>
        <svg
          className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open &&
        !disabled &&
        fixedPanelStyle != null &&
        createPortal(
          <PickerPanel
            panelRef={panelRef}
            fixedOverlayStyle={fixedPanelStyle}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchInputRef={searchInputRef}
            pathIds={pathIds}
            setPathIds={setPathIds}
            items={items}
          >
          {searchQuery.trim() ? (
            searchHits.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
            ) : (
              searchHits.map((row) => (
                <button
                  key={row.value}
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 text-gray-800"
                  onClick={() => pickLeaf(row.value)}
                >
                  {row.label}
                </button>
              ))
            )
          ) : (
            <>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
                onClick={clearSingle}
              >
                {emptyLabel}
              </button>
              {levelNodes.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">No items</div>
              ) : (
                levelNodes.map((node) => {
                  const subs = node.children ?? [];
                  const isBranch = subs.length > 0;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => {
                        if (isBranch) setPathIds([...pathIds, node.id]);
                        else pickLeaf(node.id);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between gap-2 hover:bg-gray-50 ${
                        isBranch ? 'text-gray-800' : 'text-gray-900 font-medium'
                      }`}
                    >
                      <span className="min-w-0 truncate">{node.name || '—'}</span>
                      {isBranch ? <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" /> : null}
                    </button>
                  );
                })
              )}
            </>
          )}
        </PickerPanel>,
          document.body
        )}
    </div>
  );
}

type MultiProps = {
  label: string;
  hideLabel?: boolean;
  items: FormCustomListTreeNode[];
  leafOptions: LeafRow[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** When the trigger shows no selection summary yet. */
  emptyLabel?: string;
};

export function SafetyHierarchicalCustomListMulti({
  label,
  hideLabel,
  items,
  leafOptions,
  value,
  onChange,
  disabled,
  emptyLabel = 'Select Multiple',
}: MultiProps) {
  const [open, setOpen] = useState(false);
  const [pathIds, setPathIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fixedPanelStyle = useFixedPortalDropdownPosition(open && !disabled, anchorRef, {
    maxHeightPx: 384,
    viewportMaxFraction: 0.7,
  });

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of leafOptions) m.set(r.value, r.label);
    return m;
  }, [leafOptions]);

  /** After each leaf pick (or when opening), back to Top + empty search so the next pick is quick. */
  const resetPickerNavigation = useCallback(() => {
    setPathIds([]);
    setSearchQuery('');
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
    resetPickerNavigation();
  }, [resetPickerNavigation]);

  useEffect(() => {
    if (!open) {
      resetPickerNavigation();
      return;
    }
    resetPickerNavigation();
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, resetPickerNavigation]);

  const levelNodes = useMemo(() => getChildrenAtPath(items, pathIds), [items, pathIds]);

  const searchHits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return leafOptions.filter(
      (r) => r.label.toLowerCase().includes(q) || r.value.toLowerCase().includes(q)
    );
  }, [leafOptions, searchQuery]);

  const pickLeaf = useCallback(
    (id: string) => {
      if (!value.includes(id)) {
        onChange([...value, id]);
      }
      resetPickerNavigation();
    },
    [onChange, value, resetPickerNavigation]
  );

  const removeCommitted = useCallback(
    (id: string) => {
      onChange(value.filter((x) => x !== id));
    },
    [onChange, value]
  );

  const summary =
    value.length === 0
      ? emptyLabel
      : value.length === 1
        ? labelById.get(value[0]) ?? value[0]
        : `${value.length} selected`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      closePanel();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, closePanel]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closePanel]);

  return (
    <div ref={rootRef} className="relative space-y-2">
      {!hideLabel && <label className="block text-sm font-medium text-gray-600 mb-2">{label}</label>}
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => !disabled && setOpen((o) => !o)}
        className="w-full min-h-[2.75rem] flex items-center justify-between gap-2 px-3 py-2 border-2 border-gray-200 rounded-xl text-sm text-left bg-white text-gray-900 disabled:bg-gray-50 disabled:cursor-not-allowed hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
      >
        <span className={`truncate min-w-0 ${value.length === 0 ? 'text-gray-500' : 'text-gray-900'}`}>{summary}</span>
        <svg
          className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {value.length >= 2 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 max-w-full pl-2 pr-1 py-1 rounded-lg bg-gray-100 border border-gray-200 text-xs text-gray-800"
            >
              <span className="truncate min-w-0" title={labelById.get(id)}>
                {labelById.get(id) ?? id}
              </span>
              {!disabled && (
                <button
                  type="button"
                  aria-label="Remove"
                  className="shrink-0 p-0.5 rounded hover:bg-gray-200 text-gray-600"
                  onClick={() => removeCommitted(id)}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {open &&
        !disabled &&
        fixedPanelStyle != null &&
        createPortal(
          <PickerPanel
            panelRef={panelRef}
            fixedOverlayStyle={fixedPanelStyle}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchInputRef={searchInputRef}
            pathIds={pathIds}
            setPathIds={setPathIds}
            items={items}
          >
            {value.length > 0 && (
              <div className="px-2 py-2 bg-blue-50/60 border-b border-blue-100 shrink-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-800 mb-1">Selected</div>
                <div className="flex flex-wrap gap-1.5">
                  {value.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 max-w-full pl-2 pr-1 py-0.5 rounded-md bg-white border border-blue-200 text-xs text-gray-800"
                    >
                      <span className="truncate min-w-0 max-w-[14rem]" title={labelById.get(id)}>
                        {labelById.get(id) ?? id}
                      </span>
                      <button
                        type="button"
                        aria-label="Remove from selection"
                        className="shrink-0 p-0.5 rounded hover:bg-gray-100 text-gray-600"
                        onClick={() => onChange(value.filter((x) => x !== id))}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {searchQuery.trim() ? (
              searchHits.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
              ) : (
                searchHits.map((row) => (
                  <button
                    key={row.value}
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 text-gray-800 flex items-center justify-between gap-2"
                    onClick={() => pickLeaf(row.value)}
                  >
                    <span className="min-w-0 truncate">{row.label}</span>
                    {value.includes(row.value) ? (
                      <span className="text-[10px] font-medium text-blue-700 shrink-0">Selected</span>
                    ) : null}
                  </button>
                ))
              )
            ) : (
              <>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
                  onClick={() => {
                    onChange([]);
                    resetPickerNavigation();
                  }}
                >
                  Clear all selections
                </button>
                {levelNodes.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">No items</div>
                ) : (
                  levelNodes.map((node) => {
                    const subs = node.children ?? [];
                    const isBranch = subs.length > 0;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => {
                          if (isBranch) setPathIds([...pathIds, node.id]);
                          else pickLeaf(node.id);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between gap-2 hover:bg-gray-50 ${
                          isBranch ? 'text-gray-800' : 'text-gray-900 font-medium'
                        }`}
                      >
                        <span className="min-w-0 truncate">{node.name || '—'}</span>
                        {isBranch ? (
                          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                        ) : value.includes(node.id) ? (
                          <span className="text-[10px] font-medium text-blue-700 shrink-0">Selected</span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </>
            )}
          </PickerPanel>,
          document.body
        )}
    </div>
  );
}
