import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';
import { AppControlLabelRow } from './AppControlLabel';
import { AppFieldHint } from './AppFieldHint';
import {
  formatProjectAddressLine,
  formatProjectPrimaryLine,
  type ProjectPickerItem,
} from './projectPickerUtils';
import { uiCx, uiDropdown, uiTypography } from './tokens';
import { comboboxMenuStyle, useComboboxDropdown } from './useComboboxDropdown';

export type { ProjectPickerItem } from './projectPickerUtils';
export { formatProjectAddressLine, formatProjectPrimaryLine } from './projectPickerUtils';

function ProjectOptionLabel({ project }: { project: ProjectPickerItem }) {
  const code = project.code?.trim();
  return (
    <div className="min-w-0 text-xs text-gray-900">
      <span className="font-medium">{project.name}</span>
      {code ? <span className="font-normal text-gray-500">{` (${code})`}</span> : null}
    </div>
  );
}

export type AppProjectSelectProps = {
  value: string;
  onChange: (projectId: string) => void;
  label?: ReactNode;
  fieldHint?: ReactNode;
  helperText?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  allowEmpty?: boolean;
  emptyOptionLabel?: string;
  emptyMessage?: string;
  /** When false (default), excludes bidding/opportunity projects — same as Clock In job list. */
  includeBidding?: boolean;
  triggerClassName?: string;
};

const SEARCH_DEBOUNCE_MS = 300;

export function AppProjectSelect({
  value,
  onChange,
  label,
  fieldHint,
  helperText,
  placeholder = 'Search by name, code, or address…',
  disabled,
  id,
  allowEmpty = false,
  emptyOptionLabel = 'No project',
  emptyMessage = 'No projects match. Try another search.',
  includeBidding = false,
  triggerClassName,
}: AppProjectSelectProps) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [lastPicked, setLastPicked] = useState<ProjectPickerItem | null>(null);
  const { anchorRef, portalListId, menuRect, closeDropdown: closeDropdownBase } = useComboboxDropdown(
    open,
    setOpen,
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(text.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [text]);

  const { data: projectsRaw = [], isLoading } = useQuery({
    queryKey: ['app-project-select', { q: debouncedQ, includeBidding }],
    queryFn: async () => {
      const qs = new URLSearchParams({ limit: '100' });
      if (!includeBidding) qs.set('is_bidding', 'false');
      if (debouncedQ) qs.set('q', debouncedQ);
      const result = await api<ProjectPickerItem[]>('GET', `/projects?${qs.toString()}`);
      return Array.isArray(result) ? result : [];
    },
  });

  const projects = useMemo(
    () => sortByLabel(projectsRaw, (p) => formatProjectPrimaryLine(p)),
    [projectsRaw],
  );

  const { data: valueProject } = useQuery({
    queryKey: ['app-project-select-value', value],
    queryFn: () => api<ProjectPickerItem>('GET', `/projects/${value}`),
    enabled: !!value,
  });

  useEffect(() => {
    if (!value) {
      setLastPicked(null);
      return;
    }
    const fromList = projects.find((p) => p.id === value);
    if (fromList) {
      setLastPicked(fromList);
      return;
    }
    if (valueProject && valueProject.id === value) {
      setLastPicked(valueProject);
    }
  }, [value, projects, valueProject]);

  const displayClosed = useMemo(() => {
    if (!value) return '';
    if (lastPicked?.id === value) return formatProjectPrimaryLine(lastPicked);
    if (valueProject) return formatProjectPrimaryLine(valueProject);
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
        style={comboboxMenuStyle(menuRect)}
      >
        {allowEmpty ? (
          <li role="option" aria-selected={!value}>
            <button
              type="button"
              className={uiCx(uiDropdown.option, !value && uiDropdown.optionSelected, 'text-gray-600')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange('');
                setLastPicked(null);
                setText('');
                setOpen(false);
              }}
            >
              {emptyOptionLabel}
            </button>
          </li>
        ) : null}
        {isLoading && projects.length === 0 ? (
          <li className={uiDropdown.optionMuted}>Loading projects…</li>
        ) : projects.length === 0 ? (
          <li className={uiDropdown.optionEmpty}>{emptyMessage}</li>
        ) : (
          projects.map((project) => {
            const addr = formatProjectAddressLine(project);
            return (
              <li key={project.id} role="option" aria-selected={value === project.id}>
                <button
                  type="button"
                  className={uiCx(uiDropdown.option, value === project.id && uiDropdown.optionSelected)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(project.id);
                    setLastPicked(project);
                    setText(formatProjectPrimaryLine(project));
                    setOpen(false);
                  }}
                >
                  <ProjectOptionLabel project={project} />
                  {addr ? <div className="mt-0.5 truncate text-xs text-gray-500">{addr}</div> : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    ) : null;

  return (
    <div className="space-y-1.5">
      {label ? (
        <AppControlLabelRow label={label} fieldHint={fieldHint ? <AppFieldHint hint={fieldHint} /> : undefined} />
      ) : null}
      <div ref={anchorRef} className="relative">
        <span className={uiDropdown.leftIcon} aria-hidden>
          <Search className="h-4 w-4" />
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
            setText(e.target.value);
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
          className={uiCx(
            uiDropdown.trigger,
            uiDropdown.triggerWithLeftIcon,
            open && !disabled && 'border-gray-400 ring-1 ring-inset ring-gray-400/35',
            triggerClassName,
          )}
        />
      </div>
      {helperText ? <p className={uiTypography.helper}>{helperText}</p> : null}
      {typeof document !== 'undefined' && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
