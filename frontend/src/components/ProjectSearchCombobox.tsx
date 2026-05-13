import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ProjectPickerItem = {
  id: string;
  name: string;
  code?: string | null;
  address?: string | null;
  address_city?: string | null;
  address_province?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
};

/** Plain-text label for closed input: "Name (CODE)" or name only. */
export function formatProjectPrimaryLine(p: ProjectPickerItem): string {
  const code = p.code?.trim();
  return code ? `${p.name} (${code})` : p.name;
}

function ProjectNameWithCode({ project: p }: { project: ProjectPickerItem }) {
  const code = p.code?.trim();
  return (
    <div className="text-gray-900">
      <span className="font-medium">{p.name}</span>
      {code ? <span className="text-xs text-gray-500 font-normal">{` (${code})`}</span> : null}
    </div>
  );
}

function formatProjectAddressLine(p: ProjectPickerItem): string {
  return [p.address, p.address_city, p.address_province, p.address_postal_code, p.address_country]
    .filter((x) => x && String(x).trim())
    .join(', ');
}

const defaultInputClass =
  'w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300';

type Props = {
  value: string;
  onChange: (projectId: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  inputClassName?: string;
  allowEmpty?: boolean;
  emptyOptionLabel?: string;
};

export function ProjectSearchCombobox({
  value,
  onChange,
  disabled,
  id,
  placeholder = 'Search by name, code, or address…',
  inputClassName = defaultInputClass,
  allowEmpty = false,
  emptyOptionLabel = 'All projects',
}: Props) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [debouncedQ, setDebouncedQ] = useState('');
  const anchorRef = useRef<HTMLDivElement>(null);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [lastPicked, setLastPicked] = useState<ProjectPickerItem | null>(null);
  const portalListId = useId();

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(text.trim()), 300);
    return () => window.clearTimeout(t);
  }, [text]);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['project-search-combobox', debouncedQ],
    queryFn: async () => {
      const qs = new URLSearchParams({ limit: '100' });
      // Opportunities (quotes) use is_bidding=true; this picker is for real jobs + leak investigations only.
      qs.set('is_bidding', 'false');
      if (debouncedQ) qs.set('q', debouncedQ);
      const result = await api<ProjectPickerItem[]>('GET', `/projects?${qs.toString()}`);
      return Array.isArray(result) ? result : [];
    },
  });

  useEffect(() => {
    if (!value) {
      setLastPicked(null);
      return;
    }
    const p = projects.find((x) => x.id === value);
    if (p) setLastPicked(p);
  }, [value, projects]);

  const displayClosed = useMemo(() => {
    if (!value) return '';
    if (lastPicked?.id === value) return formatProjectPrimaryLine(lastPicked);
    const p = projects.find((x) => x.id === value);
    return p ? formatProjectPrimaryLine(p) : '';
  }, [value, lastPicked, projects]);

  useEffect(() => {
    if (!value && !open) setText('');
  }, [value, open]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuRect(null);
      return;
    }
    const el = anchorRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setMenuRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, text, debouncedQ]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      const portal = document.getElementById(portalListId);
      if (portal?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const inputValue = open ? text : displayClosed || text;

  const dropdown =
    open && menuRect ? (
      <ul
        id={portalListId}
        role="listbox"
        className="fixed z-[100050] max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
        style={{ top: menuRect.top, left: menuRect.left, width: menuRect.width }}
      >
        {allowEmpty && (
          <li role="option">
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-600"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange('');
                setText('');
                setLastPicked(null);
                setOpen(false);
              }}
            >
              {emptyOptionLabel}
            </button>
          </li>
        )}
        {isLoading ? (
          <li className="px-3 py-2 text-sm text-gray-500">Loading…</li>
        ) : projects.length === 0 ? (
          <li className="px-3 py-2 text-sm text-amber-800">No projects match. Try another search.</li>
        ) : (
          projects.map((p) => {
            const addr = formatProjectAddressLine(p);
            return (
              <li key={p.id} role="option">
                <button
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                    value === p.id ? 'bg-gray-50 font-medium' : ''
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(p.id);
                    setLastPicked(p);
                    setText(formatProjectPrimaryLine(p));
                    setOpen(false);
                  }}
                >
                  <ProjectNameWithCode project={p} />
                  {addr ? <div className="text-xs text-gray-500 mt-0.5 truncate">{addr}</div> : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    ) : null;

  return (
    <div className="relative">
      <label htmlFor={id} className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
        {allowEmpty ? 'Project' : 'Project *'}
      </label>
      <div ref={anchorRef} className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          disabled={disabled}
          value={inputValue}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            if (value) onChange('');
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            if (value && displayClosed) setText(displayClosed);
          }}
          className={inputClassName}
        />
      </div>
      {typeof document !== 'undefined' && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
