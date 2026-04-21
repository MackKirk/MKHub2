import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFixedPortalDropdownPosition } from '@/hooks/useFixedPortalDropdownPosition';

export type MultiSelectRow = { value: string; label: string };

type Props = {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** When true, the label is not rendered (caller provides the heading row). */
  hideLabel?: boolean;
  /** Options where value and display text are the same (form template multi-select). */
  options?: string[];
  /** Options with separate id and label (workers, fleet, etc.). Takes precedence over `options` when non-empty. */
  rows?: MultiSelectRow[];
  /** When true with `rows`, keep caller order (e.g. custom list hierarchy order). */
  preserveOrder?: boolean;
  /** Search field at the top of the dropdown panel. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Shown on the trigger when nothing is selected. */
  emptyLabel?: string;
  /** First row in the panel to clear all selections. */
  clearSelectionLabel?: string;
};

function normalizeRows(options: string[] | undefined, rows: MultiSelectRow[] | undefined): MultiSelectRow[] {
  if (rows && rows.length > 0) return rows;
  return (options ?? []).map((o) => ({ value: o, label: o }));
}

export default function SafetyDropdownMulti({
  label,
  value,
  onChange,
  disabled,
  hideLabel,
  options,
  rows,
  preserveOrder,
  searchable,
  searchPlaceholder = 'Search…',
  emptyLabel = 'Select Multiple',
  clearSelectionLabel = 'Clear selection',
}: Props) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fixedPanelStyle = useFixedPortalDropdownPosition(open && !disabled, anchorRef, { maxHeightPx: 288 });

  const normalizedRows = useMemo(() => {
    const raw = normalizeRows(options, rows);
    if (preserveOrder && rows && rows.length > 0) return raw;
    return [...raw].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [options, rows, preserveOrder]);

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      return;
    }
    if (searchable && searchInputRef.current) {
      const t = window.setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const labelFor = (v: string) => normalizedRows.find((r) => r.value === v)?.label ?? v;

  const summary =
    value.length === 0
      ? emptyLabel
      : value.length === 1
        ? labelFor(value[0])
        : value.length <= 2
          ? value.map(labelFor).join(', ')
          : `${value.length} selected`;

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return normalizedRows;
    return normalizedRows.filter(
      (r) => r.label.toLowerCase().includes(q) || r.value.toLowerCase().includes(q)
    );
  }, [normalizedRows, searchQuery]);

  const toggle = (val: string) => {
    if (disabled) return;
    const has = value.includes(val);
    onChange(has ? value.filter((x) => x !== val) : [...value, val]);
  };

  return (
    <div ref={rootRef} className="relative">
      {!hideLabel && (
        <label className="block text-sm font-medium text-gray-600 mb-2">{label}</label>
      )}
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
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

      {open &&
        !disabled &&
        fixedPanelStyle != null &&
        createPortal(
          <div
            ref={panelRef}
            style={fixedPanelStyle}
            className="flex flex-col rounded-xl border-2 border-gray-200 bg-white shadow-lg overflow-hidden min-h-0"
            role="listbox"
            aria-multiselectable="true"
          >
            {searchable && (
              <div className="shrink-0 border-b border-gray-100 p-2 bg-gray-50/80">
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full min-h-[2.5rem] px-3 py-2 text-sm border-2 border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-gray-100">
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50 shrink-0"
                onClick={() => {
                  onChange([]);
                }}
              >
                {clearSelectionLabel}
              </button>
              {normalizedRows.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">No options</div>
              ) : filteredRows.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
              ) : (
                filteredRows.map((row) => (
                  <label
                    key={row.value}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={value.includes(row.value)}
                      onChange={() => toggle(row.value)}
                      className="h-4 w-4 shrink-0 rounded-md border-2 border-gray-300 text-red-600 focus:ring-brand-red/30"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="min-w-0">{row.label}</span>
                  </label>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
