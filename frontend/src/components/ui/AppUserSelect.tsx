import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { UserRound, X } from 'lucide-react';
import { sortByLabel } from '@/lib/sortOptions';
import {
  getUserDisplayName,
  getUserPickerLabel,
  getUserSubtitle,
  type UserDisplaySource,
} from '@/lib/userDisplay';
import { AppControlLabelRow } from './AppControlLabel';
import { AppFieldHint } from './AppFieldHint';
import { AppUserAvatar } from './AppUserAvatar';
import { SelectDropdownCheckbox } from './SelectDropdownCheckbox';
import { uiCx, uiDropdown, uiUserSelect } from './tokens';
import { comboboxMenuStyle, useComboboxDropdown, type ComboboxMenuRect } from './useComboboxDropdown';
import { useAppUserSelectCatalog } from './useAppUserSelectCatalog';

export type AppUserSelectUser = UserDisplaySource & { id: string };

type AppUserSelectCommonProps = {
  /** Omit to load all active users from the API (search + infinite scroll). */
  users?: AppUserSelectUser[];
  label?: ReactNode;
  fieldHint?: ReactNode;
  helperText?: ReactNode;
  disabled?: boolean;
  id?: string;
  emptyMessage?: string;
  pageSize?: number;
  triggerClassName?: string;
};

export type AppUserSelectSingleProps = AppUserSelectCommonProps & {
  mode?: 'single';
  value: string;
  onChange: (userId: string) => void;
  placeholder?: string;
  /** Chip below the trigger when one user is selected (default off — name shows in the field). */
  showSelectedChip?: boolean;
};

export type AppUserSelectMultipleProps = AppUserSelectCommonProps & {
  mode: 'multiple';
  value: string[];
  onChange: (userIds: string[]) => void;
  placeholder?: string;
  /** Chips for each selected user (default true in multiple mode). */
  showSelectedChips?: boolean;
};

export type AppUserSelectProps = AppUserSelectSingleProps | AppUserSelectMultipleProps;

const SEARCH_DEBOUNCE_MS = 300;

function normalizeUserId(id: string | null | undefined): string {
  return id == null ? '' : String(id).trim();
}

function filterStaticUsers(users: AppUserSelectUser[], query: string): AppUserSelectUser[] {
  const q = query.trim().toLowerCase();
  if (!q) return users;
  return users.filter((u) => {
    const name = getUserDisplayName(u).toLowerCase();
    const subtitle = getUserSubtitle(u).toLowerCase();
    const username = (u.username || '').toLowerCase();
    return name.includes(q) || subtitle.includes(q) || username.includes(q) || u.id.toLowerCase().includes(q);
  });
}

function resolveStaticSelected(users: AppUserSelectUser[], ids: string[]): AppUserSelectUser[] {
  const byId = new Map(users.map((u) => [u.id, u]));
  return ids.map((id) => byId.get(id)).filter((u): u is AppUserSelectUser => u != null);
}

function UserSelectChip({
  user,
  onRemove,
  disabled,
}: {
  user: AppUserSelectUser;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <span className={uiUserSelect.chip}>
      <AppUserAvatar user={user} size="sm" className={uiUserSelect.chipAvatar} />
      <span className="truncate">{getUserPickerLabel(user)}</span>
      <button
        type="button"
        className={uiUserSelect.chipClear}
        aria-label={`Remove ${getUserDisplayName(user)}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

export function AppUserSelect(props: AppUserSelectProps) {
  if (props.mode === 'multiple') {
    return <AppUserSelectMultiple {...props} />;
  }
  return <AppUserSelectSingle {...props} />;
}

function AppUserSelectSingle({
  value,
  onChange,
  users: usersProp,
  label,
  fieldHint,
  helperText,
  placeholder = 'Search or select user…',
  disabled,
  id,
  emptyMessage = 'No users found.',
  pageSize,
  showSelectedChip = false,
  triggerClassName,
}: AppUserSelectSingleProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [lastPicked, setLastPicked] = useState<AppUserSelectUser | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const useRemoteCatalog = usersProp === undefined;

  const { anchorRef, portalListId, menuRect, closeDropdown } = useComboboxDropdown(open, setOpen);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(text.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [text]);

  const catalog = useAppUserSelectCatalog({
    search: debouncedSearch,
    enabled: useRemoteCatalog,
    fetchList: open,
    pageSize,
    selectedIds: value ? [value] : [],
  });

  const staticSorted = useMemo(() => {
    if (!usersProp) return [];
    return sortByLabel(usersProp, (u) => getUserDisplayName(u));
  }, [usersProp]);

  const staticFiltered = useMemo(() => {
    const list = filterStaticUsers(staticSorted, open ? debouncedSearch : '');
    return sortByLabel(list, (u) => getUserPickerLabel(u));
  }, [staticSorted, debouncedSearch, open]);

  const selectedFromStatic = useMemo(
    () => staticSorted.find((u) => u.id === value) ?? null,
    [staticSorted, value],
  );

  const listUsers = useRemoteCatalog ? catalog.users : staticFiltered;
  const selectedFallback = useRemoteCatalog ? catalog.selectedUser : selectedFromStatic;

  const displayUser = useMemo(() => {
    if (!value) return null;
    const vid = normalizeUserId(value);
    if (lastPicked && normalizeUserId(lastPicked.id) === vid) return lastPicked;
    if (useRemoteCatalog) {
      const fromCatalog = catalog.resolveUserById(value);
      if (fromCatalog?.name?.includes('(')) return fromCatalog;
    }
    return selectedFallback;
  }, [value, lastPicked, useRemoteCatalog, catalog, selectedFallback]);

  const displayClosed = displayUser ? getUserPickerLabel(displayUser) : '';
  const inputValue = open ? text : displayClosed;

  useEffect(() => {
    if (!value) setLastPicked(null);
  }, [value]);

  useEffect(() => {
    if (!value || lastPicked) return;
    const vid = normalizeUserId(value);
    const fromList = listUsers.find((u) => normalizeUserId(u.id) === vid);
    if (fromList?.name) setLastPicked(fromList);
    else if (useRemoteCatalog) {
      const fromCatalog = catalog.resolveUserById(value);
      if (fromCatalog?.name?.includes('(')) setLastPicked(fromCatalog);
    }
  }, [value, lastPicked, listUsers, useRemoteCatalog, catalog]);

  const handleClose = () => {
    closeDropdown();
    if (!open) setText('');
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

  const leftTrigger =
    value && displayUser ? <AppUserAvatar user={displayUser} size="sm" /> : <UserRound className="h-4 w-4" />;

  const dropdown = renderUserListbox({
    listRef,
    portalListId,
    menuRect,
    open,
    listUsers,
    isMultiple: false,
    selectedIds: value ? [value] : [],
    emptyMessage,
    useRemoteCatalog,
    isLoading: catalog.isLoading,
    isFetching: catalog.isFetching,
    isFetchingNextPage: catalog.isFetchingNextPage,
    onSelectSingle: (userId) => {
      const user = listUsers.find((u) => normalizeUserId(u.id) === normalizeUserId(userId)) ?? null;
      if (user) setLastPicked(user);
      onChange(userId);
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
        <span className={uiDropdown.leftIcon}>{leftTrigger}</span>
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
              handleClose();
            }, 0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              handleClose();
            }
          }}
          className={uiCx(
            uiDropdown.trigger,
            value && displayUser ? uiUserSelect.triggerWithAvatar : uiDropdown.triggerWithLeftIcon,
            open && !disabled && 'border-gray-400 ring-1 ring-inset ring-gray-400/35',
            triggerClassName,
          )}
        />
      </div>
      {showSelectedChip && displayUser ? (
        <UserSelectChip
          user={displayUser}
          disabled={disabled}
          onRemove={() => {
            onChange('');
            setLastPicked(null);
            setText('');
          }}
        />
      ) : null}
      {helperText ? <p className="text-xs text-gray-600">{helperText}</p> : null}
      {typeof document !== 'undefined' && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}

function AppUserSelectMultiple({
  value,
  onChange,
  users: usersProp,
  label,
  fieldHint,
  helperText,
  placeholder = 'Search users to add…',
  disabled,
  id,
  emptyMessage = 'No users found.',
  pageSize,
  showSelectedChips = true,
  triggerClassName,
}: AppUserSelectMultipleProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const listRef = useRef<HTMLUListElement>(null);
  const useRemoteCatalog = usersProp === undefined;
  const selectedSet = useMemo(() => new Set(value.map(normalizeUserId)), [value]);

  const { anchorRef, portalListId, menuRect, closeDropdown } = useComboboxDropdown(open, setOpen);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(text.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [text]);

  const catalog = useAppUserSelectCatalog({
    search: debouncedSearch,
    enabled: useRemoteCatalog,
    fetchList: open,
    pageSize,
    selectedIds: value,
  });

  const staticSorted = useMemo(() => {
    if (!usersProp) return [];
    return sortByLabel(usersProp, (u) => getUserDisplayName(u));
  }, [usersProp]);

  const staticFiltered = useMemo(() => {
    const list = filterStaticUsers(staticSorted, open ? debouncedSearch : '');
    return sortByLabel(list, (u) => getUserPickerLabel(u));
  }, [staticSorted, debouncedSearch, open]);

  const listUsers = useRemoteCatalog ? catalog.users : staticFiltered;
  const selectedUsers = useRemoteCatalog
    ? catalog.selectedUsers
    : resolveStaticSelected(staticSorted, value);

  const closedPlaceholder = value.length === 0 ? placeholder : `${value.length} selected`;

  const inputValue = open ? text : '';
  const inputPlaceholder = open ? placeholder : closedPlaceholder;

  const toggleUser = (userId: string) => {
    const nid = normalizeUserId(userId);
    if (selectedSet.has(nid)) {
      onChange(value.filter((id) => normalizeUserId(id) !== nid));
      return;
    }
    onChange([...value, userId]);
  };

  const removeUser = (userId: string) => {
    const nid = normalizeUserId(userId);
    onChange(value.filter((id) => normalizeUserId(id) !== nid));
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

  const leftTrigger = <UserRound className="h-4 w-4" />;

  const dropdown = renderUserListbox({
    listRef,
    portalListId,
    menuRect,
    open,
    listUsers,
    isMultiple: true,
    selectedIds: value,
    emptyMessage,
    useRemoteCatalog,
    isLoading: catalog.isLoading,
    isFetching: catalog.isFetching,
    isFetchingNextPage: catalog.isFetchingNextPage,
    onToggleMultiple: toggleUser,
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
        <span className={uiDropdown.leftIcon}>{leftTrigger}</span>
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
      {showSelectedChips && selectedUsers.length > 0 ? (
        <div className={uiUserSelect.chipRow}>
          {selectedUsers.map((user) => (
            <UserSelectChip
              key={user.id}
              user={user}
              disabled={disabled}
              onRemove={() => removeUser(user.id)}
            />
          ))}
        </div>
      ) : null}
      {helperText ? <p className="text-xs text-gray-600">{helperText}</p> : null}
      {typeof document !== 'undefined' && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}

type UserListboxParams = {
  listRef: React.RefObject<HTMLUListElement>;
  portalListId: string;
  menuRect: ComboboxMenuRect | null;
  open: boolean;
  listUsers: AppUserSelectUser[];
  isMultiple: boolean;
  selectedIds: string[];
  emptyMessage: string;
  useRemoteCatalog: boolean;
  isLoading: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  onSelectSingle?: (userId: string) => void;
  onToggleMultiple?: (userId: string) => void;
};

function renderUserListbox({
  listRef,
  portalListId,
  menuRect,
  open,
  listUsers,
  isMultiple,
  selectedIds,
  emptyMessage,
  useRemoteCatalog,
  isLoading,
  isFetching,
  isFetchingNextPage,
  onSelectSingle,
  onToggleMultiple,
}: UserListboxParams) {
  if (!open || !menuRect) return null;

  const selectedSet = new Set(selectedIds.map(normalizeUserId));
  const showLoading = useRemoteCatalog && listUsers.length === 0 && (isLoading || isFetching);
  const showEmpty = !showLoading && listUsers.length === 0;

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
        <li className={uiDropdown.optionMuted}>Loading users…</li>
      ) : showEmpty ? (
        <li className={uiDropdown.optionEmpty}>{emptyMessage}</li>
      ) : (
        <>
          {listUsers.map((user) => {
            const subtitle = getUserSubtitle(user);
            const isSelected = selectedSet.has(normalizeUserId(user.id));

            const optionClass = uiCx(
              uiDropdown.option,
              'flex cursor-pointer',
              isSelected && uiDropdown.optionSelected,
            );

            const optionContent = (
              <>
                <AppUserAvatar user={user} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-gray-900">{getUserPickerLabel(user)}</div>
                  {subtitle ? (
                    <div className="mt-0.5 truncate text-xs text-gray-500">{subtitle}</div>
                  ) : null}
                </div>
              </>
            );

            return (
              <li key={user.id} role="option" aria-selected={isSelected}>
                {isMultiple ? (
                  <label
                    className={optionClass}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <div className={uiUserSelect.optionRow}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={isSelected}
                        onChange={() => onToggleMultiple?.(user.id)}
                        tabIndex={-1}
                      />
                      <SelectDropdownCheckbox checked={isSelected} />
                      {optionContent}
                    </div>
                  </label>
                ) : (
                  <button
                    type="button"
                    className={optionClass}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onSelectSingle?.(user.id)}
                  >
                    <div className={uiUserSelect.optionRow}>{optionContent}</div>
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
