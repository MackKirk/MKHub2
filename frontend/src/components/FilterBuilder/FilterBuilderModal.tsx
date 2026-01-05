import { useState, useEffect } from 'react';
import { FilterRule, FieldConfig } from './types';
import FilterRuleRow from './FilterRuleRow';

interface FilterBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (rules: FilterRule[]) => void;
  initialRules: FilterRule[];
  fields: FieldConfig[];
  getFieldData: (fieldId: string) => any;
}

export default function FilterBuilderModal({
  isOpen,
  onClose,
  onApply,
  initialRules,
  fields,
  getFieldData,
}: FilterBuilderModalProps) {
  const [rules, setRules] = useState<FilterRule[]>(initialRules);

  // Update rules when modal opens with new initial rules
  useEffect(() => {
    if (isOpen) {
      setRules(initialRules);
    }
  }, [isOpen, initialRules]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const handleAddRule = () => {
    const firstField = fields[0];
    const newRule: FilterRule = {
      id: `rule-${Date.now()}`,
      field: firstField?.id || '',
      operator: firstField?.operators[0] || 'is',
      value: '',
    };
    setRules([...rules, newRule]);
  };

  const handleUpdateRule = (updatedRule: FilterRule) => {
    setRules(rules.map(r => r.id === updatedRule.id ? updatedRule : r));
  };

  const handleDeleteRule = (ruleId: string) => {
    setRules(rules.filter(r => r.id !== ruleId));
  };

  const handleClearAll = () => {
    setRules([]);
  };

  const handleApply = () => {
    onApply(rules);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity duration-200 ease-out"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-white rounded-lg shadow-lg w-full max-w-[720px] max-h-[90vh] flex flex-col overflow-hidden"
        style={{ 
          animation: 'fadeInSlideUp 200ms ease-out forwards',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors duration-150"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {rules.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No filters applied. Add a filter to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div key={rule.id} className="transition-all duration-200 ease-out">
                  <FilterRuleRow
                    rule={rule}
                    onUpdate={handleUpdateRule}
                    onDelete={() => handleDeleteRule(rule.id)}
                    fields={fields}
                    getFieldData={getFieldData}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Add Filter Button */}
          <button
            onClick={handleAddRule}
            className="mt-4 w-full px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-md hover:bg-gray-50 transition-all duration-150"
          >
            + Add filter
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-3">
          <div>
            {rules.length > 0 && (
              <button
                onClick={handleClearAll}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors duration-150"
              >
                Clear All
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-red hover:bg-brand-red700 rounded-md transition-colors duration-150"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

