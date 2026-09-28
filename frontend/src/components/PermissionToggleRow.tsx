import type { ReactNode } from 'react';
import { AppCheckboxControl } from '@/components/ui/AppCheckboxControl';
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

/** Compact permission toggle — only the checkbox is interactive; label text is not clickable. */
export function PermissionToggleRow({
  perm,
  checked,
  disabled,
  onToggle,
  className,
  badge,
}: PermissionToggleRowProps) {
  return (
    <div className={uiCx('flex items-start gap-2.5 py-1', disabled && 'opacity-50', className)}>
      <AppCheckboxControl
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        aria-label={perm.label}
        onChange={() => onToggle()}
      />
      <div className="min-w-0 flex-1">
        <div className={uiCx(permissionUi.rowTitle, 'flex flex-wrap items-center gap-1.5')}>
          <span className="truncate">{perm.label}</span>
          {badge}
        </div>
        {perm.description ? (
          <p className={uiCx(permissionUi.rowDescription, 'mt-0.5 line-clamp-2')}>{perm.description}</p>
        ) : null}
      </div>
    </div>
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
  const ariaLabel = typeof label === 'string' ? label : 'Toggle permission';

  return (
    <div className={uiCx('flex items-start gap-2.5 py-1.5', disabled && 'opacity-50')}>
      <AppCheckboxControl
        className="mt-0.5"
        checked={checked}
        disabled={!interactive}
        aria-label={ariaLabel}
        onChange={interactive && onToggle ? () => onToggle() : undefined}
      />
      <div className="min-w-0 flex-1">
        <div className={uiCx(permissionUi.rowTitle, 'flex flex-wrap items-center gap-1.5')}>
          {label}
          {badge}
        </div>
        {description ? <p className={uiCx(permissionUi.rowDescription, 'mt-0.5')}>{description}</p> : null}
      </div>
    </div>
  );
}
