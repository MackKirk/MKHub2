import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import { sortByLabel } from '@/lib/sortOptions';
import { AppControlLabelRow } from './AppControlLabel';
import { AppFieldHint } from './AppFieldHint';
import { uiCx, uiDropdown } from './tokens';
import { useComboboxDropdown } from './useComboboxDropdown';

export type AppComboboxOption = {
  value: string;
  label: string;
  description?: string;
};

export type AppComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  options: AppComboboxOption[];
  label?: ReactNode;
  fieldHint?: ReactNode;
  helperText?: ReactNode;
  placeholder?: string;
  leftIcon?: ReactNode;
  disabled?: boolean;
  id?: string;
  emptyMessage?: string;
  triggerClassName?: string;
  /** Fired when the user edits the combobox text (e.g. server-side option refresh). */
  onInputChange?: (text: string) => void;
};

export function AppCombobox({
  value,
  onChange,
  options,
  label,
  fieldHint,
  helperText,
  placeholder = 'Search…',
  leftIcon,
  disabled,
  id,
  emptyMessage = 'No matches. Try another search.',
  triggerClassName,
  onInputChange,
}: AppComboboxProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const { anchorRef, portalListId, menuRect, closeDropdown } = useComboboxDropdown(open, setOpen);

  const sortedOptions = useMemo(() => sortByLabel(options, (o) => o.label), [options]);

  const selected = useMemo(() => sortedOptions.find((o) => o.value === value) ?? null, [sortedOptions, value]);

  const displayClosed = selected?.label ?? '';

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    const list = !q
      ? sortedOptions
      : sortedOptions.filter(
          (o) =>
            o.label.toLowerCase().includes(q) ||
            (o.description?.toLowerCase().includes(q) ?? false) ||
            o.value.toLowerCase().includes(q),
        );
    return sortByLabel(list, (o) => o.label);
  }, [sortedOptions, text]);

  const inputValue = open ? text : displayClosed || text;

  const handleClose = () => {
    closeDropdown();
    if (value && displayClosed) setText(displayClosed);
    else if (!value) setText('');
  };

  const dropdown =
    open && menuRect ? (
      <ul
        id={portalListId}
        role="listbox"
        className={uiDropdown.menu}
        style={{ top: menuRect.top, left: menuRect.left, width: menuRect.width }}
      >
        {filtered.length === 0 ? (
          <li className={uiDropdown.optionEmpty}>{emptyMessage}</li>
        ) : (
          filtered.map((option) => (
            <li key={option.value} role="option" aria-selected={value === option.value}>
              <button
                type="button"
                className={uiCx(uiDropdown.option, value === option.value && uiDropdown.optionSelected)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setText(option.label);
                  setOpen(false);
                }}
              >
                <div className="truncate text-xs text-gray-900">{option.label}</div>
                {option.description ? (
                  <div className="mt-0.5 truncate text-xs text-gray-500">{option.description}</div>
                ) : null}
              </button>
            </li>
          ))
        )}
      </ul>
    ) : null;

  const showLeftIcon = leftIcon !== undefined ? leftIcon : <Search className="h-4 w-4" />;

  return (
    <div className="space-y-1.5">
      {label ? (
        <AppControlLabelRow label={label} fieldHint={fieldHint ? <AppFieldHint hint={fieldHint} /> : undefined} />
      ) : null}
      <div ref={anchorRef} className="relative">
        {showLeftIcon ? <span className={uiDropdown.leftIcon}>{showLeftIcon}</span> : null}
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
            onInputChange?.(v);
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
            showLeftIcon && uiDropdown.triggerWithLeftIcon,
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
