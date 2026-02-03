import { FilterRule, FieldConfig } from './types';
import { isRangeOperator, getOperatorLabel } from './utils';
import { sortByLabel } from '@/lib/sortOptions';

function sortOptionsByLabel<T extends { label: string }>(options: T[]): T[] {
  return sortByLabel(options, o => o.label);
}

interface FilterRuleRowProps {
  rule: FilterRule;
  onUpdate: (rule: FilterRule) => void;
  onDelete: () => void;
  fields: FieldConfig[];
  getFieldData: (fieldId: string) => any; // Function to get data for a field (e.g., options list)
}

export default function FilterRuleRow({
  rule,
  onUpdate,
  onDelete,
  fields,
  getFieldData,
}: FilterRuleRowProps) {
  const fieldConfig = fields.find(f => f.id === rule.field) || fields[0];
  const operators = fieldConfig?.operators.map(op => ({
    value: op,
    label: getOperatorLabel(op),
  })) || [];
  const isRange = isRangeOperator(rule.operator);
  const currentValue = rule.value;
  const value1 = Array.isArray(currentValue) ? currentValue[0] : currentValue;
  const value2 = Array.isArray(currentValue) ? currentValue[1] : '';

  const handleFieldChange = (newFieldId: string) => {
    const newFieldConfig = fields.find(f => f.id === newFieldId) || fields[0];
    const newOperator = newFieldConfig.operators[0] || 'is';
    onUpdate({
      ...rule,
      field: newFieldId,
      operator: newOperator,
      value: '',
    });
  };

  const handleOperatorChange = (newOperator: string) => {
    const isNewRange = isRangeOperator(newOperator as any);
    const isCurrentRange = isRangeOperator(rule.operator);
    
    // Preserve value if switching between compatible operators (both range or both non-range)
    let newValue: string | string[];
    if (isNewRange && isCurrentRange) {
      // Both are range operators - preserve the array
      newValue = Array.isArray(rule.value) ? rule.value : ['', ''];
    } else if (!isNewRange && !isCurrentRange) {
      // Both are non-range operators - preserve the string value
      newValue = typeof rule.value === 'string' ? rule.value : '';
    } else {
      // Switching between range and non-range - reset to appropriate type
      newValue = isNewRange ? ['', ''] : '';
    }
    
    onUpdate({
      ...rule,
      operator: newOperator as any,
      value: newValue,
    });
  };

  const handleValueChange = (newValue: string, index?: number) => {
    if (isRange) {
      const current = Array.isArray(rule.value) ? rule.value : ['', ''];
      const updated = [...current];
      updated[index || 0] = newValue;
      onUpdate({ ...rule, value: updated });
    } else {
      onUpdate({ ...rule, value: newValue });
    }
  };

  const renderValueInput = () => {
    if (fieldConfig.type === 'select') {
      // Check if we have grouped options (for optgroup support)
      const groupedOptions = fieldConfig.getGroupedOptions ? fieldConfig.getGroupedOptions() : null;
      
      if (groupedOptions && groupedOptions.length > 0) {
        const sortedGroups = sortOptionsByLabel(groupedOptions.map(g => ({ ...g, label: g.label }))).map(g => ({
          label: g.label,
          options: sortOptionsByLabel(g.options),
        }));
        return (
          <select
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
            value={value1 || ''}
            onChange={(e) => handleValueChange(e.target.value)}
          >
            <option value="">Select {fieldConfig.label.toLowerCase()}...</option>
            {sortedGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        );
      }
      
      // Fallback to simple options (always alphabetical by label)
      const options = sortOptionsByLabel(fieldConfig.getOptions ? fieldConfig.getOptions() : []);
      return (
        <select
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
          value={value1 || ''}
          onChange={(e) => handleValueChange(e.target.value)}
        >
          <option value="">Select {fieldConfig.label.toLowerCase()}...</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }

    if (fieldConfig.type === 'date') {
      if (isRange) {
        return (
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
              value={value1}
              onChange={(e) => handleValueChange(e.target.value, 0)}
            />
            <span className="text-xs text-gray-400">→</span>
            <input
              type="date"
              className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
              value={value2}
              onChange={(e) => handleValueChange(e.target.value, 1)}
            />
          </div>
        );
      }
      return (
        <input
          type="date"
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
          value={value1}
          onChange={(e) => handleValueChange(e.target.value)}
        />
      );
    }

    if (fieldConfig.type === 'number') {
      if (isRange) {
        return (
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
              placeholder="Min"
              value={value1}
              onChange={(e) => handleValueChange(e.target.value, 0)}
            />
            <span className="text-xs text-gray-400">→</span>
            <input
              type="number"
              className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
              placeholder="Max"
              value={value2}
              onChange={(e) => handleValueChange(e.target.value, 1)}
            />
          </div>
        );
      }
      return (
        <input
          type="number"
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
          placeholder="Enter value..."
          value={value1}
          onChange={(e) => handleValueChange(e.target.value)}
        />
      );
    }

    if (fieldConfig.type === 'text') {
      return (
        <input
          type="text"
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
          placeholder="Enter text..."
          value={value1}
          onChange={(e) => handleValueChange(e.target.value)}
        />
      );
    }

    return null;
  };

  return (
    <div className="flex items-center gap-3 transition-all duration-200 ease-out">
      <select
        className="w-40 border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
        value={rule.field}
        onChange={(e) => handleFieldChange(e.target.value)}
      >
        {sortOptionsByLabel(fields.map(f => ({ id: f.id, label: f.label }))).map((field) => (
          <option key={field.id} value={field.id}>{field.label}</option>
        ))}
      </select>

      <select
        className="w-36 border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
        value={rule.operator}
        onChange={(e) => handleOperatorChange(e.target.value)}
      >
        {operators.map((op) => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </select>

      <div className="flex-1">
        {renderValueInput()}
      </div>

      <button
        onClick={onDelete}
        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors duration-150"
        aria-label="Delete rule"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}

