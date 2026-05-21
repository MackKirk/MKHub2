import {
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { sortByLabel } from '@/lib/sortOptions';
import { AppControlLabelRow } from './AppControlLabel';
import { AppFieldHint } from './AppFieldHint';
import { uiCx, uiDropdown, uiTypography } from './tokens';
import { useComboboxDropdown } from './useComboboxDropdown';

export type AppSelectOption = {
  value: string;
  label: string;
};

export type AppSelectProps = {
  label?: ReactNode;
  fieldHint?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  options: AppSelectOption[];
  placeholder?: string;
  emptyMessage?: string;
  /** Filter options by label/value while the menu is open. */
  searchable?: boolean;
  /** @deprecated Use triggerClassName */
  selectClassName?: string;
  triggerClassName?: string;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'>;

function filterOptions(options: AppSelectOption[], query: string): AppSelectOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter(
    (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
  );
}

function fireSelectChange(
  onChange: AppSelectProps['onChange'],
  name: string | undefined,
  next: string,
) {
  if (!onChange) return;
  const synthetic = {
    target: { value: next, name: name ?? '' },
    currentTarget: { value: next, name: name ?? '' },
  } as ChangeEvent<HTMLSelectElement>;
  onChange(synthetic);
}

export function AppSelect({
  label,
  fieldHint,
  helperText,
  error,
  className,
  selectClassName,
  triggerClassName,
  options,
  placeholder,
  emptyMessage = 'No options found.',
  searchable = false,
  id,
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  name,
  ...rest
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { anchorRef, portalListId, menuRect, closeDropdown } = useComboboxDropdown(open, setOpen);

  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(() =>
    defaultValue !== undefined && defaultValue !== null ? String(defaultValue) : '',
  );

  const currentValue = isControlled ? String(value ?? '') : internalValue;

  const sortedOptions = useMemo(() => sortByLabel(options, (o) => o.label), [options]);
  const filteredOptions = useMemo(() => {
    const list = searchable && open ? filterOptions(sortedOptions, search) : sortedOptions;
    return sortByLabel(list, (o) => o.label);
  }, [sortedOptions, searchable, open, search]);

  const selected = useMemo(
    () => sortedOptions.find((o) => o.value === currentValue) ?? null,
    [sortedOptions, currentValue],
  );

  const setValue = (next: string) => {
    if (!isControlled) setInternalValue(next);
    fireSelectChange(onChange, name, next);
  };

  const showPlaceholder = !!placeholder && !currentValue;
  const triggerLabel = selected?.label ?? placeholder ?? 'Select…';

  const menuPosition = menuRect
    ? { top: menuRect.top, left: menuRect.left, width: menuRect.width }
    : undefined;

  const optionListContent = (
    <>
      {!searchable && placeholder ? (
        <li role="option" aria-selected={!currentValue}>
          <button
            type="button"
            className={uiCx(uiDropdown.option, !currentValue && uiDropdown.optionSelected)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setValue('');
              closeDropdown();
            }}
          >
            {placeholder}
          </button>
        </li>
      ) : null}
      {filteredOptions.length === 0 ? (
        <li className={uiDropdown.optionEmpty}>{emptyMessage}</li>
      ) : (
        filteredOptions.map((option) => (
          <li key={option.value} role="option" aria-selected={currentValue === option.value}>
            <button
              type="button"
              className={uiCx(
                uiDropdown.option,
                currentValue === option.value && uiDropdown.optionSelected,
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setValue(option.value);
                closeDropdown();
                setSearch('');
              }}
            >
              {option.label}
            </button>
          </li>
        ))
      )}
    </>
  );

  const dropdown =
    open && menuPosition ? (
      searchable ? (
        <div className={uiDropdown.menuSearchable} style={menuPosition}>
          <div className={uiDropdown.menuSearchHeader}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              autoComplete="off"
              className={uiCx(uiDropdown.trigger, 'text-xs')}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
          <ul id={portalListId} role="listbox" aria-labelledby={id} className={uiDropdown.menuOptionsList}>
            {optionListContent}
          </ul>
        </div>
      ) : (
        <ul
          id={portalListId}
          role="listbox"
          aria-labelledby={id}
          className={uiDropdown.menu}
          style={menuPosition}
        >
          {optionListContent}
        </ul>
      )
    ) : null;

  const triggerClasses = uiCx(
    uiDropdown.trigger,
    'flex w-full items-center justify-between gap-2 pr-8 text-left',
    showPlaceholder && 'text-gray-400',
    open && !disabled && 'border-gray-400 ring-1 ring-inset ring-gray-400/35',
    triggerClassName ?? selectClassName,
  );

  return (
    <div className={uiCx('block space-y-1.5', className)}>
      {label ? (
        <AppControlLabelRow label={label} fieldHint={fieldHint ? <AppFieldHint hint={fieldHint} /> : undefined} />
      ) : null}
      {name ? <input type="hidden" name={name} value={currentValue} required={required} /> : null}
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
              if (!open) setSearch('');
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              closeDropdown();
              setSearch('');
            }
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (!open) setOpen(true);
            }
          }}
          {...rest}
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
      {error ? (
        <span className="block text-xs text-red-600">{error}</span>
      ) : helperText ? (
        <span className={uiTypography.helper}>{helperText}</span>
      ) : null}
      {typeof document !== 'undefined' && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
