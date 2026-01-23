import { useState, useMemo, useEffect, useRef, useContext } from 'react';
import { ConfirmContext } from '@/components/ConfirmProvider';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

const DEFAULT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

interface ClothSizeSelectProps {
  value: string;
  onChange: (value: string) => void;
  allowCustom?: boolean;
  className?: string;
  disabled?: boolean;
  onCustomSizesChange?: (sizes: string[]) => void;
  customSizes?: string[];
  useGlobalCustomSizes?: boolean; // If true, use global API endpoints for create/delete
  onRefreshCustomSizes?: () => void; // Callback to refresh custom sizes from backend
}

export default function ClothSizeSelect({
  value,
  onChange,
  allowCustom = false,
  className = '',
  disabled = false,
  onCustomSizesChange,
  customSizes: externalCustomSizes,
  useGlobalCustomSizes = false,
  onRefreshCustomSizes,
}: ClothSizeSelectProps) {
  const [internalCustomSizes, setInternalCustomSizes] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [customInputValue, setCustomInputValue] = useState('');
  const [sizeToDelete, setSizeToDelete] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Get confirm function from context if available
  const confirmContext = useContext(ConfirmContext);
  const confirm = confirmContext?.confirm || null;

  // Use external custom sizes if provided, otherwise use internal state
  const customSizes = externalCustomSizes !== undefined ? externalCustomSizes : internalCustomSizes;
  const setCustomSizes = externalCustomSizes !== undefined 
    ? (onCustomSizesChange || (() => {}))
    : setInternalCustomSizes;

  // Update local state when external custom sizes change (for immediate UI update)
  useEffect(() => {
    if (externalCustomSizes !== undefined) {
      setInternalCustomSizes(externalCustomSizes);
    }
  }, [externalCustomSizes]);

  // Custom sizes are now managed externally and come from the backend
  // No need to auto-add current value to custom sizes

  // Combine default sizes with custom sizes
  const allSizes = useMemo(() => {
    const combined = [...DEFAULT_SIZES, ...customSizes];
    // If current value is not in the list, add it (for displaying existing custom values)
    if (value && !combined.includes(value)) {
      return [value, ...combined];
    }
    return combined.filter((size, index, self) => self.indexOf(size) === index); // Remove duplicates
  }, [customSizes, value]);

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

  const handleSelectSize = (selectedValue: string) => {
    if (selectedValue === '__custom__') {
      setShowModal(true);
      setCustomInputValue('');
      setShowDropdown(false);
    } else {
      onChange(selectedValue);
      setShowDropdown(false);
    }
  };

  const handleAddCustomSize = async () => {
    const trimmedValue = customInputValue.trim().toUpperCase();
    if (trimmedValue && !allSizes.includes(trimmedValue)) {
      if (useGlobalCustomSizes) {
        // Use global API endpoint
        try {
          await api('POST', '/auth/cloth-sizes/custom', { size: trimmedValue });
          onChange(trimmedValue);
          setShowModal(false);
          setCustomInputValue('');
          // Refresh custom sizes from backend
          if (onRefreshCustomSizes) {
            await onRefreshCustomSizes();
          }
          toast.success('Custom size added');
        } catch (error: any) {
          toast.error(error?.message || 'Failed to add custom size');
        }
      } else {
        // Legacy behavior: update local state
        const newCustomSizes = [...customSizes, trimmedValue];
        setCustomSizes(newCustomSizes);
        onChange(trimmedValue);
        setShowModal(false);
        setCustomInputValue('');
        // Notify parent of custom sizes change so it can be saved
        if (onCustomSizesChange) {
          onCustomSizesChange(newCustomSizes);
        }
      }
    }
  };

  const handleDeleteClick = async (e: React.MouseEvent, sizeToDelete: string) => {
    e.stopPropagation(); // Prevent dropdown from closing
    if (DEFAULT_SIZES.includes(sizeToDelete)) return; // Can't delete default sizes
    
    setSizeToDelete(sizeToDelete);
    
    let shouldDelete = false;
    if (confirm) {
      const result = await confirm({
        title: 'Delete Size',
        message: `Are you sure you want to delete the size "${sizeToDelete}"?`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
      });
      shouldDelete = result === 'confirm';
    } else {
      // Fallback to window.confirm if ConfirmProvider is not available
      shouldDelete = window.confirm(`Are you sure you want to delete the size "${sizeToDelete}"?`);
    }

    if (shouldDelete) {
      if (useGlobalCustomSizes) {
        // Use global API endpoint
        try {
          await api('DELETE', `/auth/cloth-sizes/custom/${encodeURIComponent(sizeToDelete)}`);
          // If the deleted size was selected, clear the selection
          if (value === sizeToDelete) {
            onChange('');
          }
          // Refresh custom sizes from backend
          if (onRefreshCustomSizes) {
            onRefreshCustomSizes();
          }
          toast.success('Custom size deleted');
        } catch (error: any) {
          toast.error(error?.message || 'Failed to delete custom size');
        }
      } else {
        // Legacy behavior: update local state
        const newCustomSizes = customSizes.filter(s => s !== sizeToDelete);
        setCustomSizes(newCustomSizes);
        // If the deleted size was selected, clear the selection
        if (value === sizeToDelete) {
          onChange('');
        }
        // Notify parent of custom sizes change so it can be saved
        if (onCustomSizesChange) {
          onCustomSizesChange(newCustomSizes);
        }
      }
    }
    setSizeToDelete(null);
  };

  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowModal(false);
      setCustomInputValue('');
    } else if (e.key === 'Enter' && customInputValue.trim()) {
      handleAddCustomSize();
    }
  };

  const selectedLabel = value || 'Select...';
  const isCustomSize = value && !DEFAULT_SIZES.includes(value) && customSizes.includes(value);

  return (
    <>
      <div className={`relative ${className}`} ref={dropdownRef}>
        <button
          type="button"
          onClick={() => !disabled && setShowDropdown(!showDropdown)}
          disabled={disabled}
          className={`w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-left flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
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
            {allSizes.map((size) => {
              const isCustom = !DEFAULT_SIZES.includes(size) && customSizes.includes(size);
              return (
                <div
                  key={size}
                  className={`px-2.5 py-1.5 text-xs cursor-pointer hover:bg-gray-100 flex items-center justify-between ${
                    size === value ? 'bg-blue-50 font-medium' : 'text-gray-900'
                  }`}
                  onClick={() => handleSelectSize(size)}
                >
                  <span>{size}</span>
                  {allowCustom && isCustom && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteClick(e, size)}
                      disabled={disabled}
                      className="text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed p-1"
                      title="Delete size"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
            {allowCustom && (
              <div
                className="px-2.5 py-1.5 text-xs cursor-pointer hover:bg-gray-100 border-t text-blue-600 font-medium"
                onClick={() => handleSelectSize('__custom__')}
              >
                + Add custom size...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal for adding custom size */}
      {showModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowModal(false);
              setCustomInputValue('');
            }
          }}
          onKeyDown={handleModalKeyDown}
        >
          <div className="w-[400px] max-w-[95vw] bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b font-semibold">Add Custom Size</div>
            <div className="p-4">
              <label className="block text-sm text-gray-600 mb-2">Size Name</label>
              <input
                type="text"
                value={customInputValue}
                onChange={(e) => setCustomInputValue(e.target.value)}
                onKeyDown={handleModalKeyDown}
                placeholder="Enter size name (e.g., 3XL, XS)"
                className="w-full rounded-lg border px-3 py-2"
                autoFocus
              />
              {customInputValue.trim() && allSizes.includes(customInputValue.trim().toUpperCase()) && (
                <p className="mt-2 text-sm text-red-600">This size already exists</p>
              )}
            </div>
            <div className="p-3 flex items-center justify-end gap-2 border-t">
              <button
                onClick={() => {
                  setShowModal(false);
                  setCustomInputValue('');
                }}
                className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustomSize}
                disabled={!customInputValue.trim() || allSizes.includes(customInputValue.trim().toUpperCase())}
                className="px-3 py-2 rounded bg-brand-red text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

