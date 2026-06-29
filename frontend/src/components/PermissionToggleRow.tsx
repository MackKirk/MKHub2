import type { ReactNode } from 'react';
import { SelectDropdownCheckbox } from '@/components/ui/SelectDropdownCheckbox';
import { uiCx } from '@/components/ui';
import { permissionUi } from '@/components/permissionUi';

type PermItem = { id: string; key: string; label: string; description?: string };

type PermissionToggleRowProps = {
  perm: PermItem;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  className?: string;
  badge?: ReactNode;
};

/** Compact permission toggle — text-xs to align with AppSelect / AppInput in permission rows. */
export function PermissionToggleRow({
  perm,
  checked,
  disabled,
  onToggle,
  className,
  badge,
}: PermissionToggleRowProps) {
  const interactive = !disabled;

  return (
    <label
      className={uiCx(
        'flex items-start gap-2.5 py-1',
        interactive ? 'cursor-pointer' : 'cursor-default',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        readOnly={!interactive}
        onChange={interactive ? () => onToggle() : undefined}
      />
      <span className="mt-0.5 shrink-0">
        <SelectDropdownCheckbox checked={checked} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={uiCx(permissionUi.rowTitle, 'flex flex-wrap items-center gap-1.5')}>
          <span className="truncate">{perm.label}</span>
          {badge}
        </span>
        {perm.description ? (
          <p className={uiCx(permissionUi.rowDescription, 'mt-0.5 line-clamp-2')}>{perm.description}</p>
        ) : null}
      </span>
    </label>
  );
}

export function PermissionToggleLabel({
  label,
  description,
  checked,
  disabled,
  onToggle,
  badge,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onToggle?: () => void;
  badge?: ReactNode;
}) {
  const interactive = Boolean(onToggle) && !disabled;

  return (
    <label
      className={uiCx(
        'flex items-start gap-2.5 py-1.5',
        interactive ? 'cursor-pointer' : 'cursor-default',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        readOnly={!interactive}
        onChange={interactive && onToggle ? () => onToggle() : undefined}
      />
      <span className="mt-0.5 shrink-0">
        <SelectDropdownCheckbox checked={checked} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={uiCx(permissionUi.rowTitle, 'flex flex-wrap items-center gap-1.5')}>
          {label}
          {badge}
        </span>
        {description ? <p className={uiCx(permissionUi.rowDescription, 'mt-0.5')}>{description}</p> : null}
      </span>
    </label>
  );
}
