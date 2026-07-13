import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';
import { AppCombobox, type AppComboboxOption, uiCx } from '@/components/ui';

const CREATE_NEW_VALUE = '__create_new_supplier__';

interface SupplierSelectProps {
  value: string;
  onChange: (value: string) => void;
  onOpenNewSupplierModal?: () => void;
  className?: string;
  disabled?: boolean;
  error?: boolean;
  placeholder?: string;
}

export default function SupplierSelect({
  value,
  onChange,
  onOpenNewSupplierModal,
  className = '',
  disabled = false,
  error = false,
  placeholder = 'Search or select supplier…',
}: SupplierSelectProps) {
  const { data: supplierOptions } = useQuery({
    queryKey: ['invSuppliersOptions-select'],
    queryFn: () => api<any[]>('GET', '/inventory/suppliers'),
  });

  const options: AppComboboxOption[] = useMemo(() => {
    const list = Array.isArray(supplierOptions) ? supplierOptions : [];
    const mapped = sortByLabel(list, (s: any) => (s.name || s.id || '').toString())
      .map((s: any) => ({
        value: String(s.name || ''),
        label: String(s.name || ''),
      }))
      .filter((o) => o.value);
    if (value && value !== CREATE_NEW_VALUE && !mapped.some((o) => o.value === value)) {
      mapped.unshift({ value, label: value });
    }
    return mapped;
  }, [supplierOptions, value]);

  const pinnedOptions: AppComboboxOption[] = useMemo(
    () =>
      onOpenNewSupplierModal
        ? [{ value: CREATE_NEW_VALUE, label: '+ Create New Supplier', action: true }]
        : [],
    [onOpenNewSupplierModal],
  );

  return (
    <div className={uiCx(className)}>
      <AppCombobox
        value={value === CREATE_NEW_VALUE ? '' : value}
        onChange={(next) => {
          if (next === CREATE_NEW_VALUE) {
            onOpenNewSupplierModal?.();
            return;
          }
          onChange(next);
        }}
        options={options}
        pinnedOptions={pinnedOptions}
        placeholder={placeholder}
        emptyMessage="No suppliers found"
        disabled={disabled}
        triggerClassName={uiCx(error && 'border-red-500')}
      />
    </div>
  );
}
