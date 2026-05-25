import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import { sortByLabel } from '@/lib/sortOptions';
import { AppControlLabelRow } from './AppControlLabel';
import { AppFieldHint } from './AppFieldHint';
import { SelectDropdownCheckbox } from './SelectDropdownCheckbox';
import { uiCx, uiDropdown, uiTypography, uiUserSelect } from './tokens';
import { useComboboxDropdown } from './useComboboxDropdown';

export type AppMultiSelectOption = {
  value: string;
  label: string;
  description?: string;
};

export type AppMultiSelectProps = {
  value: string[];
  onChange: (values: string[]) => void;
  options: AppMultiSelectOption[];
  label?: ReactNode;
  fieldHint?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  emptyMessage?: string;
  /** Search in the trigger field (AppUserSelect multiple pattern). Default false uses button + chevron. */
  searchable?: boolean;
  /** Icon in searchable mode (default Search). Pass null to hide. */
  leftIcon?: ReactNode;
  showSelectedChips?: boolean;
  triggerClassName?: string;
  className?: string;
};

function filterOptions(options: AppMultiSelectOption[], query: string): AppMultiSelectOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter(
    (o) =>
      o.label.toLowerCase().includes(q) ||
      (o.description?.toLowerCase().includes(q) ?? false) ||
      o.value.toLowerCase().includes(q),
  );
}

function MultiSelectChip({
  label,
  onRemove,
  disabled,
}: {
  label: string;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <span className={uiUserSelect.chip}>
      <span className="truncate">{label}</span>
      <button
        type="button"
        className={uiUserSelect.chipClear}
        aria-label={`Remove ${label}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

export function AppMultiSelect({
  value,
  onChange,
  options,
  label,
  fieldHint,
  helperText,
  error,
  placeholder = 'Select options…',
  disabled,
  id,
  emptyMessage = 'No options found.',
  searchable = false,
  leftIcon,
  showSelectedChips = true,
  triggerClassName,
  className,
}: AppMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { anchorRef, portalListId, menuRect, closeDropdown } = useComboboxDropdown(open, setOpen);

  const sortedOptions = useMemo(() => sortByLabel(options, (o) => o.label), [options]);
  const filteredOptions = useMemo(() => {
    const list = searchable ? filterOptions(sortedOptions, open ? search : '') : sortedOptions;
    return sortByLabel(list, (o) => o.label);
  }, [sortedOptions, searchable, open, search]);

  const optionsByValue = useMemo(() => {
    const map = new Map<string, AppMultiSelectOption>();
    for (const o of options) map.set(o.value, o);
    return map;
  }, [options]);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const selectedOptions = useMemo(
    () =>
      value
        .map((v) => optionsByValue.get(v))
        .filter((o): o is AppMultiSelectOption => o != null),
    [value, optionsByValue],
  );

  const triggerLabel = value.length === 0 ? placeholder : `${value.length} selected`;

  const toggle = (optionValue: string) => {
    if (selectedSet.has(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
      return;
    }
    onChange([...value, optionValue]);
  };

  const menuPosition = menuRect
    ? { top: menuRect.top, left: menuRect.left, width: menuRect.width }
    : undefined;

  const optionListContent =
    filteredOptions.length === 0 ? (
      <li className={uiDropdown.optionEmpty}>{emptyMessage}</li>
    ) : (
      filteredOptions.map((option) => {
        const isSelected = selectedSet.has(option.value);

        return (
          <li key={option.value} role="option" aria-selected={isSelected}>
            <label
              className={uiCx(
                uiDropdown.option,
                'flex cursor-pointer',
                isSelected && uiDropdown.optionSelected,
              )}
              onMouseDown={(e) => e.preventDefault()}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={isSelected}
                disabled={disabled}
                onChange={() => toggle(option.value)}
                tabIndex={-1}
              />
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <SelectDropdownCheckbox checked={isSelected} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-gray-900">{option.label}</span>
                  {option.description ? (
                    <span className="mt-0.5 block truncate text-xs text-gray-500">
                      {option.description}
                    </span>
                  ) : null}
                </span>
              </span>
            </label>
          </li>
        );
      })
    );

  const dropdown =
    open && menuPosition ? (
      <ul
        id={portalListId}
        role="listbox"
        aria-multiselectable
        className={uiDropdown.menu}
        style={menuPosition}
      >
        {optionListContent}
      </ul>
    ) : null;

  const closedPlaceholder = value.length === 0 ? placeholder : `${value.length} selected`;
  const comboboxPlaceholder = open ? placeholder : closedPlaceholder;
  const showLeftIcon = leftIcon !== undefined ? leftIcon : searchable ? <Search className="h-4 w-4" /> : null;

  const labelRow = label ? (
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
  ) : null;

  const chipsRow =
    showSelectedChips && selectedOptions.length > 0 ? (
      <div className={uiUserSelect.chipRow}>
        {selectedOptions.map((option) => (
          <MultiSelectChip
            key={option.value}
            label={option.label}
            disabled={disabled}
            onRemove={() => toggle(option.value)}
          />
        ))}
      </div>
    ) : null;

  if (searchable) {
    return (
      <div className={uiCx('block space-y-1.5', className)}>
        {labelRow}
        <div ref={anchorRef} className="relative">
          {showLeftIcon ? <span className={uiDropdown.leftIcon}>{showLeftIcon}</span> : null}
          <input
            id={id}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls={open ? portalListId : undefined}
            disabled={disabled}
            value={open ? search : ''}
            placeholder={comboboxPlaceholder}
            autoComplete="off"
            onChange={(e) => {
              setSearch(e.target.value);
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
                setSearch('');
              }, 0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                closeDropdown();
                setSearch('');
              }
            }}
            className={uiCx(
              uiDropdown.trigger,
              showLeftIcon && uiDropdown.triggerWithLeftIcon,
              open && !disabled && 'border-gray-400 ring-1 ring-inset ring-gray-400/35',
              triggerClassName,
            )}
          />
        </div>
        {chipsRow}
        {error ? (
          <span className="block text-xs text-red-600">{error}</span>
        ) : helperText ? (
          <span className={uiTypography.helper}>{helperText}</span>
        ) : null}
        {typeof document !== 'undefined' && dropdown ? createPortal(dropdown, document.body) : null}
      </div>
    );
  }

  const triggerClasses = uiCx(
    uiDropdown.trigger,
    'flex w-full items-center justify-between gap-2 pr-8 text-left',
    value.length === 0 && 'text-gray-400',
    open && !disabled && 'border-gray-400 ring-1 ring-inset ring-gray-400/35',
    triggerClassName,
  );

  return (
    <div className={uiCx('block space-y-1.5', className)}>
      {labelRow}
      <div ref={anchorRef} className="relative">
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? portalListId : undefined}
          disabled={disabled}
          className={triggerClasses}
          onClick={() => {
            if (!disabled) {
              setOpen((o) => !o);
              setSearch('');
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              closeDropdown();
              setSearch('');
            }
          }}
        >
          <span className="min-w-0 truncate">{triggerLabel}</span>
        </button>
        <ChevronDown
          className={uiCx(
            'pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400',
            open && 'rotate-180',
            'transition-transform duration-150',
          )}
          aria-hidden
        />
      </div>
      {chipsRow}
      {error ? (
        <span className="block text-xs text-red-600">{error}</span>
      ) : helperText ? (
        <span className={uiTypography.helper}>{helperText}</span>
      ) : null}
      {typeof document !== 'undefined' && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
