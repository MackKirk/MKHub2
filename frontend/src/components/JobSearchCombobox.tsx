import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PREDEFINED_JOBS, formatJobPickerLine, isPredefinedJobId } from '@/constants/predefinedJobs';
import { sortByLabel } from '@/lib/sortOptions';
import { formatProjectAddressLine, type ProjectPickerItem } from '@/components/ui/projectPickerUtils';
import { AppControlLabelRow, AppFieldHint, uiCx, uiDropdown, useComboboxDropdown } from '@/components/ui';

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

function JobNameWithCode({ job, selected }: { job: JobPickerItem; selected?: boolean }) {
  const code = job.code?.trim();
  return (
    <div className="text-xs text-gray-900">
      <span className={selected ? 'font-medium' : undefined}>{job.name}</span>
      {code ? <span className="font-normal text-gray-500">{` (${code})`}</span> : null}
    </div>
  );
}

type Props = {
  value: string;
  onChange: (jobId: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  inputClassName?: string;
  label?: string;
  fieldHint?: ReactNode;
};

export function JobSearchCombobox({
  value,
  onChange,
  disabled,
  id,
  placeholder = 'Search by name, code, or address…',
  inputClassName,
  label = 'Job *',
  fieldHint,
}: Props) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [lastPicked, setLastPicked] = useState<JobPickerItem | null>(null);
  const { anchorRef, portalListId, menuRect, closeDropdown: closeDropdownBase } = useComboboxDropdown(
    open,
    setOpen,
  );

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

  const combinedOptions = useMemo(
    () => sortByLabel([...staticJobs, ...projectJobs], (j) => formatJobPickerLine(j)),
    [staticJobs, projectJobs],
  );

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

  const closeDropdown = useCallback(() => {
    closeDropdownBase();
    if (value && displayClosed) setText(displayClosed);
    else if (!value) setText('');
  }, [value, displayClosed, closeDropdownBase]);

  const inputValue = open ? text : displayClosed || text;

  const dropdown =
    open && menuRect ? (
      <ul
        id={portalListId}
        role="listbox"
        className={uiDropdown.menu}
        style={{ top: menuRect.top, left: menuRect.left, width: menuRect.width }}
      >
        {isLoading && combinedOptions.length === 0 ? (
          <li className={uiDropdown.optionMuted}>Loading…</li>
        ) : combinedOptions.length === 0 ? (
          <li className={uiDropdown.optionEmpty}>No jobs match. Try another search.</li>
        ) : (
          combinedOptions.map((job) => {
            const addr = job.kind === 'project' ? formatProjectAddressLine(job) : '';
            return (
              <li key={`${job.kind}-${job.id}`} role="option">
                <button
                  type="button"
                  className={uiCx(uiDropdown.option, value === job.id && uiDropdown.optionSelected)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(job.id);
                    setLastPicked(job);
                    setText(formatJobPickerLine(job));
                    setOpen(false);
                  }}
                >
                  <JobNameWithCode job={job} selected={value === job.id} />
                  {addr ? <div className="mt-0.5 truncate text-xs text-gray-500">{addr}</div> : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    ) : null;

  return (
    <div className="relative space-y-1.5">
      <AppControlLabelRow
        label={label}
        fieldHint={fieldHint ? <AppFieldHint hint={fieldHint} /> : undefined}
      />
      <div ref={anchorRef} className="relative">
        <span className={uiDropdown.leftIcon} aria-hidden>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </span>
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
          onBlur={() => {
            window.setTimeout(() => {
              const active = document.activeElement;
              if (anchorRef.current?.contains(active)) return;
              const portal = document.getElementById(portalListId);
              if (portal?.contains(active)) return;
              closeDropdown();
            }, 0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              closeDropdown();
            }
          }}
          className={uiCx(uiDropdown.trigger, uiDropdown.triggerWithLeftIcon, inputClassName)}
        />
      </div>
      {typeof document !== 'undefined' && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
