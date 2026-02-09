import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';

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
  placeholder = 'Select a supplier',
}: SupplierSelectProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: supplierOptions } = useQuery({ 
    queryKey: ['invSuppliersOptions-select'], 
    queryFn: () => api<any[]>('GET', '/inventory/suppliers') 
  });

  const suppliers = useMemo(() => {
    const list = Array.isArray(supplierOptions) ? supplierOptions : [];
    return sortByLabel(list, (s: any) => (s.name || s.id || '').toString());
  }, [supplierOptions]);

  const selectedLabel = useMemo(() => {
    if (!value) return placeholder;
    const supplier = suppliers.find((s: any) => s.name === value);
    return supplier?.name || value;
  }, [value, suppliers, placeholder]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showDropdown]);

  const handleSelectSupplier = (supplierName: string) => {
    onChange(supplierName);
    setShowDropdown(false);
  };

  const handleCreateNew = () => {
    setShowDropdown(false);
    if (onOpenNewSupplierModal) {
      onOpenNewSupplierModal();
    }
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !disabled && setShowDropdown(!showDropdown)}
        disabled={disabled}
        className={`w-full rounded-lg border px-3 py-2 text-left bg-white flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed ${
          error ? 'border-red-500' : 'border-gray-300'
        }`}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-500'}>{selectedLabel}</span>
        <svg 
          className={`w-4 h-4 text-gray-500 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showDropdown && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suppliers.length > 0 ? (
            suppliers.map((supplier: any) => (
              <div
                key={supplier.id}
                className={`px-3 py-2 cursor-pointer hover:bg-gray-100 ${
                  supplier.name === value ? 'bg-blue-50 font-medium' : ''
                }`}
                onClick={() => handleSelectSupplier(supplier.name)}
              >
                <span>{supplier.name}</span>
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-gray-500 text-sm">No suppliers found</div>
          )}
          {onOpenNewSupplierModal && (
            <div
              className="px-3 py-2 cursor-pointer hover:bg-gray-100 border-t text-blue-600 font-medium"
              onClick={handleCreateNew}
            >
              + Create New Supplier
            </div>
          )}
        </div>
      )}
    </div>
  );
}

