import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, X } from 'lucide-react';
import { sortByLabel } from '@/lib/sortOptions';
import { AppControlLabelRow } from './AppControlLabel';
import { AppFieldHint } from './AppFieldHint';
import { SelectDropdownCheckbox } from './SelectDropdownCheckbox';
import { uiCx, uiDropdown, uiUserSelect } from './tokens';
import { comboboxMenuStyle, useComboboxDropdown, type ComboboxMenuRect } from './useComboboxDropdown';
import {
  getClientPickerLabel,
  getClientSubtitle,
  useAppClientSelectCatalog,
  type AppClientSelectClient,
} from './useAppClientSelectCatalog';

export type { AppClientSelectClient } from './useAppClientSelectCatalog';
export { getClientPickerLabel, getClientSubtitle } from './useAppClientSelectCatalog';

type AppClientSelectCommonProps = {
  /** Omit to load customers from the API (search + infinite scroll). */
  clients?: AppClientSelectClient[];
  label?: ReactNode;
  fieldHint?: ReactNode;
  helperText?: ReactNode;
  disabled?: boolean;
  id?: string;
  emptyMessage?: string;
  pageSize?: number;
  triggerClassName?: string;
  /** When search has no matches, show a create action (requires non-empty search query). */
  onCreateNew?: (searchQuery: string) => void;
  createNewLabel?: string;
};

export type AppClientSelectSingleProps = AppClientSelectCommonProps & {
  mode?: 'single';
  value: string;
  onChange: (clientId: string) => void;
  placeholder?: string;
};

export type AppClientSelectMultipleProps = AppClientSelectCommonProps & {
  mode: 'multiple';
  value: string[];
  onChange: (clientIds: string[]) => void;
  placeholder?: string;
  showSelectedChips?: boolean;
  /** Excluded from the dropdown list (e.g. primary project owner). */
  excludeClientId?: string;
};

export type AppClientSelectProps = AppClientSelectSingleProps | AppClientSelectMultipleProps;

const SEARCH_DEBOUNCE_MS = 300;

function normalizeClientId(id: string | null | undefined): string {
  return id == null ? '' : String(id).trim();
}

function filterStaticClients(clients: AppClientSelectClient[], query: string): AppClientSelectClient[] {
  const q = query.trim().toLowerCase();
  if (!q) return clients;
  return clients.filter((c) => {
    const label = getClientPickerLabel(c).toLowerCase();
    const subtitle = getClientSubtitle(c).toLowerCase();
    return label.includes(q) || subtitle.includes(q) || c.id.toLowerCase().includes(q);
  });
}

function ClientSelectChip({
  client,
  onRemove,
  disabled,
}: {
  client: AppClientSelectClient;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <span className={uiUserSelect.chip}>
      <span className="truncate">{getClientPickerLabel(client)}</span>
      <button
        type="button"
        className={uiUserSelect.chipClear}
        aria-label={`Remove ${getClientPickerLabel(client)}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

export function AppClientSelect(props: AppClientSelectProps) {
  if (props.mode === 'multiple') {
    return <AppClientSelectMultiple {...props} />;
  }
  return <AppClientSelectSingle {...props} />;
}

function AppClientSelectSingle({
  value,
  onChange,
  clients: clientsProp,
  label,
  fieldHint,
  helperText,
  placeholder = 'Search or select customer…',
  disabled,
  id,
  emptyMessage = 'No customers found.',
  pageSize,
  triggerClassName,
  onCreateNew,
  createNewLabel = 'Create new',
}: AppClientSelectSingleProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [lastPicked, setLastPicked] = useState<AppClientSelectClient | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const useRemoteCatalog = clientsProp === undefined;

  const { anchorRef, portalListId, menuRect, closeDropdown } = useComboboxDropdown(open, setOpen);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(text.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [text]);

  const catalog = useAppClientSelectCatalog({
    search: debouncedSearch,
    enabled: useRemoteCatalog,
    fetchList: open,
    pageSize,
    selectedIds: value ? [value] : [],
  });

  const staticSorted = useMemo(() => {
    if (!clientsProp) return [];
    return sortByLabel(clientsProp, (c) => getClientPickerLabel(c));
  }, [clientsProp]);

  const staticFiltered = useMemo(() => {
    const list = filterStaticClients(staticSorted, open ? debouncedSearch : '');
    return sortByLabel(list, (c) => getClientPickerLabel(c));
  }, [staticSorted, debouncedSearch, open]);

  const listClients = useRemoteCatalog ? catalog.clients : staticFiltered;

  const displayClient = useMemo(() => {
    if (!value) return null;
    const vid = normalizeClientId(value);
    if (lastPicked && normalizeClientId(lastPicked.id) === vid) return lastPicked;
    if (useRemoteCatalog) return catalog.resolveClientById(value);
    return staticSorted.find((c) => normalizeClientId(c.id) === vid) ?? null;
  }, [value, lastPicked, useRemoteCatalog, catalog, staticSorted]);

  const displayClosed = displayClient ? getClientPickerLabel(displayClient) : '';
  const inputValue = open ? text : displayClosed;

  useEffect(() => {
    if (!value) setLastPicked(null);
  }, [value]);

  useEffect(() => {
    const el = listRef.current;
    if (!open || !el || !useRemoteCatalog) return;
    const onScroll = () => {
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
      if (nearBottom && catalog.hasNextPage && !catalog.isFetchingNextPage) {
        catalog.fetchNextPage();
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [open, useRemoteCatalog, catalog.hasNextPage, catalog.isFetchingNextPage, catalog.fetchNextPage]);

  const dropdown = renderClientListbox({
    listRef,
    portalListId,
    menuRect,
    open,
    listClients,
    isMultiple: false,
    selectedIds: value ? [value] : [],
    emptyMessage,
    searchQuery: debouncedSearch,
    createNewLabel,
    onCreateNew: onCreateNew
      ? (q) => {
          onCreateNew(q);
          setText('');
          closeDropdown();
        }
      : undefined,
    useRemoteCatalog,
    isLoading: catalog.isLoading,
    isFetching: catalog.isFetching,
    isFetchingNextPage: catalog.isFetchingNextPage,
    onSelectSingle: (clientId) => {
      const client = listClients.find((c) => normalizeClientId(c.id) === normalizeClientId(clientId)) ?? null;
      if (client) setLastPicked(client);
      onChange(clientId);
      setText('');
      setOpen(false);
    },
  });

  return (
    <div className="space-y-1.5">
      {label ? (
        <AppControlLabelRow label={label} fieldHint={fieldHint ? <AppFieldHint hint={fieldHint} /> : undefined} />
      ) : null}
      <div ref={anchorRef} className="relative">
        <span className={uiDropdown.leftIcon}>
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
            if (value) {
              onChange('');
              setLastPicked(null);
            }
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setText('');
          }}
          onBlur={() => {
            window.setTimeout(() => {
              const active = document.activeElement;
              if (anchorRef.current?.contains(active)) return;
              const portal = document.getElementById(portalListId);
              if (portal?.contains(active)) return;
              closeDropdown();
              setText('');
            }, 0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              closeDropdown();
              setText('');
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
      {helperText ? <p className="text-xs text-gray-600">{helperText}</p> : null}
      {typeof document !== 'undefined' && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}

function AppClientSelectMultiple({
  value,
  onChange,
  clients: clientsProp,
  label,
  fieldHint,
  helperText,
  placeholder = 'Search or add related customers…',
  disabled,
  id,
  emptyMessage = 'No customers found.',
  pageSize,
  showSelectedChips = true,
  excludeClientId = '',
  triggerClassName,
  onCreateNew,
  createNewLabel = 'Create new',
}: AppClientSelectMultipleProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const listRef = useRef<HTMLUListElement>(null);
  const useRemoteCatalog = clientsProp === undefined;
  const selectedSet = useMemo(() => new Set(value.map(normalizeClientId)), [value]);

  const { anchorRef, portalListId, menuRect, closeDropdown } = useComboboxDropdown(open, setOpen);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(text.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [text]);

  const catalog = useAppClientSelectCatalog({
    search: debouncedSearch,
    enabled: useRemoteCatalog,
    fetchList: open,
    pageSize,
    selectedIds: value,
  });

  const staticSorted = useMemo(() => {
    if (!clientsProp) return [];
    return sortByLabel(clientsProp, (c) => getClientPickerLabel(c));
  }, [clientsProp]);

  const staticFiltered = useMemo(() => {
    const list = filterStaticClients(staticSorted, open ? debouncedSearch : '');
    return sortByLabel(list, (c) => getClientPickerLabel(c));
  }, [staticSorted, debouncedSearch, open]);

  const excludeId = normalizeClientId(excludeClientId);
  const listClients = useMemo(() => {
    const base = useRemoteCatalog ? catalog.clients : staticFiltered;
    if (!excludeId) return base;
    return base.filter((c) => normalizeClientId(c.id) !== excludeId);
  }, [useRemoteCatalog, catalog.clients, staticFiltered, excludeId]);

  const selectedClients = useRemoteCatalog
    ? catalog.selectedClients
    : value
        .map((id) => staticSorted.find((c) => normalizeClientId(c.id) === normalizeClientId(id)))
        .filter((c): c is AppClientSelectClient => c != null);

  const closedPlaceholder = value.length === 0 ? placeholder : `${value.length} selected`;
  const inputValue = open ? text : '';
  const inputPlaceholder = open ? placeholder : closedPlaceholder;

  const toggleClient = (clientId: string) => {
    const nid = normalizeClientId(clientId);
    if (selectedSet.has(nid)) {
      onChange(value.filter((id) => normalizeClientId(id) !== nid));
      return;
    }
    onChange([...value, clientId]);
  };

  useEffect(() => {
    const el = listRef.current;
    if (!open || !el || !useRemoteCatalog) return;
    const onScroll = () => {
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
      if (nearBottom && catalog.hasNextPage && !catalog.isFetchingNextPage) {
        catalog.fetchNextPage();
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [open, useRemoteCatalog, catalog.hasNextPage, catalog.isFetchingNextPage, catalog.fetchNextPage]);

  const dropdown = renderClientListbox({
    listRef,
    portalListId,
    menuRect,
    open,
    listClients,
    isMultiple: true,
    selectedIds: value,
    emptyMessage,
    searchQuery: debouncedSearch,
    createNewLabel,
    onCreateNew: onCreateNew
      ? (q) => {
          onCreateNew(q);
          setText('');
          closeDropdown();
        }
      : undefined,
    useRemoteCatalog,
    isLoading: catalog.isLoading,
    isFetching: catalog.isFetching,
    isFetchingNextPage: catalog.isFetchingNextPage,
    onToggleMultiple: toggleClient,
  });

  return (
    <div className="space-y-1.5">
      {label ? (
        <AppControlLabelRow
          label={
            <>
              {label}
              {value.length > 0 ? (
                <span className="ml-1 font-normal normal-case text-gray-500">({value.length} selected)</span>
              ) : null}
            </>
          }
          fieldHint={fieldHint ? <AppFieldHint hint={fieldHint} /> : undefined}
        />
      ) : null}
      <div ref={anchorRef} className="relative">
        <span className={uiDropdown.leftIcon}>
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
          placeholder={inputPlaceholder}
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => {
              const active = document.activeElement;
              if (anchorRef.current?.contains(active)) return;
              const portal = document.getElementById(portalListId);
              if (portal?.contains(active)) return;
              closeDropdown();
              setText('');
            }, 0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              closeDropdown();
              setText('');
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
      {showSelectedChips && selectedClients.length > 0 ? (
        <div className={uiUserSelect.chipRow}>
          {selectedClients.map((client) => (
            <ClientSelectChip
              key={client.id}
              client={client}
              disabled={disabled}
              onRemove={() => toggleClient(client.id)}
            />
          ))}
        </div>
      ) : null}
      {helperText ? <p className="text-xs text-gray-600">{helperText}</p> : null}
      {typeof document !== 'undefined' && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}

type ClientListboxParams = {
  listRef: React.RefObject<HTMLUListElement>;
  portalListId: string;
  menuRect: ComboboxMenuRect | null;
  open: boolean;
  listClients: AppClientSelectClient[];
  isMultiple: boolean;
  selectedIds: string[];
  emptyMessage: string;
  searchQuery: string;
  createNewLabel: string;
  onCreateNew?: (searchQuery: string) => void;
  useRemoteCatalog: boolean;
  isLoading: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  onSelectSingle?: (clientId: string) => void;
  onToggleMultiple?: (clientId: string) => void;
};

function renderClientListbox({
  listRef,
  portalListId,
  menuRect,
  open,
  listClients,
  isMultiple,
  selectedIds,
  emptyMessage,
  searchQuery,
  createNewLabel,
  onCreateNew,
  useRemoteCatalog,
  isLoading,
  isFetching,
  isFetchingNextPage,
  onSelectSingle,
  onToggleMultiple,
}: ClientListboxParams) {
  if (!open || !menuRect) return null;

  const selectedSet = new Set(selectedIds.map(normalizeClientId));
  const showLoading = useRemoteCatalog && listClients.length === 0 && (isLoading || isFetching);
  const showEmpty = !showLoading && listClients.length === 0;
  const showCreateNew = showEmpty && !!onCreateNew && searchQuery.trim().length > 0;

  return (
    <ul
      ref={listRef}
      id={portalListId}
      role="listbox"
      aria-multiselectable={isMultiple || undefined}
      className={uiDropdown.menu}
      style={comboboxMenuStyle(menuRect)}
    >
      {showLoading ? (
        <li className={uiDropdown.optionMuted}>Loading customers…</li>
      ) : showEmpty ? (
        <>
          <li className={uiDropdown.optionEmpty}>{emptyMessage}</li>
          {showCreateNew ? (
            <li role="option">
              <button
                type="button"
                className={uiCx(uiDropdown.option, 'flex w-full cursor-pointer items-center gap-2 text-gray-900')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onCreateNew?.(searchQuery.trim())}
              >
                <Plus className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                <span className="truncate text-xs font-medium">{createNewLabel}</span>
              </button>
            </li>
          ) : null}
        </>
      ) : (
        <>
          {listClients.map((client) => {
            const subtitle = getClientSubtitle(client);
            const isSelected = selectedSet.has(normalizeClientId(client.id));
            const optionClass = uiCx(
              uiDropdown.option,
              'flex cursor-pointer',
              isSelected && uiDropdown.optionSelected,
            );

            const optionContent = (
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-gray-900">{getClientPickerLabel(client)}</div>
                {subtitle ? <div className="mt-0.5 truncate text-xs text-gray-500">{subtitle}</div> : null}
              </div>
            );

            return (
              <li key={client.id} role="option" aria-selected={isSelected}>
                {isMultiple ? (
                  <label className={optionClass} onMouseDown={(e) => e.preventDefault()}>
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={isSelected}
                        onChange={() => onToggleMultiple?.(client.id)}
                        tabIndex={-1}
                      />
                      <SelectDropdownCheckbox checked={isSelected} />
                      {optionContent}
                    </span>
                  </label>
                ) : (
                  <button
                    type="button"
                    className={optionClass}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onSelectSingle?.(client.id)}
                  >
                    {optionContent}
                  </button>
                )}
              </li>
            );
          })}
          {useRemoteCatalog && isFetchingNextPage ? (
            <li className={uiDropdown.optionMuted}>Loading more…</li>
          ) : null}
        </>
      )}
    </ul>
  );
}
