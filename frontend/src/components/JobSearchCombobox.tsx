import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PREDEFINED_JOBS, formatJobPickerLine, isPredefinedJobId } from '@/constants/predefinedJobs';
import { sortByLabel } from '@/lib/sortOptions';
import type { ProjectPickerItem } from '@/components/ProjectSearchCombobox';
import { formatProjectAddressLine } from '@/components/ProjectSearchCombobox';

export type JobPickerItem = {
  id: string;
  name: string;
  code?: string | null;
  kind: 'predefined' | 'project';
  address?: string | null;
  address_city?: string | null;
  address_province?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
};

function JobNameWithCode({ job }: { job: JobPickerItem }) {
  const code = job.code?.trim();
  return (
    <div className="text-gray-900">
      <span className="font-medium">{job.name}</span>
      {code ? <span className="text-xs font-normal text-gray-500">{` (${code})`}</span> : null}
    </div>
  );
}

const defaultInputClass =
  'w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300';

type Props = {
  value: string;
  onChange: (jobId: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  inputClassName?: string;
  label?: string;
};

export function JobSearchCombobox({
  value,
  onChange,
  disabled,
  id,
  placeholder = 'Search by name, code, or address…',
  inputClassName = defaultInputClass,
  label = 'Job *',
}: Props) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [debouncedQ, setDebouncedQ] = useState('');
  const anchorRef = useRef<HTMLDivElement>(null);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [lastPicked, setLastPicked] = useState<JobPickerItem | null>(null);
  const portalListId = useId();

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(text.trim()), 300);
    return () => window.clearTimeout(t);
  }, [text]);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['job-search-combobox-projects', debouncedQ],
    queryFn: async () => {
      const qs = new URLSearchParams({ limit: '100', is_bidding: 'false' });
      if (debouncedQ) qs.set('q', debouncedQ);
      const result = await api<ProjectPickerItem[]>('GET', `/projects?${qs.toString()}`);
      return Array.isArray(result) ? result : [];
    },
  });

  const { data: valueProject } = useQuery({
    queryKey: ['job-search-combobox-value-project', value],
    queryFn: () => api<ProjectPickerItem>('GET', `/projects/${value}`),
    enabled: !!value && !isPredefinedJobId(value),
  });

  const staticJobs = useMemo((): JobPickerItem[] => {
    const q = debouncedQ.toLowerCase();
    const filtered = PREDEFINED_JOBS.filter((j) => {
      if (!q) return true;
      return (
        j.name.toLowerCase().includes(q) ||
        j.code.toLowerCase().includes(q) ||
        formatJobPickerLine(j).toLowerCase().includes(q)
      );
    });
    return sortByLabel(
      filtered.map((j) => ({
        id: j.id,
        name: j.name,
        code: j.code,
        kind: 'predefined' as const,
      })),
      (j) => j.name,
    );
  }, [debouncedQ]);

  const projectJobs = useMemo((): JobPickerItem[] => {
    return sortByLabel(
      projects.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        kind: 'project' as const,
        address: p.address,
        address_city: p.address_city,
        address_province: p.address_province,
        address_postal_code: p.address_postal_code,
        address_country: p.address_country,
      })),
      (j) => j.name,
    );
  }, [projects]);

  const combinedOptions = useMemo(() => [...staticJobs, ...projectJobs], [staticJobs, projectJobs]);

  useEffect(() => {
    if (!value) {
      setLastPicked(null);
      return;
    }
    const fromList = combinedOptions.find((x) => x.id === value);
    if (fromList) {
      setLastPicked(fromList);
      return;
    }
    const pre = PREDEFINED_JOBS.find((j) => j.id === value);
    if (pre) {
      setLastPicked({ id: pre.id, name: pre.name, code: pre.code, kind: 'predefined' });
      return;
    }
    if (valueProject) {
      setLastPicked({
        id: valueProject.id,
        name: valueProject.name,
        code: valueProject.code,
        kind: 'project',
        address: valueProject.address,
        address_city: valueProject.address_city,
        address_province: valueProject.address_province,
        address_postal_code: valueProject.address_postal_code,
        address_country: valueProject.address_country,
      });
    }
  }, [value, combinedOptions, valueProject]);

  const displayClosed = useMemo(() => {
    if (!value) return '';
    if (lastPicked?.id === value) return formatJobPickerLine(lastPicked);
    const pre = PREDEFINED_JOBS.find((j) => j.id === value);
    if (pre) return formatJobPickerLine(pre);
    if (valueProject) return formatJobPickerLine(valueProject);
    return '';
  }, [value, lastPicked, valueProject]);

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
  }, [open, portalListId]);

  const inputValue = open ? text : displayClosed || text;

  const dropdown =
    open && menuRect ? (
      <ul
        id={portalListId}
        role="listbox"
        className="fixed z-[100050] max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
        style={{ top: menuRect.top, left: menuRect.left, width: menuRect.width }}
      >
        {isLoading && combinedOptions.length === 0 ? (
          <li className="px-3 py-2 text-sm text-gray-500">Loading…</li>
        ) : combinedOptions.length === 0 ? (
          <li className="px-3 py-2 text-sm text-amber-800">No jobs match. Try another search.</li>
        ) : (
          combinedOptions.map((job) => {
            const addr = job.kind === 'project' ? formatProjectAddressLine(job) : '';
            return (
              <li key={`${job.kind}-${job.id}`} role="option">
                <button
                  type="button"
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                    value === job.id ? 'bg-gray-50 font-medium' : ''
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(job.id);
                    setLastPicked(job);
                    setText(formatJobPickerLine(job));
                    setOpen(false);
                  }}
                >
                  <JobNameWithCode job={job} />
                  {addr ? <div className="mt-0.5 truncate text-xs text-gray-500">{addr}</div> : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    ) : null;

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </label>
      <div ref={anchorRef} className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400"
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
