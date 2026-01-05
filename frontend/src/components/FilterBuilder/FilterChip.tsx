import { FilterRule } from './types';
import { getOperatorLabel } from './utils';

interface FilterChipProps {
  rule: FilterRule;
  onRemove: () => void;
  getValueLabel: (rule: FilterRule) => string;
  getFieldLabel: (fieldId: string) => string;
}

export default function FilterChip({
  rule,
  onRemove,
  getValueLabel,
  getFieldLabel,
}: FilterChipProps) {
  const fieldLabel = getFieldLabel(rule.field);
  const operatorLabel = getOperatorLabel(rule.operator);
  const valueLabel = getValueLabel(rule);

  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md text-sm transition-all duration-150 hover:bg-gray-200">
      <span className="font-medium">{fieldLabel}</span>
      <span className="text-gray-500">{operatorLabel}</span>
      <span>{valueLabel}</span>
      <button
        onClick={onRemove}
        className="ml-1 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors duration-150"
        aria-label="Remove filter"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

