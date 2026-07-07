import type { MouseEvent } from 'react';
import { SelectDropdownCheckbox } from '@/components/ui/SelectDropdownCheckbox';
import { permissionUi } from '@/components/permissionUi';
import type { PermissionAccessLevel } from '@/lib/permissionAccessLevel';
import { uiCx } from '@/components/ui';

type Option = { value: PermissionAccessLevel | string; label: string };

type Props = {
  value: PermissionAccessLevel | string;
  options: Option[];
  disabled?: boolean;
  onChange: (level: PermissionAccessLevel) => void;
  'aria-label'?: string;
};

/** Fixed width — View + divider + Edit (all rows share this exact size). */
const ACCESS_CONTROL_WIDTH = 'w-[calc(2*(3.25rem+1.25rem)+1px)]';

function stopPointerBubble(e: MouseEvent) {
  e.stopPropagation();
}

function preventFocusScroll(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
}

/** Empty column slot — preserves View/Edit alignment without looking interactive. */
function AccessColumnSpacer({ alignLabel }: { alignLabel: string }) {
  return (
    <div
      className="pointer-events-none flex w-full min-w-0 flex-col items-center gap-1 px-2.5 py-1.5"
      aria-hidden
    >
      <span className={uiCx(permissionUi.columnTitle, 'invisible select-none')}>{alignLabel}</span>
      <span
        className={uiCx(
          'h-4 w-4 shrink-0 rounded-sm bg-white',
          'bg-[repeating-linear-gradient(135deg,#ececec_0,#ececec_0.5px,transparent_0.5px,transparent_4px)]',
        )}
      />
    </div>
  );
}

function AccessCheckbox({
  label,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const interactive = !disabled;

  if (!interactive) {
    return (
      <div
        className="flex w-full min-w-0 cursor-not-allowed flex-col items-center gap-1 px-2.5 py-1.5 opacity-50"
        aria-hidden
      >
        <span className={permissionUi.columnTitle}>{label}</span>
        <SelectDropdownCheckbox checked={checked} />
      </div>
    );
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={uiCx(
        'flex w-full min-w-0 flex-col items-center gap-1 px-2.5 py-1.5',
        'cursor-pointer hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/30',
      )}
      onMouseDown={preventFocusScroll}
      onClick={(e) => {
        stopPointerBubble(e);
        onToggle();
      }}
    >
      <span className={permissionUi.columnTitle}>{label}</span>
      <SelectDropdownCheckbox checked={checked} />
    </button>
  );
}

/** Compact access-level picker — View / Edit checkboxes (or Allowed for write-only rows). */
export function PermissionAccessLevelSelect({
  value,
  options,
  disabled,
  onChange,
  'aria-label': ariaLabel,
}: Props) {
  const level = value as PermissionAccessLevel;
  const hasView = options.some((o) => o.value === 'view');
  const hasEdit = options.some((o) => o.value === 'edit');
  const isWriteOnly = !hasView && hasEdit;

  const viewChecked = level === 'view' || level === 'edit';
  const editChecked = level === 'edit';
  const viewLocked = editChecked;

  const handleViewToggle = () => {
    if (disabled || viewLocked) return;
    onChange(viewChecked ? 'blocked' : 'view');
  };

  const handleEditToggle = () => {
    if (disabled) return;
    onChange(editChecked ? 'view' : 'edit');
  };

  const handleAllowedToggle = () => {
    if (disabled) return;
    onChange(editChecked ? 'blocked' : 'edit');
  };

  return (
    <div
      className={uiCx(
        'flex shrink-0 overflow-hidden rounded-lg border border-gray-200/80 bg-white shadow-sm',
        ACCESS_CONTROL_WIDTH,
        isWriteOnly ? 'justify-center' : 'grid grid-cols-[1fr_1px_1fr]',
      )}
      role="group"
      aria-label={ariaLabel}
      onMouseDown={stopPointerBubble}
      onClick={stopPointerBubble}
    >
      {isWriteOnly ? (
        <AccessCheckbox
          label="Allowed"
          checked={editChecked}
          disabled={disabled}
          onToggle={handleAllowedToggle}
        />
      ) : (
        <>
          {hasView ? (
            <AccessCheckbox
              label="View"
              checked={viewChecked}
              disabled={disabled || viewLocked}
              onToggle={handleViewToggle}
            />
          ) : null}
          {hasView ? <div className="self-stretch bg-gray-200/90" aria-hidden /> : null}
          {hasEdit ? (
            <AccessCheckbox
              label="Edit"
              checked={editChecked}
              disabled={disabled}
              onToggle={handleEditToggle}
            />
          ) : hasView ? (
            <AccessColumnSpacer alignLabel="Edit" />
          ) : null}
        </>
      )}
    </div>
  );
}
