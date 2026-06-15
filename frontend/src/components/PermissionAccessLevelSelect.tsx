import { AppSelect } from '@/components/ui';
import type { PermissionAccessLevel } from '@/lib/permissionAccessLevel';

type Option = { value: PermissionAccessLevel | string; label: string };

type Props = {
  value: PermissionAccessLevel | string;
  options: Option[];
  disabled?: boolean;
  onChange: (level: PermissionAccessLevel) => void;
  'aria-label'?: string;
};

/** Compact access-level picker — AppSelect dropdown (Blocked / View / Edit). */
export function PermissionAccessLevelSelect({
  value,
  options,
  disabled,
  onChange,
  'aria-label': ariaLabel,
}: Props) {
  return (
    <AppSelect
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      options={options.map((o) => ({ value: String(o.value), label: o.label }))}
      onChange={(e) => onChange(e.target.value as PermissionAccessLevel)}
      triggerClassName="min-w-[7.5rem] shrink-0"
    />
  );
}
