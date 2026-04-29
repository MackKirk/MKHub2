import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFixedPortalDropdownPosition } from '@/hooks/useFixedPortalDropdownPosition';
import { getOverlayRoot } from '@/lib/overlayRoot';

export type SingleSelectRow = { value: string; label: string };

type Props = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** When true, the label is not rendered (caller provides the heading row). */
  hideLabel?: boolean;
  rows: SingleSelectRow[];
  searchPlaceholder?: string;
  /** Shown when no value is selected (trigger and clear row). */
  emptyLabel?: string;
  /** Portal panel z-index (stacking vs siblings inside `#overlay-root`). Default 5000 — above typical modal shells (z-50). */
  portalZIndex?: number;
};

export default function SafetySearchableSingle({
  label,
  value,
  onChange,
  disabled,
  hideLabel,
  rows,
  searchPlaceholder = 'Search…',
  emptyLabel = 'Select One',
  portalZIndex = 5000,
}: Props) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fixedPanelStyle = useFixedPortalDropdownPosition(open && !disabled, anchorRef, {
    maxHeightPx: 288,
    zIndex: portalZIndex,
  });

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })),
    [rows]
  );

  const labelFor = (v: string) => sortedRows.find((r) => r.value === v)?.label ?? v;
  const summary = !value.trim() ? emptyLabel : labelFor(value);

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      return;
    }
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

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

  /** Close panel whenever the controlled value updates (selection committed). */
  useEffect(() => {
    setOpen(false);
  }, [value]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedRows;
    return sortedRows.filter((r) => r.label.toLowerCase().includes(q) || r.value.toLowerCase().includes(q));
  }, [sortedRows, searchQuery]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const pickOnMouseDown = (v: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    pick(v);
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
          <div
            ref={panelRef}
            style={fixedPanelStyle}
            className="flex flex-col rounded-xl border-2 border-gray-200 bg-white shadow-lg overflow-hidden min-h-0"
            role="listbox"
          >
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
            <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-gray-100">
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
                onMouseDown={pickOnMouseDown('')}
              >
                {emptyLabel}
              </button>
              {sortedRows.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">No options</div>
              ) : filteredRows.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
              ) : (
                filteredRows.map((row) => (
                  <button
                    key={row.value}
                    type="button"
                    role="option"
                    aria-selected={value === row.value}
                    onMouseDown={pickOnMouseDown(row.value)}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                      value === row.value ? 'bg-blue-50 text-blue-900 font-medium' : 'text-gray-800'
                    }`}
                  >
                    {row.label}
                  </button>
                ))
              )}
            </div>
          </div>,
          getOverlayRoot()
        )}
    </div>
  );
}
