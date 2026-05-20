import { AppProjectSelect } from '@/components/ui';

export type { ProjectPickerItem } from '@/components/ui/projectPickerUtils';
export { formatProjectAddressLine, formatProjectPrimaryLine } from '@/components/ui/projectPickerUtils';

type Props = {
  value: string;
  onChange: (projectId: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  /** @deprecated Use triggerClassName on AppProjectSelect */
  inputClassName?: string;
  allowEmpty?: boolean;
  emptyOptionLabel?: string;
};

/** @deprecated Prefer `AppProjectSelect` from `@/components/ui`. Thin wrapper for legacy imports. */
export function ProjectSearchCombobox({
  allowEmpty = false,
  inputClassName,
  ...props
}: Props) {
  return (
    <AppProjectSelect
      label={allowEmpty ? 'Project' : 'Project *'}
      allowEmpty={allowEmpty}
      triggerClassName={inputClassName}
      {...props}
    />
  );
}
