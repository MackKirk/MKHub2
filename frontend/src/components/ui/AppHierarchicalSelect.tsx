import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { sortByLabel } from '@/lib/sortOptions';
import { AppControlLabelRow } from './AppControlLabel';
import { AppFieldHint } from './AppFieldHint';
import { SelectDropdownCheckbox } from './SelectDropdownCheckbox';
import { uiCx, uiDropdown, uiTypography, uiUserSelect } from './tokens';
import { comboboxMenuStyle, useComboboxDropdown, type ComboboxMenuRect } from './useComboboxDropdown';
import {
  type FormCustomListTreeNode,
  getChildrenAtPath,
} from '@/utils/customListTree';

export type AppHierarchicalTreeNode = FormCustomListTreeNode;

export type AppHierarchicalLeafOption = {
  value: string;
  label: string;
};

const BREADCRUMB_SEP = ' › ';

function sortTreeNodes(nodes: AppHierarchicalTreeNode[]): AppHierarchicalTreeNode[] {
  return sortByLabel(nodes, (n) => n.name || '');
}

function breadcrumbTrail(
  roots: AppHierarchicalTreeNode[],
  pathIds: string[],
): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  let cur = roots;
  for (const id of pathIds) {
    const n = cur.find((x) => x.id === id);
    if (!n) break;
    out.push({ id: n.id, name: n.name || '' });
    cur = n.children ?? [];
  }
  return out;
}

function useHierarchicalPickerNavigation(open: boolean, resetOnOpen = false) {
  const [pathIds, setPathIds] = useState<string[]>([]);

  const resetNavigation = useCallback(() => {
    setPathIds([]);
  }, []);

  useEffect(() => {
    if (!open) {
      resetNavigation();
      return;
    }
    if (resetOnOpen) resetNavigation();
  }, [open, resetOnOpen, resetNavigation]);

  return { pathIds, setPathIds, resetNavigation };
}

type HierarchicalPickerPanelProps = {
  items: AppHierarchicalTreeNode[];
  pathIds: string[];
  setPathIds: (p: string[]) => void;
  portalListId: string;
  menuPosition: CSSProperties;
  children: ReactNode;
};

function HierarchicalPickerPanel({
  items,
  pathIds,
  setPathIds,
  portalListId,
  menuPosition,
  children,
}: HierarchicalPickerPanelProps) {
  const trail = breadcrumbTrail(items, pathIds);

  return (
    <div
      id={portalListId}
      role="listbox"
      className={uiCx(uiDropdown.menuSearchable, 'max-h-96')}
      style={menuPosition}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-gray-100 bg-white px-2.5 py-2 text-xs text-gray-600">
        <button
          type="button"
          className={uiCx(
            'rounded-md px-2 py-1 font-medium transition-colors',
            pathIds.length === 0 ? 'bg-gray-100 text-gray-900' : 'hover:bg-gray-50',
          )}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setPathIds([])}
        >
          Top
        </button>
        {trail.map((seg, i) => (
          <span key={seg.id} className="flex min-w-0 items-center gap-1">
            <span className="text-gray-300" aria-hidden>
              {BREADCRUMB_SEP}
            </span>
            <button
              type="button"
              title={seg.name}
              className={uiCx(
                'max-w-[10rem] truncate rounded-md px-2 py-1 font-medium transition-colors',
                i === trail.length - 1 ? 'bg-gray-50 text-gray-900' : 'hover:bg-gray-50',
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPathIds(pathIds.slice(0, i + 1))}
            >
              {seg.name || '—'}
            </button>
          </span>
        ))}
      </div>
      <ul className={uiDropdown.menuOptionsList}>{children}</ul>
    </div>
  );
}

type SingleProps = {
  label?: ReactNode;
  fieldHint?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  hideLabel?: boolean;
  items: AppHierarchicalTreeNode[];
  leafOptions: AppHierarchicalLeafOption[];
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  id?: string;
  triggerClassName?: string;
  className?: string;
};

export function AppHierarchicalSelectSingle({
  label,
  fieldHint,
  helperText,
  error,
  hideLabel,
  items,
  leafOptions,
  value,
  onChange,
  disabled,
  placeholder = 'Select…',
  emptyMessage = 'No options found.',
  id: idProp,
  triggerClassName,
  className,
}: SingleProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [open, setOpen] = useState(false);
  const { anchorRef, portalListId, menuRect, closeDropdown } = useComboboxDropdown(open, setOpen);
  const { pathIds, setPathIds, resetNavigation } = useHierarchicalPickerNavigation(open);

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of leafOptions) m.set(r.value, r.label);
    return m;
  }, [leafOptions]);

  const levelNodes = useMemo(
    () => sortTreeNodes(getChildrenAtPath(items, pathIds)),
    [items, pathIds],
  );

  const showPlaceholder = !value.trim();
  const triggerLabel = showPlaceholder ? placeholder : labelById.get(value) ?? value;

  const pickLeaf = useCallback(
    (leafId: string) => {
      onChange(leafId);
      closeDropdown();
      resetNavigation();
    },
    [onChange, closeDropdown, resetNavigation],
  );

  const clearValue = useCallback(() => {
    onChange('');
    closeDropdown();
    resetNavigation();
  }, [onChange, closeDropdown, resetNavigation]);

  const menuPosition = comboboxMenuStyle(menuRect);

  const listContent = (
    <>
      <li role="option" aria-selected={!value.trim()}>
        <button
          type="button"
          className={uiCx(uiDropdown.optionMuted, 'w-full text-left hover:bg-gray-50')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={clearValue}
        >
          {placeholder}
        </button>
      </li>
      {levelNodes.length === 0 ? (
        <li className={uiDropdown.optionEmpty}>{emptyMessage}</li>
      ) : (
        levelNodes.map((node) => {
          const subs = node.children ?? [];
          const isBranch = subs.length > 0;
          return (
            <li key={node.id} role="option" aria-selected={!isBranch && value === node.id}>
              <button
                type="button"
                className={uiCx(
                  uiDropdown.option,
                  'flex items-center justify-between gap-2',
                  !isBranch && value === node.id && uiDropdown.optionSelected,
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (isBranch) setPathIds([...pathIds, node.id]);
                  else pickLeaf(node.id);
                }}
              >
                <span className="min-w-0 truncate">{node.name || '—'}</span>
                {isBranch ? (
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                ) : null}
              </button>
            </li>
          );
        })
      )}
    </>
  );

  const dropdown =
    open && menuPosition ? (
      <HierarchicalPickerPanel
        items={items}
        portalListId={portalListId}
        menuPosition={menuPosition}
        pathIds={pathIds}
        setPathIds={setPathIds}
      >
        {listContent}
      </HierarchicalPickerPanel>
    ) : null;

  const triggerClasses = uiCx(
    uiDropdown.trigger,
    'flex w-full items-center justify-between gap-2 pr-8 text-left',
    showPlaceholder && 'text-gray-400',
    open && !disabled && 'border-gray-400 ring-1 ring-inset ring-gray-400/35',
    triggerClassName,
  );

  return (
    <div className={uiCx('block space-y-1.5', className)}>
      {!hideLabel && label ? (
        <AppControlLabelRow
          label={label}
          fieldHint={fieldHint ? <AppFieldHint hint={fieldHint} /> : undefined}
        />
      ) : null}
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
            if (!disabled) setOpen((o) => !o);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              closeDropdown();
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
      {error ? (
        <span className="block text-xs text-red-600">{error}</span>
      ) : helperText ? (
        <span className={uiTypography.helper}>{helperText}</span>
      ) : null}
      {typeof document !== 'undefined' && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}

type MultiProps = {
  label?: ReactNode;
  fieldHint?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  hideLabel?: boolean;
  items: AppHierarchicalTreeNode[];
  leafOptions: AppHierarchicalLeafOption[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  id?: string;
  triggerClassName?: string;
  className?: string;
  showSelectedChips?: boolean;
};

function MultiSelectChip({
  label: chipLabel,
  onRemove,
  disabled,
}: {
  label: string;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <span className={uiUserSelect.chip}>
      <span className="truncate">{chipLabel}</span>
      <button
        type="button"
        className={uiUserSelect.chipClear}
        aria-label={`Remove ${chipLabel}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

export function AppHierarchicalSelectMulti({
  label,
  fieldHint,
  helperText,
  error,
  hideLabel,
  items,
  leafOptions,
  value,
  onChange,
  disabled,
  placeholder = 'Select options…',
  emptyMessage = 'No options found.',
  id: idProp,
  triggerClassName,
  className,
  showSelectedChips = true,
}: MultiProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [open, setOpen] = useState(false);
  const { anchorRef, portalListId, menuRect, closeDropdown } = useComboboxDropdown(open, setOpen);
  const { pathIds, setPathIds, resetNavigation } = useHierarchicalPickerNavigation(open, true);

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of leafOptions) m.set(r.value, r.label);
    return m;
  }, [leafOptions]);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const levelNodes = useMemo(
    () => sortTreeNodes(getChildrenAtPath(items, pathIds)),
    [items, pathIds],
  );

  const selectedOptions = useMemo(
    () =>
      sortByLabel(
        value.map((v) => ({
          value: v,
          label: labelById.get(v) ?? v,
        })),
        (o) => o.label,
      ),
    [value, labelById],
  );

  const triggerLabel = value.length === 0 ? placeholder : `${value.length} selected`;

  const toggleLeaf = useCallback(
    (leafId: string) => {
      if (selectedSet.has(leafId)) {
        onChange(value.filter((x) => x !== leafId));
      } else {
        onChange([...value, leafId]);
      }
      resetNavigation();
    },
    [onChange, value, selectedSet, resetNavigation],
  );

  const menuPosition = comboboxMenuStyle(menuRect);

  const renderLeafRow = (leafId: string, displayLabel: string) => {
    const isSelected = selectedSet.has(leafId);
    return (
      <li key={leafId} role="option" aria-selected={isSelected}>
        <label
          className={uiCx(uiDropdown.option, 'flex cursor-pointer', isSelected && uiDropdown.optionSelected)}
          onMouseDown={(e) => e.preventDefault()}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={isSelected}
            disabled={disabled}
            onChange={() => toggleLeaf(leafId)}
            tabIndex={-1}
          />
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <SelectDropdownCheckbox checked={isSelected} />
            <span className="min-w-0 flex-1 truncate text-xs text-gray-900">{displayLabel}</span>
          </span>
        </label>
      </li>
    );
  };

  const listContent = (
    <>
      <li role="option" aria-selected={value.length === 0}>
        <button
          type="button"
          className={uiCx(uiDropdown.optionMuted, 'w-full text-left hover:bg-gray-50')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange([]);
            resetNavigation();
          }}
        >
          Clear all
        </button>
      </li>
      {levelNodes.length === 0 ? (
        <li className={uiDropdown.optionEmpty}>{emptyMessage}</li>
      ) : (
        levelNodes.map((node) => {
          const subs = node.children ?? [];
          const isBranch = subs.length > 0;
          if (isBranch) {
            return (
              <li key={node.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  className={uiCx(uiDropdown.option, 'flex items-center justify-between gap-2')}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setPathIds([...pathIds, node.id])}
                >
                  <span className="min-w-0 truncate">{node.name || '—'}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                </button>
              </li>
            );
          }
          return renderLeafRow(node.id, node.name || '—');
        })
      )}
    </>
  );

  const dropdown =
    open && menuPosition ? (
      <HierarchicalPickerPanel
        items={items}
        portalListId={portalListId}
        menuPosition={menuPosition}
        pathIds={pathIds}
        setPathIds={setPathIds}
      >
        {listContent}
      </HierarchicalPickerPanel>
    ) : null;

  const triggerClasses = uiCx(
    uiDropdown.trigger,
    'flex w-full items-center justify-between gap-2 pr-8 text-left',
    value.length === 0 && 'text-gray-400',
    open && !disabled && 'border-gray-400 ring-1 ring-inset ring-gray-400/35',
    triggerClassName,
  );

  const chipsRow =
    showSelectedChips && selectedOptions.length > 0 ? (
      <div className={uiUserSelect.chipRow}>
        {selectedOptions.map((option) => (
          <MultiSelectChip
            key={option.value}
            label={option.label}
            disabled={disabled}
            onRemove={() => toggleLeaf(option.value)}
          />
        ))}
      </div>
    ) : null;

  const labelRow =
    !hideLabel && label ? (
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
            if (!disabled) setOpen((o) => !o);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              closeDropdown();
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
