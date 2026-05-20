import { Check } from 'lucide-react';
import { uiUserSelect } from './tokens';

type SelectDropdownCheckboxProps = {
  checked: boolean;
};

/** Custom checkbox box used in portaled multi-select menus (AppMultiSelect, AppUserSelect). */
export function SelectDropdownCheckbox({ checked }: SelectDropdownCheckboxProps) {
  return (
    <span
      className={checked ? uiUserSelect.optionCheckSelected : uiUserSelect.optionCheck}
      aria-hidden
    >
      {checked ? <Check className="h-3 w-3 text-white" strokeWidth={3} /> : null}
    </span>
  );
}
